/*
 * Echo(audioCtx, input, output)
 * AudioWorklet echo with its own circular delay buffer (no createDelay / DelayNode),
 * loaded through a Blob URL.
 *
 * Output is wet only (the crushed/echoed signal), no internal dry.
 *
 * Usage:
 *   const ec = new Echo(audioCtx, someNode, audioCtx.destination);
 *   await ec.ready;
 *   ec.unbypass();            // input -> processing -> output
 *   ec.setTime(375);          // 10..2000 ms
 *   ec.setFeedback(0.4);      // 0..0.95
 *   ec.setTone(0.75);         // 0..1 -> lowpass 200 Hz..20 kHz (exponential)
 *   ec.setWet(0.5);           // 0..1 level of the echo signal
 *   ec.setOutputGain(0);      // -48..+48 dB
 *   ec.setPingPong(true);     // cross-feed repeats between channel pairs
 *   ec.setTimeSync(120, 0.5); // optional: time from BPM and beats (0.5 = 1/8 note)
 *   ec.bypass();              // input -> output directly
 */

const ECHO_WORKLET_CODE = `
class EchoProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'timeMs',   defaultValue: 375,  minValue: 10,  maxValue: 2000,  automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0.4,  minValue: 0,   maxValue: 0.95,  automationRate: 'k-rate' },
      { name: 'toneHz',   defaultValue: 6000, minValue: 200, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'wet',      defaultValue: 0.5,  minValue: 0,   maxValue: 1,     automationRate: 'k-rate' },
      { name: 'gainDb',   defaultValue: 0,    minValue: -48, maxValue: 48,    automationRate: 'k-rate' },
      { name: 'pingpong', defaultValue: 0,    minValue: 0,   maxValue: 1,     automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super();
    const po = (options && options.processorOptions) || {};
    this.channels = po.channels || 8;
    this.len = Math.ceil(sampleRate * 2.0) + 16; // 2 s max + margin
    this.buf = [];
    for (let c = 0; c < this.channels; c++) this.buf.push(new Float32Array(this.len));
    this.w = 0;
    this.lp = new Float64Array(this.channels);   // tone lowpass state
    this.ys = new Float64Array(this.channels);   // per-sample wet values
    this.active = false;

    // smoothed values
    this.delayS = 0.375 * sampleRate;
    this.fbS = 0.4;
    this.wetS = 0.5;
    this.gainS = 1;
    this.toneS = 1 - Math.exp(-6.283185307179586 * 6000 / sampleRate);

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
    for (let c = 0; c < this.channels; c++) this.buf[c].fill(0);
    this.lp.fill(0);
    this.limGain = 1;
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    if (!this.active) return true; // outputs stay silent

    const inp = inputs[0] || [];
    const n = out[0].length;
    const chs = Math.min(this.channels, out.length);
    const len = this.len;

    const delayT = (parameters.timeMs[0] / 1000) * sampleRate;
    const fbT    = parameters.feedback[0];
    const toneT  = 1 - Math.exp(-6.283185307179586 * parameters.toneHz[0] / sampleRate);
    const wetT   = parameters.wet[0];
    const gainT  = Math.pow(10, parameters.gainDb[0] / 20);
    const pp     = parameters.pingpong[0] > 0.5;

    const ys = this.ys;
    let w = this.w;

    for (let i = 0; i < n; i++) {
      // smoothing (delay time glides like a tape echo instead of clicking)
      this.delayS += (delayT - this.delayS) * 0.0003;
      this.fbS    += (fbT   - this.fbS)    * 0.002;
      this.wetS   += (wetT  - this.wetS)   * 0.002;
      this.gainS  += (gainT - this.gainS)  * 0.002;
      this.toneS  += (toneT - this.toneS)  * 0.002;

      let rp = w - this.delayS;
      if (rp < 0) rp += len;
      const i0 = Math.floor(rp);
      const frac = rp - i0;
      const i1 = (i0 + 1) % len;

      const fb = this.fbS;
      const level = this.wetS * this.gainS;
      let peak = 0;

      // 1) read + tone filter every channel
      for (let c = 0; c < chs; c++) {
        const b = this.buf[c];
        const d = b[i0] * (1 - frac) + b[i1] * frac;
        this.lp[c] += this.toneS * (d - this.lp[c]);
        ys[c] = this.lp[c];
      }

      // 2) write input + feedback (ping-pong crosses channel pairs 0-1, 2-3, ...)
      for (let c = 0; c < chs; c++) {
        let src = c;
        if (pp) {
          const partner = c ^ 1;
          if (partner < chs) src = partner;
        }
        const x = inp[c] ? inp[c][i] : 0;
        this.buf[c][w] = x + ys[src] * fb;

        const o = ys[c] * level;
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

      w++;
      if (w >= len) w = 0;
    }

    this.w = w;
    return true;
  }
}
registerProcessor('echo-processor', EchoProcessor);
`;

// one addModule per AudioContext (registerProcessor throws on duplicates)
const _echoModuleLoaded = new WeakMap();

function _loadEchoModule(audioCtx) {
  if (_echoModuleLoaded.has(audioCtx)) return _echoModuleLoaded.get(audioCtx);
  const blob = new Blob([ECHO_WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const p = audioCtx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
  _echoModuleLoaded.set(audioCtx, p);
  return p;
}

class Echo {
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
      timeMs: 375,
      feedback: 0.4,
      toneHz: 200 * Math.pow(100, 0.75),
      wet: 0.5,
      gainDb: 0,
      pingpong: 0
    };

    // start bypassed so audio flows right away
    this._connectDirect();

    this.ready = _loadEchoModule(audioCtx).then(() => {
      this.node = new AudioWorkletNode(audioCtx, 'echo-processor', {
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

  setTime(ms)        { this._set('timeMs', ms, 10, 2000); }                       // ms
  setFeedback(v)     { this._set('feedback', v, 0, 0.95); }                       // 0..0.95
  setTone(v)         { this._set('toneHz', 200 * Math.pow(100, Math.min(1, Math.max(0, v))), 200, 20000); } // 0..1 -> 200 Hz..20 kHz
  setWet(v)          { this._set('wet', v, 0, 1); }                               // level of the echo (wet only)
  setOutputGain(db)  { this._set('gainDb', db, -48, 48); }                        // dB
  setPingPong(on)    { this._set('pingpong', on ? 1 : 0, 0, 1); }                 // true/false or 1/0

  // optional helper: time from BPM, beats = 1 (quarter), 0.5 (eighth), 0.25 (sixteenth)...
  setTimeSync(bpm, beats) { this.setTime((60000 / bpm) * beats); }

  destroy() {
    this.bypass();
    this._disconnectDirect();
    if (this.node) {
      try { this.node.disconnect(); } catch (e) {}
      this.node = null;
    }
  }
}
