/*
 * BitCrusher(audioCtx, input, output)
 * AudioWorklet bitcrusher (bit depth + sample rate reduction), loaded through a Blob URL.
 *
 * Usage:
 *   const bc = new BitCrusher(audioCtx, someNode, audioCtx.destination);
 *   await bc.ready;
 *   bc.unbypass();           // input -> processing -> output
 *   bc.setBits(6);           // 1..16 bits
 *   bc.setDownsample(8);     // 1..64 (hold each sample for N samples)
 *   bc.setWet(1);            // 0..1
 *   bc.setOutputGain(0);     // -48..+48 dB
 *   bc.bypass();             // input -> output directly
 */

const BITCRUSHER_WORKLET_CODE = `
class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits',       defaultValue: 8,   minValue: 6,   maxValue: 16, automationRate: 'k-rate' },
      { name: 'downsample', defaultValue: 4,   minValue: 1,   maxValue: 64, automationRate: 'k-rate' },
      { name: 'wet',        defaultValue: 1,   minValue: 0,   maxValue: 1,  automationRate: 'k-rate' },
      { name: 'gainDb',     defaultValue: 0,   minValue: -48, maxValue: 48, automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super();
    const po = (options && options.processorOptions) || {};
    this.channels = po.channels || 8;
    this.held = new Float64Array(this.channels);
    this.phase = 1; // forces a fresh sample on the first frame
    this.active = false;
    this.wetS = 1;
    this.gainS = 1;
    // output limiter (ceiling 0 dBFS, linked across all channels)
    this.limGain = 1;
    this.limRelease = Math.exp(-1 / (0.1 * sampleRate)); // ~100 ms release
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m && m.type === 'active') {
        if (m.value && !this.active) this.clear();
        this.active = !!m.value;
      }
    };
  }

  clear() {
    this.held.fill(0);
    this.phase = 1;
    this.limGain = 1;
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    if (!this.active) return true; // outputs stay silent

    const inp = inputs[0] || [];
    const n = out[0].length;
    const chs = Math.min(this.channels, out.length);

    const bits    = parameters.bits[0];
    const factor  = parameters.downsample[0];
    const wetT    = parameters.wet[0];
    const gainT   = Math.pow(10, parameters.gainDb[0] / 20);

    // mid-rise quantizer: 2^bits levels across -1..1
    const step = 2 / Math.pow(2, bits);
    const invFactor = 1 / factor;
    const smooth = 0.002;

    for (let i = 0; i < n; i++) {
      this.wetS  += (wetT - this.wetS) * smooth;
      this.gainS += (gainT - this.gainS) * smooth;

      // sample-and-hold: grab a new sample every 'factor' samples
      this.phase += invFactor;
      const refresh = this.phase >= 1;
      if (refresh) this.phase -= 1;

      const wet = this.wetS; // level of the crushed signal (no internal dry)
      const g = this.gainS;
      let peak = 0;

      for (let c = 0; c < chs; c++) {
        const x = inp[c] ? inp[c][i] : 0;

        if (refresh) {
          const xc = x > 1 ? 1 : (x < -1 ? -1 : x);
          this.held[c] = step * (Math.floor(xc / step) + 0.5);
        }

        const o = this.held[c] * wet * g;
        out[c][i] = o;
        const a = o < 0 ? -o : o;
        if (a > peak) peak = a;
      }

      // limiter: instant attack, smooth release, linked across channels
      const target = peak > 1 ? 1 / peak : 1;
      if (target < this.limGain) this.limGain = target;
      else this.limGain = target + (this.limGain - target) * this.limRelease;
      const lg = this.limGain;

      for (let c = 0; c < chs; c++) {
        const o = out[c][i] * lg;
        out[c][i] = o > 1 ? 1 : (o < -1 ? -1 : o); // hard safety at 0 dBFS
      }
    }

    return true;
  }
}
registerProcessor('bitcrusher-processor', BitCrusherProcessor);
`;

// one addModule per AudioContext (registerProcessor throws on duplicates)
const _bitcrusherModuleLoaded = new WeakMap();

function _loadBitCrusherModule(audioCtx) {
  if (_bitcrusherModuleLoaded.has(audioCtx)) return _bitcrusherModuleLoaded.get(audioCtx);
  const blob = new Blob([BITCRUSHER_WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const p = audioCtx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
  _bitcrusherModuleLoaded.set(audioCtx, p);
  return p;
}

class BitCrusher {
  constructor(audioCtx, input, output, options = {}) {
    this.audioCtx = audioCtx;
    this.input = input;
    this.output = output;
    this.channels = options.channels || 8;

    this.node = null;
    this.isBypassed = true;
    this._directConnected = false;

    // values (applied once the node exists)
    this.values = {
      bits: 8,
      downsample: 4,
      wet: 1,
      gainDb: 0
    };

    // start bypassed so audio flows right away
    this._connectDirect();

    this.ready = _loadBitCrusherModule(audioCtx).then(() => {
      this.node = new AudioWorkletNode(audioCtx, 'bitcrusher-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [this.channels],
        channelCount: this.channels,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
        processorOptions: { channels: this.channels }
      });
      this.node.connect(this.output);
      for (const k in this.values) this._applyParam(k);
      if (!this.isBypassed) this._routeProcessing();
      return this;
    });
  }

  // ---- routing ----
  _connectDirect() {
    if (this._directConnected) return;
    this.input.connect(this.output);
    this._directConnected = true;
  }
  _disconnectDirect() {
    if (!this._directConnected) return;
    try { this.input.disconnect(this.output); } catch (e) {}
    this._directConnected = false;
  }
  _routeProcessing() {
    this._disconnectDirect();
    this.input.connect(this.node);
    this.node.port.postMessage({ type: 'active', value: true });
  }

  // Bypass: input -> output
  bypass() {
    this.isBypassed = true;
    if (this.node) {
      try { this.input.disconnect(this.node); } catch (e) {}
      this.node.port.postMessage({ type: 'active', value: false });
    }
    this._connectDirect();
  }

  // Unbypass: input -> processing -> output
  unbypass() {
    this.isBypassed = false;
    if (this.node) this._routeProcessing();
    // otherwise applied when the module finishes loading
  }

  // ---- params ----
  _applyParam(name) {
    if (!this.node) return;
    const p = this.node.parameters.get(name);
    p.setTargetAtTime(this.values[name], this.audioCtx.currentTime, 0.01);
  }
  _set(name, v, lo, hi) {
    this.values[name] = Math.min(hi, Math.max(lo, v));
    this._applyParam(name);
  }

  setBits(v)       { this._set('bits', v, 6, 16); }          // bit depth
  setDownsample(v) { this._set('downsample', v, 1, 64); }    // hold each sample N samples
  setWet(v)        { this._set('wet', v, 0, 1); }            // 0..1 = level of the crushed signal (wet only, no internal dry)
  setOutputGain(db){ this._set('gainDb', db, -48, 48); }     // dB

  destroy() {
    this.bypass();
    this._disconnectDirect();
    if (this.node) {
      try { this.node.disconnect(); } catch (e) {}
      this.node = null;
    }
  }
}
