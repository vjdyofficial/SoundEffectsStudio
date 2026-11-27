
class PitchShift {
  // One worklet registration per AudioContext.
  static #loaded = new WeakMap();

  // -----------------------------------------------------------------------
  // SOLA AUDIOWORKLET
  // This function is serialized and executed in AudioWorkletGlobalScope.
  // It must not depend on anything outside itself.
  // -----------------------------------------------------------------------
  static #workletMain = function (PROCESSOR_NAME) {
    // 4-point Hermite interpolation
    function hermite(ym1, y0, y1, y2, t) {
      const c1 = 0.5 * (y1 - ym1);
      const c2 = ym1 - 2.5 * y0 + 2 * y1 - 0.5 * y2;
      const c3 = 0.5 * (y2 - ym1) + 1.5 * (y0 - y1);
      return ((c3 * t + c2) * t + c1) * t + y0;
    }

    // Periodic Hann window
    function fillHann(arr, G) {
      for (let i = 0; i < G; i++) {
        arr[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / G);
      }
    }

    class PitchShiftProcessor extends AudioWorkletProcessor {
      static get parameterDescriptors() {
        return [{
          name: "pitch",
          defaultValue: 1,
          minValue: 0.25,
          maxValue: 4,
          automationRate: "k-rate",
        }];
      }

      constructor(options) {
        super();

        const o = options.processorOptions;

        this.G = o.grain;
        this.H = o.grain / 2;
        this.S = o.search;
        this.K = o.compareCount;
        this.stride = o.compareStride;
        this.C0 = o.latency;

        this.maxRatio = o.maxRatio;
        this.size = o.bufferSize;
        this.mask = o.bufferSize - 1;
        this.maxD = o.maxDelay;
        this.maxG = o.maxGrain;
        this.maxK = o.maxCompareCount;

        this.win = new Float32Array(this.maxG);
        this.winNext = new Float32Array(this.maxG);

        fillHann(this.win, this.G);

        this.bufs = [];

        for (let c = 0; c < o.maxChannels; c++) {
          this.bufs.push(new Float32Array(this.size));
        }

        this.refA = new Float32Array(this.maxK);
        this.refIdx = new Int32Array(this.maxK);
        this.rj = new Float64Array(this.maxK);

        this.w = 0;
        this.n = [0, this.H];
        this.d = [this.C0, this.C0];

        this.nActive = 0;
        this.started = false;
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

        if (p.G !== this.G) {
          fillHann(this.winNext, p.G);
        }

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

        if (dA < 4 || dA > this.maxD) {
          return -Infinity;
        }

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

      _startGrain(t, r) {
        const {
          K, stride, S, G, C0,
          mask, bufs, nActive,
          refA, refIdx, rj,
        } = this;

        const o = t ^ 1;
        const s0 = C0 + (r - 1) * (G / 2);

        this.d[t] = s0;

        const baseB = this.w - this.d[o] + 0.5;

        for (let k = 0; k < K; k++) {
          rj[k] = r * (k - K) * stride;
          refIdx[k] = Math.floor(baseB + rj[k]) & mask;
        }

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

        if (eRef < 1e-9) return;

        const buf = bufs[ref];

        for (let k = 0; k < K; k++) {
          refA[k] = buf[refIdx[k]];
        }

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

        if (best > -Infinity) {
          this.d[t] = s0 + bestDl;
        }
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
          this.bufs.push(new Float32Array(this.size));
        }

        this.nActive = nch;

        const { mask, maxD, bufs } = this;
        const bufs0 = bufs;

        let win = this.win;
        let G = this.G;

        const len = out[0].length;
        const dd = 1 - r;

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

    registerProcessor(PROCESSOR_NAME, PitchShiftProcessor);
  };

  // -----------------------------------------------------------------------
  // PRIVATE HELPERS
  // -----------------------------------------------------------------------

  static #nextPow2(v) {
    return 2 ** Math.ceil(Math.log2(v));
  }

  static #createAudioNode(input, output, params) {
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

  static #passThrough(node) {
    node.channelCountMode = "max";
    node.channelInterpretation = "discrete";
    return node;
  }

  static #loadWorklet(audioContext) {
    let entry = this.#loaded.get(audioContext);

    if (entry) return entry.promise;

    const randomId = globalThis.crypto?.randomUUID
      ? crypto.randomUUID().replaceAll("-", "")
      : Math.random().toString(36).slice(2) +
        Date.now().toString(36);

    const processorName = `vjdy-pitch-${randomId}`;

    const source =
      `(${this.#workletMain.toString()})` +
      `(${JSON.stringify(processorName)});`;

    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );

    const promise = audioContext.audioWorklet
      .addModule(url)
      .then(() => processorName)
      .catch((error) => {
        this.#loaded.delete(audioContext);
        throw error;
      })
      .finally(() => {
        URL.revokeObjectURL(url);
      });

    entry = { processorName, promise };

    this.#loaded.set(audioContext, entry);

    return promise;
  }

  // -----------------------------------------------------------------------
  // CONSTRUCTOR
  // -----------------------------------------------------------------------

  constructor(audioContext, options = {}) {
    if (!audioContext?.audioWorklet) {
      throw new TypeError("A valid AudioContext is required.");
    }

    const {
      grain = 0.05,
      search = 0.016,
      compare = 0.024,

      maxGrain = 0.1,
      maxSearch = 0.02,
      maxCompare = 0.05,

      maxSemitones = 12,
      maxChannels = 8,

      ramp = 0.02,
      extraLatency = 0.05,
    } = options;

    const sr = audioContext.sampleRate;
    const maxRatio = Math.pow(2, maxSemitones / 12);
    const stride = 4;

    const extraLatencySamples = Number.isFinite(extraLatency)
      ? Math.max(0, Math.round(extraLatency * sr))
      : 0;

    // Convert seconds to samples.
    const derive = (g, s, c) => {
      const G = 2 * Math.round((g * sr) / 2);
      const H = G / 2;

      const S = Math.max(3, Math.round(s * sr));
      const M = Math.min(H, Math.round(c * sr));
      const K = Math.max(8, Math.floor(M / stride));

      const latency =
        Math.ceil((maxRatio - 1) * H + S + 8) +
        extraLatencySamples;

      return { G, S, K, latency };
    };

    const toWorklet = (c) => ({
      grain: c.G,
      search: c.S,
      compareCount: c.K,
      compareStride: stride,
      latency: c.latency,
    });

    const big = derive(maxGrain, maxSearch, maxCompare);

    const reach = Math.ceil(maxRatio * big.K * stride);

    const bufferSize = PitchShift.#nextPow2(
      big.latency +
      (maxRatio - 1) * (big.G / 2) +
      big.S +
      reach +
      32,
    );

    const maxDelay = bufferSize - reach - 16;

    const LIMITS = {
      grain: [0.01, maxGrain],
      search: [0.001, maxSearch],
      compare: [0.004, maxCompare],
    };

    const clamp = (v, [lo, hi]) =>
      Math.min(hi, Math.max(lo, v));

    const settings = {
      grain: clamp(grain, LIMITS.grain),
      search: clamp(search, LIMITS.search),
      compare: clamp(compare, LIMITS.compare),
    };

    let cfg = derive(
      settings.grain,
      settings.search,
      settings.compare,
    );

    // ---------------------------------------------------------------------
    // AUDIO GRAPH
    // ---------------------------------------------------------------------

    const input = PitchShift.#passThrough(
      audioContext.createGain(),
    );

    const output = PitchShift.#passThrough(
      audioContext.createGain(),
    );

    // Preserve the native input methods before the public wrapper replaces
    // input.connect() and input.disconnect().
    const connectInput = input.connect.bind(input);
    const disconnectInput = input.disconnect.bind(input);

    // Start in direct bypass mode.
    connectInput(output);

    const node = PitchShift.#createAudioNode(
      input,
      output,
      {},
    );

    // ---------------------------------------------------------------------
    // PITCH CONTROL AND PROCESSOR ROUTING
    // ---------------------------------------------------------------------

    let semitones = 0;
    let pitchParam = null;
    let shifter = null;

    let currentRoute = "bypass";

    const updateBypass = () => {
      if (!shifter) return;

      const bypass = Math.abs(semitones) < 1e-6;

      if (bypass && currentRoute !== "bypass") {
        disconnectInput(shifter);
        connectInput(output);

        currentRoute = "bypass";
      } else if (!bypass && currentRoute !== "shifter") {
        disconnectInput(output);
        connectInput(shifter);

        currentRoute = "shifter";
      }
    };

    Object.defineProperty(node, "transpose", {
      enumerable: true,

      get() {
        return semitones;
      },

      set(value) {
        value = Number(value);

        if (!Number.isFinite(value)) return;

        semitones = Math.max(
          -maxSemitones,
          Math.min(maxSemitones, value),
        );

        if (pitchParam) {
          pitchParam.setTargetAtTime(
            Math.pow(2, semitones / 12),
            audioContext.currentTime,
            ramp,
          );
        }

        updateBypass();
      },
    });

    // ---------------------------------------------------------------------
    // LIVE CONFIGURATION
    // ---------------------------------------------------------------------

    const live = (name) => ({
      enumerable: true,

      get() {
        return settings[name];
      },

      set(value) {
        value = Number(value);

        if (!Number.isFinite(value)) return;

        settings[name] = clamp(value, LIMITS[name]);

        cfg = derive(
          settings.grain,
          settings.search,
          settings.compare,
        );

        if (shifter) {
          shifter.port.postMessage({
            type: "config",
            ...toWorklet(cfg),
          });
        }
      },
    });

    Object.defineProperty(node, "grain", live("grain"));
    Object.defineProperty(node, "search", live("search"));
    Object.defineProperty(node, "compare", live("compare"));

    Object.defineProperty(node, "latency", {
      enumerable: true,
      get: () => cfg.latency / sr,
    });

    // ---------------------------------------------------------------------
    // INITIALIZATION STATE
    // ---------------------------------------------------------------------

    let initialized = false;
    let readyCallback = null;

    Object.defineProperty(node, "initialized", {
      enumerable: true,
      get: () => initialized,
    });

    Object.defineProperty(node, "processorName", {
      enumerable: true,
      get: () => shifter ? shifter.constructor.name : null,
    });

    Object.defineProperty(node, "onready", {
      enumerable: true,

      get() {
        return readyCallback;
      },

      set(callback) {
        readyCallback =
          typeof callback === "function" ? callback : null;

        // Also support assigning onready AFTER initialization.
        if (initialized && readyCallback) {
          Promise.resolve().then(() => {
            try {
              readyCallback.call(node, node);
            } catch (error) {
              console.error("[PitchShift] onready callback:", error);
            }
          });
        }
      },
    });

    // ---------------------------------------------------------------------
    // ASYNCHRONOUS WORKLET INITIALIZATION
    // ---------------------------------------------------------------------

    const ready = PitchShift.#loadWorklet(audioContext)
      .then((processorName) => {
        shifter = new AudioWorkletNode(
          audioContext,
          processorName,
          {
            numberOfInputs: 1,
            numberOfOutputs: 1,

            channelCountMode: "max",
            channelInterpretation: "discrete",

            processorOptions: {
              ...toWorklet(cfg),

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

        // Keep the processor connected to output. Its input is switched
        // on/off by updateBypass().
        shifter.connect(output);

        updateBypass();

        initialized = true;

        if (readyCallback) {
          try {
            readyCallback.call(node, node);
          } catch (error) {
            console.error("[PitchShift] onready callback:", error);
          }
        }

        return node;
      })
      .catch((error) => {
        node.initializationError = error;

        console.error(
          "[PitchShift] Initialization failed:",
          error,
        );

        if (typeof node.onerror === "function") {
          node.onerror.call(node, error);
        }

        throw error;
      });

    Object.defineProperty(node, "ready", {
      enumerable: true,
      value: ready,
    });

    // Prevent an unhandled rejection when callers don't use .ready.
    ready.catch(() => {});

    return node;
  }
}
