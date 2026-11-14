// ---------------------------------------------------------------------------
// Phaser: a chain of first-order all-pass filters whose break frequency is
// swept by an LFO. Mixed with the dry signal, the phase shifts turn into
// moving notches. Optional feedback (positive or negative) makes them sharper.
//
// 8 channels, one filter chain per channel; channel pairs get an LFO phase
// offset (spread) for width. Cheap on purpose:
//  - all stages of a channel share ONE coefficient, so there is no per-stage
//    tan() and no per-sample LFO: the LFO and the coefficient are evaluated
//    once per block and interpolated across it;
//  - silent channels are skipped once their tail has died out.
// ---------------------------------------------------------------------------

const PHASER_WORKLET_CODE = `
class PhaserProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = 'k-rate';
    return [
      { name: 'wet',      defaultValue: 0.5, minValue: 0,    maxValue: 1,    automationRate: k },
      { name: 'depth',    defaultValue: 0.6, minValue: 0,    maxValue: 1,    automationRate: k },
      { name: 'rate',     defaultValue: 0.4, minValue: 0.02, maxValue: 10,   automationRate: k },
      { name: 'center',   defaultValue: 800, minValue: 100,  maxValue: 4000, automationRate: k },
      { name: 'stages',   defaultValue: 4,   minValue: 1,    maxValue: 12,   automationRate: k },
      { name: 'feedback', defaultValue: 0.5, minValue: -0.9, maxValue: 0.9,  automationRate: k },
      { name: 'spread',   defaultValue: 0.5, minValue: 0,    maxValue: 1,    automationRate: k }
    ];
  }

  constructor() {
    super();
    this.z = new Float64Array(8 * 12);   // all-pass state: 8 channels x 12 stages
    this.fbS = new Float64Array(8);      // feedback sample per channel
    this.aCur = new Float64Array(8);     // all-pass coefficient at block start
    this.aEnd = new Float64Array(8);     // ... and at block end
    this.silent = new Float64Array(8);   // samples since a channel last had input
    this.idle = new Uint8Array(8);
    this.phase = 0;
    this.prevStages = 4;
    this.inited = false;
    this.cWet = 0;
    this.cFb = 0;
    this.port.onmessage = () => this._reset();
  }

  _reset() {
    this.z.fill(0);
    this.fbS.fill(0);
    this.silent.fill(0);
    this.idle.fill(0);
  }

  // first-order all-pass coefficient for a break frequency (90 degrees of phase shift there)
  _coef(freq) {
    const t = Math.tan(Math.PI * freq / sampleRate);
    return (t - 1) / (t + 1);
  }

  // LFO (sine) -> break frequency, swept exponentially around the centre
  _freq(phase, ch, spread, center, depth) {
    const off = spread * ((ch & 1) * 0.5 + (ch >> 1) * 0.25);
    const lfo = Math.sin(6.283185307 * (phase + off));
    const f = center * Math.pow(2, depth * 2.5 * lfo);   // up to +/- 2.5 octaves
    const max = sampleRate * 0.45;
    return f < 20 ? 20 : f > max ? max : f;
  }

  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    const nCh = Math.min(out.length, 8);
    if (!nCh) return true;
    const n = out[0].length;
    const sr = sampleRate;

    const tWet = p.wet[0], tFb = p.feedback[0];
    const center = p.center[0], depth = p.depth[0], spread = p.spread[0];
    const stages = Math.max(1, Math.min(12, Math.round(p.stages[0])));

    if (!this.inited) {
      this.inited = true;
      this.cWet = tWet;
      this.cFb = tFb;
      for (let ch = 0; ch < 8; ch++) {
        this.aCur[ch] = this._coef(this._freq(this.phase, ch, spread, center, depth));
      }
    }

    // fewer stages than before: clear the unused ones so they start clean when re-enabled
    if (stages < this.prevStages) {
      for (let ch = 0; ch < 8; ch++) {
        for (let s = stages; s < this.prevStages; s++) this.z[ch * 12 + s] = 0;
      }
    }
    this.prevStages = stages;

    // LFO advances once per block; coefficients at the end of the block
    const phaseEnd = this.phase + p.rate[0] * n / sr;
    for (let ch = 0; ch < nCh; ch++) {
      this.aEnd[ch] = this._coef(this._freq(phaseEnd, ch, spread, center, depth));
    }
    this.phase = phaseEnd - Math.floor(phaseEnd);

    const tail = (Math.abs(tFb) > 0.001 || Math.abs(this.cFb) > 0.001) ? sr * 3 : sr * 0.3;
    const dW = (tWet - this.cWet) / n;
    const dF = (tFb - this.cFb) / n;
    const z = this.z;

    for (let ch = 0; ch < nCh; ch++) {
      const xin = inp[ch], yout = out[ch];

      // any signal on this channel?
      let has = false;
      if (xin) {
        for (let i = 0; i < n; i++) {
          const s = xin[i];
          if (s > 1e-7 || s < -1e-7) { has = true; break; }
        }
      }
      if (has) this.silent[ch] = 0; else this.silent[ch] += n;

      // silent and tail finished: skip this channel
      if (!has && this.silent[ch] > tail) {
        if (!this.idle[ch]) {
          for (let s = 0; s < 12; s++) z[ch * 12 + s] = 0;
          this.fbS[ch] = 0;
          this.idle[ch] = 1;
        }
        yout.fill(0);
        continue;
      }
      this.idle[ch] = 0;

      let a = this.aCur[ch];
      const da = (this.aEnd[ch] - a) / n;
      let wv = this.cWet, f = this.cFb, fbs = this.fbS[ch];
      const zb = ch * 12;

      for (let i = 0; i < n; i++) {
        a += da; wv += dW; f += dF;
        const x = xin ? xin[i] : 0;

        let s = x + fbs * f;
        for (let st = 0; st < stages; st++) {
          const y = a * s + z[zb + st];   // first-order all-pass
          z[zb + st] = s - a * y;
          s = y;
        }

        fbs = s > 8 ? 8 : s < -8 ? -8 : s;
        if (fbs < 1e-20 && fbs > -1e-20) fbs = 0;

        // feedback adds gain on average (1 / (1 - f^2) in power): compensate it
        const w = s * Math.sqrt(1 - f * f);

        // wet = 1 gives (dry + all-pass) / 2, i.e. the deepest notches
        yout[i] = x * (1 - 0.5 * wv) + w * 0.5 * wv;
      }
      this.fbS[ch] = fbs;
    }

    this.cWet = tWet;
    this.cFb = tFb;
    for (let ch = 0; ch < 8; ch++) this.aCur[ch] = this.aEnd[ch];
    return true;
  }
}
registerProcessor('phaser-processor', PhaserProcessor);
`;

class Phaser {
  static _loading = new WeakMap(); // audioCtx -> addModule promise (a processor can only be registered once)

  static _load(audioCtx) {
    if (!Phaser._loading.has(audioCtx)) {
      const blob = new Blob([PHASER_WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const p = audioCtx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
      Phaser._loading.set(audioCtx, p);
    }
    return Phaser._loading.get(audioCtx);
  }

  // [min, max] per setting (values outside are clamped)
  static RANGES = {
    wet:      [0, 1],
    depth:    [0, 1],
    rate:     [0.02, 10],
    center:   [100, 4000],
    stages:   [1, 12],
    feedback: [-0.9, 0.9],
    spread:   [0, 1],
  };

  constructor(audioCtx, input, output, startBypassed = true) {
    this.ctx = audioCtx;
    this.input = input;
    this.output = output;
    this.node = null;
    this._bypassed = startBypassed;   // starts bypassed by default, like Chorus
    this.settings = {};

    // dry pass-through until the worklet is ready (and while bypassed)
    this.input.connect(this.output);
    this.ready = this._init();
  }

  async _init() {
    await Phaser._load(this.ctx);
    this.node = new AudioWorkletNode(this.ctx, 'phaser-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
    });
    for (const [name, v] of Object.entries(this.settings)) {
      this.node.parameters.get(name).value = v;
    }
    this._route();
  }

  _route() {
    if (!this.node) return;
    try { this.input.disconnect(this.output); } catch (e) {}
    try { this.input.disconnect(this.node); } catch (e) {}
    try { this.node.disconnect(); } catch (e) {}
    if (this._bypassed) {
      this.input.connect(this.output);
    } else {
      this.input.connect(this.node);
      this.node.connect(this.output);
    }
  }

  bypass()   { this._bypassed = true;  this._route(); }

  unbypass() {
    this._bypassed = false;
    if (this.node) this.node.port.postMessage('reset');   // clear stale filter state
    this._route();
  }

  _set(name, v) {
    v = Number(v);
    if (!Number.isFinite(v)) return;
    const [lo, hi] = Phaser.RANGES[name];
    v = Math.min(hi, Math.max(lo, v));
    this.settings[name] = v;
    if (this.node) this.node.parameters.get(name).value = v;
  }

  wet(v)      { this._set('wet', v); }       // 0-1      dry/wet (1 = deepest notches)
  depth(v)    { this._set('depth', v); }     // 0-1      sweep width, up to +/- 2.5 octaves
  rate(hz)    { this._set('rate', hz); }     // 0.02-10 Hz   LFO speed
  center(hz)  { this._set('center', hz); }   // 100-4000 Hz  middle of the sweep
  stages(n)   { this._set('stages', n); }    // 1-12     all-pass stages (2 per notch, even numbers are classic)
  feedback(v) { this._set('feedback', v); }  // -0.9-0.9 sharper notches; negative gives a different, hollower tone
  spread(v)   { this._set('spread', v); }    // 0-1      LFO phase offset between channels (width)
}