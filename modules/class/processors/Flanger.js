/*
 * Flanger(audioCtx, input, output)
 * AudioWorklet flanger, loaded through a Blob URL (no external file path needed).
 *
 * Usage:
 *   const fl = new Flanger(audioCtx, someNode, audioCtx.destination);
 *   await fl.ready;
 *   fl.unbypass();              // input -> processing -> output
 *   fl.setWet(0.6);             // 0..1
 *   fl.setDepth(0.7);           // 0..1
 *   fl.setCycleBeats(16);       // 2..128 beats per sweep cycle
 *   fl.setBpm(128);             // 40..250
 *   fl.setClipperThreshold(1);  // 0..1  -> -100..0 dB
 *   fl.setClipperMax(0);        // -48..+48 dB
 *   fl.bypass();                // input -> output directly
 */

const FLANGER_WORKLET_CODE = `
class FlangerProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'wet',           defaultValue: 0.5, minValue: 0,   maxValue: 1,    automationRate: 'k-rate' },
      { name: 'depth',         defaultValue: 0.5, minValue: 0,   maxValue: 1,    automationRate: 'k-rate' },
      { name: 'cycleBeats',    defaultValue: 8,   minValue: 2,   maxValue: 128,  automationRate: 'k-rate' },
      { name: 'bpm',           defaultValue: 120, minValue: 40,  maxValue: 250,  automationRate: 'k-rate' },
      { name: 'clipThreshold', defaultValue: 1,   minValue: 0,   maxValue: 1,    automationRate: 'k-rate' },
      { name: 'clipMaxDb',     defaultValue: 0,   minValue: -48, maxValue: 48,   automationRate: 'k-rate' },
      { name: 'feedback',      defaultValue: 0.5, minValue: 0,   maxValue: 0.95, automationRate: 'k-rate' },
      { name: 'hpFreq',        defaultValue: 150, minValue: 20,  maxValue: 1000, automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super();
    const po = (options && options.processorOptions) || {};
    this.channels = po.channels || 8;
    this.minDelay = 0.0003;   // seconds
    this.maxDelay = 0.012;    // seconds
    this.len = Math.ceil(sampleRate * 0.025) + 8;
    this.buf = [];
    for (let c = 0; c < this.channels; c++) this.buf.push(new Float32Array(this.len));
    this.w = 0;
    this.phase = 0;
    this.active = false;
    // smoothed values
    this.wetS = 0.5;
    this.depthS = 0.5;
    // output limiter (ceiling 0 dBFS, linked across all channels)
    this.limGain = 1;
    this.limRelease = Math.exp(-1 / (0.1 * sampleRate)); // ~100 ms release
    // wet-path highpass (2nd order, per channel) so bass is not flanged
    this.hx1 = new Float64Array(this.channels);
    this.hx2 = new Float64Array(this.channels);
    this.hy1 = new Float64Array(this.channels);
    this.hy2 = new Float64Array(this.channels);
    this.lastHp = -1;
    this.hb0 = 1; this.hb1 = 0; this.hb2 = 0; this.ha1 = 0; this.ha2 = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m && m.type === 'active') {
        if (m.value && !this.active) this.clear();
        this.active = !!m.value;
      }
    };
  }

  clear() {
    for (let c = 0; c < this.channels; c++) this.buf[c].fill(0);
    this.phase = 0;
    this.limGain = 1;
    this.hx1.fill(0); this.hx2.fill(0); this.hy1.fill(0); this.hy2.fill(0);
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    if (!this.active) return true; // outputs stay silent

    const inp = inputs[0] || [];
    const n = out[0].length;
    const chs = Math.min(this.channels, out.length);
    const len = this.len;

    const wetT   = parameters.wet[0];
    const depthT = parameters.depth[0];
    const fb     = parameters.feedback[0];
    const period = (parameters.cycleBeats[0] * 60) / parameters.bpm[0]; // seconds per cycle
    const phaseInc = 1 / (period * sampleRate);

    // clipper: 0..1 -> -100..0 dB
    const thrDb = -100 + parameters.clipThreshold[0] * 100;
    const thr = Math.pow(10, thrDb / 20);
    const makeup = Math.pow(10, parameters.clipMaxDb[0] / 20);

    // wet-path highpass coefficients (Butterworth, Q = 0.7071)
    const hpF = parameters.hpFreq[0];
    if (hpF !== this.lastHp) {
      this.lastHp = hpF;
      const w0 = 6.283185307179586 * Math.min(hpF, sampleRate * 0.45) / sampleRate;
      const cw = Math.cos(w0);
      const alpha = Math.sin(w0) / (2 * 0.70710678);
      const a0 = 1 + alpha;
      this.hb0 = ((1 + cw) / 2) / a0;
      this.hb1 = (-(1 + cw)) / a0;
      this.hb2 = this.hb0;
      this.ha1 = (-2 * cw) / a0;
      this.ha2 = (1 - alpha) / a0;
    }
    const hb0 = this.hb0, hb1 = this.hb1, hb2 = this.hb2, ha1 = this.ha1, ha2 = this.ha2;

    const smooth = 0.002;
    const span = this.maxDelay - this.minDelay;
    let w = this.w;

    for (let i = 0; i < n; i++) {
      this.wetS   += (wetT - this.wetS) * smooth;
      this.depthS += (depthT - this.depthS) * smooth;

      this.phase += phaseInc;
      if (this.phase >= 1) this.phase -= 1;
      const lfo = 0.5 - 0.5 * Math.cos(6.283185307179586 * this.phase); // 0..1

      const d = (this.minDelay + this.depthS * span * lfo) * sampleRate;
      let rp = w - d;
      if (rp < 0) rp += len;
      const i0 = Math.floor(rp);
      const frac = rp - i0;
      const i1 = (i0 + 1) % len;

      const wet = this.wetS;
      const dryGain = 1 - 0.5 * wet;
      const wetGain = 0.5 * wet * makeup;
      let peak = 0;

      for (let c = 0; c < chs; c++) {
        const b = this.buf[c];
        const x = inp[c] ? inp[c][i] : 0;

        let y = b[i0] * (1 - frac) + b[i1] * frac;

        // highpass the wet signal (also keeps bass out of the feedback loop)
        const yin = y;
        y = hb0 * yin + hb1 * this.hx1[c] + hb2 * this.hx2[c]
          - ha1 * this.hy1[c] - ha2 * this.hy2[c];
        this.hx2[c] = this.hx1[c]; this.hx1[c] = yin;
        this.hy2[c] = this.hy1[c]; this.hy1[c] = y;
        // clipper
        if (y > thr) y = thr; else if (y < -thr) y = -thr;

        b[w] = x + y * fb;
        const o = x * dryGain + y * wetGain;
        out[c][i] = o;
        const a = o < 0 ? -o : o;
        if (a > peak) peak = a;
      }

      // limiter: instant attack, smooth release, linked across channels
      const target = peak > 1 ? 1 / peak : 1;
      if (target < this.limGain) this.limGain = target;
      else this.limGain = target + (this.limGain - target) * this.limRelease;
      const g = this.limGain;

      for (let c = 0; c < chs; c++) {
        const o = out[c][i] * g;
        out[c][i] = o > 1 ? 1 : (o < -1 ? -1 : o); // hard safety at 0 dBFS
      }

      w++;
      if (w >= len) w = 0;
    }

    this.w = w;
    return true;
  }
}
registerProcessor('flanger-processor', FlangerProcessor);
`;

// one addModule per AudioContext (registerProcessor throws on duplicates)
const _flangerModuleLoaded = new WeakMap();

function _loadFlangerModule(audioCtx) {
  if (_flangerModuleLoaded.has(audioCtx)) return _flangerModuleLoaded.get(audioCtx);
  const blob = new Blob([FLANGER_WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const p = audioCtx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
  _flangerModuleLoaded.set(audioCtx, p);
  return p;
}

class Flanger {
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
      wet: 0.5,
      depth: 0.5,
      cycleBeats: 8,
      bpm: 120,
      clipThreshold: 1,
      clipMaxDb: 0,
      feedback: 0.5,
      hpFreq: 150
    };

    // start bypassed so audio flows right away
    this._connectDirect();

    this.ready = _loadFlangerModule(audioCtx).then(() => {
      this.node = new AudioWorkletNode(audioCtx, 'flanger-processor', {
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

  setWet(v)              { this._set('wet', v, 0, 1); }              // 0..1 = 0..100%
  setDepth(v)            { this._set('depth', v, 0, 1); }            // 0..1 = 0..100%
  setCycleBeats(beats)   { this._set('cycleBeats', beats, 2, 128); } // beats per cycle
  setBpm(bpm)            { this._set('bpm', bpm, 40, 250); }         // time
  setClipperThreshold(v) { this._set('clipThreshold', v, 0, 1); }    // 0..1 -> -100..0 dB
  setClipperMax(db)      { this._set('clipMaxDb', db, -48, 48); }    // dB
  setFeedback(v)         { this._set('feedback', v, 0, 0.95); }      // extra, not in your list
  setHighpass(hz)        { this._set('hpFreq', hz, 20, 1000); }      // wet-path highpass, Hz

  destroy() {
    this.bypass();
    this._disconnectDirect();
    if (this.node) {
      try { this.node.disconnect(); } catch (e) {}
      this.node = null;
    }
  }
}
