const STEREOLIZER_WORKLET_CODE = `

const OFFSET = [0, 0.5, 0.25, 0, 0.375, 0.875, 0.125, 0.625];
const MOD_OFFSETS = [0, 0.5, 0.25, 0, 0, 0.5, 0, 0.5];
const SIDE = [-1, 1, 0, 0, -1, 1, -1, 1];
const CHANNELS = [0, 1, 2, 4, 5, 6, 7];

const WIDTH_PAIRS = [
  [0, 1],
  [4, 5],
  [6, 7]
];

const TAU = 6.283185307179586;

class StereoizerProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    const k = 'k-rate';

    return [
      { name: 'strength',    defaultValue: 0.5,  minValue: 0,     maxValue: 1,    automationRate: k },
      { name: 'focus',       defaultValue: 1500, minValue: 100,   maxValue: 8000, automationRate: k },
      { name: 'delay',       defaultValue: 0,    minValue: -5,    maxValue: 5,    automationRate: k },

      { name: 'chorusRate',  defaultValue: 0.05, minValue: 0.05, maxValue: 1, automationRate: k },
      { name: 'chorusDepth', defaultValue: 0,    minValue: 0,    maxValue: 1, automationRate: k },

      { name: 'wide',        defaultValue: 0, minValue: 0, maxValue: 1, automationRate: k },
      { name: 'juno',        defaultValue: 0, minValue: 0, maxValue: 1, automationRate: k },
      { name: 'atmosphere',  defaultValue: 0, minValue: 0, maxValue: 1, automationRate: k },

      { name: 'mix',         defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: k }
    ];
  }

  constructor() {
    super();

    const sr = sampleRate;

    // 100 ms circular buffer capacity
    let size = 1;

    while (size < sr * 0.1) {
      size <<= 1;
    }

    this.mask = size - 1;
    this.wi = 0;

    // Phase network
    this.cs = new Float64Array(32);
    this.ce = new Float64Array(32);
    this.z = new Float64Array(32);

    // Effect buffers
    this.chorusBuffer = [];
    this.atmoBuffer1 = [];
    this.atmoBuffer2 = [];
    this.delayBuffer = [];

    for (let c = 0; c < 8; c++) {
      this.chorusBuffer.push(new Float32Array(size));
      this.atmoBuffer1.push(new Float32Array(size));
      this.atmoBuffer2.push(new Float32Array(size));

      this.delayBuffer.push(
        SIDE[c] !== 0 ? new Float32Array(size) : null
      );
    }

    // Block-rate chorus modulation
    this.chStart = new Float64Array(8);
    this.chStep = new Float64Array(8);

    // DSP state
    this.str = 0;
    this.dPrev = 0;

    this.chph = 0;
    this.jph = 0;

    this.lastF = -1;
    this.fresh = true;

    this.wasProcessing = false;
    this.phaseWasActive = false;

    this.wasChorusOrJunoActive = false;
    this.wasAtmoActive = false;
    this.wasDelayActive = false;

    // Reset with acknowledgment for safe unbypass
    this.port.onmessage = (event) => {
      const msg = event.data;

      if (msg && msg.type === 'reset') {
        this._reset();

        this.port.postMessage({
          type: 'reset-done',
          id: msg.id
        });
      }
    };
  }

  // -------------------------------------------------------------------------
  // Reset DSP state
  // -------------------------------------------------------------------------

  _reset() {
    this.cs.fill(0);
    this.ce.fill(0);
    this.z.fill(0);

    for (let c = 0; c < 8; c++) {
      this.chorusBuffer[c].fill(0);
      this.atmoBuffer1[c].fill(0);
      this.atmoBuffer2[c].fill(0);

      if (this.delayBuffer[c]) {
        this.delayBuffer[c].fill(0);
      }
    }

    this.str = 0;
    this.dPrev = 0;

    this.chph = 0;
    this.jph = 0;

    this.lastF = -1;
    this.fresh = true;

    this.phaseWasActive = false;

    this.wasProcessing = false;
    this.wasChorusOrJunoActive = false;
    this.wasAtmoActive = false;
    this.wasDelayActive = false;
  }

  // -------------------------------------------------------------------------
  // Fractional delay reader
  // -------------------------------------------------------------------------

  _read(buf, pos) {
    const i = Math.floor(pos);
    const frac = pos - i;

    const a = buf[i & this.mask];
    const b = buf[(i + 1) & this.mask];

    return a + (b - a) * frac;
  }

  // -------------------------------------------------------------------------
  // Direct eight-channel copy
  // -------------------------------------------------------------------------

  _copy(inp, out) {
    for (let c = 0; c < 8; c++) {
      if (inp[c]) {
        out[c].set(inp[c]);
      } else {
        out[c].fill(0);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Main processing
  // -------------------------------------------------------------------------

  process(inputs, outputs, p) {

    const inp = inputs[0];
    const out = outputs[0];

    if (!out || !out.length) {
      return true;
    }

    // Safety fallback for non-8-channel output
    if (out.length < 8) {
      for (let c = 0; c < out.length; c++) {
        if (inp[c]) {
          out[c].set(inp[c]);
        } else {
          out[c].fill(0);
        }
      }

      return true;
    }

    const n = out[0].length;
    const sr = sampleRate;
    const mask = this.mask;

    // -----------------------------------------------------------------------
    // Parameters
    // -----------------------------------------------------------------------

    const strength = p.strength[0];
    const focus = p.focus[0];
    const delay = p.delay[0];

    const chorusRate = p.chorusRate[0];
    const chorusDepth = p.chorusDepth[0];

    const wide = p.wide[0];
    const juno = p.juno[0];
    const atmosphere = p.atmosphere[0];

    const mix = p.mix[0];

    const dryGain = 1 - mix;
    const wetGain = mix;

    // -----------------------------------------------------------------------
    // Fast bypass: 100% dry
    // -----------------------------------------------------------------------

    if (mix <= 0) {
      this._copy(inp, out);

      this.wasProcessing = false;

      return true;
    }

    // -----------------------------------------------------------------------
    // Determine active processing stages
    // -----------------------------------------------------------------------

    const phaseActive = strength > 0.0001;
    const chorusActive = chorusDepth > 0.0001;
    const junoActive = juno > 0.0001;
    const atmoActive = atmosphere > 0.0001;
    const widthActive = wide > 0.0001;

    const dNow = delay * 0.001 * sr;

    const delayActive =
      Math.abs(dNow) > 0.001 ||
      Math.abs(this.dPrev) > 0.001;

    const needsProcessing =
      phaseActive ||
      chorusActive ||
      junoActive ||
      atmoActive ||
      widthActive ||
      delayActive;

    // -----------------------------------------------------------------------
    // Fast bypass: no active effects
    // -----------------------------------------------------------------------

    if (!needsProcessing) {
      this._copy(inp, out);

      this.wasProcessing = false;

      return true;
    }

    // -----------------------------------------------------------------------
    // Reset stale DSP state when processing resumes
    // -----------------------------------------------------------------------

    if (!this.wasProcessing) {
      this._reset();
      this.wasProcessing = true;
    }

    // -----------------------------------------------------------------------
    // Clear buffers when individual effects are reactivated
    // -----------------------------------------------------------------------

    const chorusOrJunoActive = chorusActive || junoActive;

    if (
      chorusOrJunoActive &&
      !this.wasChorusOrJunoActive
    ) {
      for (let ci = 0; ci < 7; ci++) {
        this.chorusBuffer[CHANNELS[ci]].fill(0);
      }
    }

    if (atmoActive && !this.wasAtmoActive) {
      for (let ci = 0; ci < 7; ci++) {
        const ch = CHANNELS[ci];

        this.atmoBuffer1[ch].fill(0);
        this.atmoBuffer2[ch].fill(0);
      }
    }

    if (delayActive && !this.wasDelayActive) {
      for (let ci = 0; ci < 7; ci++) {
        const ch = CHANNELS[ci];

        if (this.delayBuffer[ch]) {
          this.delayBuffer[ch].fill(0);
        }
      }
    }

    // -----------------------------------------------------------------------
    // 1. Phase coefficient generation
    // Fixed Focus: no independent LFO modulation
    // -----------------------------------------------------------------------

    if (
      phaseActive &&
      (
        this.fresh ||
        focus !== this.lastF ||
        !this.phaseWasActive
      )
    ) {

      this.lastF = focus;

      for (let ci = 0; ci < 7; ci++) {

        const ch = CHANNELS[ci];

        const f0 = focus;
        const b = ch * 4;

        for (let k = 0; k < 4; k++) {

          let f = f0 * Math.pow(
            2,
            (k - 1.5 + OFFSET[ch]) * 0.25
          );

          f = Math.max(
            30,
            Math.min(sr * 0.45, f)
          );

          const t = Math.tan(Math.PI * f / sr);

          this.ce[b + k] = (t - 1) / (t + 1);
        }
      }

      if (this.fresh) {
        this.cs.set(this.ce);
        this.fresh = false;
      }
    }

    this.phaseWasActive = phaseActive;

    const dS = (strength - this.str) / n;
    const dDelay = (dNow - this.dPrev) / n;

    // -----------------------------------------------------------------------
    // 2. Chorus modulation
    // Internal chorus modulation retained
    // -----------------------------------------------------------------------

    const chorusPhaseEnd = chorusActive
      ? this.chph + chorusRate * n / sr
      : this.chph;

    if (chorusActive) {

      for (let ci = 0; ci < 7; ci++) {

        const ch = CHANNELS[ci];
        const offset = MOD_OFFSETS[ch];

        const a = Math.sin(
          TAU * (this.chph + offset)
        );

        const b = Math.sin(
          TAU * (chorusPhaseEnd + offset)
        );

        this.chStart[ch] = a;
        this.chStep[ch] = (b - a) / n;
      }
    }

    // -----------------------------------------------------------------------
    // 3. Juno modulation
    // Internal ensemble modulation retained
    // -----------------------------------------------------------------------

    const junoPhaseEnd = junoActive
      ? this.jph + chorusRate * n / sr
      : this.jph;

    let j1 = 0;
    let j2 = 0;
    let j3 = 0;

    let jd1 = 0;
    let jd2 = 0;
    let jd3 = 0;

    if (junoActive) {

      const jp = this.jph;
      const je = junoPhaseEnd;

      j1 = Math.sin(TAU * jp);
      j2 = Math.sin(TAU * (jp * 1.017 + 0.33));
      j3 = Math.sin(TAU * (jp * 0.983 + 0.66));

      jd1 = (
        Math.sin(TAU * je) - j1
      ) / n;

      jd2 = (
        Math.sin(TAU * (je * 1.017 + 0.33)) - j2
      ) / n;

      jd3 = (
        Math.sin(TAU * (je * 0.983 + 0.66)) - j3
      ) / n;
    }

    // -----------------------------------------------------------------------
    // 4. Atmosphere delay taps
    // -----------------------------------------------------------------------

    const atmoD1 = Math.max(
      1,
      Math.floor(sr * 0.007)
    );

    const atmoD2 = Math.max(
      1,
      Math.floor(sr * 0.011)
    );

    // -----------------------------------------------------------------------
    // 5. LFE passthrough
    // -----------------------------------------------------------------------

    if (inp[3]) {
      out[3].set(inp[3]);
    } else {
      out[3].fill(0);
    }

    // -----------------------------------------------------------------------
    // 6. Main channel processing
    // -----------------------------------------------------------------------

    for (let ci = 0; ci < 7; ci++) {

      const ch = CHANNELS[ci];

      const xin = inp[ch];
      const yout = out[ch];

      const b = ch * 4;

      // Phase coefficients
      let c0 = this.cs[b];
      let c1 = this.cs[b + 1];
      let c2 = this.cs[b + 2];
      let c3 = this.cs[b + 3];

      let dc0 = 0;
      let dc1 = 0;
      let dc2 = 0;
      let dc3 = 0;

      if (phaseActive) {
        dc0 = (this.ce[b] - c0) / n;
        dc1 = (this.ce[b + 1] - c1) / n;
        dc2 = (this.ce[b + 2] - c2) / n;
        dc3 = (this.ce[b + 3] - c3) / n;
      }

      // Filter state
      let z0 = this.z[b];
      let z1 = this.z[b + 1];
      let z2 = this.z[b + 2];
      let z3 = this.z[b + 3];

      let s = this.str;
      let d = this.dPrev;

      // Effect buffers
      const chorusBuf = this.chorusBuffer[ch];

      const atmo1 = this.atmoBuffer1[ch];
      const atmo2 = this.atmoBuffer2[ch];

      const delayBuf = this.delayBuffer[ch];

      const side = SIDE[ch];

      // Block-rate chorus interpolation
      let chLfo = this.chStart[ch];
      const chLfoStep = this.chStep[ch];

      // ---------------------------------------------------------------------
      // Sample loop
      // ---------------------------------------------------------------------

      for (let i = 0; i < n; i++) {

        const wp = (this.wi + i) & mask;

        const x = xin ? xin[i] : 0;

        s += dS;
        d += dDelay;

        let signal = x;

        // ---------------------------------------------------------------
        // Phase processing
        // ---------------------------------------------------------------

        if (phaseActive) {

          c0 += dc0;
          c1 += dc1;
          c2 += dc2;
          c3 += dc3;

          let q = signal;

          let y = c0 * q + z0;
          z0 = q - c0 * y;
          q = y;

          y = c1 * q + z1;
          z1 = q - c1 * y;
          q = y;

          y = c2 * q + z2;
          z2 = q - c2 * y;
          q = y;

          y = c3 * q + z3;
          z3 = q - c3 * y;
          q = y;

          signal += s * (q - signal);
        }

        // ---------------------------------------------------------------
        // Chorus and Juno shared buffer
        // ---------------------------------------------------------------

        if (chorusActive || junoActive) {

          chorusBuf[wp] = signal;

          // Chorus
          if (chorusActive) {

            const chorusDelay =
              (12 + chorusDepth * 4 * chLfo) *
              0.001 * sr;

            const delayed = this._read(
              chorusBuf,
              wp - chorusDelay
            );

            signal += chorusDepth * 0.65 *
              (delayed - signal);

            chLfo += chLfoStep;
          }

          // Juno ensemble
          if (junoActive) {

            const d1 = (11 + j1 * 1.5) * 0.001 * sr;
            const d2 = (15 + j2 * 1.5) * 0.001 * sr;
            const d3 = (19 + j3 * 1.5) * 0.001 * sr;

            const ensemble = (
              this._read(chorusBuf, wp - d1) +
              this._read(chorusBuf, wp - d2) +
              this._read(chorusBuf, wp - d3)
            ) / 3;

            signal += juno * 0.65 *
              (ensemble - signal);
          }
        }

        // ---------------------------------------------------------------
        // Atmosphere diffusion
        // ---------------------------------------------------------------

        if (atmoActive) {

          const r1 = atmo1[
            (wp - atmoD1) & mask
          ];

          const a1 = r1 - 0.55 * signal;

          atmo1[wp] = signal + 0.55 * a1;

          const r2 = atmo2[
            (wp - atmoD2) & mask
          ];

          const a2 = r2 - 0.55 * a1;

          atmo2[wp] = a1 + 0.55 * a2;

          signal += atmosphere * 0.4 *
            (a2 - signal);
        }

        // ---------------------------------------------------------------
        // Haas delay
        // ---------------------------------------------------------------

        if (delayActive && delayBuf) {

          delayBuf[wp] = signal;

          let channelDelay = side * d;

          if (channelDelay < 0) {
            channelDelay = 0;
          }

          if (channelDelay > 0.001) {

            signal = this._read(
              delayBuf,
              wp - channelDelay
            );
          }
        }

        yout[i] = signal;

        // Juno interpolation
        if (junoActive) {
          j1 += jd1;
          j2 += jd2;
          j3 += jd3;
        }
      }

      // Save phase state
      if (phaseActive) {
        this.z[b] = z0;
        this.z[b + 1] = z1;
        this.z[b + 2] = z2;
        this.z[b + 3] = z3;
      }
    }

    // -----------------------------------------------------------------------
    // 7. Advance internal effect phases
    // -----------------------------------------------------------------------

    if (chorusActive) {
      this.chph = chorusPhaseEnd -
        Math.floor(chorusPhaseEnd);
    }

    if (junoActive) {
      this.jph = junoPhaseEnd -
        Math.floor(junoPhaseEnd);
    }

    // -----------------------------------------------------------------------
    // 8. Stereo Width
    // -----------------------------------------------------------------------

    if (widthActive) {

      const gain = 1 + wide;

      for (let pair = 0; pair < 3; pair++) {

        const left = WIDTH_PAIRS[pair][0];
        const right = WIDTH_PAIRS[pair][1];

        const L = out[left];
        const R = out[right];

        for (let i = 0; i < n; i++) {

          const mid = (L[i] + R[i]) * 0.5;

          const side = (R[i] - L[i]) * 0.5 * gain;

          L[i] = mid - side;
          R[i] = mid + side;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 9. Dry / Wet Mix
    // -----------------------------------------------------------------------

    if (mix < 0.99999) {

      for (let ci = 0; ci < 7; ci++) {

        const ch = CHANNELS[ci];

        const xin = inp[ch];
        const yout = out[ch];

        for (let i = 0; i < n; i++) {

          const dry = xin ? xin[i] : 0;
          const wet = yout[i];

          yout[i] =
            dry * dryGain +
            wet * wetGain;
        }
      }
    }

    // -----------------------------------------------------------------------
    // 10. Save processing state
    // -----------------------------------------------------------------------

    this.wi = (this.wi + n) & mask;

    if (phaseActive) {
      this.cs.set(this.ce);
    }

    this.str = strength;
    this.dPrev = dNow;

    this.wasChorusOrJunoActive = chorusOrJunoActive;
    this.wasAtmoActive = atmoActive;
    this.wasDelayActive = delayActive;

    return true;
  }
}

registerProcessor(
  'stereolizer-processor',
  StereoizerProcessor
);
`;

// ===========================================================================
// STEREOIZER CLASS
// ===========================================================================

class Stereoizer {
  static _loading = new WeakMap();

  // -------------------------------------------------------------------------
  // Worklet loader
  // -------------------------------------------------------------------------

  static _load(audioCtx) {
    if (!Stereoizer._loading.has(audioCtx)) {
      const blob = new Blob([STEREOLIZER_WORKLET_CODE], {
        type: "application/javascript",
      });

      const url = URL.createObjectURL(blob);

      const promise = audioCtx.audioWorklet
        .addModule(url)
        .finally(() => URL.revokeObjectURL(url));

      Stereoizer._loading.set(audioCtx, promise);
    }

    return Stereoizer._loading.get(audioCtx);
  }

  // -------------------------------------------------------------------------
  // Parameter ranges
  // -------------------------------------------------------------------------

  static RANGES = {
    strength: [0, 1],
    focus: [100, 8000],
    delay: [-5, 5],

    chorusRate: [0.05, 1],
    chorusDepth: [0, 1],

    wide: [0, 1],
    juno: [0, 1],
    atmosphere: [0, 1],

    mix: [0, 1],
  };

  // -------------------------------------------------------------------------
  // Color mapping
  //
  // Hue        = Chorus rate + intensity
  // Saturation = Stereo Width
  // Lightness  = Juno Ensemble
  // Alpha      = Atmosphere
  // -------------------------------------------------------------------------

  static colorMap({ hue, saturation, lightness, alpha }) {
    let h;

    if (hue <= 300) {
      h = hue / 300;
    } else {
      h = (360 - hue) / 60;
    }

    h = Math.max(0, Math.min(1, h));

    return {
      chorusRate: 0.05 * Math.pow(20, h),

      chorusDepth: h,

      wide: saturation,

      juno: lightness,

      atmosphere: alpha,
    };
  }

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(audioCtx, input, output, startBypassed = true) {
    this.ctx = audioCtx;

    this.input = input;
    this.output = output;

    this.node = null;

    this._bypassed = !!startBypassed;

    this._routeMode = "direct";
    this._hasBeenActivated = false;

    this._resetSequence = 0;
    this._resetWaiters = new Map();

    this.settings = {};

    // Direct connection until worklet initialization
    this.input.connect(this.output);

    this.ready = this._init();
  }

  // -------------------------------------------------------------------------
  // Initialize
  // -------------------------------------------------------------------------

  async _init() {
    await Stereoizer._load(this.ctx);

    this.node = new AudioWorkletNode(this.ctx, "stereolizer-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,

      outputChannelCount: [8],

      channelCount: 8,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
    });

    // Handle reset acknowledgments
    this.node.port.onmessage = (event) => {
      const msg = event.data;

      if (!msg || msg.type !== "reset-done") {
        return;
      }

      const resolve = this._resetWaiters.get(msg.id);

      if (resolve) {
        this._resetWaiters.delete(msg.id);
        resolve();
      }
    };

    // Restore saved parameters
    for (const [name, value] of Object.entries(this.settings)) {
      const param = this.node.parameters.get(name);

      if (param) {
        param.value = value;
      }
    }

    this._route();

    return this;
  }

  // -------------------------------------------------------------------------
  // Reset worklet and wait for acknowledgment
  // -------------------------------------------------------------------------

  _resetNode() {
    if (!this.node) {
      return Promise.resolve();
    }

    const id = ++this._resetSequence;

    return new Promise((resolve) => {
      this._resetWaiters.set(id, resolve);

      this.node.port.postMessage({
        type: "reset",
        id,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------

  _route() {
    if (!this.node) {
      return;
    }

    const target = this._bypassed ? "direct" : "worklet";

    // Avoid unnecessary disconnect/reconnect operations
    if (this._routeMode === target) {
      return;
    }

    // Remove existing owned routes
    try {
      this.input.disconnect(this.output);
    } catch (e) {}

    try {
      this.input.disconnect(this.node);
    } catch (e) {}

    try {
      this.node.disconnect();
    } catch (e) {}

    // Direct bypass
    if (target === "direct") {
      this.input.connect(this.output);

      this._routeMode = "direct";

      return;
    }

    // Worklet processing
    this.input.connect(this.node);
    this.node.connect(this.output);

    this._routeMode = "worklet";
    this._hasBeenActivated = true;
  }

  // -------------------------------------------------------------------------
  // Bypass
  // -------------------------------------------------------------------------

  bypass() {
    this._bypassed = true;

    // If initialization is pending, the direct route is already active
    this._route();

    return this;
  }

  // -------------------------------------------------------------------------
  // Unbypass
  // -------------------------------------------------------------------------

  async unbypass() {
    this._bypassed = false;

    // Wait until the worklet is ready
    await this.ready;

    // Another bypass request may have happened while loading
    if (this._bypassed) {
      return this;
    }

    // Already connected to the worklet
    if (this._routeMode === "worklet") {
      return this;
    }

    // Reset old DSP state before reconnecting
    if (this._hasBeenActivated) {
      await this._resetNode();
    }

    // A bypass request may have happened during reset
    if (this._bypassed) {
      return this;
    }

    this._route();

    return this;
  }

  // -------------------------------------------------------------------------
  // Parameter setter
  // -------------------------------------------------------------------------

  _set(name, value) {
    value = Number(value);

    if (!Number.isFinite(value)) {
      return;
    }

    const range = Stereoizer.RANGES[name];

    if (!range) {
      return;
    }

    const [min, max] = range;

    value = Math.max(min, Math.min(max, value));

    this.settings[name] = value;

    if (this.node) {
      const param = this.node.parameters.get(name);

      if (param) {
        param.value = value;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Main controls
  // -------------------------------------------------------------------------

  strength(v) {
    this._set("strength", v);
  }

  focus(hz) {
    this._set("focus", hz);
  }

  delay(ms) {
    this._set("delay", ms);
  }

  // -------------------------------------------------------------------------
  // Chorus
  // -------------------------------------------------------------------------

  chorusRate(v) {
    this._set("chorusRate", v);
  }

  chorusDepth(v) {
    this._set("chorusDepth", v);
  }

  // -------------------------------------------------------------------------
  // Color effects
  // -------------------------------------------------------------------------

  wide(v) {
    this._set("wide", v);
  }

  juno(v) {
    this._set("juno", v);
  }

  atmosphere(v) {
    this._set("atmosphere", v);
  }

  // -------------------------------------------------------------------------
  // Dry / Wet
  // -------------------------------------------------------------------------

  mix(v) {
    this._set("mix", v);
  }

  // -------------------------------------------------------------------------
  // Color controller
  //
  // h: 0-360
  // s/l/a: 0-1 or 0-100
  // -------------------------------------------------------------------------

  color(h, s, l, a = 1) {
    const frac = (v) => {
      v = Number(v);

      if (!Number.isFinite(v)) {
        return 0;
      }

      return Math.min(1, Math.max(0, v > 1 ? v / 100 : v));
    };

    const hue = ((Number(h) % 360) + 360) % 360;

    const c = {
      hue,

      saturation: frac(s),

      lightness: frac(l),

      alpha: frac(a),
    };

    const mapped = Stereoizer.colorMap(c);

    this.chorusRate(mapped.chorusRate);
    this.chorusDepth(mapped.chorusDepth);

    this.wide(mapped.wide);
    this.juno(mapped.juno);
    this.atmosphere(mapped.atmosphere);

    return {
      ...c,
      ...mapped,
    };
  }
}
