// ---------------------------------------------------------------------------
// Tiny replacement for the "custom-audio-node" package. Turns `input` into
// the public node: whatever connects INTO it feeds the graph, and whatever it
// connects TO is fed from `output`. `params` are exposed as properties.
// ---------------------------------------------------------------------------
function createAudioNode(input, output, params) {
  input.connect = (...args) => output.connect(...args);
  input.disconnect = (...args) => output.disconnect(...args);
  for (const name of Object.keys(params)) {
    Object.defineProperty(input, name, {
      value: params[name],
      enumerable: true,
    });
  }
  return input;
}

// ---------------------------------------------------------------------------
// MEDIUM quality pitch shifter: two-tap granular delay line with waveform
// alignment (SOLA). Worklet code below is NOT called in this file: its source
// text is sent to the audio thread, so it must be fully self-contained.
//
// Why it has no CPU spikes / buffer problems:
//  - no FFT and no FIFO frames: the cost per sample is constant (two
//    interpolated reads per channel);
//  - the only periodic work is a small alignment search once every half grain
//    (~30k multiply-adds, independent of channel count);
//  - all buffers are allocated up front, nothing is allocated in process();
//  - every read position is clamped, so it can never read unwritten data or
//    wrap into stale samples, even if the pitch is changed abruptly.
//
// Channels share ONE set of grain positions/delays, so every channel is
// delayed and resampled identically: polarity and inter-channel phase (e.g.
// an inverted side signal) are preserved exactly.
//
// LIVE SETTINGS (grain / search / compare):
//  - buffers and windows are allocated once for the LARGEST allowed values
//    (maxGrain / maxSearch / maxCompare), so changing a setting never
//    allocates anything on the audio thread;
//  - a change is queued and applied at the next grain boundary of tap 0. At
//    that moment tap 1 is exactly at the centre of its grain (weight 1.0), so
//    the crossfade weights stay continuous while the grain length changes.
// ---------------------------------------------------------------------------
function workletMain() {
  // 4-point Hermite interpolation
  function hermite(ym1, y0, y1, y2, t) {
    const c1 = 0.5 * (y1 - ym1);
    const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
    const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
    return ((c3 * t + c2) * t + c1) * t + y0;
  }

  // periodic Hann: win[n] + win[n + G/2] === 1 (constant-gain crossfade)
  function fillHann(arr, G) {
    for (let i = 0; i < G; i++) {
      arr[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / G);
    }
  }

  class PitchShiftProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        {
          name: "pitch", // frequency ratio (2 = +1 octave)
          defaultValue: 1,
          minValue: 0.25,
          maxValue: 4,
          automationRate: "k-rate",
        },
      ];
    }

    constructor(options) {
      super();
      const o = options.processorOptions;
      this.G = o.grain; // grain length (samples, even)
      this.H = o.grain / 2; // hop = half grain
      this.S = o.search; // alignment search range (+/- samples)
      this.K = o.compareCount; // points compared per candidate
      this.stride = o.compareStride; // spacing of compared points
      this.C0 = o.latency; // nominal delay at the centre of a grain
      this.maxRatio = o.maxRatio;
      this.size = o.bufferSize;
      this.mask = o.bufferSize - 1;
      this.maxD = o.maxDelay; // largest allowed delay
      this.maxG = o.maxGrain; // largest grain (samples), for allocation
      this.maxK = o.maxCompareCount; // largest compare count, for allocation

      // Two window tables: one in use, one filled in advance for a pending
      // grain change (swapped at the grain boundary, never allocated later)
      this.win = new Float32Array(this.maxG);
      this.winNext = new Float32Array(this.maxG);
      fillHann(this.win, this.G);

      // All memory allocated up front
      this.bufs = [];
      for (let c = 0; c < o.maxChannels; c++) {
        this.bufs.push(new Float32Array(this.size));
      }
      this.refA = new Float32Array(this.maxK);
      this.refIdx = new Int32Array(this.maxK);
      this.rj = new Float64Array(this.maxK);

      // Two taps, half a grain apart
      this.w = 0;
      this.n = [0, this.H]; // position inside each tap's grain
      this.d = [this.C0, this.C0]; // current delay of each tap
      this.nActive = 0;
      this.started = false;

      // live settings, queued until the next grain boundary
      this.pending = null;
      this.port.onmessage = (e) => this._onMessage(e.data);
    }

    _onMessage(m) {
      if (!m || m.type !== "config") return;
      let G = Math.min(this.maxG, Math.max(16, m.grain | 0));
      G -= G % 2;
      const p = {
        G,
        S: Math.max(3, m.search | 0),
        K: Math.max(1, Math.min(this.maxK, m.compareCount | 0)),
        stride: Math.max(1, m.compareStride | 0),
        latency: Math.max(8, m.latency | 0),
      };
      // prepare the new window now (cheap, and off the per-sample path)
      if (p.G !== this.G) fillHann(this.winNext, p.G);
      this.pending = p;
    }

    _applyPending() {
      const p = this.pending;
      this.pending = null;
      if (p.G !== this.G) {
        const t = this.win;
        this.win = this.winNext;
        this.winNext = t;
      }
      this.G = p.G;
      this.H = p.G / 2;
      this.S = p.S;
      this.K = p.K;
      this.stride = p.stride;
      this.C0 = p.latency;
    }

    _score(buf, a, s0, dl, r) {
      const dA = s0 + dl;
      if (dA < 4 || dA > this.maxD) return -Infinity;
      const { K, mask, rj } = this;
      const pos0 = this.w - dA + 0.5;
      let dot = 0;
      let eb = 0;
      for (let k = 0; k < K; k++) {
        const v = buf[Math.floor(pos0 + rj[k]) & mask];
        dot += a[k] * v;
        eb += v * v;
      }
      return dot / Math.sqrt(eb + 1e-9);
    }

    // Called when tap t starts a new grain: choose its starting delay so that
    // its waveform lines up with the tap that is currently playing.
    _startGrain(t, r) {
      const { K, stride, S, G, C0, mask, bufs, nActive, refA, refIdx, rj } = this;
      const o = t ^ 1;
      const s0 = C0 + (r - 1) * (G / 2); // nominal start delay
      this.d[t] = s0;

      // The other tap's recent output (it sits at the centre of its grain, so
      // the last K*stride samples all belong to its current grain).
      const baseB = this.w - this.d[o] + 0.5;
      for (let k = 0; k < K; k++) {
        rj[k] = r * (k - K) * stride;
        refIdx[k] = Math.floor(baseB + rj[k]) & mask;
      }

      // Align on the loudest channel (costs the same for 2 or 8 channels)
      let ref = 0;
      let eRef = -1;
      for (let ch = 0; ch < nActive; ch++) {
        const b = bufs[ch];
        let e = 0;
        for (let k = 0; k < K; k++) {
          const v = b[refIdx[k]];
          e += v * v;
        }
        if (e > eRef) {
          eRef = e;
          ref = ch;
        }
      }
      if (eRef < 1e-9) return; // silence: nothing to align

      const buf = bufs[ref];
      for (let k = 0; k < K; k++) refA[k] = buf[refIdx[k]];

      // coarse search, then refine around the best candidate
      let best = -Infinity;
      let bestDl = 0;
      for (let dl = -S; dl <= S; dl += 3) {
        const sc = this._score(buf, refA, s0, dl, r);
        if (sc > best) {
          best = sc;
          bestDl = dl;
        }
      }
      const centre = bestDl;
      for (let dl = centre - 2; dl <= centre + 2; dl++) {
        if (dl === centre) continue;
        const sc = this._score(buf, refA, s0, dl, r);
        if (sc > best) {
          best = sc;
          bestDl = dl;
        }
      }
      if (best > -Infinity) this.d[t] = s0 + bestDl;
    }

    process(inputs, outputs, parameters) {
      const out = outputs[0];
      if (!out.length) return true;
      const inp = inputs[0];

      let r = parameters.pitch[0];
      if (!(r > 0)) r = 1;
      const maxR = this.maxRatio;
      if (r > maxR) r = maxR;
      else if (r < 1 / maxR) r = 1 / maxR;

      const nch = out.length;
      while (this.bufs.length < nch) {
        this.bufs.push(new Float32Array(this.size)); // rare: >maxChannels
      }
      this.nActive = nch;

      const { mask, maxD, bufs } = this;
      const bufs0 = bufs;
      let win = this.win; // may be swapped at a grain boundary
      let G = this.G;
      const len = out[0].length;
      const dd = 1 - r;

      // first block: place both taps for the current pitch
      if (!this.started) {
        this.started = true;
        const H = this.H;
        this.d[0] = this.C0 + (r - 1) * (H - this.n[0]);
        this.d[1] = this.C0 + (r - 1) * (H - this.n[1]);
      }

      let w = this.w;
      let n0 = this.n[0];
      let n1 = this.n[1];
      let d0 = this.d[0];
      let d1 = this.d[1];

      for (let i = 0; i < len; i++) {
        for (let ch = 0; ch < nch; ch++) {
          const x = inp[ch];
          bufs0[ch][w] = x ? x[i] : 0;
        }

        // positions of both taps (shared by every channel)
        const e0 = d0 < 4 ? 4 : d0 > maxD ? maxD : d0;
        const e1 = d1 < 4 ? 4 : d1 > maxD ? maxD : d1;
        const f0 = w - e0;
        const f1 = w - e1;
        const j0 = Math.floor(f0);
        const j1 = Math.floor(f1);
        const t0 = f0 - j0;
        const t1 = f1 - j1;
        const a0 = (j0 - 1) & mask;
        const b0 = j0 & mask;
        const c0 = (j0 + 1) & mask;
        const g0 = (j0 + 2) & mask;
        const a1 = (j1 - 1) & mask;
        const b1 = j1 & mask;
        const c1 = (j1 + 1) & mask;
        const g1 = (j1 + 2) & mask;
        const wt0 = win[n0];
        const wt1 = win[n1];

        for (let ch = 0; ch < nch; ch++) {
          const b = bufs0[ch];
          out[ch][i] =
            wt0 * hermite(b[a0], b[b0], b[c0], b[g0], t0) +
            wt1 * hermite(b[a1], b[b1], b[c1], b[g1], t1);
        }

        d0 += dd;
        d1 += dd;
        n0++;
        n1++;
        w = (w + 1) & mask;

        if (n0 >= G) {
          n0 = 0;
          this.w = w;
          this.d[0] = d0;
          this.d[1] = d1;
          if (this.pending) {
            // Tap 1 is exactly at the centre of its grain here (weight 1.0),
            // and so is the new window at H, so the crossfade stays smooth.
            this._applyPending();
            win = this.win;
            G = this.G;
            n1 = this.H;
          }
          this._startGrain(0, r);
          d0 = this.d[0];
        } else if (n1 >= G) {
          n1 = 0;
          this.w = w;
          this.d[0] = d0;
          this.d[1] = d1;
          this._startGrain(1, r);
          d1 = this.d[1];
        }
      }

      this.w = w;
      this.n[0] = n0;
      this.n[1] = n1;
      this.d[0] = d0;
      this.d[1] = d1;
      return true;
    }
  }

  registerProcessor("pitch-shift-processor-medium", PitchShiftProcessor);
}

// ---------------------------------------------------------------------------
// Loading: one addModule per AudioContext. Registering the same processor name
// twice throws, so cache the promise per context.
// ---------------------------------------------------------------------------
const loaded = new WeakMap();

function loadWorklet(audioContext) {
  let p = loaded.get(audioContext);
  if (!p) {
    const source = `(${workletMain.toString()})();`;
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    p = audioContext.audioWorklet
      .addModule(url)
      .finally(() => URL.revokeObjectURL(url));
    loaded.set(audioContext, p);
  }
  return p;
}

const nextPow2 = (v) => 2 ** Math.ceil(Math.log2(v));

/**
 * Medium-quality pitch shifter (granular + waveform alignment, AudioWorklet).
 * Synchronous: returns a usable node immediately; the shifter is attached as
 * soon as the worklet module has loaded (until then wet is silent).
 *
 * Channel count is automatic: every channel that arrives is shifted with the
 * same grain positions and comes out on the same channel index, nothing is
 * downmixed, so channel polarity is never summed away by the routing.
 *
 *   const node = PitchShift(ctx);
 *   node.transpose = 3;     // semitones; safe to set before it's ready
 *   node.grain = 0.04;      // seconds, 0.010 - maxGrain   (live)
 *   node.search = 0.008;    // seconds, 0.001 - maxSearch  (live)
 *   node.compare = 0.015;   // seconds, 0.004 - maxCompare (live; effective
 *                           //          value is capped at half the grain)
 *   await node.ready;       // optional
 */
function PitchShift(audioContext, options = {}) {
  const {
    grain = 0.032, // seconds. longer = smoother, more latency
    search = 0.006, // seconds, alignment search range (+/-)
    compare = 0.012, // seconds of audio compared when aligning
    maxGrain = 0.1, // largest grain you can set live (memory is sized for it)
    maxSearch = 0.02, // largest search you can set live
    maxCompare = 0.05, // largest compare you can set live
    maxSemitones = 12, // pitch range is +/- this many semitones
    maxChannels = 8, // buffers preallocated for this many channels
    ramp = 0.02, // seconds, smoothing for transpose changes
    extraLatency = 0.05, // additional delay in seconds
  } = options;

  const sr = audioContext.sampleRate;
  const maxRatio = Math.pow(2, maxSemitones / 12);
  const stride = 4;
  const extraLatencySamples = Number.isFinite(extraLatency)
    ? Math.max(0, Math.round(extraLatency * sr))
    : 0;

  // seconds -> everything the worklet needs, in samples
  const derive = (g, s, c) => {
    const G = 2 * Math.round((g * sr) / 2);
    const H = G / 2;
    const S = Math.max(3, Math.round(s * sr));
    const M = Math.min(H, Math.round(c * sr));
    const K = Math.max(8, Math.floor(M / stride));
    // delay at the centre of each grain; large enough that the sweeping delay
    // can never reach the write head at the extreme pitch
    const latency = Math.ceil((maxRatio - 1) * H + S + 8) + extraLatencySamples;
    return { G, S, K, latency };
  };
  const toWorklet = (c) => ({
    grain: c.G,
    search: c.S,
    compareCount: c.K,
    compareStride: stride,
    latency: c.latency,
  });

  // Memory is sized for the LARGEST settings so live changes never allocate
  const big = derive(maxGrain, maxSearch, maxCompare);
  const reach = Math.ceil(maxRatio * big.K * stride); // how far back a compare reads
  const bufferSize = nextPow2(
    big.latency + (maxRatio - 1) * (big.G / 2) + big.S + reach + 32,
  );
  const maxDelay = bufferSize - reach - 16;

  const LIMITS = {
    grain: [0.01, maxGrain],
    search: [0.001, maxSearch],
    compare: [0.004, maxCompare],
  };
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

  const settings = {
    grain: clamp(grain, LIMITS.grain),
    search: clamp(search, LIMITS.search),
    compare: clamp(compare, LIMITS.compare),
  };
  let cfg = derive(settings.grain, settings.search, settings.compare);

  // "max" count mode + "discrete" interpretation: the node takes as many
  // channels as are connected, and channel N always stays channel N
  // (no speaker-layout up/down-mixing).
  const passThrough = (n) => {
    n.channelCountMode = "max";
    n.channelInterpretation = "discrete";
    return n;
  };

  const input = passThrough(audioContext.createGain());
  const output = passThrough(audioContext.createGain());
  const wet = passThrough(audioContext.createGain());
  const dry = passThrough(audioContext.createGain());
  dry.gain.value = 0;

  // Match the dry path to the shifter's latency
  const dryDelay = passThrough(audioContext.createDelay(1));
  dryDelay.delayTime.value = cfg.latency / sr;

  input.connect(wet);
  input.connect(dry);
  dry.connect(dryDelay);
  dryDelay.connect(output);

  const node = createAudioNode(input, output, {
    dry: dry.gain, // AudioParams, default 0
    wet: wet.gain, // default 1
  });

  let semitones = 0;
  let pitchParam = null;
  let shifter = null;

  Object.defineProperty(node, "transpose", {
    set(value) {
      semitones = value;
      if (pitchParam) {
        pitchParam.setTargetAtTime(
          Math.pow(2, value / 12),
          audioContext.currentTime,
          ramp,
        );
      }
    },
    get() {
      return semitones;
    },
  });

  // Live settings (seconds). Safe to set at any time, before or after ready.
  const live = (name) => ({
    get: () => settings[name],
    set(value) {
      value = Number(value);
      if (!Number.isFinite(value)) return;
      settings[name] = clamp(value, LIMITS[name]);
      cfg = derive(settings.grain, settings.search, settings.compare);
      dryDelay.delayTime.setTargetAtTime(
        cfg.latency / sr,
        audioContext.currentTime,
        0.05,
      );
      if (shifter) {
        shifter.port.postMessage({ type: "config", ...toWorklet(cfg) });
      }
    },
  });
  Object.defineProperty(node, "grain", live("grain"));
  Object.defineProperty(node, "search", live("search"));
  Object.defineProperty(node, "compare", live("compare"));

  // seconds; follows grain/search (the wet path adopts it at the next grain)
  Object.defineProperty(node, "latency", { get: () => cfg.latency / sr });

  // Attach the shifter once the worklet module is loaded
  Object.defineProperty(node, "ready", {
    value: loadWorklet(audioContext).then(() => {
      shifter = new AudioWorkletNode(
        audioContext,
        "pitch-shift-processor-medium",
        {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCountMode: "max",
          channelInterpretation: "discrete",
          processorOptions: {
            ...toWorklet(cfg), // current settings, even if changed while loading
            maxRatio,
            bufferSize,
            maxDelay,
            maxChannels,
            maxGrain: big.G,
            maxCompareCount: big.K,
          },
        },
      );
      pitchParam = shifter.parameters.get("pitch");
      pitchParam.setValueAtTime(
        Math.pow(2, semitones / 12),
        audioContext.currentTime,
      );
      wet.connect(shifter);
      shifter.connect(output);
    }),
  });

  return node;
}