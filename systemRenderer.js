// ---------------------------------------------------------------------------
// WaveformAnalyzer: waveform peaks + musical key + BPM, all in ONE AudioWorklet
//
// The decoded audio is rendered through an OfflineAudioContext (much faster
// than real time, and the real-time audioContext is not touched at all). The
// worklet sees every sample exactly once and does three jobs in that pass:
//
//  1. WAVEFORM  min/max per column, per channel (same rule as before: column x
//               covers frames [x*step, (x+1)*step), step = ceil(frames / width))
//  2. BPM       onset envelope (3 bands: low / mid / high, log-compressed
//               energy rises, one value per 128 samples) -> autocorrelation
//               over 50-220 BPM, with a tempo prior around 120 BPM
//  3. KEY       mono mix -> low-pass + decimation to about 11 kHz -> 4096-point
//               FFT every 2048 samples -> spectral peaks folded into 12 pitch
//               classes (chroma) -> correlated with the 24 Krumhansl-Kessler
//               major/minor key profiles
//
// The result comes back in a single message when the last frame is processed.
// ---------------------------------------------------------------------------

const ANALYZER_WORKLET_CODE = `
const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Krumhansl-Kessler key profiles (index 0 = the tonic)
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a, b) {
  let ma = 0, mb = 0;
  for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
  ma /= 12; mb /= 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return num / (Math.sqrt(da * db) + 1e-12);
}

class AnalyzerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    const sr = sampleRate;
    this.total = o.totalFrames;
    this.nch = o.channels;
    this.width = o.width;
    this.step = Math.max(1, Math.ceil(this.total / this.width));

    // --- waveform peaks ---
    this.mins = [];
    this.maxs = [];
    for (let c = 0; c < this.nch; c++) {
      this.mins.push(new Float32Array(this.width).fill(1));
      this.maxs.push(new Float32Array(this.width).fill(-1));
    }
    this.pos = 0;
    this.col = 0;
    this.colEnd = this.step;

    // --- onset envelope (BPM): one value per 128 samples ---
    this.ONS = 128;
    this.env = new Float32Array(Math.ceil(this.total / this.ONS) + 2);
    this.envN = 0;
    this.aLo = 1 - Math.exp(-2 * Math.PI * 150 / sr);    // low band: below 150 Hz
    this.aMid = 1 - Math.exp(-2 * Math.PI * 2000 / sr);  // mid band: 150 Hz - 2 kHz, high: above
    this.lp1 = 0; this.lp2 = 0;
    this.eL = 0; this.eM = 0; this.eH = 0; this.eCount = 0;
    this.pL = 0; this.pM = 0; this.pH = 0;

    // --- key: decimated STFT + chroma ---
    this.D = Math.max(1, Math.round(sr / 11025));
    this.srD = sr / this.D;
    this.dcount = 0;
    const N = 4096;
    this.N = N;
    this.hop = 2048;
    this.fbuf = new Float32Array(N);
    this.fcount = 0;
    this.re = new Float64Array(N);
    this.im = new Float64Array(N);
    this.mag = new Float64Array(N / 2 + 1);
    this.win = new Float64Array(N);
    for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    this.cosT = new Float64Array(N / 2);
    this.sinT = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) {
      this.cosT[k] = Math.cos(2 * Math.PI * k / N);
      this.sinT[k] = Math.sin(2 * Math.PI * k / N);
    }
    this.rev = new Uint16Array(N);
    const bits = Math.round(Math.log2(N));
    for (let i = 0; i < N; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.binHz = this.srD / N;
    this.kLo = Math.max(2, Math.ceil(65 / this.binHz));                  // about C2
    this.kHi = Math.min(N / 2 - 2, Math.floor(2100 / this.binHz));       // about C7
    this.fc = new Float64Array(12);
    this.chroma = new Float64Array(12);
    this.chromaFrames = 0;

    // anti-alias filter before decimation: 4th-order Butterworth (2 biquads) at 0.4 * srD
    this.bqc = new Float64Array(10);
    this.bqz = new Float64Array(4);
    if (this.D > 1) {
      const w0 = 2 * Math.PI * (0.4 * this.srD) / sr;
      const cw = Math.cos(w0), sw = Math.sin(w0);
      const qs = [0.5412, 1.3066];
      for (let s = 0; s < 2; s++) {
        const al = sw / (2 * qs[s]);
        const a0 = 1 + al;
        const q = s * 5;
        this.bqc[q]     = ((1 - cw) / 2) / a0;
        this.bqc[q + 1] = (1 - cw) / a0;
        this.bqc[q + 2] = ((1 - cw) / 2) / a0;
        this.bqc[q + 3] = (-2 * cw) / a0;
        this.bqc[q + 4] = (1 - al) / a0;
      }
    }

    this.done = false;
  }

  _lp(s, x) {
    const c = this.bqc, z = this.bqz, q = s * 5, i = s * 2;
    const y = c[q] * x + z[i];
    z[i] = c[q + 1] * x - c[q + 3] * y + z[i + 1];
    z[i + 1] = c[q + 2] * x - c[q + 4] * y;
    return y;
  }

  // one onset value from the band energies of the last 128 samples
  _onset() {
    const n = this.ONS, C = 1000;
    const l = Math.log(1 + C * this.eL / n);
    const m = Math.log(1 + C * this.eM / n);
    const h = Math.log(1 + C * this.eH / n);
    let nv = Math.max(0, l - this.pL) + Math.max(0, m - this.pM) + Math.max(0, h - this.pH);
    if (this.envN === 0) nv = 0;   // no spike from the very first block
    this.pL = l; this.pM = m; this.pH = h;
    if (this.envN < this.env.length) this.env[this.envN++] = nv;
    this.eL = 0; this.eM = 0; this.eH = 0; this.eCount = 0;
  }

  // one STFT frame -> chroma
  _frame() {
    const N = this.N, re = this.re, im = this.im, fb = this.fbuf, win = this.win, rev = this.rev;
    for (let i = 0; i < N; i++) {
      re[rev[i]] = fb[i] * win[i];
      im[rev[i]] = 0;
    }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, tstep = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += tstep) {
          const wr = this.cosT[k], wi = -this.sinT[k];
          const a = i + j, b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }

    const mag = this.mag, kLo = this.kLo, kHi = this.kHi;
    let mx = 0;
    for (let k = kLo - 1; k <= kHi + 1; k++) {
      mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      if (k >= kLo && k <= kHi && mag[k] > mx) mx = mag[k];
    }
    if (mx < 1e-5) return;   // silence

    const fc = this.fc;
    fc.fill(0);
    const thr = mx * 0.1;
    for (let k = kLo; k <= kHi; k++) {
      const b = mag[k];
      if (b < thr || b <= mag[k - 1] || b < mag[k + 1]) continue;   // spectral peaks only
      const a = mag[k - 1], c = mag[k + 1];
      const den = a - 2 * b + c;
      const delta = den !== 0 ? 0.5 * (a - c) / den : 0;            // parabolic peak position
      const f = (k + delta) * this.binHz;
      const midi = 69 + 12 * Math.log2(f / 440);
      let pc = midi % 12;
      if (pc < 0) pc += 12;
      const lo = Math.floor(pc), frac = pc - lo;
      const w = Math.log(1 + 10 * b / mx);                          // compress loud peaks
      fc[lo % 12] += (1 - frac) * w;
      fc[(lo + 1) % 12] += frac * w;
    }
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += fc[i];
    if (sum <= 0) return;
    for (let i = 0; i < 12; i++) this.chroma[i] += fc[i] / sum;     // every frame counts the same
    this.chromaFrames++;
  }

  _key() {
    if (this.chromaFrames < 2) return null;
    const c = this.chroma;
    const prof = new Float64Array(12);
    const scores = [];
    for (let mode = 0; mode < 2; mode++) {
      const base = mode === 0 ? KK_MAJOR : KK_MINOR;
      for (let t = 0; t < 12; t++) {
        for (let i = 0; i < 12; i++) prof[i] = base[(i - t + 12) % 12];
        scores.push({ tonic: t, mode: mode === 0 ? 'maj' : 'min', score: pearson(c, prof) });
      }
    }
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];
    return {
      key: KEY_NAMES[best.tonic] + ' ' + best.mode,
      tonic: best.tonic,
      tonicName: KEY_NAMES[best.tonic],
      mode: best.mode,
      confidence: Math.max(0, Math.min(1, best.score)),   // correlation with the best profile
      margin: best.score - scores[1].score,                // how far ahead of the runner-up
      candidates: scores.slice(0, 3).map((s) => ({
        key: KEY_NAMES[s.tonic] + ' ' + s.mode,
        score: s.score
      }))
    };
  }

  _bpm() {
    const n = this.envN;
    const fe = sampleRate / this.ONS;
    if (n < fe * 6) return null;   // needs at least about 6 seconds
    const env = this.env;

    // novelty: remove a slow moving average (about +/- 0.75 s), keep the positive part
    const w = Math.max(3, Math.round(fe * 0.75));
    const cs = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + env[i];
    const x = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const a = i - w < 0 ? 0 : i - w;
      const b = i + w + 1 > n ? n : i + w + 1;
      const v = env[i] - (cs[b] - cs[a]) / (b - a);
      x[i] = v > 0 ? v : 0;
      mean += x[i];
    }
    mean /= n;
    let e0 = 0;
    for (let i = 0; i < n; i++) { x[i] -= mean; e0 += x[i] * x[i]; }
    if (e0 <= 1e-12) return null;

    // autocorrelation for 50-220 BPM, plus twice the lag (harmonic support)
    const lagMin = Math.max(2, Math.floor(fe * 60 / 220));
    const lagMax = Math.ceil(fe * 60 / 50);
    const maxLag = Math.min(n - 2, lagMax * 2 + 2);
    if (maxLag <= lagMin + 2) return null;
    const acf = new Float64Array(maxLag + 2);
    for (let l = lagMin - 1; l <= maxLag; l++) {
      let s = 0;
      for (let i = l; i < n; i++) s += x[i] * x[i - l];
      acf[l] = (s / (n - l)) / (e0 / n);   // 1 = perfect repetition
    }

    // best lag: autocorrelation + half of the doubled lag, weighted by a tempo prior around 120 BPM
    let best = -Infinity, bestL = lagMin;
    for (let l = lagMin; l <= lagMax && l + 1 <= maxLag; l++) {
      const bpm = 60 * fe / l;
      const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
      const s = (acf[l] + (2 * l <= maxLag ? 0.5 * acf[2 * l] : 0)) * prior;
      if (s > best) { best = s; bestL = l; }
    }

    // parabolic interpolation around the best lag: finer than one lag step
    const y0 = acf[bestL - 1], y1 = acf[bestL], y2 = acf[bestL + 1];
    const den = y0 - 2 * y1 + y2;
    let delta = den < 0 ? 0.5 * (y0 - y2) / den : 0;
    if (delta > 1) delta = 1; else if (delta < -1) delta = -1;
    const bpm = Math.round(600 * fe / (bestL + delta)) / 10;

    return {
      bpm: bpm,
      confidence: Math.max(0, Math.min(1, y1)),   // strength of the repetition at that tempo
      alternatives: [Math.round(bpm * 5) / 10, Math.round(bpm * 20) / 10].filter((v) => v >= 40 && v <= 240)
    };
  }

  _finish() {
    this.done = true;
    const transfer = [];
    for (let c = 0; c < this.nch; c++) transfer.push(this.mins[c].buffer, this.maxs[c].buffer);
    this.port.postMessage({
      type: 'result',
      mins: this.mins,
      maxs: this.maxs,
      key: this._key(),
      bpm: this._bpm()
    }, transfer);
  }

  process(inputs) {
    if (this.done) return false;
    const inp = inputs[0];
    const nch = this.nch;
    const mins = this.mins, maxs = this.maxs;
    const blockLen = inp.length && inp[0] ? inp[0].length : 128;
    const n = Math.min(blockLen, this.total - this.pos);
    const D = this.D, useBq = D > 1, N = this.N;

    for (let i = 0; i < n; i++) {
      // waveform column
      if (this.pos >= this.colEnd) { this.col++; this.colEnd += this.step; }
      const col = this.col;

      let m = 0;
      for (let c = 0; c < nch; c++) {
        const ch = inp[c];
        const v = ch ? ch[i] : 0;
        if (v < mins[c][col]) mins[c][col] = v;
        if (v > maxs[c][col]) maxs[c][col] = v;
        m += v;
      }
      m /= nch;
      this.pos++;

      // onset envelope bands
      this.lp1 += this.aLo * (m - this.lp1);
      this.lp2 += this.aMid * (m - this.lp2);
      const lo = this.lp1, mid = this.lp2 - this.lp1, hi = m - this.lp2;
      this.eL += lo * lo; this.eM += mid * mid; this.eH += hi * hi;
      if (++this.eCount === this.ONS) this._onset();

      // key: low-pass, keep every D-th sample, run a frame every hop
      let y = m;
      if (useBq) { y = this._lp(0, y); y = this._lp(1, y); }
      if (++this.dcount >= D) {
        this.dcount = 0;
        this.fbuf[this.fcount++] = y;
        if (this.fcount === N) {
          this._frame();
          this.fbuf.copyWithin(0, this.hop);
          this.fcount = N - this.hop;
        }
      }
    }

    if (this.pos >= this.total) { this._finish(); return false; }
    return true;
  }
}
registerProcessor('analyzer-processor', AnalyzerProcessor);
`;

function FormatTimeFromNumber(seconds) {
  if (isNaN(seconds) || seconds <= 0) return "00:00";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");

  if (h > 0) {
    const hh = h.toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } else {
    return `${mm}:${ss}`;
  }
}

const waveformChannel = new BroadcastChannel("waveform");

const audioContext = new AudioContext({
  latencyHint: "balanced",
});

audioContext.suspend();

navigation.navigate = (...args) => {
  console.warn(
    "Sound Effects Studio is not allowed to navigate to other websites " +
      "since this is a standalone application. I know it was built on " +
      "Chromium but we blocked it to prevent accessing the remote content " +
      "especially Node Modules was enabled and loaded on this application.",
  );
};

const waveformQueue = [];
let processingWaveform = false;

waveformChannel.onmessage = (event) => {
  if (event.data.type !== "generate") return;

  waveformQueue.push(event.data);
  processNextWaveform();
};

let numberofsend = 0;

let analyzerUrl = null;
function getAnalyzerUrl() {
  if (!analyzerUrl) {
    analyzerUrl = URL.createObjectURL(
      new Blob([ANALYZER_WORKLET_CODE], { type: "application/javascript" }),
    );
  }
  return analyzerUrl;
}

// Decode on a throwaway offline context: the real-time audioContext is not needed.
// Using its sample rate keeps the decoded buffer identical to what you got before.
function decodeAudio(arrayBuffer, sampleRate) {
  const ctx = new OfflineAudioContext(1, 1, sampleRate);
  return ctx.decodeAudioData(arrayBuffer);
}

// -> { waveform2: [[{min, max} x width] per channel], key, bpm }
async function analyzeAudioBuffer(audioBuffer, width) {
  const channels = audioBuffer.numberOfChannels;

  // One output channel on purpose: the offline context allocates a result buffer
  // of (channels x length) floats, and the worklet only outputs silence.
  const offline = new OfflineAudioContext(
    1,
    audioBuffer.length,
    audioBuffer.sampleRate,
  );
  await offline.audioWorklet.addModule(getAnalyzerUrl());

  const node = new AudioWorkletNode(offline, "analyzer-processor", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    channelCount: channels,
    channelCountMode: "explicit",
    channelInterpretation: "discrete",
    processorOptions: { totalFrames: audioBuffer.length, width, channels },
  });

  const resultPromise = new Promise((resolve, reject) => {
    node.port.onmessage = (e) => {
      if (e.data && e.data.type === "result") resolve(e.data);
    };
    node.onprocessorerror = () => reject(new Error("Analyzer worklet failed"));
  });

  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(node);
  node.connect(offline.destination); // connected, so the graph pulls it
  source.start();

  await offline.startRendering();
  const result = await Promise.race([
    resultPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Analyzer returned no result")), 10000),
    ),
  ]);

  // same shape as before: one array of { min, max } per channel
  const waveform2 = result.mins.map((mins, c) => {
    const maxs = result.maxs[c];
    const arr = new Array(width);
    for (let x = 0; x < width; x++) arr[x] = { min: mins[x], max: maxs[x] };
    return arr;
  });

  return { waveform2, key: result.key, bpm: result.bpm };
}

// ---------------------------------------------------------------------------
// Your processNextWaveform, with the main-thread loops replaced by the worklet.
// processingWaveform, waveformQueue, numberofsend, waveformChannel and
// audioContext are yours and stay as they are.
// ---------------------------------------------------------------------------
async function processNextWaveform() {
  if (processingWaveform || waveformQueue.length === 0) return;

  numberofsend++;
  document.getElementById("4543ds").textContent = numberofsend;

  processingWaveform = true;

  const {
    src,
    width,
    height,
    width2,
    height2,
    id,
    canvasprocess,
    canvasprocess2,
  } = waveformQueue.shift();

  try {
    document.getElementById("24332df").dataset.status = "running";

    const response = await fetch(src);

    if (!response.ok)
      throw new Error(`Failed to fetch audio: ${response.status}`);

    const arrayBuffer = await response.arrayBuffer();

    const audioBuffer = await decodeAudio(arrayBuffer, audioContext.sampleRate);

    const channelCount = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;

    const { waveform2, key, bpm } = await analyzeAudioBuffer(
      audioBuffer,
      width,
    );

    document.getElementById("24332df").dataset.status = "";

    waveformChannel.postMessage({
      type: "waveform",
      width,
      height,
      width2,
      height2,
      waveform: waveform2[0],
      waveform2,
      id,
      canvasprocess,
      canvasprocess2,
      channelCount,
      sampleRate,
      key, // { key: "A minor", tonicName, mode, confidence, margin, candidates } or null
      bpm, // { bpm: 128.0, confidence, alternatives: [64, 256] } or null
    });
  } catch (error) {
    document.getElementById("24332df").dataset.status = "";

    console.error("Waveform generation failed:", error);

    waveformChannel.postMessage({
      type: "errorload",
      error: error.message || "Unable to decode audio",
    });
  } finally {
    processingWaveform = false;
    processNextWaveform();
  }
}

setInterval(() => {
  document.getElementById("25q24").textContent = `${audioContext.sampleRate}Hz`;
  document.getElementById("2jeqw").textContent = `${audioContext.state}`;
  document.getElementById("23rdw").textContent =
    `${FormatTimeFromNumber(audioContext.currentTime)}`;
}, 1000);

const rendererchannel = new BroadcastChannel("renderer-channel");

rendererchannel.onmessage = (event) => {
  document.getElementById("ertf3").textContent = `${event.data.sampleRate}Hz`;
  document.getElementById("23fsd").textContent = `${event.data.underrunEvents}`;
  document.getElementById("34tgr").textContent =
    `${FormatTimeFromNumber(event.data.currentTime)}`;
};
