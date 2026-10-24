// pitch-shift-processor.js
// Phase-vocoder pitch shifter running in an AudioWorklet (off the main thread,
// sample-accurate, no delay-line crossfade artifacts).
//
// Quality knobs (processorOptions):
//   fftSize : 2048 (default) | 4096 (smoother, more latency/CPU)
//   overlap : 4 (default)    | 8    (cleaner, 2x CPU)

const TWO_PI = Math.PI * 2;

function makeFFT(n) {
  const levels = Math.log2(n) | 0;
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((TWO_PI * i) / n);
    sin[i] = Math.sin((TWO_PI * i) / n);
  }
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  // In-place forward complex FFT (unnormalized)
  return function fft(re, im) {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const tr = re[l] * cos[k] + im[l] * sin[k];
          const ti = im[l] * cos[k] - re[l] * sin[k];
          re[l] = re[j] - tr;
          im[l] = im[j] - ti;
          re[j] += tr;
          im[j] += ti;
        }
      }
    }
  };
}

class ChannelState {
  constructor(N, hop) {
    const bins = N / 2 + 1;
    this.inFifo = new Float32Array(N);
    this.outFifo = new Float32Array(hop);
    this.accum = new Float32Array(N * 2);
    this.lastPhase = new Float64Array(bins);
    this.sumPhase = new Float64Array(bins);
    this.anaMagn = new Float64Array(bins);
    this.anaFreq = new Float64Array(bins); // in (fractional) bins
    this.synMagn = new Float64Array(bins);
    this.synFreq = new Float64Array(bins);
    this.re = new Float64Array(N);
    this.im = new Float64Array(N);
    this.rover = N - hop;
  }
}

class PitchShiftProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "pitch", // frequency ratio (2 = +1 octave, 0.5 = -1 octave)
        defaultValue: 1,
        minValue: 0.25,
        maxValue: 4,
        automationRate: "k-rate",
      },
    ];
  }

  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.N = o.fftSize || 2048;
    this.osamp = o.overlap || 4;
    this.hop = this.N / this.osamp;
    this.half = this.N / 2;
    this.latencyIn = this.N - this.hop;
    this.expct = TWO_PI / this.osamp; // expected phase advance per hop at bin k = k * expct
    this.fft = makeFFT(this.N);
    this.win = new Float64Array(this.N);
    for (let i = 0; i < this.N; i++) {
      this.win[i] = 0.5 - 0.5 * Math.cos((TWO_PI * i) / this.N); // periodic Hann
    }
    this.channels = [];
  }

  _frame(c, ratio) {
    const { N, hop, half, osamp, win, expct, fft } = this;
    const { re, im, lastPhase, sumPhase, anaMagn, anaFreq, synMagn, synFreq } = c;

    // ---- Analysis ----
    for (let i = 0; i < N; i++) {
      re[i] = c.inFifo[i] * win[i];
      im[i] = 0;
    }
    fft(re, im);

    for (let k = 0; k <= half; k++) {
      const r = re[k];
      const m = im[k];
      anaMagn[k] = 2 * Math.sqrt(r * r + m * m);

      const phase = Math.atan2(m, r);
      let d = phase - lastPhase[k] - k * expct;
      lastPhase[k] = phase;
      d -= TWO_PI * Math.round(d / TWO_PI); // wrap to [-pi, pi]
      anaFreq[k] = k + (osamp * d) / TWO_PI; // true frequency, in bins
    }

    // ---- Pitch shift: remap bins ----
    synMagn.fill(0);
    synFreq.fill(0);
    for (let k = 0; k <= half; k++) {
      const idx = Math.round(k * ratio);
      if (idx <= half) {
        synMagn[idx] += anaMagn[k];
        synFreq[idx] = anaFreq[k] * ratio;
      }
    }

    // ---- Synthesis ----
    for (let k = 0; k <= half; k++) {
      const t = (TWO_PI * (synFreq[k] - k)) / osamp + k * expct;
      let p = sumPhase[k] + t;
      p -= TWO_PI * Math.floor(p / TWO_PI); // keep bounded
      sumPhase[k] = p;
      re[k] = synMagn[k] * Math.cos(p);
      im[k] = -synMagn[k] * Math.sin(p); // conjugate: forward FFT acts as inverse
    }
    for (let k = half + 1; k < N; k++) {
      re[k] = 0;
      im[k] = 0;
    }
    fft(re, im); // real part of result == real part of inverse FFT

    const scale = 2 / (half * osamp);
    for (let i = 0; i < N; i++) c.accum[i] += win[i] * re[i] * scale;

    c.outFifo.set(c.accum.subarray(0, hop));
    c.accum.copyWithin(0, hop);
    c.accum.fill(0, c.accum.length - hop);
    c.inFifo.copyWithin(0, hop);
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0];
    const out = outputs[0];
    const ratio = parameters.pitch[0];
    const lat = this.latencyIn;
    const N = this.N;

    for (let ch = 0; ch < out.length; ch++) {
      const c =
        this.channels[ch] ||
        (this.channels[ch] = new ChannelState(N, this.hop));
      const x = inp[ch] || inp[0]; // mono input feeds all outputs
      const y = out[ch];

      for (let i = 0; i < y.length; i++) {
        c.inFifo[c.rover] = x ? x[i] : 0;
        y[i] = c.outFifo[c.rover - lat];
        if (++c.rover >= N) {
          c.rover = lat;
          this._frame(c, ratio);
        }
      }
    }
    return true;
  }
}

registerProcessor("pitch-shift-processor", PitchShiftProcessor);