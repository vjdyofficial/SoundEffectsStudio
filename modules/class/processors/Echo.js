// ---------------------------------------------------------------------------
// Echo: 1-10 repeats, 8 channels, AudioWorklet (no DelayNode anywhere).
//
// Why it has no buffer problems:
//  - the echoes are TAPS read from one ring buffer per channel: there is no
//    feedback loop (neither in the graph nor in the code), so nothing can run
//    away and no DelayNode "minimum delay in a cycle" rule applies;
//  - LATENCY: every echo is at least `latency` samples behind the write head
//    (default ~6 ms, never less than 2 render quanta), so a read can never
//    touch data that has not been written yet, even while the time is being
//    changed;
//  - the buffer is allocated once, up front, for the longest possible time
//    (maxTime x 5 echoes), so a read can never wrap into stale data;
//  - the input block is written first, then the taps are read;
//  - silent channels are skipped once the last echo has died out (their
//    buffer is cleared once, so old audio never comes back).
//
// Echo k (1..N) is the input delayed by k x time, at level wet x feedback^(k-1):
// "feedback" is how much quieter each repeat is than the one before.
// Output is the echoes ONLY (no dry), like the BitCrusher.
// ---------------------------------------------------------------------------

const ECHO_WORKLET_CODE = `
class EchoProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = 'k-rate';
    return [
      { name: 'wet',      defaultValue: 0.5, minValue: 0, maxValue: 1,     automationRate: k },
      { name: 'delay',    defaultValue: 250, minValue: 1, maxValue: 10000, automationRate: k }, // ms
      { name: 'feedback', defaultValue: 0.5, minValue: 0, maxValue: 1,     automationRate: k },
      { name: 'echoes',   defaultValue: 3,   minValue: 1, maxValue: 10,     automationRate: k },
      { name: 'limiter',  defaultValue: 1,   minValue: 0, maxValue: 1,     automationRate: k }
    ];
  }

  constructor(options) {
    super();
    const o = options.processorOptions;
    this.size = o.bufferSize;
    this.mask = o.bufferSize - 1;
    this.latency = o.latency;     // samples: shortest allowed echo time
    this.maxDelay = o.maxDelay;   // samples: longest allowed echo time

    this.bufs = [];
    for (let c = 0; c < 8; c++) this.bufs.push(new Float32Array(this.size));
    this.w = 0;                   // write position, shared by all channels
    this.d = 0;                   // current echo time in samples
    this.inited = false;
    this.cg = new Float64Array(10);  // tap gains (current)
    this.tg = new Float64Array(10);  // tap gains (target)
    this.act = new Uint8Array(10);
    this.silent = new Float64Array(8);
    this.idle = new Uint8Array(8);
    this.gl = 1;                  // limiter gain
    this.port.onmessage = () => this._reset();
  }

  _reset() {
    for (let c = 0; c < 8; c++) this.bufs[c].fill(0);
    this.silent.fill(0);
    this.idle.fill(0);
    this.gl = 1;
  }

  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    const nCh = Math.min(out.length, 8);
    if (!nCh) return true;
    const n = out[0].length;
    const sr = sampleRate;
    const mask = this.mask;
    const w = this.w;

    // echo time in samples, kept between the latency and the maximum
    let tD = p.delay[0] * 0.001 * sr;
    tD = tD < this.latency ? this.latency : tD > this.maxDelay ? this.maxDelay : tD;
    if (!this.inited) { this.inited = true; this.d = tD; }
    const d0 = this.d;
    const dd = (tD - d0) / n;     // time glides across the block: no clicks

    // tap k (0..9) = wet * feedback^k while k < echoes, otherwise 0
    const echoes = Math.max(1, Math.min(10, Math.round(p.echoes[0])));
    const wet = p.wet[0], fb = p.feedback[0];
    for (let k = 0; k < 10; k++) {
      this.tg[k] = k < echoes ? wet * Math.pow(fb, k) : 0;
      this.act[k] = (this.cg[k] !== 0 || this.tg[k] !== 0) ? 1 : 0;
    }

    // samples until the last echo has finished
    const tail = echoes * Math.max(d0, tD) + n;

    for (let ch = 0; ch < nCh; ch++) {
      const xin = inp[ch], yout = out[ch], buf = this.bufs[ch];

      // any signal on this channel?
      let has = false;
      if (xin) {
        for (let i = 0; i < n; i++) {
          const s = xin[i];
          if (s > 1e-7 || s < -1e-7) { has = true; break; }
        }
      }
      if (has) this.silent[ch] = 0; else this.silent[ch] += n;

      // silent and every echo finished: skip, and clear the buffer once
      if (!has && this.silent[ch] > tail) {
        if (!this.idle[ch]) { buf.fill(0); this.idle[ch] = 1; }
        yout.fill(0);
        continue;
      }
      this.idle[ch] = 0;

      // write the input block FIRST: every read below is behind the write head
      for (let i = 0; i < n; i++) buf[(w + i) & mask] = xin ? xin[i] : 0;

      yout.fill(0);
      for (let k = 0; k < 10; k++) {
        if (!this.act[k]) continue;
        const m = k + 1;
        let g = this.cg[k];
        const dg = (this.tg[k] - g) / n;
        let d = d0;
        for (let i = 0; i < n; i++) {
          d += dd; g += dg;
          const pos = w + i - m * d;     // always >= latency samples behind the write head
          const i0 = Math.floor(pos);
          const a = buf[i0 & mask];
          yout[i] += g * (a + (buf[(i0 + 1) & mask] - a) * (pos - i0));
        }
      }
    }

    this.w = (w + n) & mask;
    this.d = tD;
    for (let k = 0; k < 10; k++) this.cg[k] = this.tg[k];

    // safety limiter at about 0 dB, linked across channels (acts on the echoes only)
    let gl = this.gl;
    if (p.limiter[0] > 0.5) {
      const rel = 1 - Math.exp(-1 / (0.15 * sr));
      for (let i = 0; i < n; i++) {
        let pk = 0;
        for (let ch = 0; ch < nCh; ch++) {
          const v = Math.abs(out[ch][i]);
          if (v > pk) pk = v;
        }
        const tgt = pk > 0.98 ? 0.98 / pk : 1;
        if (tgt < gl) gl = tgt; else gl += (1 - gl) * rel;
        if (gl < 1) for (let ch = 0; ch < nCh; ch++) out[ch][i] *= gl;
      }
    } else {
      gl = 1;
    }
    this.gl = gl;
    return true;
  }
}
registerProcessor('echo-processor', EchoProcessor);
`;

class Echo {
  static _loading = new WeakMap(); // audioCtx -> addModule promise (a processor can only be registered once)

  static _load(audioCtx) {
    if (!Echo._loading.has(audioCtx)) {
      const blob = new Blob([ECHO_WORKLET_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const p = audioCtx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
      Echo._loading.set(audioCtx, p);
    }
    return Echo._loading.get(audioCtx);
  }

  // [min, max] per setting (values outside are clamped)
  static RANGES = {
    wet:      [0, 1],
    feedback: [0, 1],
    echoes:   [1, 10],
    limiter:  [0, 1],
  };
  static TEMPO = [40, 250];       // BPM
  static BEAT = [0.0625, 8];      // beats per echo

  // options: { maxTime: seconds (default 2), latency: seconds (default 0.006) }
  constructor(audioCtx, input, output, startBypassed = true, options = {}) {
    const { maxTime = 2, latency = 0.006 } = options;
    const sr = audioCtx.sampleRate;

    this.ctx = audioCtx;
    this.input = input;
    this.output = output;
    this.node = null;
    this._bypassed = startBypassed;   // starts bypassed by default, like Chorus
    this.settings = {};

    // sizes (samples)
    this.latencySamples = Math.max(256, Math.ceil(latency * sr));   // never below 2 render quanta
    this.maxDelaySamples = Math.floor(maxTime * sr);
    // 10 echoes x the longest time, plus room for one block and the interpolation read
    this.bufferSize = 2 ** Math.ceil(Math.log2(10 * this.maxDelaySamples + 256));

    // echo time: free time (ms) or tempo-synced (bpm x beats)
    this._mode = 'time';
    this._timeMs = 250;
    this._bpm = 120;
    this._beat = 0.5;
    this._applyTime();

    // dry pass-through until the worklet is ready (and while bypassed)
    this.input.connect(this.output);
    this.ready = this._init();
  }

  async _init() {
    await Echo._load(this.ctx);
    this.node = new AudioWorkletNode(this.ctx, 'echo-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      processorOptions: {
        bufferSize: this.bufferSize,
        latency: this.latencySamples,
        maxDelay: this.maxDelaySamples,
      },
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
      this.input.connect(this.output);
      this.input.connect(this.node);
      this.node.connect(this.output);
    }
  }

  bypass()   { this._bypassed = true;  this._route(); }

  unbypass() {
    this._bypassed = false;
    if (this.node) this.node.port.postMessage('reset');   // clear old audio from the buffers
    this._route();
  }

  _setParam(name, v) {
    this.settings[name] = v;
    if (this.node) this.node.parameters.get(name).value = v;
  }

  _set(name, v) {
    v = Number(v);
    if (!Number.isFinite(v)) return;
    const [lo, hi] = Echo.RANGES[name];
    this._setParam(name, Math.min(hi, Math.max(lo, v)));
  }

  // time in ms: from the free time, or from tempo x beats
  _applyTime() {
    let ms = this._mode === 'beat' ? (60000 / this._bpm) * this._beat : this._timeMs;
    const lo = (this.latencySamples / this.ctx.sampleRate) * 1000;
    const hi = (this.maxDelaySamples / this.ctx.sampleRate) * 1000;
    if (ms < lo) {
      console.warn('Echo: time ' + ms.toFixed(1) + ' ms is below the safe minimum, using ' + lo.toFixed(1) + ' ms');
      ms = lo;
    } else if (ms > hi) {
      console.warn('Echo: time ' + ms.toFixed(0) + ' ms is above the maximum, using ' + hi.toFixed(0) + ' ms');
      ms = hi;
    }
    this._effectiveMs = ms;
    this._setParam('delay', ms);
  }

  get latency() { return this.latencySamples / this.ctx.sampleRate; }   // seconds: shortest echo time
  get timeMs()  { return this._effectiveMs; }                           // the echo time in use

  wet(v)      { this._set('wet', v); }        // 0-1  level of the echoes (output is echoes only)
  feedback(v) { this._set('feedback', v); }   // 0-1  how loud each repeat stays vs the previous one
  echoes(n)   { this._set('echoes', Math.round(Number(n))); }   // 1-10 repeats

  // free time in ms (switches to time mode)
  time(ms) {
    ms = Number(ms);
    if (!Number.isFinite(ms)) return;
    this._timeMs = ms;
    this._mode = 'time';
    this._applyTime();
  }

  // tempo-synced (switches to beat mode): tempo(120); beat(0.5) = an eighth note
  tempo(bpm) {
    bpm = Number(bpm);
    if (!Number.isFinite(bpm)) return;
    this._bpm = Math.min(Echo.TEMPO[1], Math.max(Echo.TEMPO[0], bpm));
    this._mode = 'beat';
    this._applyTime();
  }

  beat(beats) {
    beats = Number(beats);
    if (!Number.isFinite(beats)) return;
    this._beat = Math.min(Echo.BEAT[1], Math.max(Echo.BEAT[0], beats));
    this._mode = 'beat';
    this._applyTime();
  }

  limiter(on) { this._set('limiter', on ? 1 : 0); }
}