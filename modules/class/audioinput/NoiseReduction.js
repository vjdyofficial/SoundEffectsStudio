class NoiseReduction extends GainNode {
  static _modules = new WeakMap(); // one addModule per AudioContext

  static _load(ctx) {
    if (!NoiseReduction._modules.has(ctx)) {
      const code = `
      class NoiseReductionProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();
          const nch = (options.processorOptions && options.processorOptions.channels) || 2;
          this.nch = nch;
          const sr = sampleRate;

          // STFT: 512 window, hop 128 (75% overlap)
          const N = 512;
          this.N = N; this.H = 128; this.K = N >> 1;
          this.win = new Float64Array(N);
          for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
          this.synScale = 1 / (1.5 * N);
          this.cosT = new Float64Array(N >> 1);
          this.sinT = new Float64Array(N >> 1);
          for (let k = 0; k < (N >> 1); k++) {
            this.cosT[k] = Math.cos(2 * Math.PI * k / N);
            this.sinT[k] = Math.sin(2 * Math.PI * k / N);
          }
          const bits = Math.round(Math.log2(N));
          this.rev = new Uint16Array(N);
          for (let i = 0; i < N; i++) {
            let r = 0;
            for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
            this.rev[i] = r;
          }
          this.re = new Float64Array(N);
          this.im = new Float64Array(N);
          this.G2 = new Float64Array(this.K + 1);

          this.inBuf = []; this.outAcc = [];
          this.Ps = []; this.Nz = []; this.Gs = [];
          for (let c = 0; c < nch; c++) {
            this.inBuf.push(new Float64Array(N));
            this.outAcc.push(new Float64Array(N));
            this.Ps.push(new Float64Array(this.K + 1));
            this.Nz.push(new Float64Array(this.K + 1));
            this.Gs.push(new Float64Array(this.K + 1).fill(1));
          }
          this.inited = new Uint8Array(nch);
          this.warm = new Uint16Array(nch);
          this.w = 0; this.hop = 0;
          this.learning = false;
          this.rise = Math.pow(10, (5 / 10) * this.H / sr);   // noise floor may rise ~5 dB/s

          // gate (runs on the live input, so it gets ~10 ms lookahead over the delayed denoised audio)
          const dt = 32 / sr;
          this.gAtk = 1 - Math.exp(-dt / 0.002);
          this.gRel = 1 - Math.exp(-dt / 0.080);
          this.gEnvUp = 1 - Math.exp(-dt / 0.001);
          this.gEnvDown = 1 - Math.exp(-dt / 0.030);
          this.holdMax = Math.round(0.1 / dt);
          this.gEnv = 0; this.gOpen = true; this.hold = 0; this.gGain = 1;
          this.gg = null; this.zero = null;

          this.denOn = false;
          this.setGate(25);
          this.setDen(25);

          this.port.onmessage = (e) => {
            const m = e.data;
            if (m.gate !== undefined) this.setGate(m.gate);
            if (m.denoiser !== undefined) this.setDen(m.denoiser);
            if (m.reset) this.reset();
          };
        }

        setGate(v) {
          v = Math.max(0, Math.min(50, v)) / 5;          // 0-50 -> 0-10 internally
          this.gateOn = v > 0;
          const db = -80 + v * 5;                        // 1 -> -79 dB ... 50 -> -30 dB
          this.openThr = Math.pow(10, db / 20);
          this.closeThr = Math.pow(10, (db - 4) / 20);
        }

        setDen(v) {
          v = Math.max(0, Math.min(50, v)) / 5;          // 0-50 -> 0-10 internally
          const on = v > 0;
          if (on && !this.denOn) this.resetStft();
          this.denOn = on;
          this.alpha = 1.2 + v * 0.35;                   // noise over-estimate (1.2 .. 4.7)
          this.beta = Math.pow(10, -(v * 3.5) / 20);     // max reduction up to 35 dB at 50
        }

        resetStft() {
          for (let c = 0; c < this.nch; c++) {
            this.inBuf[c].fill(0); this.outAcc[c].fill(0);
            this.Ps[c].fill(0); this.Nz[c].fill(0); this.Gs[c].fill(1);
          }
          this.inited.fill(0);
          this.warm.fill(0);
          this.w = 0; this.hop = 0;
        }

        reset() {
          this.resetStft();
          this.gEnv = 0; this.gOpen = true; this.hold = 0; this.gGain = 1;
        }

        fft(re, im) {
          const N = this.N, rev = this.rev, cs = this.cosT, sn = this.sinT;
          for (let i = 0; i < N; i++) {
            const j = rev[i];
            if (j > i) {
              let t = re[i]; re[i] = re[j]; re[j] = t;
              t = im[i]; im[i] = im[j]; im[j] = t;
            }
          }
          for (let size = 2; size <= N; size <<= 1) {
            const half = size >> 1, step = N / size;
            for (let i = 0; i < N; i += size) {
              for (let j = 0, k = 0; j < half; j++, k += step) {
                const wr = cs[k], wi = -sn[k];
                const a = i + j, b = a + half;
                const tr = re[b] * wr - im[b] * wi;
                const ti = re[b] * wi + im[b] * wr;
                re[b] = re[a] - tr; im[b] = im[a] - ti;
                re[a] += tr; im[a] += ti;
              }
            }
          }
        }

        frame(c, w) {
          const N = this.N, M = N - 1, K = this.K;
          const re = this.re, im = this.im, win = this.win;
          const ib = this.inBuf[c], ob = this.outAcc[c];
          for (let i = 0; i < N; i++) { re[i] = ib[(w + i) & M] * win[i]; im[i] = 0; }
          this.fft(re, im);

          // is this frame digital silence? (mic not streaming yet / muted)
          let sumP = 0;
          for (let k = 0; k <= K; k++) sumP += re[k] * re[k] + im[k] * im[k];
          const silent = sumP < 1e-9;
          if (silent && !this.inited[c]) return;          // nothing to learn, output stays 0

          const Ps = this.Ps[c], Nz = this.Nz[c], Gs = this.Gs[c], G2 = this.G2;
          const alpha = this.alpha, beta = this.beta, rise = this.rise;
          const first = !this.inited[c];

          // warm-up: learn the noise fast during the first ~0.4 s of real audio
          const warming = this.warm[c] < 150;
          if (warming && !silent) this.warm[c]++;
          const fastLearn = this.learning || warming;

          for (let k = 0; k <= K; k++) {
            const p = re[k] * re[k] + im[k] * im[k];
            let ps;
            if (first) { ps = p; Ps[k] = p; Nz[k] = p; Gs[k] = 1; }
            else { ps = Ps[k] * 0.7 + p * 0.3; Ps[k] = ps; }

            let nz = Nz[k];
            if (!silent) {                                // never learn from digital silence
              if (fastLearn) nz += 0.1 * (ps - nz);       // gate closed or warm-up: learn both ways
              else if (ps < nz) nz += 0.15 * (ps - nz);   // follow dips down
              else nz *= rise;                            // creep up slowly
              if (nz < 1e-12) nz = 1e-12;
              Nz[k] = nz;
            }

            const r = alpha * nz / (ps + 1e-20);
            let g = r >= 1 ? 0 : Math.sqrt(1 - r);
            if (g < beta) g = beta;

            const gp = Gs[k];
            g = g > gp ? gp + 0.8 * (g - gp) : gp + 0.15 * (g - gp);
            Gs[k] = g;
          }
          this.inited[c] = 1;

          G2[0] = Gs[0] * 0.75 + Gs[1] * 0.25;
          for (let k = 1; k < K; k++) G2[k] = 0.25 * Gs[k - 1] + 0.5 * Gs[k] + 0.25 * Gs[k + 1];
          G2[K] = Gs[K] * 0.75 + Gs[K - 1] * 0.25;

          for (let k = 0; k <= K; k++) {
            const g = G2[k];
            re[k] *= g; im[k] *= g;
            if (k > 0 && k < K) { re[N - k] *= g; im[N - k] *= g; }
          }

          this.fft(im, re);                               // inverse (swap trick): result lands in re
          const sc = this.synScale;
          for (let i = 0; i < N; i++) ob[(w + i) & M] += re[i] * win[i] * sc;
        }

        process(inputs, outputs) {
          const inp = inputs[0], out = outputs[0];
          const nch = Math.min(out.length, this.nch);
          if (!nch) return true;
          const len = out[0].length;
          const gateOn = this.gateOn, denOn = this.denOn;

          if (!gateOn && !denOn) {
            for (let c = 0; c < nch; c++) {
              if (inp[c]) out[c].set(inp[c]); else out[c].fill(0);
            }
            return true;
          }

          if (!this.gg || this.gg.length < len) {
            this.gg = new Float32Array(len);
            this.zero = new Float32Array(len);
          }
          const gg = this.gg;

          // A) gate gain (linked across channels)
          if (gateOn) {
            const CH = 32;
            for (let s = 0; s < len; s += CH) {
              const e = Math.min(s + CH, len), n = e - s;
              let peak = 0;
              for (let c = 0; c < nch; c++) {
                const x = inp[c];
                if (!x) continue;
                for (let i = s; i < e; i++) { const v = x[i], a = v < 0 ? -v : v; if (a > peak) peak = a; }
              }
              this.gEnv += (peak > this.gEnv ? this.gEnvUp : this.gEnvDown) * (peak - this.gEnv);
              if (this.gEnv > this.openThr) { this.gOpen = true; this.hold = this.holdMax; }
              else if (this.gEnv < this.closeThr) {
                if (this.hold > 0) this.hold--; else this.gOpen = false;
              }
              const t = this.gOpen ? 1 : 0.0005;
              const g0 = this.gGain;
              this.gGain += (t > g0 ? this.gAtk : this.gRel) * (t - g0);
              const d = (this.gGain - g0) / n;
              let g = g0;
              for (let i = s; i < e; i++) { g += d; gg[i] = g; }
            }
          } else {
            gg.fill(1, 0, len);
            this.gGain = 1; this.gOpen = true; this.hold = 0;
          }
          this.learning = gateOn && !this.gOpen;

          // B) denoiser + apply gate
          const M = this.N - 1, H = this.H;
          const w0 = this.w, hop0 = this.hop;
          let wEnd = w0, hopEnd = hop0;

          for (let c = 0; c < nch; c++) {
            const x = inp[c] || this.zero, y = out[c];
            if (denOn) {
              const ib = this.inBuf[c], ob = this.outAcc[c];
              let w = w0, hop = hop0;
              for (let i = 0; i < len; i++) {
                ib[w] = x[i];
                w = (w + 1) & M;
                if (++hop === H) { hop = 0; this.frame(c, w); }
                const o = ob[w]; ob[w] = 0;
                y[i] = o * gg[i];
              }
              wEnd = w; hopEnd = hop;
            } else {
              for (let i = 0; i < len; i++) y[i] = x[i] * gg[i];
            }
          }
          if (denOn) { this.w = wEnd; this.hop = hopEnd; }
          return true;
        }
      }
      registerProcessor('noise-reduction-processor', NoiseReductionProcessor);
      `;
      const url = URL.createObjectURL(
        new Blob([code], { type: "application/javascript" }),
      );
      const p = ctx.audioWorklet
        .addModule(url)
        .finally(() => URL.revokeObjectURL(url));
      NoiseReduction._modules.set(ctx, p);
    }
    return NoiseReduction._modules.get(ctx);
  }

  constructor(audioCtx, outputNode, channels = 2) {
    super(audioCtx, {
      channelCount: channels,
      channelCountMode: "explicit",
      channelInterpretation: channels <= 2 ? "speakers" : "discrete", // mono mic -> both channels
    });
    this._out = outputNode;
    this._channels = channels;
    this._bypassed = false;
    this._gate = 25;
    this._den = 25;
    this.worklet = null;

    this._route(); // passes audio straight through until the worklet is ready

    this.ready = NoiseReduction._load(audioCtx).then(() => {
      this.worklet = new AudioWorkletNode(
        audioCtx,
        "noise-reduction-processor",
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [channels],
          channelCount: channels,
          channelCountMode: "explicit",
          channelInterpretation: channels <= 2 ? "speakers" : "discrete",
          processorOptions: { channels },
        },
      );
      this.worklet.port.postMessage({ gate: this._gate, denoiser: this._den });
      this._route();
      return this;
    });
  }

  _isBypassed() {
    // manual bypass OR both knobs at 0
    return this._bypassed || (this._gate === 0 && this._den === 0);
  }

  _route() {
    try {
      super.disconnect();
    } catch (e) {}
    if (this.worklet) {
      try {
        this.worklet.disconnect();
      } catch (e) {}
    }

    const bp = !this.worklet || this._isBypassed();
    if (bp) {
      super.connect(this._out); // worklet fully disconnected = 0 CPU
    } else {
      this.worklet.port.postMessage({ reset: true });
      super.connect(this.worklet);
      this.worklet.connect(this._out);
    }
    this._wasBypassed = bp;
  }

  _update() {
    // re-route only when the effective state changes
    if (this.worklet && this._isBypassed() !== this._wasBypassed) this._route();
  }

  setGate(v) {
    // 0-50 (0 = off)
    this._gate = Math.max(0, Math.min(50, v));
    if (this.worklet) this.worklet.port.postMessage({ gate: this._gate });
    this._update();
  }

  setDenoiser(v) {
    // 0-50 (0 = off)
    this._den = Math.max(0, Math.min(50, v));
    if (this.worklet) this.worklet.port.postMessage({ denoiser: this._den });
    this._update();
  }

  destroy() {
    try {
      super.disconnect();
    } catch (e) {}
    if (this.worklet) {
      try {
        this.worklet.disconnect();
      } catch (e) {}
    }
    this.worklet = null;
  }
}
