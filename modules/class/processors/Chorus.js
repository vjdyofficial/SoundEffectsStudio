const CHORUS_WORKLET_CODE = `
class ChorusProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = 'k-rate';
    return [
      { name: 'wet',      defaultValue: 0.5, minValue: 0,    maxValue: 1,    automationRate: k },
      { name: 'depth',    defaultValue: 0.5, minValue: 0,    maxValue: 1,    automationRate: k },
      { name: 'rate',     defaultValue: 0.8, minValue: 0.05, maxValue: 10,   automationRate: k },
      { name: 'delay',    defaultValue: 20,  minValue: 5,    maxValue: 50,   automationRate: k },
      { name: 'voices',   defaultValue: 3,   minValue: 1,    maxValue: 6,    automationRate: k },
      { name: 'spread',   defaultValue: 0.5, minValue: 0,    maxValue: 1,    automationRate: k },
      { name: 'feedback', defaultValue: 0,   minValue: 0,    maxValue: 0.7,  automationRate: k },
      { name: 'lowcut',   defaultValue: 150, minValue: 20,   maxValue: 1000, automationRate: k }
    ];
  }

  constructor() {
    super();
    const MAXCH = 8;
    let size = 1;
    while (size < sampleRate * 0.12) size <<= 1; // power of two: wrap with a mask
    this.size = size;
    this.mask = size - 1;
    this.bufs = [];
    for (let c = 0; c < MAXCH; c++) this.bufs.push(new Float32Array(size));
    this.pos = 0;
    this.phase = 0;
    this.cur = null;
    this.fb = new Float32Array(MAXCH);
    this.hpX = new Float32Array(MAXCH);
    this.hpY = new Float32Array(MAXCH);
    this.silent = new Float64Array(MAXCH); // samples since last input signal
    this.idle = new Uint8Array(MAXCH);
    this.d = new Float64Array(6);
    this.dStep = new Float64Array(6);
    this.port.onmessage = () => { for (let c = 0; c < MAXCH; c++) this._clear(c); };
  }

  _clear(ch) {
    this.bufs[ch].fill(0);
    this.fb[ch] = 0; this.hpX[ch] = 0; this.hpY[ch] = 0;
    this.idle[ch] = 1;
  }

  process(inputs, outputs, p) {
    const inp = inputs[0], out = outputs[0];
    const nCh = Math.min(out.length, 8);
    if (!nCh) return true;
    const n = out[0].length;
    const sr = sampleRate;

    const tWet = p.wet[0], tDepth = p.depth[0], tDelay = p.delay[0],
          tSpread = p.spread[0], tFb = p.feedback[0];
    if (!this.cur) this.cur = { wet: tWet, depth: tDepth, delay: tDelay, spread: tSpread, fb: tFb };
    const c = this.cur;

    const ph0 = this.phase;
    const ph1 = ph0 + (p.rate[0] / sr) * n;
    this.phase = ph1 - Math.floor(ph1);
    const p0 = this.pos;
    const mask = this.mask;
    this.pos = (p0 + n) & mask;

    // wet = 0: plain pass-through, no processing
    if (tWet <= 0 && c.wet <= 0) {
      for (let ch = 0; ch < nCh; ch++) {
        if (inp[ch]) out[ch].set(inp[ch]); else out[ch].fill(0);
        if (!this.idle[ch]) this._clear(ch);
      }
      c.wet = tWet; c.depth = tDepth; c.delay = tDelay; c.spread = tSpread; c.fb = tFb;
      return true;
    }

    const TWO_PI = 6.283185307;
    const voices = Math.max(1, Math.min(6, Math.round(p.voices[0])));
    const inv = 1 / voices, norm = 1 / Math.sqrt(voices);
    const rc = 1 / (TWO_PI * p.lowcut[0]);
    const hpA = rc / (rc + 1 / sr);
    const tail = (tFb > 0.001 || c.fb > 0.001) ? sr * 3 : this.size;

    const dl0 = c.delay * 0.001 * sr, dl1 = tDelay * 0.001 * sr;
    const amp0 = Math.min(c.depth * 0.010 * sr, dl0 - 1);
    const amp1 = Math.min(tDepth * 0.010 * sr, dl1 - 1);
    const dW = (tWet - c.wet) / n, dF = (tFb - c.fb) / n;
    const dCur = this.d, dStep = this.dStep;

    for (let ch = 0; ch < nCh; ch++) {
      const xin = inp[ch], yout = out[ch];

      // is there any signal on this channel?
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
        if (!this.idle[ch]) this._clear(ch);
        yout.fill(0);
        continue;
      }
      this.idle[ch] = 0;

      // delay time per voice at block start and end (linear in between)
      const pairOff = (ch & 1) * 0.5 + (ch >> 1) * 0.25;
      for (let v = 0; v < voices; v++) {
        const off = v * inv;
        const dd = 1 + 0.08 * v;
        const a = dl0 * dd + amp0 * Math.sin(TWO_PI * (ph0 + off + c.spread * pairOff));
        const b = dl1 * dd + amp1 * Math.sin(TWO_PI * (ph1 + off + tSpread * pairOff));
        dCur[v] = a;
        dStep[v] = (b - a) / n;
      }

      const buf = this.bufs[ch];
      let fbs = this.fb[ch], hx = this.hpX[ch], hy = this.hpY[ch];
      let wv = c.wet, f = c.fb;

      for (let i = 0; i < n; i++) {
        const x = xin ? xin[i] : 0;
        const wi = (p0 + i) & mask;
        buf[wi] = x + fbs * f;

        let sum = 0;
        for (let v = 0; v < voices; v++) {
          const rp = wi - dCur[v];
          const i0 = Math.floor(rp);
          const fr = rp - i0;
          const a = buf[i0 & mask], b = buf[(i0 + 1) & mask];
          sum += a + (b - a) * fr;
          dCur[v] += dStep[v];
        }

        const avg = sum * inv;
        fbs = (avg < 1e-20 && avg > -1e-20) ? 0 : avg;

        // high-pass the wet signal
        const w = sum * norm;
        const y = hpA * (hy + w - hx);
        hx = w; hy = y;

        wv += dW; f += dF;
        yout[i] = x * (1 - wv) + y * wv;
      }

      this.fb[ch] = fbs; this.hpX[ch] = hx; this.hpY[ch] = hy;
    }

    c.wet = tWet; c.depth = tDepth; c.delay = tDelay; c.spread = tSpread; c.fb = tFb;
    return true;
  }
}
registerProcessor('chorus-processor', ChorusProcessor);
`;

class Chorus {
  static _loading = new WeakMap(); // audioCtx -> addModule promise (can only register once)

  static _load(audioCtx) {
    if (!Chorus._loading.has(audioCtx)) {
      const blob = new Blob([CHORUS_WORKLET_CODE], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      const p = audioCtx.audioWorklet
        .addModule(url)
        .finally(() => URL.revokeObjectURL(url));
      Chorus._loading.set(audioCtx, p);
    }
    return Chorus._loading.get(audioCtx);
  }

  constructor(audioCtx, input, output) {
    this.ctx = audioCtx;
    this.input = input;
    this.output = output;
    this.node = null;
    this._bypassed = true;
    this.settings = {};

    // pass audio through until the worklet is ready
    this.input.connect(this.output);
    this.ready = this._init();
  }

  async _init() {
    await Chorus._load(this.ctx);
    // in _init(): force a real 8-channel node
    this.node = new AudioWorkletNode(this.ctx, "chorus-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [8],
      channelCount: 8,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });

    // clear stale delay-line audio when coming back from bypass

    for (const [name, v] of Object.entries(this.settings)) {
      this.node.parameters.get(name).value = v;
    }
    this._route();
  }

  _route() {
    if (!this.node) return;
    try {
      this.input.disconnect(this.output);
    } catch (e) {}
    try {
      this.input.disconnect(this.node);
    } catch (e) {}
    try {
      this.node.disconnect();
    } catch (e) {}
    if (this._bypassed) {
      this.input.connect(this.output);
    } else {
      this.input.connect(this.node);
      this.node.connect(this.output);
    }
  }

  bypass() {
    this._bypassed = true;
    this._route();
  }
  unbypass() {
    this._bypassed = false;
    if (this.node) this.node.port.postMessage("reset");
    this._route();
  }

  _set(name, v) {
    this.settings[name] = v;
    if (this.node) this.node.parameters.get(name).value = v;
  }

  wet(v) {
    this._set("wet", v);
  } // 0-1   dry/wet mix
  depth(v) {
    this._set("depth", v);
  } // 0-1   modulation amount
  rate(hz) {
    this._set("rate", hz);
  } // 0.05-10 Hz
  delay(ms) {
    this._set("delay", ms);
  } // 5-50 ms base delay
  voices(n) {
    this._set("voices", n);
  } // 1-6
  spread(v) {
    this._set("spread", v);
  } // 0-1   stereo/surround phase offset between channels
  feedback(v) {
    this._set("feedback", v);
  } // 0-0.7
  lowcut(hz) {
    this._set("lowcut", hz);
  } // 20-1000 Hz high-pass on the wet signal
}
