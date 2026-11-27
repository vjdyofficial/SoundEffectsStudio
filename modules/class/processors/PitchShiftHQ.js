// high.js
// High-quality phase-vocoder pitch shifter, tuned for low CPU.
// Plain Web Audio + AudioWorklet (no custom-audio-node). ES module.
//
// Usage:
//   import { PitchShift } from './high.js';
//   const ps = new PitchShift(audioCtx);      // channel count follows the input (2, 6, 8 ...)
//   source.connect(ps);                       // it is a real AudioNode
//   ps.connect(audioCtx.destination);         // or ps.connect(merger, 0, 3)
//   ps.transpose = 5;     // semitones
//   ps.wet = 1;           // 1 = fully shifted, 0 = dry
//   ps.latency = 1;       // seconds of delay before the audio is processed
//
// Where the CPU savings come from:
//   - identity phase locking (peak based), so it stays clean at larger shifts
//   - phase math is done with complex numbers, trig only for spectral peaks (not per bin)
//   - two channels share ONE complex FFT (ch A = real part, ch B = imaginary part)
//   - input is written bit-reversed straight into the FFT, radix-4 first stage, Float32 work buffers
//   - nothing above 20 kHz is processed
//   - no allocations in process(), precomputed twiddles / windows, no buffer copies (swapped)
//   - silent frames skip the FFT entirely
//   - 0 semitones skips the FFT (plain windowed overlap-add, same latency)
//   - the dry path is delay-compensated with a native DelayNode
//   - the optional latency is a native DelayNode, not JS
//   - FFT size is picked from the sample rate (about 40 ms window), so nothing to set

const WORKLET_NAME = 'pv-high-shifter';

const WORKLET_SOURCE = `
class PVHighShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }

  constructor(options) {
    super();
    const o = options.processorOptions || {};
    const N = this.N = o.fftSize || 2048;
    const OS = this.OS = o.overlap || 4;
    const sr = (typeof sampleRate === 'number') ? sampleRate : 48000;
    this.hop = N / OS;
    this.half = N >> 1;
    this.mask = N - 1;
    this.binMax = Math.max(16, Math.min(this.half, Math.floor(20000 * N / sr))); // nothing above 20 kHz is processed
    this.pos = 0;
    this.w = 0;
    this.ratio = 1;
    this.expct = 2 * Math.PI / OS;
    this.twoPi = 2 * Math.PI;
    this.invTwoPi = 1 / (2 * Math.PI);
    this.bypassScale = 1 / (OS * 0.375);

    // Hann window (analysis) and Hann window * output scale (synthesis)
    const scale = 1 / (N * OS * 0.375);
    this.win = new Float32Array(N);
    this.winS = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const wv = 0.5 - 0.5 * Math.cos(2 * Math.PI * j / N);
      this.win[j] = wv;
      this.winS[j] = wv * scale;
    }

    // twiddles laid out per stage: entry [h + j] = exp(-i*pi*j/h), contiguous reads
    this.twr = new Float32Array(N);
    this.twi = new Float32Array(N);
    for (let h = 1; h < N; h <<= 1) {
      for (let j = 0; j < h; j++) {
        this.twr[h + j] = Math.cos(Math.PI * j / h);
        this.twi[h + j] = -Math.sin(Math.PI * j / h);
      }
    }
    const bits = Math.round(Math.log2(N));
    this.rev = new Uint32Array(N);
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }

    this.nCh = 0;
    this.chs = [];
    this.groups = [];
  }

  makeCh() {
    const N = this.N, h1 = this.half + 1;
    return {
      inRing: new Float32Array(N),
      outRing: new Float32Array(N),
      xr: new Float32Array(h1), xi: new Float32Array(h1),     // current spectrum
      pxr: new Float32Array(h1), pxi: new Float32Array(h1),   // previous spectrum
      yr: new Float32Array(h1), yi: new Float32Array(h1),     // current output spectrum
      pyr: new Float32Array(h1), pyi: new Float32Array(h1),   // previous output spectrum
      m2: new Float32Array(h1),
      ym: new Float32Array(h1),
      pk: new Int32Array((this.half >> 1) + 2),
      needInit: true
    };
  }

  // the channel count follows whatever is connected (1..32), nothing to configure
  ensure(n) {
    if (n === this.nCh) return;
    while (this.chs.length < n) this.chs.push(this.makeCh());
    this.nCh = n;
    this.groups = [];
    // channels are processed in pairs: one FFT per pair
    for (let c = 0; c < n; c += 2) {
      this.groups.push({
        a: this.chs[c],
        b: c + 1 < n ? this.chs[c + 1] : null,
        re: new Float32Array(this.N),
        im: new Float32Array(this.N)
      });
    }
  }

  // forward FFT, input must already be in bit-reversed order, output is in natural order
  fftBR(re, im) {
    const N = this.N, twr = this.twr, twi = this.twi;
    // first two stages together, their twiddles are 1 and -i, no multiplications
    for (let i = 0; i < N; i += 4) {
      const r0 = re[i], i0 = im[i], r1 = re[i + 1], i1 = im[i + 1];
      const r2 = re[i + 2], i2 = im[i + 2], r3 = re[i + 3], i3 = im[i + 3];
      const ar = r0 + r1, ai = i0 + i1, br = r0 - r1, bi = i0 - i1;
      const cr = r2 + r3, ci = i2 + i3, dr = r2 - r3, di = i2 - i3;
      re[i] = ar + cr;     im[i] = ai + ci;
      re[i + 2] = ar - cr; im[i + 2] = ai - ci;
      re[i + 1] = br + di; im[i + 1] = bi - dr;
      re[i + 3] = br - di; im[i + 3] = bi + dr;
    }
    // remaining stages fused two at a time (radix-2 squared): half the memory traffic
    let h = 4;
    for (; (h << 1) < N; h <<= 2) {
      const size = h << 2, h2 = h << 1, h3 = h2 + h;
      for (let i = 0; i < N; i += size) {
        for (let j = 0; j < h; j++) {
          const a = i + j, b = a + h, c = a + h2, d = a + h3;
          const w1r = twr[h + j], w1i = twi[h + j];
          const w2r = twr[h2 + j], w2i = twi[h2 + j];
          const w3r = twr[h3 + j], w3i = twi[h3 + j];
          const ar = re[a], ai = im[a], br = re[b], bi = im[b];
          const cr = re[c], ci = im[c], dr = re[d], di = im[d];
          // first stage of the pair
          const tbr = br * w1r - bi * w1i, tbi = br * w1i + bi * w1r;
          const tdr = dr * w1r - di * w1i, tdi = dr * w1i + di * w1r;
          const a1r = ar + tbr, a1i = ai + tbi, b1r = ar - tbr, b1i = ai - tbi;
          const c1r = cr + tdr, c1i = ci + tdi, d1r = cr - tdr, d1i = ci - tdi;
          // second stage of the pair
          const tcr = c1r * w2r - c1i * w2i, tci = c1r * w2i + c1i * w2r;
          const ter = d1r * w3r - d1i * w3i, tei = d1r * w3i + d1i * w3r;
          re[a] = a1r + tcr; im[a] = a1i + tci;
          re[c] = a1r - tcr; im[c] = a1i - tci;
          re[b] = b1r + ter; im[b] = b1i + tei;
          re[d] = b1r - ter; im[d] = b1i - tei;
        }
      }
    }
    if (h < N) {                // one plain stage left when log2(N) is odd
      for (let j = 0; j < h; j++) {
        const wr = twr[h + j], wi = twi[h + j];
        const a = j, b = j + h;
        const xr = re[b], xi = im[b];
        const tr = xr * wr - xi * wi, ti = xr * wi + xi * wr;
        const ur = re[a], ui = im[a];
        re[b] = ur - tr; im[b] = ui - ti;
        re[a] = ur + tr; im[a] = ui + ti;
      }
    }
  }

  // Shift one channel's spectrum with identity phase locking (Laroche & Dolson):
  // every spectral peak and the bins around it move together and get rotated by one
  // unit complex number. No atan2 / sin / cos per bin, only a few per peak.
  shift(ch, ratio) {
    const bmax = this.binMax, expct = this.expct, twoPi = this.twoPi, invTwoPi = this.invTwoPi;
    const osk = this.OS * invTwoPi;
    const xr = ch.xr, xi = ch.xi, m2 = ch.m2, pxr = ch.pxr, pxi = ch.pxi;
    const pyr = ch.pyr, pyi = ch.pyi, yr = ch.yr, yi = ch.yi, ym = ch.ym, pk = ch.pk;
    const init = ch.needInit;
    yr.fill(0); yi.fill(0); ym.fill(0);

    let np = 0;
    // low bins: plain 3-point peaks, bass partials sit close together and must stay separate
    for (let k = 1; k < 16; k++) {
      const m = m2[k];
      if (m > 1e-18 && m > m2[k - 1] && m >= m2[k + 1]) pk[np++] = k;
    }
    for (let k = 16; k <= bmax - 2; k++) {
      const m = m2[k];
      if (m > 1e-18 && m > m2[k - 1] && m > m2[k - 2] && m >= m2[k + 1] && m >= m2[k + 2]) {
        pk[np++] = k;
        k++; // two neighbours of a peak can't be peaks
      }
    }
    if (np === 0) return;

    for (let i = 0; i < np; i++) {
      const p = pk[i];
      const lo = i === 0 ? 0 : ((pk[i - 1] + p) >> 1) + 1;
      const hi = i === np - 1 ? bmax : (p + pk[i + 1]) >> 1;
      const pr = xr[p], pim = xi[p];
      const pinv = 1 / Math.sqrt(m2[p]);
      const ur = pr * pinv, ui = pim * pinv;         // unit phasor of the input peak

      // true frequency of the partial from the phase advance since the last frame
      let tf = p;
      if (!init) {
        const cr = pr * pxr[p] + pim * pxi[p];
        const ci = pim * pxr[p] - pr * pxi[p];
        let d = Math.atan2(ci, cr) - p * expct;
        d -= twoPi * Math.round(d * invTwoPi);
        tf = p + d * osk;
      }
      const fq = tf * ratio;
      const q = Math.round(fq);
      if (q < 0 || q > bmax) continue;

      // rotation = (previous output phasor at q, advanced by the new frequency) / input phasor
      let rr = 1, ri = 0;
      if (!init) {
        const qr = pyr[q], qi = pyi[q];
        const qm = qr * qr + qi * qi;
        if (qm > 1e-24) {
          const qinv = 1 / Math.sqrt(qm);
          const al = expct * fq, ca = Math.cos(al), sa = Math.sin(al);
          const tr = (qr * ca - qi * sa) * qinv, ti = (qr * sa + qi * ca) * qinv;
          rr = tr * ur + ti * ui;
          ri = ti * ur - tr * ui;
        }
      }

      const sh = q - p;
      let j0 = lo + sh, j1 = hi + sh;
      if (j0 < 0) j0 = 0;
      if (j1 > bmax) j1 = bmax;
      for (let j = j0; j <= j1; j++) {
        const k = j - sh, m = m2[k];
        if (m > ym[j]) {                       // when shifted regions collide, the louder bin wins
          ym[j] = m;
          const a = xr[k], b = xi[k];
          yr[j] = a * rr - b * ri;
          yi[j] = a * ri + b * rr;
        }
      }
    }
  }

  processFrame() {
    const N = this.N, half = this.half, mask = this.mask, w = this.w;
    const win = this.win, winS = this.winS, rev = this.rev, bmax = this.binMax;
    const ratio = this.ratio;
    const bypass = Math.abs(ratio - 1) < 1e-4;

    for (let g = 0; g < this.groups.length; g++) {
      const grp = this.groups[g];
      const a = grp.a, b = grp.b, re = grp.re, im = grp.im;
      const ia = a.inRing, ib = b ? b.inRing : null;

      // 0 semitones: skip the FFT, plain windowed overlap-add (same latency)
      if (bypass) {
        const bs = this.bypassScale;
        const oa = a.outRing, ob = b ? b.outRing : null;
        for (let j = 0; j < N; j++) {
          const idx = (w + j) & mask, wv = win[j] * win[j] * bs;
          oa[idx] += ia[idx] * wv;
          if (ob) ob[idx] += ib[idx] * wv;
        }
        a.needInit = true; if (b) b.needInit = true;
        continue;
      }

      // windowed input goes straight into bit-reversed order
      let peak = 0;
      for (let j = 0; j < N; j++) {
        const idx = (w + j) & mask;
        const xa = ia[idx], xb = ib ? ib[idx] : 0;
        const aa = xa < 0 ? -xa : xa, ab = xb < 0 ? -xb : xb;
        if (aa > peak) peak = aa;
        if (ab > peak) peak = ab;
        const r = rev[j], wv = win[j];
        re[r] = xa * wv;
        im[r] = xb * wv;
      }
      // silence: nothing to add, just resync phases on the next audible frame
      if (peak < 1e-6) { a.needInit = true; if (b) b.needInit = true; continue; }

      this.fftBR(re, im);

      // split the two real signals out of the packed complex spectrum
      const axr = a.xr, axi = a.xi, am2 = a.m2;
      if (b) {
        const bxr = b.xr, bxi = b.xi, bm2 = b.m2;
        for (let k = 0; k <= bmax; k++) {
          const k2 = (N - k) & mask;
          const zr = re[k], zi = im[k], wr = re[k2], wi = im[k2];
          const ar = (zr + wr) * 0.5, ai = (zi - wi) * 0.5;
          const br = (zi + wi) * 0.5, bi = (wr - zr) * 0.5;
          axr[k] = ar; axi[k] = ai; am2[k] = ar * ar + ai * ai;
          bxr[k] = br; bxi[k] = bi; bm2[k] = br * br + bi * bi;
        }
      } else {
        for (let k = 0; k <= bmax; k++) {
          const k2 = (N - k) & mask;
          const zr = re[k], zi = im[k], wr = re[k2], wi = im[k2];
          const ar = (zr + wr) * 0.5, ai = (zi - wi) * 0.5;
          axr[k] = ar; axi[k] = ai; am2[k] = ar * ar + ai * ai;
        }
      }

      this.shift(a, ratio);
      if (b) this.shift(b, ratio);

      // repack Z = A + iB (both spectra are Hermitian), written in bit-reversed order
      const ayr = a.yr, ayi = a.yi;
      const byr = b ? b.yr : null, byi = b ? b.yi : null;
      re[0] = ayr[0]; im[0] = b ? byr[0] : 0;
      const rh = rev[half];
      re[rh] = ayr[half]; im[rh] = b ? byr[half] : 0;
      if (b) {
        for (let j = 1; j < half; j++) {
          const y0r = ayr[j], y0i = ayi[j], y1r = byr[j], y1i = byi[j];
          const rj = rev[j], rn = rev[N - j];
          re[rj] = y0r - y1i; im[rj] = y0i + y1r;
          re[rn] = y0r + y1i; im[rn] = y1r - y0i;
        }
      } else {
        for (let j = 1; j < half; j++) {
          const y0r = ayr[j], y0i = ayi[j];
          const rj = rev[j], rn = rev[N - j];
          re[rj] = y0r; im[rj] = y0i;
          re[rn] = y0r; im[rn] = -y0i;
        }
      }

      // inverse FFT through the swap trick: afterwards re = channel A, im = channel B
      this.fftBR(im, re);

      const oa = a.outRing, ob = b ? b.outRing : null;
      if (ob) {
        for (let j = 0; j < N; j++) {
          const idx = (w + j) & mask, ws = winS[j];
          oa[idx] += re[j] * ws;
          ob[idx] += im[j] * ws;
        }
      } else {
        for (let j = 0; j < N; j++) {
          const idx = (w + j) & mask;
          oa[idx] += re[j] * winS[j];
        }
      }

      // current spectra become "previous" (swap references, no copying)
      let t;
      t = a.xr; a.xr = a.pxr; a.pxr = t;  t = a.xi; a.xi = a.pxi; a.pxi = t;
      t = a.yr; a.yr = a.pyr; a.pyr = t;  t = a.yi; a.yi = a.pyi; a.pyi = t;
      a.needInit = false;
      if (b) {
        t = b.xr; b.xr = b.pxr; b.pxr = t;  t = b.xi; b.xi = b.pxi; b.pxi = t;
        t = b.yr; b.yr = b.pyr; b.pyr = t;  t = b.yi; b.yi = b.pyi; b.pyi = t;
        b.needInit = false;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output.length) return true;
    const input = inputs[0] || [];
    const len = output[0].length;
    this.ensure(output.length);
    this.ratio = parameters.pitch[0];
    const chs = this.chs, nCh = this.nCh, mask = this.mask, hop = this.hop;

    // work in chunks that end exactly where the next frame is due, one channel at a time
    let i = 0;
    while (i < len) {
      const n = Math.min(len - i, hop - this.pos);
      const w = this.w;
      for (let c = 0; c < nCh; c++) {
        const ch = chs[c], ir = ch.inRing, orr = ch.outRing, src = input[c], o = output[c];
        if (src) for (let t = 0; t < n; t++) ir[(w + t) & mask] = src[i + t];
        else for (let t = 0; t < n; t++) ir[(w + t) & mask] = 0;
        for (let t = 0; t < n; t++) {
          const idx = (w + t) & mask;
          o[i + t] = orr[idx];
          orr[idx] = 0;
        }
      }
      this.w = (w + n) & mask;
      this.pos += n;
      i += n;
      if (this.pos >= hop) {
        this.pos = 0;
        this.processFrame();
      }
    }
    return true;
  }
}
registerProcessor('${WORKLET_NAME}', PVHighShifter);
`;

const moduleLoads = new WeakMap();

function loadWorklet(ctx) {
  let p = moduleLoads.get(ctx);
  if (!p) {
    const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
    p = ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url));
    moduleLoads.set(ctx, p);
  }
  return p;
}

function pickFftSize(sampleRate) {
  let n = 1024;
  while (n < sampleRate * 0.04 && n < 4096) n <<= 2; // about 40 ms window
  return n;
}

const nodeConnect = (from, to, a, b) => AudioNode.prototype.connect.call(from, to, a, b);

/**
 * A real AudioNode (a GainNode subclass), so it can be a target of connect():
 *   source.connect(ps);   ps.connect(merger, 0, 3);   ps.connect(ctx.destination);
 * Channel count follows the input automatically (any count), nothing to set.
 */

class PitchShiftHQ extends GainNode {
  constructor(ctx, opts = {}) {
    super(
      ctx,
      opts.channels
        ? {
            channelCount: opts.channels,
            channelCountMode: "explicit",
            channelInterpretation: "discrete",
          }
        : {},
    );

    this.ctx = ctx;
    this._channels = opts.channels || 0;
    this._fftSize = pickFftSize(ctx.sampleRate);

    this._transpose = 0;
    this._wet = 1;
    this._latency = 0;

    this._node = null;
    this._route = "bypass";
    this._disposed = false;

    const chOpts = this._channels
      ? {
          channelCount: this._channels,
          channelCountMode: "explicit",
          channelInterpretation: "discrete",
        }
      : {};

    // ---------------------------------------------------------------
    // INTERNAL NODES
    // ---------------------------------------------------------------

    this._out = new GainNode(ctx, chOpts);

    this._delay = new DelayNode(ctx, {
      maxDelayTime: 5,
    });

    this._dryDelay = new DelayNode(ctx, {
      maxDelayTime: 1,
    });

    this._dryDelay.delayTime.value =
      this._fftSize / ctx.sampleRate;

    this._dry = new GainNode(ctx);
    this._wetGain = new GainNode(ctx);

    // Initial mix.
    this._wetGain.gain.value = 1;
    this._dry.gain.value = 0;

    // Output mixing paths.
    this._dryDelay.connect(this._dry);
    this._dry.connect(this._out);

    this._wetGain.connect(this._out);

    // ---------------------------------------------------------------
    // INITIAL BYPASS ROUTE
    // ---------------------------------------------------------------

    nodeConnect(this, this._delay);

    // No FFT processing at zero transpose.
    this._delay.connect(this._out);

    // ---------------------------------------------------------------
    // WORKLET INITIALIZATION
    // ---------------------------------------------------------------

    this.ready = loadWorklet(ctx)
      .then(() => {
        if (this._disposed) {
          throw new Error("PitchShiftHQ has been disposed.");
        }

        const wopts = {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelInterpretation: "discrete",

          processorOptions: {
            fftSize: this._fftSize,
            overlap: 4,
          },
        };

        if (this._channels) {
          wopts.channelCount = this._channels;
          wopts.channelCountMode = "explicit";
          wopts.outputChannelCount = [this._channels];
        } else {
          wopts.channelCountMode = "max";
        }

        const node = new AudioWorkletNode(
          ctx,
          WORKLET_NAME,
          wopts,
        );

        this._node = node;

        // Worklet output is permanently connected.
        node.connect(this._wetGain);

        // Apply initial pitch and routing.
        this._applyPitch();
        this._updateBypass();

        return this;
      })
      .catch((error) => {
        console.error(
          "[PitchShiftHQ] Initialization failed:",
          error,
        );

        throw error;
      });

    // ---------------------------------------------------------------
    // INITIAL OPTIONS
    // ---------------------------------------------------------------

    if (opts.transpose !== undefined) {
      this.transpose = opts.transpose;
    }

    if (opts.wet !== undefined) {
      this.wet = opts.wet;
    }

    if (opts.latency !== undefined) {
      this.latency = opts.latency;
    }
  }

  // ---------------------------------------------------------------
  // INPUT / OUTPUT
  // ---------------------------------------------------------------

  get input() {
    return this;
  }

  get output() {
    return this._out;
  }

  // ---------------------------------------------------------------
  // TRANSPOSE
  // ---------------------------------------------------------------

  get transpose() {
    return this._transpose;
  }

  set transpose(value) {
    value = Number(value);

    if (!Number.isFinite(value)) return;

    this._transpose = Math.max(
      -24,
      Math.min(24, value),
    );

    this._applyPitch();
    this._updateBypass();
  }

  _applyPitch() {
    if (!this._node) return;

    const pitch = this._node.parameters.get("pitch");

    if (!pitch) return;

    pitch.setTargetAtTime(
      Math.pow(2, this._transpose / 12),
      this.ctx.currentTime,
      0.02,
    );
  }

  // ---------------------------------------------------------------
  // BYPASS ROUTING
  // ---------------------------------------------------------------

  _updateBypass() {
    if (this._disposed) return;

    const bypass = Math.abs(this._transpose) < 1e-6;

    // Worklet is not initialized yet.
    // Initial route is already direct bypass.
    if (!this._node) {
      return;
    }

    const nextRoute = bypass ? "bypass" : "processing";

    if (this._route === nextRoute) {
      return;
    }

    // Safely remove all outgoing connections from the internal
    // delay node. No destination-specific disconnect is needed.
    this._delay.disconnect();

    if (bypass) {
      // Direct signal path.
      this._delay.connect(this._out);

      this._route = "bypass";

      return;
    }

    // -------------------------------------------------------------
    // ENABLE FFT PROCESSING
    // -------------------------------------------------------------

    // Dry signal is latency compensated.
    this._delay.connect(this._dryDelay);

    // Wet signal enters the phase-vocoder Worklet.
    this._delay.connect(this._node);

    this._route = "processing";
  }

  // ---------------------------------------------------------------
  // WET MIX
  // ---------------------------------------------------------------

  get wet() {
    return this._wet;
  }

  set wet(value) {
    value = Number(value);

    if (!Number.isFinite(value)) return;

    value = Math.max(0, Math.min(1, value));

    this._wet = value;

    this._wetGain.gain.setTargetAtTime(
      value,
      this.ctx.currentTime,
      0.01,
    );

    this._dry.gain.setTargetAtTime(
      1 - value,
      this.ctx.currentTime,
      0.01,
    );
  }

  // ---------------------------------------------------------------
  // OPTIONAL INPUT LATENCY
  // ---------------------------------------------------------------

  get latency() {
    return this._latency;
  }

  set latency(seconds) {
    seconds = Number(seconds);

    if (!Number.isFinite(seconds)) return;

    this._latency = Math.max(
      0,
      Math.min(5, seconds),
    );

    this._delay.delayTime.setTargetAtTime(
      this._latency,
      this.ctx.currentTime,
      0.01,
    );
  }

  // ---------------------------------------------------------------
  // PROCESSING LATENCY
  // ---------------------------------------------------------------

  get processingLatency() {
    return this._fftSize / this.ctx.sampleRate;
  }

  // ---------------------------------------------------------------
  // AUDIO NODE CONNECTIONS
  // ---------------------------------------------------------------

  connect(dest, outputIndex, inputIndex) {
    if (inputIndex === undefined) {
      this._out.connect(dest, outputIndex);
    } else {
      this._out.connect(dest, outputIndex, inputIndex);
    }

    return dest;
  }

  disconnect(...args) {
    this._out.disconnect(...args);
  }

  // ---------------------------------------------------------------
  // DISPOSE
  // ---------------------------------------------------------------

  dispose() {
    if (this._disposed) return;

    this._disposed = true;

    try {
      AudioNode.prototype.disconnect.call(this);
    } catch (error) {
      // Already disconnected.
    }

    try {
      this._delay.disconnect();
    } catch (error) {
      // Already disconnected.
    }

    try {
      this._dryDelay.disconnect();
    } catch (error) {
      // Already disconnected.
    }

    try {
      this._dry.disconnect();
      this._wetGain.disconnect();
      this._out.disconnect();
    } catch (error) {
      // Already disconnected.
    }

    if (this._node) {
      try {
        this._node.disconnect();
      } catch (error) {
        // Already disconnected.
      }

      this._node = null;
    }
  }
}
