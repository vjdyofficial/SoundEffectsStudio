// LoudnessMeter(audioCtx, input)
//
// 8-channel AudioWorklet meter (loaded via Blob, works from file://).
//
// Modes:
// 'peak' | 'rms' | 'lufs' | 'youtube' | 'disney'
// 'blits' | 'smpte' | 'voltage' | 'isdb-t'
// 'ohm' | 'watts'

class LoudnessMeter {
  constructor(audioCtx, input) {
    this.ctx = audioCtx;
    this.input = input;

    this.node = null;
    this.sink = null;

    this.ready = false;
    this.updateMs = 500;
    this._last = 0;

    this.mode = "peak";
    this.onUpdate = null;

    // Reference loudness for target-based modes.
    this.targets = {
      youtube: -14,
      disney: -24,
      blits: -18,
      smpte: -20,
      "isdb-t": -24,
    };

    // Analog level calibration.
    // 24 = SMPTE calibration (-20 dBFS = +4 dBu).
    // 18 = EBU calibration (-18 dBFS = 0 dBu).
    this.fullScaleDbu = 24;

    // Electrical measurement.
    // Nominal speaker impedance in ohms.
    this.speakerImpedance = 8;

    // 0 dBu = 0.7746 V RMS.
    this.voltageReference = 0.7746;

    // Starts automatically.
    this.whenReady = this._start().catch((err) => {
      console.error("LoudnessMeter failed to start:", err);
    });
  }

  init() {
    return this.whenReady;
  }

  // Register the Worklet once per AudioContext.
  static _loadModule(ctx, code) {
    if (!LoudnessMeter._mods) {
      LoudnessMeter._mods = new WeakMap();
    }

    let p = LoudnessMeter._mods.get(ctx);

    if (!p) {
      const url = URL.createObjectURL(
        new Blob([code], {
          type: "application/javascript",
        }),
      );

      p = ctx.audioWorklet
        .addModule(url)
        .finally(() => URL.revokeObjectURL(url));

      LoudnessMeter._mods.set(ctx, p);
    }

    return p;
  }

  async _start() {
    const code = `
      class LoudnessProcessor extends AudioWorkletProcessor {
        constructor() {
          super();

          this.CH = 8;

          // BS.1770 channel weights:
          // L R C = 1
          // LFE = excluded
          // Surround channels = 1.41
          this.W = [1, 1, 1, 0, 1.41, 1.41, 1.41, 1.41];

          this.mode = 'peak';

          this.setUpdate(0.5);

          this.FLOOR = -60;
          this.blockCount = 0;

          this.cap = Math.ceil(3.2 * sampleRate / 128) + 2;

          this.makeK();
          this.reset();

          this.port.onmessage = (e) => {
            if (e.data && e.data.updateSec) {
              this.setUpdate(e.data.updateSec);
            }

            if (e.data && e.data.mode) {
              this.mode = e.data.mode;
              this.reset();
            }
          };
        }

        setUpdate(sec) {
          this.updateSec = sec;

          this.reportEvery = Math.max(
            1,
            Math.round(sec * sampleRate / 128)
          );

          // Peak release: approximately 20 dB/s.
          this.relFactor = Math.pow(
            10,
            -(this.reportEvery * 128 / sampleRate)
          );

          this.blockCount = 0;
        }

        makeK() {
          const fs = sampleRate;

          // Stage 1: K-weighting high shelf.
          let f0 = 1681.974450955533;
          let G = 3.999843853973347;
          let Q = 0.7071752369554196;

          let K = Math.tan(Math.PI * f0 / fs);

          const Vh = Math.pow(10, G / 20);
          const Vb = Math.pow(Vh, 0.4996667741545416);

          let a0 = 1 + K / Q + K * K;

          this.s1 = {
            b0: (Vh + Vb * K / Q + K * K) / a0,
            b1: 2 * (K * K - Vh) / a0,
            b2: (Vh - Vb * K / Q + K * K) / a0,
            a1: 2 * (K * K - 1) / a0,
            a2: (1 - K / Q + K * K) / a0
          };

          // Stage 2: RLB high-pass.
          f0 = 38.13547087602444;
          Q = 0.5003270373238773;

          K = Math.tan(Math.PI * f0 / fs);
          a0 = 1 + K / Q + K * K;

          this.s2 = {
            b0: 1,
            b1: -2,
            b2: 1,
            a1: 2 * (K * K - 1) / a0,
            a2: (1 - K / Q + K * K) / a0
          };
        }

        reset() {
          const m = this.mode;

          // Raw RMS modes.
          const rmsFam =
            m === 'rms' ||
            m === 'blits' ||
            m === 'smpte' ||
            m === 'voltage' ||
            m === 'watts';

          // Measurement windows.
          const sec = rmsFam ? 0.3 :
            m === 'isdb-t' ? 0.4 :
            m === 'lufs' ? 0.4 :
            3.0;

          this.win = Math.round(sec * sampleRate / 128);
          this.nSamples = this.win * 128;

          this.ring = [];

          for (let c = 0; c < this.CH; c++) {
            this.ring.push(new Float64Array(this.cap));
          }

          this.sum = new Float64Array(this.CH);
          this.pos = 0;

          // K-weighting filter states.
          this.z = new Float64Array(this.CH * 4);

          // Peak meter states.
          this.peakMax = new Float64Array(this.CH);
          this.held = new Float64Array(this.CH);
        }

        process(inputs) {
          const input = inputs[0];
          const mode = this.mode;

          const isPeak =
            mode === 'peak' ||
            mode === 'ohm';

          const isRms =
            mode === 'rms' ||
            mode === 'blits' ||
            mode === 'smpte' ||
            mode === 'voltage' ||
            mode === 'watts';

          for (let c = 0; c < this.CH; c++) {
            const x = input && input[c];

            let e = 0;
            let p = 0;

            if (x) {
              const n = x.length;

              if (isPeak) {
                for (let i = 0; i < n; i++) {
                  const a = x[i] < 0 ? -x[i] : x[i];

                  if (a > p) p = a;
                }

              } else if (isRms) {
                for (let i = 0; i < n; i++) {
                  e += x[i] * x[i];
                }

              } else {
                const s1 = this.s1;
                const s2 = this.s2;

                const z = this.z;
                const o = c * 4;

                let z1 = z[o];
                let z2 = z[o + 1];
                let z3 = z[o + 2];
                let z4 = z[o + 3];

                for (let i = 0; i < n; i++) {
                  const v = x[i];

                  let y = s1.b0 * v + z1;

                  z1 = s1.b1 * v - s1.a1 * y + z2;
                  z2 = s1.b2 * v - s1.a2 * y;

                  const w = y;

                  y = s2.b0 * w + z3;

                  z3 = s2.b1 * w - s2.a1 * y + z4;
                  z4 = s2.b2 * w - s2.a2 * y;

                  e += y * y;
                }

                z[o] = z1;
                z[o + 1] = z2;
                z[o + 2] = z3;
                z[o + 3] = z4;
              }
            }

            if (isPeak) {
              if (p > this.peakMax[c]) {
                this.peakMax[c] = p;
              }

            } else {
              const r = this.ring[c];

              const old = r[
                (this.pos - this.win + this.cap) % this.cap
              ];

              this.sum[c] += e - old;

              r[this.pos] = e;
            }
          }

          if (!isPeak) {
            this.pos = (this.pos + 1) % this.cap;
          }

          if (++this.blockCount >= this.reportEvery) {
            this.blockCount = 0;
            this.report();
          }

          return true;
        }

        report() {
          const db = new Array(this.CH);

          let total = null;

          if (this.mode === 'peak' || this.mode === 'ohm') {
            let m = 0;

            for (let c = 0; c < this.CH; c++) {
              const h = Math.max(
                this.peakMax[c],
                this.held[c] * this.relFactor
              );

              this.held[c] = h;
              this.peakMax[c] = 0;

              db[c] = h > 0
                ? Math.max(
                    this.FLOOR,
                    20 * Math.log10(h)
                  )
                : this.FLOOR;

              if (h > m) m = h;
            }

            total = m > 0
              ? Math.max(
                  this.FLOOR,
                  20 * Math.log10(m)
                )
              : this.FLOOR;

          } else {
            const md = this.mode;

            // RMS = 0 offset.
            // Line-up and electrical RMS modes = +3.0103 dB.
            // K-weighted loudness = -0.691 dB.
            const off = md === 'rms' ? 0 :
              (
                md === 'blits' ||
                md === 'smpte' ||
                md === 'voltage' ||
                md === 'watts'
              ) ? 3.0103 : -0.691;

            let tot = 0;

            for (let c = 0; c < this.CH; c++) {
              const ms = Math.max(0, this.sum[c]) / this.nSamples;

              db[c] = ms > 1e-12
                ? Math.max(
                    this.FLOOR,
                    10 * Math.log10(ms) + off
                  )
                : this.FLOOR;

              if (md === 'watts') {
                // Electrical power: sum all channel energies.
                // No BS.1770 channel weighting is applied.
                tot += ms;
              } else {
                tot += this.W[c] * ms;
              }
            }

            if (md === 'watts') {
              // Combined electrical power across all channels.
              total = tot > 1e-12
                ? Math.max(
                    this.FLOOR,
                    10 * Math.log10(tot) + off
                  )
                : this.FLOOR;

            } else if (
              md === 'lufs' ||
              md === 'youtube' ||
              md === 'disney' ||
              md === 'isdb-t'
            ) {
              total = tot > 1e-12
                ? Math.max(
                    this.FLOOR,
                    10 * Math.log10(tot) - 0.691
                  )
                : this.FLOOR;
            }
          }

          this.port.postMessage({
            mode: this.mode,
            db,
            total
          });
        }
      }

      registerProcessor('loudness-meter', LoudnessProcessor);
    `;

    await LoudnessMeter._loadModule(this.ctx, code);

    this.node = new AudioWorkletNode(this.ctx, "loudness-meter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 8,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      outputChannelCounts: [1],
    });

    // Silent sink so the browser keeps pulling the node.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;

    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);

    this.node.port.onmessage = (e) => {
      this._handle(e.data);
    };

    this.input.connect(this.node);

    this.ready = true;

    this.node.port.postMessage({
      updateSec: this.updateMs / 1000,
    });

    this.setMode(this.mode);

    if (this.ctx.state === "suspended") {
      console.warn(
        "LoudnessMeter: AudioContext is suspended, call audioCtx.resume() after a click",
      );
    }
  }

  setUpdateMs(ms) {
    this.updateMs = Math.max(20, ms);

    if (this.ready) {
      this.node.port.postMessage({
        updateSec: this.updateMs / 1000,
      });
    }
  }

  setMode(mode) {
    if (
      ![
        "peak",
        "rms",
        "lufs",
        "youtube",
        "disney",
        "blits",
        "smpte",
        "voltage",
        "isdb-t",
        "ohm",
        "watts",
      ].includes(mode)
    ) {
      return;
    }

    this.mode = mode;

    if (!this.ready) return;

    this.node.port.postMessage({ mode });
  }

  // Set nominal speaker impedance.
  setSpeakerImpedance(ohms) {
    if (!Number.isFinite(ohms) || ohms <= 0) {
      return;
    }

    this.speakerImpedance = ohms;
  }

  // Set analog calibration:
  // dBu level corresponding to 0 dBFS.
  setFullScaleDbu(dbu) {
    if (!Number.isFinite(dbu)) {
      return;
    }

    this.fullScaleDbu = dbu;
  }

  // 0..1 bar position.
  // -60..+12 dB, 0 dB at 80%.
  static dbToLevel(db, ref = 0) {
    if (!isFinite(db)) return 0;

    const d = db - ref;

    if (d <= -60) return 0;
    if (d >= 12) return 1;

    return d >= 0 ? 0.8 + (d / 12) * 0.2 : ((d + 60) / 60) * 0.8;
  }

  _fmt(v) {
    if (!isFinite(v)) return "-inf";

    const t = v.toFixed(1);

    return t === "-0.0" ? "0.0" : t;
  }

  _fmtVolts(v) {
    return v >= 1 ? v.toFixed(2) + " V" : (v * 1000).toFixed(1) + " mV";
  }

  _fmtWatts(w) {
    if (w >= 1000) {
      return (w / 1000).toFixed(2) + " kW";
    }

    if (w >= 1) {
      return w.toFixed(2) + " W";
    }

    if (w >= 0.001) {
      return (w * 1000).toFixed(2) + " mW";
    }

    return (w * 1000000).toFixed(2) + " µW";
  }

  _make(db) {
    const m = this.mode;
    const target = this.targets[m];

    let text;
    let rel = null;
    let fixedLevel = null;

    if (m === "peak" || m === "rms") {
      text = this._fmt(db) + " dB";
    } else if (m === "lufs") {
      text = this._fmt(db) + " LUFS";
    } else if (m === "blits" || m === "smpte") {
      rel = db <= -60 ? -60 : db - target;

      text = (rel > 0 ? "+" : "") + this._fmt(rel) + " dB";
    } else if (m === "voltage") {
      const volts =
        db <= -60
          ? 0
          : this.voltageReference * Math.pow(10, (db + this.fullScaleDbu) / 20);

      text = this._fmtVolts(volts);

      rel = db <= -60 ? -60 : db - (4 - this.fullScaleDbu);
    } else if (m === "isdb-t") {
      rel = db <= -60 ? -60 : db - target;

      text = this._fmt(db) + " LKFS";
    } else if (m === "ohm") {
      text = this.speakerImpedance.toFixed(1) + " Ω";

      // OHM is a configured nominal load, not an audio level.
      fixedLevel = 0.8;
    } else if (m === "watts") {
      const volts =
        db <= -60
          ? 0
          : this.voltageReference * Math.pow(10, (db + this.fullScaleDbu) / 20);

      const watts = (volts * volts) / this.speakerImpedance;

      text = this._fmtWatts(watts);
    } else {
      rel = db <= -60 ? -60 : db - target;

      text = (rel > 0 ? "+" : "") + this._fmt(rel) + " LU";
    }

    const level =
      fixedLevel !== null
        ? fixedLevel
        : LoudnessMeter.dbToLevel(rel !== null ? rel : db);

    return {
      text,
      db,
      level,
    };
  }

  // dBFS -> volts, using the same calibration as the 'voltage' mode.
  _dbToVolts(db) {
    return db <= -60
      ? 0
      : this.voltageReference * Math.pow(10, (db + this.fullScaleDbu) / 20);
  }

  // Electrical values for every channel, plus a combined total.
  _electrical(dbArr) {
    const Z = this.speakerImpedance;

    const vCh = dbArr.map((d) => this._dbToVolts(d));
    const wCh = vCh.map((v) => (v * v) / Z);

    // Combined power = sum of channel powers (no BS.1770 weighting),
    // same as the 'watts' mode. Combined voltage is the equivalent
    // RMS voltage for that power into one nominal load.
    const wTot = wCh.reduce((a, b) => a + b, 0);
    const vTot = Math.sqrt(wTot * Z);

    return {
      voltage: {
        channels: vCh.map((v) => ({
          text: this._fmtVolts(v),
          value: v,
        })),
        total: {
          text: this._fmtVolts(vTot),
          value: vTot,
        },
      },
      watts: {
        channels: wCh.map((w) => ({
          text: this._fmtWatts(w),
          value: w,
        })),
        total: {
          text: this._fmtWatts(wTot),
          value: wTot,
        },
      },
    };
  }

  _handle(msg) {
    if (msg.mode !== this.mode) return;

    const now = performance.now();

    if (now - this._last < this.updateMs * 0.9) {
      return;
    }

    this._last = now;

    if (!this.onUpdate) return;
    const channels = msg.db.map((d) => this._make(d));
    const total = msg.total === null ? null : this._make(msg.total);
    const { voltage, watts } = this._electrical(msg.db);
    this.onUpdate(channels, total, voltage, watts);
  }

  destroy() {
    try {
      if (this.input && this.node) {
        this.input.disconnect(this.node);
      }
    } catch (e) {}

    try {
      if (this.node) {
        this.node.disconnect();
        this.node.port.onmessage = null;
      }
    } catch (e) {}

    try {
      if (this.sink) {
        this.sink.disconnect();
      }
    } catch (e) {}

    this.node = null;
    this.sink = null;
    this.ready = false;
  }
}
