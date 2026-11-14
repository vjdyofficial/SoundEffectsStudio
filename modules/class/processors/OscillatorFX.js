// ---------------------------------------------------------------------------
// Noise generation helpers
//
// Noise "color" is the spectral slope: power ~ 1/f^alpha
//   alpha 0 = white, 1 = pink, 2 = brown, 3 = black (-18 dB/octave)
// Each color is generated in the frequency domain (random Gaussian bins with
// the right amplitude slope) and turned into a buffer with an inverse FFT, so
// the slope is exact and the buffer loops perfectly (it is periodic by
// construction, no click at the loop point).
// ---------------------------------------------------------------------------

// in-place radix-2 inverse FFT (unscaled), length must be a power of two
function ifft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI) / len;
    const wlr = Math.cos(ang);
    const wli = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const nwr = wr * wlr - wi * wli;
        wi = wr * wli + wi * wlr;
        wr = nwr;
      }
    }
  }
}

function gaussian() {
  let u = 0;
  while (u === 0) u = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// rms: every color is normalised to the same level, so switching color never
// changes the loudness much. Content below fLow (Hz) is removed: it is
// inaudible and would only waste headroom (important for brown/black noise).
function makeNoiseBuffer(ctx, N, alpha, rms = 0.5, fLow = 10) {
  const sr = ctx.sampleRate;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const half = N >> 1;
  const kLow = Math.max(1, Math.ceil((fLow * N) / sr));

  for (let k = kLow; k < half; k++) {
    const a = Math.pow(k, -alpha / 2);
    const r = a * gaussian();
    const i = a * gaussian();
    re[k] = r;
    im[k] = i;
    re[N - k] = r; // Hermitian symmetry -> real output
    im[N - k] = -i;
  }
  ifft(re, im);

  let sum = 0;
  for (let n = 0; n < N; n++) sum += re[n] * re[n];
  const scale = rms / Math.sqrt(sum / N);

  const buf = ctx.createBuffer(1, N, sr);
  const data = buf.getChannelData(0);
  for (let n = 0; n < N; n++) data[n] = re[n] * scale;
  return buf;
}

// white, pink, brown, black: built once per AudioContext (~100-200 ms)
const noiseCache = new WeakMap();
function getNoiseBuffers(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const N = 2 ** Math.ceil(Math.log2(ctx.sampleRate * 4)); // ~4-5 s, periodic
    b = [0, 1, 2, 3].map((alpha) => makeNoiseBuffer(ctx, N, alpha));
    noiseCache.set(ctx, b);
  }
  return b;
}

// ---------------------------------------------------------------------------
// NoiseVoice: the four colors play together as looping sources, each through
// its own gain; setColor(alpha) crossfades the two neighbouring colors
// (equal power, the buffers are independent, so loudness stays constant).
// It has the same start()/stop()/onended/disconnect() interface as an
// OscillatorNode, so OscillatorEffect can treat both the same way.
// ---------------------------------------------------------------------------
class NoiseVoice {
  constructor(ctx, buffers, alpha) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.srcs = [];
    this.gains = [];
    for (const buf of buffers) {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(g);
      g.connect(this.out);
      this.srcs.push(s);
      this.gains.push(g);
    }
    this._apply(alpha, true);
  }

  connect(dest) { this.out.connect(dest); }

  disconnect() {
    try { this.out.disconnect(); } catch (e) {}
  }

  start() {
    // random start points so repeated starts don't sound identical
    for (const s of this.srcs) s.start(0, Math.random() * s.buffer.duration);
  }

  stop(t) {
    for (const s of this.srcs) {
      try { s.stop(t); } catch (e) {}
    }
  }

  set onended(fn) { this.srcs[0].onended = fn; }

  setColor(alpha) { this._apply(alpha, false); }

  _apply(alpha, immediate) {
    const a = Math.min(3, Math.max(0, alpha));
    const i = Math.min(2, Math.floor(a));
    const t = a - i;
    const now = this.ctx.currentTime;
    for (let k = 0; k < 4; k++) {
      let g = 0;
      if (k === i) g = Math.cos((t * Math.PI) / 2);
      else if (k === i + 1) g = Math.sin((t * Math.PI) / 2);
      if (immediate) this.gains[k].gain.value = g;
      else this.gains[k].gain.setTargetAtTime(g, now, 0.02);
    }
  }
}

// ---------------------------------------------------------------------------

class OscillatorEffect {
  static CHANNELS = {
    0: [0, 1], // stereo
    1: [6, 7], // surround side
    2: [4, 5], // surround rear
    3: [2],    // center
  };

  // Noise color follows frequency() (log scale between the anchors):
  //   20 Hz   -> black noise (alpha 3)
  //   1000 Hz -> default noise (alpha 1, pink)
  //   2048 Hz -> white noise (alpha 0), and above
  static NOISE_RANGE = { low: 20, mid: 1000, high: 2048 };
  static NOISE_ALPHA = { low: 3, mid: 1, high: 0 };

  static noiseColor(hz) {
    const { low, mid, high } = OscillatorEffect.NOISE_RANGE;
    const A = OscillatorEffect.NOISE_ALPHA;
    const f = Math.min(high, Math.max(low, hz));
    if (f <= mid) {
      const t = Math.log(f / low) / Math.log(mid / low);
      return A.low + (A.mid - A.low) * t;
    }
    const t = Math.log(f / mid) / Math.log(high / mid);
    return A.mid + (A.high - A.mid) * t;
  }

  constructor(audioCtx, outputNode) {
    this.ctx = audioCtx;
    this.output = outputNode;

    this._type = 'sine';
    this._frequency = 440;
    this._detune = 0;
    this._channel = 0;
    this._on = false;
    this._level = 0.25;   // output level when on
    this._fade = 0.01;    // seconds, avoids clicks on start/stop
    this._source = null;

    // mono gain -> 8-input merger -> outputNode
    this.gain = audioCtx.createGain();
    this.gain.channelCount = 1;
    this.gain.channelCountMode = 'explicit';
    this.gain.gain.value = 0;

    this.merger = audioCtx.createChannelMerger(8);
    this.merger.connect(this.output);

    this._route();
  }

  // ---- internals ----

  _route() {
    try { this.gain.disconnect(); } catch (e) {}
    for (const ch of OscillatorEffect.CHANNELS[this._channel]) {
      this.gain.connect(this.merger, 0, ch);
    }
  }

  _createSource() {
    let src;
    if (this._type === 'noise') {
      // first use builds the noise buffers (~100-200 ms), later uses are instant
      src = new NoiseVoice(
        this.ctx,
        getNoiseBuffers(this.ctx),
        OscillatorEffect.noiseColor(this._frequency),
      );
    } else {
      src = this.ctx.createOscillator();
      src.type = this._type;
      src.frequency.value = this._frequency;
      src.detune.value = this._detune;
    }
    src.connect(this.gain);
    return src;
  }

  _killSource(src) {
    if (!src) return;
    const t = this.ctx.currentTime + this._fade;
    try { src.stop(t); } catch (e) {}
    src.onended = () => { try { src.disconnect(); } catch (e) {} };
  }

  // ---- public API ----

  // Call once at startup if you don't want the first noise start to hiccup
  prepareNoise() { getNoiseBuffers(this.ctx); }

  // hz. For tones: pitch. For noise: color (20 = black ... 1000 = default ... 2048+ = white)
  frequency(hz) {
    this._frequency = hz;
    if (!this._source) return;
    if (this._type === 'noise') {
      this._source.setColor(OscillatorEffect.noiseColor(hz));
    } else {
      this._source.frequency.setTargetAtTime(hz, this.ctx.currentTime, 0.01);
    }
  }

  // cents (tones only, ignored for noise)
  detune(cents) {
    this._detune = cents;
    if (this._source && this._type !== 'noise') {
      this._source.detune.setTargetAtTime(cents, this.ctx.currentTime, 0.01);
    }
  }

  // 'sine' | 'saw' | 'triangle' | 'square' | 'noise'
  waveshape(shape) {
    const type = shape === 'saw' ? 'sawtooth' : shape;
    if (!['sine', 'sawtooth', 'triangle', 'square', 'noise'].includes(type)) return;

    const wasNoise = this._type === 'noise';
    const isNoise = type === 'noise';
    this._type = type;

    if (!this._source) return;

    if (wasNoise === isNoise) {
      this._source.type = type; // oscillator -> oscillator, seamless
    } else {
      // swap oscillator <-> noise
      const old = this._source;
      this._source = this._createSource();
      this._source.start();
      this._killSource(old);
    }
  }

  // switch(true) = on, switch(false) = off, switch() = toggle
  switch(state = !this._on) {
    if (state === this._on) return;
    this._on = state;
    const now = this.ctx.currentTime;
    const g = this.gain.gain;

    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);

    if (state) {
      this._source = this._createSource();
      this._source.start();
      g.linearRampToValueAtTime(this._level, now + this._fade);
    } else {
      g.linearRampToValueAtTime(0, now + this._fade);
      this._killSource(this._source);
      this._source = null;
    }
  }

  // 0 = stereo (0-1), 1 = surround side (6-7), 2 = surround rear (4-5), 3 = center (2)
  setChannel(mode) {
    if (!(mode in OscillatorEffect.CHANNELS)) return;
    this._channel = mode;
    this._route();
  }
}