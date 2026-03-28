const { mas } = require('process');

const reduceSlider = document.getElementById("reduceSlider");
const srsMixSlider = document.getElementById("srsMix");
const frontSlider = document.getElementById("frontSlider");
const sideSlider = document.getElementById("sideSlider");
const rearSlider = document.getElementById("rearSlider");
const centerSlider = document.getElementById("centerSlider");

let faderNodeSide = audioCtx.createGain();
faderNodeSide.gain.value = 0.85;
let faderNodeCenter = audioCtx.createGain();
faderNodeCenter.gain.value = 0.65;
let faderNodeLFE = audioCtx.createGain();
faderNodeLFE.gain.value = 0.65;
let faderNodeRear = audioCtx.createGain();
faderNodeRear.gain.value = 1;

let faderNode_SRS = audioCtx.createGain();
faderNode_SRS.channelCount = 8;
faderNode_SRS.channelCountMode = "explicit";
faderNode_SRS.channelInterpretation = "speakers";
faderNode_SRS.gain.value = 1;

function createStereoWidth(ctx) {
  const splitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const merger2 = ctx.createChannelMerger(2);

  // Gains
  const gainL = ctx.createGain();
  const gainR = ctx.createGain();
  const invertL = ctx.createGain();
  const invertR = ctx.createGain();

  gainL.gain.value = 0;
  gainR.gain.value = 0;
  invertL.gain.value = 0;
  invertR.gain.value = 0;

  // Split stereo
  splitter.connect(gainL, 0);
  splitter.connect(gainR, 1);
  splitter.connect(invertL, 0);
  splitter.connect(invertR, 1);

  // Normal mix
  gainL.connect(merger, 0, 0);
  gainR.connect(merger, 0, 1);

  // Inverted mix
  invertR.connect(merger2, 0, 0);
  invertL.connect(merger2, 0, 1);

  return {
    input: splitter,
    output: {
      normal: merger,
      cancel: merger2
    },
    control: (value, multiplier) => {
      const norm = value;

      gainL.gain.value = (norm);
      gainR.gain.value = (norm);
      const cancel = -(norm);
      invertL.gain.value = cancel;
      invertR.gain.value = cancel;
    }
  };
}

function createStereoEnhancer(ctx) {
  /* =========================
     INPUT (UP TO 7.1)
  ========================== */
  const amp = ctx.createGain();
  amp.gain.value = 1;
  amp.channelCount = 8;
  amp.channelCountMode = "explicit";
  amp.channelInterpretation = "speakers";

  const splitter = ctx.createChannelSplitter(8);
  amp.connect(splitter);

  /* =========================
     SURROUND → STEREO FOLD
  ========================== */
  const downmixMerger = ctx.createChannelMerger(2);

  function g(v) {
    const n = ctx.createGain();
    n.gain.value = v;
    return n;
  }

  const downmixNodes = {
    L: g(1.0),
    R: g(1.0),
    C: g(0),
    LFE: g(0),
    LS: g(0),
    RS: g(0),
    LB: g(0),
    RB: g(0)
  };

  splitter.connect(downmixNodes.L, 0);
  splitter.connect(downmixNodes.R, 1);
  splitter.connect(downmixNodes.C, 2);
  splitter.connect(downmixNodes.LFE, 3);
  splitter.connect(downmixNodes.LS, 4);
  splitter.connect(downmixNodes.RS, 5);
  splitter.connect(downmixNodes.LB, 6);
  splitter.connect(downmixNodes.RB, 7);

  // LEFT fold
  downmixNodes.L.connect(downmixMerger, 0, 0);
  downmixNodes.C.connect(downmixMerger, 0, 0);
  downmixNodes.LFE.connect(downmixMerger, 0, 0);
  downmixNodes.LS.connect(downmixMerger, 0, 0);
  downmixNodes.LB.connect(downmixMerger, 0, 0);

  // RIGHT fold
  downmixNodes.R.connect(downmixMerger, 0, 1);
  downmixNodes.C.connect(downmixMerger, 0, 1);
  downmixNodes.LFE.connect(downmixMerger, 0, 1);
  downmixNodes.RS.connect(downmixMerger, 0, 1);
  downmixNodes.RB.connect(downmixMerger, 0, 1);

  /* =========================
     STEREO ENHANCER CORE
  ========================== */
  const stereoSplitter = ctx.createChannelSplitter(2);
  const merger = ctx.createChannelMerger(2);
  const merger2 = ctx.createChannelMerger(2);

  downmixMerger.connect(stereoSplitter);

  const gainOrig = ctx.createGain();
  const gainAdjust = ctx.createGain();
  const gainAdjustThr = ctx.createGain();

  gainOrig.gain.value = 1;
  gainAdjust.gain.value = 0;
  gainAdjustThr.gain.value = 1;

  downmixMerger.connect(gainOrig);
  downmixMerger.connect(gainAdjustThr);
  gainAdjustThr.connect(gainAdjust);

  const gainL = ctx.createGain();
  const gainR = ctx.createGain();
  const invertL = ctx.createGain();
  const invertR = ctx.createGain();

  gainL.gain.value = 0;
  gainR.gain.value = 0;
  invertL.gain.value = 0;
  invertR.gain.value = 0;

  stereoSplitter.connect(gainL, 0);
  stereoSplitter.connect(gainR, 1);
  stereoSplitter.connect(invertL, 0);
  stereoSplitter.connect(invertR, 1);

  gainL.connect(merger, 0, 0);
  gainR.connect(merger, 0, 1);

  invertR.connect(merger2, 0, 0);
  invertL.connect(merger2, 0, 1);

  /* =========================
     REAR AMBIENCE PATH
  ========================== */
  const rearSplit = ctx.createChannelSplitter(2);

  const rearDelayL = ctx.createDelay(0.1);
  const rearDelayR = ctx.createDelay(0.1);

  // default rear delay
  rearDelayL.delayTime.value = 0.018;
  rearDelayR.delayTime.value = 0.022; // decorrelate

  const rearGainL = ctx.createGain();
  const rearGainR = ctx.createGain();

  rearGainL.gain.value = 0.15;
  rearGainR.gain.value = 0.15;

  // tap stereo downmix
  downmixMerger.connect(rearSplit);

  rearSplit.connect(rearDelayL, 0);
  rearSplit.connect(rearDelayR, 1);

  rearDelayL.connect(rearGainL);
  rearDelayR.connect(rearGainR);

  // mix rear into NORMAL output only
  rearGainL.connect(merger, 0, 0);
  rearGainR.connect(merger, 0, 1);

  /* =========================
     RETURN OBJECT
  ========================== */
  return {
    input: amp,
    output: {
      normal: merger,
      cancel: merger2,
      orig: gainOrig,
      adjust: gainAdjust
    },

    // rear controls
    rear: {
      get gain() { return rearGainL.gain.value; },
      set gain(v) {
        rearGainL.gain.value = v;
        rearGainR.gain.value = v;
      },
      get delay() { return rearDelayL.delayTime.value; },
      set delay(v) {
        rearDelayL.delayTime.value = v;
        rearDelayR.delayTime.value = v * 1.1;
      }
    },

    downmix: {
      get L() { return downmixNodes.L.gain.value; },
      set L(v) { downmixNodes.L.gain.value = v; },
      get R() { return downmixNodes.R.gain.value; },
      set R(v) { downmixNodes.R.gain.value = v; },
      get C() { return downmixNodes.C.gain.value; },
      set C(v) { downmixNodes.C.gain.value = v; },
      get LFE() { return downmixNodes.LFE.gain.value; },
      set LFE(v) { downmixNodes.LFE.gain.value = v; },
      get LS() { return downmixNodes.LS.gain.value; },
      set LS(v) { downmixNodes.LS.gain.value = v; },
      get RS() { return downmixNodes.RS.gain.value; },
      set RS(v) { downmixNodes.RS.gain.value = v; },
      get LB() { return downmixNodes.LB.gain.value; },
      set LB(v) { downmixNodes.LB.gain.value = v; },
      get RB() { return downmixNodes.RB.gain.value; },
      set RB(v) { downmixNodes.RB.gain.value = v; }
    },

    control: (value, multiplier) => {
      const side = sideSlider.value;
      const final = (reduceSlider.value - reduceSlider.min) /
        (reduceSlider.max - reduceSlider.min);
      const norm = (final * side);

      gainL.gain.value = norm;
      gainR.gain.value = norm;
      invertL.gain.value = -norm;
      invertR.gain.value = -norm;

      gainOrig.gain.value = reduceSlider.max - value;
      gainAdjust.gain.value = value;
      gainAdjustThr.gain.value = multiplier;

      document.getElementById("srsIndicator").style.opacity =
        reduceSlider.value >= 0.01 ? 1 : 0.25;
    }
  };
}

function createStereoToSurround(ctx) {
  const input = ctx.createChannelSplitter(2);

  /* =========================
     BASE GAINS
  ========================== */
  const gainL = ctx.createGain();
  const gainR = ctx.createGain();
  const invL = ctx.createGain();
  const invR = ctx.createGain();

  gainL.gain.value = 0;
  gainR.gain.value = 0;
  invL.gain.value = 0;
  invR.gain.value = 0;

  input.connect(gainL, 0);
  input.connect(gainR, 1);
  input.connect(invL, 0);
  input.connect(invR, 1);

  /* =========================
     FRONT (NORMAL STEREO)
  ========================== */
  const front = ctx.createChannelMerger(2);
  gainL.connect(front, 0, 0);
  gainR.connect(front, 0, 1);

  /* =========================
     CANCEL (SIDE SIGNAL)
  ========================== */
  const cancel = ctx.createChannelMerger(2);
  invR.connect(cancel, 0, 0);
  invL.connect(cancel, 0, 1);

  /* =========================
     CENTER (MONO SUM)
  ========================== */
  const centerGain = ctx.createGain();
  centerGain.gain.value = 0.7;

  gainL.connect(centerGain);
  gainR.connect(centerGain);

  /* =========================
     LFE (LOW PASS ONLY)
  ========================== */
  const lfeFilter = ctx.createBiquadFilter();
  lfeFilter.type = "lowpass";
  lfeFilter.frequency.value = 120;
  lfeFilter.Q.value = 0.7;

  const lfeGain = ctx.createGain();
  lfeGain.gain.value = 1.0;

  centerGain.connect(lfeFilter);
  lfeFilter.connect(lfeGain);

  /* =========================
     SIDE (WIDTH)
  ========================== */
  const sideGain = ctx.createGain();
  sideGain.gain.value = 1.0;
  cancel.connect(sideGain);

  /* =========================
     REAR (DELAYED WIDTH)
  ========================== */
  const rearDelay = ctx.createDelay(0.5);
  rearDelay.delayTime.value = 0.025; // 25 ms

  const rearGain = ctx.createGain();
  rearGain.gain.value = 0.8;

  cancel.connect(rearDelay);
  rearDelay.connect(rearGain);

  /* =========================
     LIMITERS (OPTIONAL BUT GOOD)
  ========================== */
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.ratio.value = 8;

  front.connect(limiter);

  /* =========================
     CONTROL API
  ========================== */
  function control(width = 0.5, multiplier = 1) {
    const v = width / multiplier;

    gainL.gain.value = v;
    gainR.gain.value = v;

    invL.gain.value = -v;
    invR.gain.value = -v;

    sideGain.gain.value = v;
    rearGain.gain.value = v * 0.8;
    centerGain.gain.value = 0.7 - v * 0.3;
  }

  return {
    input,
    output: {
      front: limiter,      // L / R
      center: centerGain,  // C
      lfe: lfeGain,        // Sub
      side: sideGain,      // SL / SR
      rear: rearGain       // RL / RR (delayed)
    },
    control
  };
}

const enhancer = createStereoEnhancer(audioCtx);
const surround = createStereoToSurround(audioCtx);
const side_width = createStereoWidth(audioCtx);

function createEqualizer(ctx) {
  const frequencies = [31.5, 63, 125, 200, 250, 500, 750, 1000, 2000, 4000, 8000, 16000];
  const filters = frequencies.map((freq) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "peaking";
    filter.frequency.value = freq;
    filter.Q.value = 1;
    filter.gain.value = 0;
    return filter;
  });

  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.25;

  filters[filters.length - 1].connect(limiter);

  // helper for smooth updates
  function smoothSet(param, value, smoothTime = 0.03) {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setTargetAtTime(value, now, smoothTime);
  }

  return {
    input: filters[0],
    output: limiter,
    input2: filters[0],
    output2: limiter,
    filters,
    limiter,
    smoothSet, // expose helper
  };
}

function createSRSEqualizer(ctx, channelCount = 8) {
  const input = ctx.createGain()
  const output = ctx.createGain()

  input.channelCountMode = "explicit"
  input.channelCount = channelCount
  output.channelCountMode = "explicit"
  output.channelCount = channelCount

  const splitter = ctx.createChannelSplitter(channelCount)
  const merger = ctx.createChannelMerger(channelCount)

  const frequencies = [31.5, 63, 125, 200, 250, 500, 750, 1000, 2000, 4000, 8000, 16000];

  const channels = [] // store per-channel chains

  input.connect(splitter)

  for (let ch = 0; ch < channelCount; ch++) {
    const filters = frequencies.map(freq => {
      const filter = ctx.createBiquadFilter()
      filter.type = "peaking"
      filter.frequency.value = freq
      filter.Q.value = 1
      filter.gain.value = 0
      return filter
    })

    // chain filters
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i].connect(filters[i + 1])
    }

    // compressor (your limiter)
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -12
    limiter.knee.value = 12
    limiter.ratio.value = 8
    limiter.attack.value = 0.01
    limiter.release.value = 0.25

    filters[filters.length - 1].connect(limiter)

    // routing
    splitter.connect(filters[0], ch)
    limiter.connect(merger, 0, ch)

    channels.push({
      filters,
      limiter
    })
  }

  merger.connect(output)

  // same smooth helper
  function smoothSet(param, value, smoothTime = 0.03) {
    const now = ctx.currentTime
    param.cancelScheduledValues(now)
    param.setTargetAtTime(value, now, smoothTime)
  }

  return {
    input,
    output,
    channels, // 🔥 per-channel access
    smoothSet
  }
}

// 🔹 Create enhancer and EQ
const eq = createEqualizer(audioCtx);
const eq_srs = createSRSEqualizer(audioCtx);

function createCenterSpeakerEffect(ctx) {
  // --- Split stereo into left/right ---
  const splitter = ctx.createChannelSplitter(2);

  // --- Mix stereo to center ---
  const leftMono = ctx.createGain();
  const rightMono = ctx.createGain();
  leftMono.gain.value = 0.5;
  rightMono.gain.value = 0.5;

  splitter.connect(leftMono, 0);
  splitter.connect(rightMono, 1);

  // --- Center gain node ---
  const centerGain = ctx.createGain(); // virtual center
  leftMono.connect(centerGain);
  rightMono.connect(centerGain);

  // --- High-pass filter to remove bass ---
  const highpass = ctx.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 150; // remove frequencies below ~150Hz
  highpass.Q.value = 0.707;

  centerGain.connect(highpass);

  // --- Return nodes ---
  return {
    input: splitter,
    output: highpass,   // filtered center output
    centerNode: centerGain // for adjusting center gain
  };
}

function createRearSpeakerEffect(ctx, delayTime = 0.03) { // delayTime in seconds
  // --- Split stereo into left/right ---
  const splitter = ctx.createChannelSplitter(2);

  // --- Rear gain nodes for left and right ---
  const rearLeftGain = ctx.createGain();
  const rearRightGain = ctx.createGain();
  rearLeftGain.gain.value = 1.0;
  rearRightGain.gain.value = 1.0;

  // --- Connect splitter channels ---
  splitter.connect(rearLeftGain, 0); // left input
  splitter.connect(rearRightGain, 1); // right input

  // --- Delay nodes for spatial effect ---
  const rearLeftDelay = ctx.createDelay();
  const rearRightDelay = ctx.createDelay();
  rearLeftDelay.delayTime.value = delayTime + 0.007;       // left rear delay
  rearRightDelay.delayTime.value = delayTime + 0.020; // slightly different for depth

  rearLeftGain.connect(rearLeftDelay);
  rearRightGain.connect(rearRightDelay);

  // --- Optional: subtle high-pass to remove sub-bass from rear ---
  const highpassLeft = ctx.createBiquadFilter();
  const highpassRight = ctx.createBiquadFilter();
  highpassLeft.type = "highpass";
  highpassRight.type = "highpass";
  highpassLeft.frequency.value = 250;
  highpassRight.frequency.value = 300;

  rearLeftDelay.connect(highpassLeft);
  rearRightDelay.connect(highpassRight);

  // --- Merge back into stereo rear output ---
  const rearMerger = ctx.createChannelMerger(2);
  highpassLeft.connect(rearMerger, 0, 0);  // left rear
  highpassRight.connect(rearMerger, 0, 1); // right rear\

  // --- Rear gain nodes for left and right ---
  const outputrearLeftGain = ctx.createGain();
  const outputrearRightGain = ctx.createGain();
  outputrearLeftGain.gain.value = 1.0;
  outputrearRightGain.gain.value = 1.0;

  highpassLeft.connect(outputrearLeftGain);
  highpassRight.connect(outputrearRightGain);

  return {
    input: splitter,
    output: rearMerger,         // stereo rear output
    rearLeftNode: outputrearLeftGain,
    rearRightNode: outputrearRightGain
  };
}

const centerEffect = createCenterSpeakerEffect(audioCtx);
const rearEffect = createRearSpeakerEffect(audioCtx);

// 🔹 EQ Slider Handling
function setEqGain(band, gain) {
  // Prevent gain adjustment and saving if EQ is disabled (flat mode)
  if (!eqSwitch.checked) return;

  eq.filters[band].gain.value = gain;
  localStorage.setItem("eqBand" + band, gain);
}

// Load EQ values from storage
eq.filters.forEach((f, i) => {
  const saved = localStorage.getItem("eqBand" + i);
  if (saved !== null) {
    f.gain.value = parseFloat(saved);
    const slider = document.getElementById("eq" + i);
    if (slider) slider.value = saved;
  }
});

// Listen for slider changes
for (let i = 0; i < eq.filters.length; i++) {
  const slider = document.getElementById("eq" + i);
  if (slider) {
    slider.addEventListener("input", () => {
      const val = parseFloat(slider.value);
      setEqGain(i, val);
    });
  }
}

function SET_EQ_SRS(value, filter) {
  eq_srs.channels.forEach(ch => {
    ch.filters[filter].gain.value = value;
  })
}

function SET_EQ_SRS_Q(value, filter) {
  eq_srs.channels.forEach(ch => {
    ch.filters[filter].Q.value = value;
  })
}

const eqSwitch = document.getElementById("eqSwitch")
const slidersEQ = []

for (let i = 0; i < eq.filters.length; i++) {
  const slider = document.getElementById("eq" + i)
  if (!slider) continue

  slidersEQ.push(slider)

  slider.addEventListener("input", () => {
    const value = eqSwitch.checked ? Number(slider.value) : -12;

    // apply gain
    eq.filters[i].gain.value = eqSwitch.checked ? value : -12
    SET_EQ_SRS(value, i)

    // save
    localStorage.setItem("eqBand" + i, value)

    // apply Q based on switch
    const Q_SWITCH = eqSwitch.checked ? 1 : -24;
    eq.filters[i].Q.value = Q_SWITCH
    SET_EQ_SRS(value, i)
    SET_EQ_SRS_Q(Q_SWITCH, i)
  })
}

eqSwitch.addEventListener("change", () => {
  const isEnabled = eqSwitch.checked
  const Q_SWITCH = isEnabled ? 1 : -24 // safer than 0

  for (let i = 0; i < eq.filters.length; i++) {
    const slider = document.getElementById("eq" + i)
    const f = eq.filters[i]
    const value = eqSwitch.checked ? Number(slider.value) : -12;
    f.Q.value = Q_SWITCH
    f.gain.value = isEnabled ? value : -12
    SET_EQ_SRS(value, i)
    SET_EQ_SRS_Q(Q_SWITCH, i)
  }
})

eqSwitch.dispatchEvent(new Event('change'))

function createBassOnlyFilter(audioCtx) {
  // --- Stereo → Mono ---  
  // Convert L + R into a single mono bass signal
  const splitter = audioCtx.createChannelSplitter(2);
  const merger = audioCtx.createChannelMerger(1);

  const leftGain = audioCtx.createGain();
  const rightGain = audioCtx.createGain();

  // Average L and R: (L + R) / 2
  leftGain.gain.value = 0.5;
  rightGain.gain.value = 0.5;

  splitter.connect(leftGain, 0);   // left channel
  splitter.connect(rightGain, 1);  // right channel

  leftGain.connect(merger, 0, 0);
  rightGain.connect(merger, 0, 0);

  // --- Lowpass ---
  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 65;
  lowpass.Q.value = 0.707;

  // --- Lowshelf ---
  const bassFilter = audioCtx.createBiquadFilter();
  bassFilter.type = "lowshelf";
  bassFilter.frequency.value = 80;   // must be <= lowpass
  bassFilter.gain.value = 0;
  bassFilter.Q.value = 0.707;

  // --- Bass gain (for slider 0 → mute) ---
  const bassGain = audioCtx.createGain();
  bassGain.gain.value = 0;  // start muted

  // --- Limiter ---
  const limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  // --- Chain ---
  // mono merger → lowpass → bassFilter → bassGain → limiter
  merger.connect(lowpass);
  lowpass.connect(bassFilter);
  bassFilter.connect(bassGain);
  bassGain.connect(limiter);

  // --- Set Value ---
  bassFilter.setValue = function (value, rampTime = 0.05) {
    const v = Math.min(Math.max(value, 0), 24);
    const now = audioCtx.currentTime;

    // Smooth gain
    bassFilter.gain.cancelScheduledValues(now);
    bassFilter.gain.setTargetAtTime(v, now, rampTime);

    // Mute bass chain if slider = 0
    bassGain.gain.cancelScheduledValues(now);
    bassGain.gain.setTargetAtTime(v === 0 ? 0 : 1, now, rampTime);
  };

  return {
    input: splitter,   // ⬅️ Important: audio must connect here now
    input2: splitter,   // ⬅️ Important: audio must connect here now
    output: limiter,
    output2: limiter,
    setValue: bassFilter.setValue,

    // expose nodes if needed
    splitter,
    merger,
    leftGain,
    rightGain,
    lowpass,
    bassFilter,
    bassGain,
    limiter
  };
}

const bass = createBassOnlyFilter(audioCtx);
const bass2 = createBassOnlyFilter(audioCtx);
const faderSlider = document.getElementById("faderSlider");
const faderValue = document.getElementById("faderValue");
const cutoffSlider = document.getElementById("cutoffSlider");
const cutoffValue = document.getElementById("cutoffValue");
const cutoffSlider2 = document.getElementById("cutoffSlider2");
const cutoffValue2 = document.getElementById("cutoffValue2");

const centerValue = document.getElementById("centerValue");
const bassSlider = document.getElementById("bassSlider");
const savedFader = localStorage.getItem("faderGain") || 1;
const savedcutoff = localStorage.getItem("cutoffGain") || 16;
const savedcutoff2 = localStorage.getItem("cutoffGain2") || 0;

function setValueBothFunc() {
  bass.setValue(Number(bassSlider.value));
  bass2.setValue(Number(bassSlider.value));
  if (Number(bassSlider.value) == 0) {
    faderNode.gain.value = 1
    faderNode_SRS.gain.value = 1;
  } else {
    faderNode.gain.setTargetAtTime(Number(faderSlider.value), audioCtx.currentTime, 0.5);
    faderNode_SRS.gain.setTargetAtTime(Number(faderSlider.value * 0.707), audioCtx.currentTime, 0.5);
  }


  const bool = Number(bassSlider.value) == 0 ? true : false;
  document.getElementById("faderSlider_graphic").dataset.boolean = bool
  document.getElementById("bassIndicator").style.opacity = Number(bassSlider.value) >= 0.01 ? 1 : 0.25;
  document.getElementById("bassSliderText").innerHTML = gainTodB(bassSlider.value);
  document.getElementById("info_bassgain").innerHTML = gainTodB(bassSlider.value);
  faderSlider.disabled = bool
}

// load saved
const savedBass = localStorage.getItem("bassValue") || 0;

if (savedBass !== null) {
  bassSlider.value = savedBass;
  setValueBothFunc();
}

// update + save
bassSlider.addEventListener("input", (e) => {
  const value = Number(bassSlider.value);
  setValueBothFunc();
  localStorage.setItem("bassValue", value);
});

const passSlider = document.getElementById("passSlider");
const passValue = document.getElementById("passValue");
const savedPass = localStorage.getItem("passValue") || 65;

if (savedPass !== null) {
  passSlider.value = savedPass;
  passValue.innerHTML = `${Number(savedPass)}Hz`;
  document.getElementById("info_basspass").innerHTML = `${Number(savedPass)}Hz`;
  bass.lowpass.frequency.value = Number(savedPass)
  bass.bassFilter.frequency.value = Number(savedPass + 15)
  bass2.lowpass.frequency.value = Number(savedPass)
  bass2.bassFilter.frequency.value = Number(savedPass + 15)
}

// update + save
passSlider.addEventListener("input", (e) => {
  const value = Number(passSlider.value);
  passValue.innerHTML = `${value}Hz`;
  document.getElementById("info_basspass").innerHTML = `${Number(value)}Hz`;
  bass.lowpass.frequency.value = Number(value)
  localStorage.setItem("passValue", value);
});

const filterSlider = document.getElementById("filterSlider");
const filterValue = document.getElementById("filterValue");
const savedFilter = localStorage.getItem("filterValue") || 0;

if (savedFilter !== null) {
  filterSlider.value = savedFilter;
  filterValue.innerHTML = `${Number(savedFilter)}∆`;
  document.getElementById("info_bassfilter").innerHTML = `${Number(savedFilter)}∆`;
  bass.lowpass.Q.value = Number(savedFilter);
  bass2.lowpass.Q.value = Number(savedFilter);
}

// update + save
filterSlider.addEventListener("input", (e) => {
  const value = Number(filterSlider.value);
  filterValue.innerHTML = `${value}∆`;
  document.getElementById("info_bassfilter").innerHTML = `${Number(value)}∆`;
  bass.lowpass.Q.value = Number(value)
  bass2.lowpass.Q.value = Number(value)
  localStorage.setItem("filterValue", value);
});

function createGlobalLimiter(audioCtx) {
  const limiter = audioCtx.createDynamicsCompressor();

  limiter.threshold.value = -1.0;   // Brickwall just under 0dB
  limiter.knee.value = 0.0;         // Hard knee for strict limiting
  limiter.ratio.value = 20.0;       // Very strong limiting (brickwall-like)
  limiter.attack.value = 0.003;     // Super fast to catch peaks
  limiter.release.value = 0.05;     // Small release so sound stays clean

  return limiter;
}

// limiter node
const limiter = createGlobalLimiter(audioCtx);

// sliders
const limiterSlider = document.getElementById("limiterSlider");
const limiterValue = document.getElementById("limiterValue");

// Load saved value or default
const savedLimiter = localStorage.getItem("limiterThreshold") || 0;

if (savedLimiter !== null) {
  limiterSlider.value = savedLimiter;
  const value = Number(limiterSlider.value);
  document.getElementById("info_basslimiter").innerHTML = `${Number(value)}∆`;
  limiterValue.textContent = `${Number(value)}∆`;
  limiter.threshold.value = -value;
}

// Update on slider move
limiterSlider.addEventListener("input", () => {
  const value = Number(limiterSlider.value);
  document.getElementById("info_basslimiter").innerHTML = `${Number(value)}∆`;
  limiter.threshold.value = -value;      // update limiter
  limiterValue.textContent = `${Number(value)}∆`;     // update UI
  localStorage.setItem("limiterThreshold", value); // save
});

let effect_mixerNode = audioCtx.createGain();

function adjustSamplerEffect(val) {
  effect_mixerNode.gain.value = Number(val);
  feedbackNode.gain.value = (1 - Number(val));
}

const savedEffectVolume = localStorage.getItem("masterEffectVolume") || 0;
const masterEffectSlider = document.getElementById('masterEffectSlider');
const masterEffectValue = document.getElementById('masterEffectValue');

// Update on slider move
masterEffectSlider.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  masterEffectValue.textContent = value.toFixed(2) + "∆";
  adjustSamplerEffect(value);
  localStorage.setItem("masterEffectVolume", e.target.value); // save
});

masterEffectSlider.value = savedEffectVolume;
masterEffectSlider.dispatchEvent(new Event("input", { bubbles: true }));

const rawaudio = audioCtx.createGain();
rawaudio.gain.value = 1;

mixerNode.connect(enhancer.input);
mixerNode2.connect(effect_mixerNode);
effect_mixerNode.connect(enhancer.input);
listenMixerNode.connect(enhancer.input);

mixerNode.connect(surround.input);
effect_mixerNode.connect(surround.input);
listenMixerNode.connect(surround.input);

mixerNode.connect(side_width.input);
effect_mixerNode.connect(side_width.input);
listenMixerNode.connect(side_width.input);

side_width.control(0.5);

mixerNode.connect(bass.input);
feedbackNode.connect(bass.input);
effect_mixerNode.connect(bass.input);
listenMixerNode.connect(bass.input);

// Connect your existing node to center input
mixerNode.connect(centerEffect.input);
effect_mixerNode.connect(centerEffect.input);
listenMixerNode.connect(centerEffect.input);

// Connect your existing node to center input
mixerNode.connect(rearEffect.input);
effect_mixerNode.connect(rearEffect.input);
listenMixerNode.connect(rearEffect.input);

centerEffect.output.connect(faderNode);
centerEffect.centerNode.gain.value = 0; // start muted

// Connect EQ after enhancer’s normal path (before destination)

function setSRSBasedonEnhancer() {
  surround.control(srsMixSlider.value * 0.75);

  document.getElementById("srscompIndicator").style.opacity = (srsMixSlider.value * 0.75) >= 0.01 ? 1 : 0.25;
  rearEffect.rearLeftNode.gain.value = srsMixSlider.value * 0.67;
  rearEffect.rearRightNode.gain.value = srsMixSlider.value * 0.67;
  side_width.control(srsMixSlider.value * 1.5);
  document.getElementById('srsMixText').innerHTML = `${Math.round(srsMixSlider.value * 100)}%`;
}

const savedCenter = localStorage.getItem("centerGain") || 0;
centerSlider.value = savedCenter;

function sendToText(percent) {
  const volumeText = document.getElementById('reduceSliderText');
  if (volumeText) {
    volumeText.innerHTML = `${percent}%`;
    document.getElementById('info_srs').innerHTML = `${percent}%`
    document.getElementById('info_srsincrement').innerHTML = gainTodB(frontSlider.value);
    document.getElementById('frontSliderText').innerHTML = gainTodB(frontSlider.value);
    document.getElementById('sideSliderText').innerHTML = gainTodB(sideSlider.value);
    document.getElementById('rearSliderText').innerHTML = gainTodB(rearSlider.value);
    document.getElementById('info_srscenter').innerHTML = gainTodB(centerSlider.value);
  }

  const bool = Number(percent) == 0 ? true : false;
  frontSlider.disabled = bool;
  document.getElementById("frontSlider_graphic").dataset.boolean = bool
  document.getElementById("centerSlider_graphic").dataset.boolean = bool
  document.getElementById("sideSlider_graphic").dataset.boolean = bool
  document.getElementById("rearSlider_graphic").dataset.boolean = bool
  centerSlider.disabled = bool;
  sideSlider.disabled = bool;
  rearSlider.disabled = bool;
  centerEffect.centerNode.gain.value = bool ? 0 : parseFloat(centerSlider.value * reduceSlider.value);
  enhancer.rear.gain = bool ? 0 : parseFloat(rearSlider.value);
}

const savedThreshold = localStorage.getItem("front");
let channelSwitchValue = savedThreshold ? parseFloat(savedThreshold) || 1 : 1;
frontSlider.value = channelSwitchValue;

// 💾 Listen for changes and save
frontSlider.addEventListener("input", () => {
  channelSwitchValue = parseFloat(frontSlider.value) || 0;
  localStorage.setItem("front", channelSwitchValue);
  const val = parseFloat(reduceSlider.value);
  enhancer.control(val, channelSwitchValue);
  localStorage.setItem("reduceLevel", val);
  const percent = Math.round(val * 100);
  sendToText(percent);
});

// Update on slider move
centerSlider.addEventListener("input", () => {
  const value = Number(centerSlider.value);
  centerValue.textContent = gainTodB(centerSlider.value);
  const val = parseFloat(reduceSlider.value);
  enhancer.control(val, channelSwitchValue);
  localStorage.setItem("centerGain", value); // save
  const percent = Math.round(val * 100);
  sendToText(percent);
});

centerSlider.dispatchEvent(new Event('input'));

const sideEnhanceValue = localStorage.getItem("sideEnhanceValue") || 1;
sideSlider.value = sideEnhanceValue;

// 💾 Listen for changes and save
sideSlider.addEventListener("input", () => {
  const val = parseFloat(reduceSlider.value);
  enhancer.control(val, channelSwitchValue);
  localStorage.setItem("sideEnhanceValue", sideSlider.value);
  const percent = Math.round(val * 100);
  sendToText(percent);
});

sideSlider.dispatchEvent(new Event('input'));

const rearEnhanceValue = localStorage.getItem("rearEnhanceValue") || 0;
rearSlider.value = rearEnhanceValue;

// 💾 Listen for changes and save
rearSlider.addEventListener("input", () => {
  const val = parseFloat(reduceSlider.value);
  enhancer.control(val, channelSwitchValue);
  localStorage.setItem("rearEnhanceValue", rearSlider.value);
  const percent = Math.round(val * 100);
  sendToText(percent);
});

rearSlider.dispatchEvent(new Event('input'));

// 🔹 load slider state
const savedValue = localStorage.getItem("reduceLevel");
if (savedValue !== null) {
  reduceSlider.value = savedValue;
  const val = parseFloat(savedValue);
  enhancer.control(val, channelSwitchValue);
  const percent = Math.round(val * 100);
  sendToText(percent);
} else {
  reduceSlider.value = 0; // default
  enhancer.control(0, channelSwitchValue);
  const percent = 0;
  sendToText(percent);
}

// 🔹 listen for slider changes + save state
reduceSlider.addEventListener("input", () => {
  const val = parseFloat(reduceSlider.value);
  enhancer.control(val, channelSwitchValue);
  localStorage.setItem("reduceLevel", val);
  const percent = Math.round(val * 100);
  sendToText(percent);
});

const savedSRSValue = localStorage.getItem("srsLevel") || 0;

// 🔹 listen for slider changes + save state
srsMixSlider.addEventListener("input", () => {
  setSRSBasedonEnhancer();
  localStorage.setItem("srsLevel", srsMixSlider.value);
});

srsMixSlider.value = savedSRSValue;
srsMixSlider.dispatchEvent(new Event('input'));

function createReverb(audioCtx) {
  function generateIR(duration = 2.0, decay = 2.0) {
    const rate = audioCtx.sampleRate;
    const length = rate * duration;
    const buffer = audioCtx.createBuffer(2, length, rate);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buffer;
  }

  // --- Nodes ---
  const convolver = audioCtx.createConvolver();
  const dry = audioCtx.createGain();
  const wet = audioCtx.createGain();
  const preDelay = audioCtx.createDelay(5.0);
  const roomSize = audioCtx.createGain();

  const hpFilter = audioCtx.createBiquadFilter();
  hpFilter.type = "highpass";
  hpFilter.frequency.value = 200;

  const lpFilterPre = audioCtx.createBiquadFilter();
  lpFilterPre.type = "lowpass";
  lpFilterPre.frequency.value = 250;

  const lpFilterPost = audioCtx.createBiquadFilter();
  lpFilterPost.type = "lowpass";
  lpFilterPost.frequency.value = 180;


  // --- I/O ---
  const input = audioCtx.createGain();   // WET input
  const input2 = audioCtx.createGain();   // DRY input

  const output = audioCtx.createGain();  // MIXED output
  const output2 = audioCtx.createGain();  // DRY-only output

  // --- Defaults ---
  dry.gain.value = 1.0;
  wet.gain.value = 0.5;
  preDelay.delayTime.value = 0.02;
  roomSize.gain.value = 1.0;

  convolver.buffer = generateIR(2.5, 2.5);

  // =========================
  // Routing
  // =========================

  // --- Wet path (input only)
  input
    .connect(preDelay)
    .connect(hpFilter)
    .connect(convolver)
    .connect(roomSize)
    .connect(wet)
    .connect(output);

  input2
    .connect(lpFilterPre)
    .connect(convolver)
    .connect(lpFilterPost)
    .connect(dry)
    .connect(output2);

  // =========================
  // API
  // =========================

  return {
    // inputs / outputs
    input,     // wet input
    input2,    // dry input
    output,    // mixed
    output2,   // dry-only

    // nodes
    dry,
    wet,
    preDelay,
    roomSize,
    convolver,
    hpFilter,

    // controls
    setIR(duration, decay) {
      convolver.buffer = generateIR(duration, decay);
    },

    setDry(value) {
      dry.gain.value = value;
    },

    setWet(value) {
      wet.gain.value = value;
    },

    setPreDelay(ms) {
      preDelay.delayTime.value = ms / 1000;
    },

    setRoomSize(mult) {
      roomSize.gain.value = mult;
    },

    setHighPassFreq(freq) {
      hpFilter.frequency.value = freq;
    }
  };
}

function createBalanceNode(audioContext, initialBalance = 0, invert = false) {
  // -1 = full left, 0 = center, +1 = full right

  const splitter = audioContext.createChannelSplitter(2);
  const merger = audioContext.createChannelMerger(2);

  const gainL = audioContext.createGain();
  const gainR = audioContext.createGain();

  function connectChannels() {
    // Disconnect everything first
    splitter.disconnect();
    gainL.disconnect();
    gainR.disconnect();

    if (!invert) {
      // normal routing
      splitter.connect(gainL, 0); // left → left gain
      splitter.connect(gainR, 1); // right → right gain
      gainL.connect(merger, 0, 0); // left gain → left output
      gainR.connect(merger, 0, 1); // right gain → right output
    } else {
      // inverted routing
      splitter.connect(gainL, 0); // left → left gain
      splitter.connect(gainR, 1); // right → right gain
      gainL.connect(merger, 0, 1); // left gain → right output
      gainR.connect(merger, 0, 0); // right gain → left output
    }
  }

  function setBalance(value) {
    const v = Math.max(-1, Math.min(1, value)); // clamp -1..1

    if (v < 0) {
      gainL.gain.value = 1;
      gainR.gain.value = 1 + v; // reduce right
    } else {
      gainL.gain.value = 1 - v; // reduce left
      gainR.gain.value = 1;
    }
  }

  connectChannels();
  setBalance(initialBalance);

  return {
    input: splitter,
    output: merger,
    setBalance,
    setInvert(value) {
      invert = !!value;
      connectChannels(); // remap channels
      setBalance(initialBalance); // reapply balance
    }
  };
}

function createParallelCompressor(ctx) {
  const input = ctx.createGain()
  const output = ctx.createGain()

  // Dry / Wet
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()

  dryGain.gain.value = 0
  wetGain.gain.value = 1 // start gentle

  // Compressor
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -24
  compressor.knee.value = 30
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.25

  // Wiring
  input.connect(dryGain)
  input.connect(compressor)

  compressor.connect(wetGain)

  dryGain.connect(output)
  wetGain.connect(output)

  return {
    input,
    output,
    compressor,
    dryGain,
    wetGain
  }
}

function createParallelCompressorSRS(ctx, channelCount = 8) {
  const input = ctx.createGain()
  const output = ctx.createGain()

  input.channelCount = channelCount
  input.channelCountMode = "explicit"
  output.channelCount = channelCount
  output.channelCountMode = "explicit"

  // Split / Merge
  const splitter = ctx.createChannelSplitter(channelCount)
  const merger = ctx.createChannelMerger(channelCount)

  // Dry / Wet
  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()

  dryGain.gain.value = 0
  wetGain.gain.value = 1

  // Arrays
  const compressors = []

  // Connect input → splitter
  input.connect(splitter)

  for (let i = 0; i < channelCount; i++) {
    const comp = ctx.createDynamicsCompressor()

    comp.threshold.value = -24
    comp.knee.value = 30
    comp.ratio.value = 4
    comp.attack.value = 0.003
    comp.release.value = 0.25

    compressors.push(comp)

    // Per-channel routing
    splitter.connect(comp, i)
    comp.connect(merger, 0, i)
  }

  // Dry path (no split needed)
  input.connect(dryGain)

  // Wet path
  merger.connect(wetGain)

  // Mix
  dryGain.connect(output)
  wetGain.connect(output)

  return {
    input,
    output,
    compressors,
    dryGain,
    wetGain
  }
}

const reverb = createReverb(audioCtx);
const reverbSampler = createReverb(audioCtx);
const comp = createParallelCompressor(audioCtx);
const compSRS = createParallelCompressorSRS(audioCtx);
const compRecord = createParallelCompressor(audioCtx);

reverb.setHighPassFreq(500);  // remove more bass from reverb

const masterVolume = audioCtx.createGain();

let masterSound // your GainNode
masterSound = audioCtx.createGain()
masterSound.gain.value = 1

let masterSound2 // your GainNode
masterSound2 = audioCtx.createGain()
masterSound2.gain.value = 1

let animationInterval = null
let animationInterval2 = null

function animateGain(direction) {
  if (!masterSound) return
  clearInterval(animationInterval)

  const step = 0.01
  const intervalTime = 10
  const target = direction ? 1 : 0

  animationInterval = setInterval(() => {
    if (direction) {
      // Animate up
      masterSound.gain.value += step
      if (masterSound.gain.value >= target) {
        masterSound.gain.value = target
        clearInterval(animationInterval)
      }
    } else {
      // Animate down
      masterSound.gain.value -= step
      if (masterSound.gain.value <= target) {
        masterSound.gain.value = target
        clearInterval(animationInterval)
      }
    }
  }, intervalTime)
}

function animateGainonTest(direction) {
  if (!masterSound2) return
  clearInterval(animationInterval2)

  const step = 0.01
  const intervalTime = 5
  const target = direction ? 1 : 0

  animationInterval2 = setInterval(() => {
    if (direction) {
      // Animate up
      masterSound2.gain.value += step
      if (masterSound2.gain.value >= target) {
        masterSound2.gain.value = target
        clearInterval(animationInterval2)
      }
    } else {
      // Animate down
      masterSound2.gain.value -= step
      if (masterSound2.gain.value <= target) {
        masterSound2.gain.value = target
        clearInterval(animationInterval2)
      }
    }
  }, intervalTime)
}

const balanceNode = createBalanceNode(audioCtx);

mixerNode.connect(reverb.input);
feedbackNode.connect(reverb.input);
effect_mixerNode.connect(reverb.input);
listenMixerNode.connect(reverb.input);

rawaudio.connect(faderNode);
rawaudio.connect(reverb.input);

bass.output.connect(limiter);
bass.output.connect(reverb.input2);

enhancer.output.normal.connect(faderNode);  // stereo
enhancer.output.cancel.connect(faderNode);  // cancel

enhancer.output.orig.connect(faderNode);  // stereo
enhancer.output.adjust.connect(faderNode);  // cancel
reverb.output2.connect(limiter);
reverb.output.connect(faderNode);

function createCutoffNode(audioCtx, {
  type = "lowpass",
  frequency = 1000,
  Q = 0,
  smoothing = 2
} = {}) {
  const input = audioCtx.createGain();
  const output = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = Q;

  // wiring
  input.connect(filter);
  filter.connect(output);

  return {
    input,
    output,
    filter,

    setFrequency(freq) {
      filter.frequency.setTargetAtTime(
        freq,
        audioCtx.currentTime,
        smoothing
      );
    },

    setQ(value) {
      filter.Q.setTargetAtTime(
        value,
        audioCtx.currentTime,
        smoothing
      );
    },

    setType(newType) {
      filter.type = newType;
    }
  };
}

const cutoff = createCutoffNode(audioCtx, { frequency: 16000 });
const cutoffbass = createCutoffNode(audioCtx, { frequency: 0, type: "highpass" });

limiter.connect(cutoffbass.input);

faderNode.connect(eq.input);
faderNode.connect(cutoff.input);
eq.output.connect(cutoff.input);
cutoff.output.connect(cutoffbass.input);
cutoffbass.output.connect(preamp);
preamp.connect(comp.input);
comp.output.connect(balanceNode.input);
balanceNode.output.connect(masterSound);
masterSound.connect(masterSound2);
masterSound2.connect(masterVolume);

surround.output.center.connect(faderNodeCenter);
surround.output.lfe.connect(faderNodeLFE);
surround.output.side.connect(faderNodeSide);

side_width.output.normal.connect(faderNodeSide);
side_width.output.cancel.connect(faderNodeSide);

const SRS_MERGER_CENTER = audioCtx.createChannelMerger(8);
const SRS_MERGER_REAR = audioCtx.createChannelMerger(8);
const SRS_MERGER_LFE = audioCtx.createChannelMerger(8);
const SRS_MERGER_SIDE = audioCtx.createChannelMerger(8);

const SRS_SIDE_SOURCE = faderNodeSide;
const SRS_SIDE_SPLITTER = audioCtx.createChannelSplitter(2); // stereo
SRS_SIDE_SOURCE.connect(SRS_SIDE_SPLITTER);

const SRS_LFE_SOURCE = faderNodeLFE;
const SRS_LFE_SPLITTER = audioCtx.createChannelSplitter(1); // stereo
SRS_LFE_SOURCE.connect(SRS_LFE_SPLITTER);

const SRS_CENTER_SOURCE = faderNodeCenter;
const SRS_CENTER_SPLITTER = audioCtx.createChannelSplitter(1); // stereo
SRS_CENTER_SOURCE.connect(SRS_CENTER_SPLITTER);

SRS_SIDE_SPLITTER.connect(SRS_MERGER_SIDE, 0, 6);
SRS_SIDE_SPLITTER.connect(SRS_MERGER_SIDE, 1, 7);

const SRS_REAR_SOURCE_L = rearEffect.rearLeftNode;
const SRS_REAR_SOURCE_R = rearEffect.rearRightNode;
const SRS_REAR_SPLITTER = audioCtx.createChannelSplitter(2); // stereo
SRS_REAR_SOURCE_L.connect(SRS_REAR_SPLITTER);
SRS_REAR_SOURCE_R.connect(SRS_REAR_SPLITTER);
SRS_REAR_SPLITTER.connect(SRS_MERGER_REAR, 0, 4);
SRS_REAR_SPLITTER.connect(SRS_MERGER_REAR, 0, 5);

SRS_CENTER_SPLITTER.connect(SRS_MERGER_CENTER, 0, 2);
SRS_LFE_SPLITTER.connect(SRS_MERGER_LFE, 0, 3);

// Connect merger to destination
SRS_MERGER_REAR.connect(faderNodeRear);
faderNodeRear.connect(preampSRS);
SRS_MERGER_SIDE.connect(preampSRS);
SRS_MERGER_CENTER.connect(preampSRS);
SRS_MERGER_LFE.connect(masterSound);

const srsoutputsplitter = audioCtx.createChannelSplitter(8);
const srsoutputmerger = audioCtx.createChannelMerger(8);

mixerNode.connect(srsoutputsplitter);
listenMixerNode.connect(srsoutputsplitter);
effect_mixerNode.connect(srsoutputsplitter);

const faders = [];

for (let i = 2; i < 8; i++) {
  const fader = audioCtx.createGain();
  faders.push(fader);

  srsoutputsplitter.connect(fader, i);     // take channel i
  fader.connect(srsoutputmerger, 0, i);    // send back to channel i
}

srsoutputmerger.connect(preampSRS);
preampSRS.connect(eq_srs.input);
preampSRS.connect(faderNode_SRS);
eq_srs.output.connect(faderNode_SRS);
faderNode_SRS.connect(compSRS.input);
compSRS.output.connect(masterSound);

mixerExecAnnounce.connect(masterVolume);
masterVolume.connect(audioCtx.destination);

let isAnnouncing = false;

document.getElementById('announceBtn').onclick = (e) => {
  if (!isAnnouncing) {
    isAnnouncing = true;
    executeAnnouncement(true);
    animateGain(false);
    snackbar('Announcement opened');
    document.getElementById('announceText').textContent = 'Close';
    document.getElementById('announceBtn').title = "Close Announcement Execution [P]"
  } else {
    isAnnouncing = false;
    executeAnnouncement(false);
    snackbar('Announcement closed');
    document.getElementById('announceText').textContent = 'Open';
    document.getElementById('announceBtn').title = "Open Announcement Execution [P]"
  }

  document.getElementById('announceBtn').disabled = true;
}

document.getElementById('executeAnnouncementOn').addEventListener('ended', (e) => {
  document.getElementById('announceBtn').disabled = false;
  e.target.src = "";
})

document.getElementById('executeAnnouncementOff').addEventListener('ended', (e) => {
  animateGain(true);
  document.getElementById('announceBtn').disabled = false;
  e.target.src = "";
})

const COMP_PARAMS = {
  threshold: {
    values: [-96, -48, -40, -32, -24],
    unit: "dB",
    default: 2 // index → -32
  },
  ratio: {
    values: [1.5, 2, 3, 4, 8],
    unit: ":1",
    default: 2
  },
  attack: {
    values: [0.001, 0.003, 0.01, 0.02, 0.05],
    unit: "s",
    default: 2
  },
  release: {
    values: [0.05, 0.1, 0.3, 0.6, 1.0],
    unit: "s",
    default: 2
  },
};

comp.compressor.knee.value = 30;
compRecord.compressor.knee.value = 30;

function SRS_SET_FOREACH_CHANNEL(type, value) {
  for (let i = 0; i < 8; i++) {
    compSRS.compressors[i][type].setTargetAtTime(value, audioCtx.currentTime, 0.05);
  }
}

function initCompressorSlider({
  key,
  slider,
  label,
  audioParam,
  audioParamRecord,
  fixed,
  step
}) {
  const cfg = COMP_PARAMS[key];

  // load saved value or default
  const savedValue = Number(localStorage.getItem("comp_" + key)) ?? cfg.values[cfg.default];

  slider.min = 0;
  slider.max = 1;    // normalized 0→1
  slider.step = step || 0;

  slider.addEventListener("input", () => {
    const t = Number(slider.value);          // normalized 0→1
    // map 0→1 to min/max range from cfg.values
    const minVal = cfg.values[0];
    const maxVal = cfg.values[cfg.values.length - 1];
    const value = minVal + t * (maxVal - minVal);

    audioParam.setTargetAtTime(value, audioCtx.currentTime, 0.05);
    audioParamRecord.setTargetAtTime(value, audioCtx.currentTime, 0.05);
    SRS_SET_FOREACH_CHANNEL(key, value)
    label.textContent = value.toFixed(fixed || 0) + cfg.unit;

    localStorage.setItem("comp_" + key, value); // save actual value
  });

  // restore slider position based on saved value
  const minVal = cfg.values[0];
  const maxVal = cfg.values[cfg.values.length - 1];
  slider.value = (savedValue - minVal) / (maxVal - minVal);

  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

initCompressorSlider({
  key: "threshold",
  slider: document.getElementById('compthresholdSlider'),
  label: document.getElementById('compthresholdValue'),
  audioParam: comp.compressor.threshold,
  audioParamRecord: compRecord.compressor.threshold,
  fixed: 0,
  step: 0.02
});

initCompressorSlider({
  key: "ratio",
  slider: document.getElementById('compratioSlider'),
  label: document.getElementById('compratioValue'),
  audioParam: comp.compressor.ratio,
  audioParamRecord: compRecord.compressor.ratio,
  fixed: 1,
  step: 0.1
});

initCompressorSlider({
  key: "attack",
  slider: document.getElementById('compattackSlider'),
  label: document.getElementById('compattackValue'),
  audioParam: comp.compressor.attack,
  audioParamRecord: compRecord.compressor.attack,
  fixed: 3,
  step: 0.05
});

initCompressorSlider({
  key: "release",
  slider: document.getElementById('comprelSlider'),
  label: document.getElementById('comprelValue'),
  audioParam: comp.compressor.release,
  audioParamRecord: compRecord.compressor.release,
  fixed: 2,
  step: 0.01
});

compRecord.dryGain.gain.value = 0;
compRecord.wetGain.gain.value = 1;

const savedMaster = localStorage.getItem("masterVolume") || 1;
const masterSlider = document.getElementById('masterSlider');
const masterValue = document.getElementById('masterValue');

// Update on slider move
masterSlider.addEventListener("input", () => {
  const value = Number(masterSlider.value * 100);
  masterVolume.gain.value = Number(masterSlider.value);
  masterValue.textContent = `${value.toFixed(0)}%`;
  localStorage.setItem("masterVolume", masterSlider.value); // save
});

masterSlider.value = savedMaster;
masterSlider.dispatchEvent(new Event("input", { bubbles: true }));

const savedBalance = localStorage.getItem("Balance") || 0;
const BalanceSlider = document.getElementById('BalanceSlider');
const BalanceValue = document.getElementById('BalanceValue');
const checkboxInvert = document.getElementById("InvertCheckbox");
const savedInvert = localStorage.getItem("InvertEnabled");

// Update on slider move
BalanceSlider.addEventListener("input", () => {
  const value = Number(BalanceSlider.value);
  balanceNode.setBalance(value); // tilt slightly to left
  const v = Math.max(-1, Math.min(1, value)); // clamp -1..1

  if (checkboxInvert.checked) {
    if (v < 0) {
      // negative = left, remove "-" sign
      BalanceValue.textContent = Math.abs(v).toFixed(2) + " R";
    } else if (v === 0) {
      BalanceValue.textContent = "0.00 RL";
    } else {
      // positive = right
      BalanceValue.textContent = v.toFixed(2) + " L";
    }
  } else {
    if (v < 0) {
      // negative = left, remove "-" sign
      BalanceValue.textContent = Math.abs(v).toFixed(2) + " L";
    } else if (v === 0) {
      BalanceValue.textContent = "0.00 LR";
    } else {
      // positive = right
      BalanceValue.textContent = v.toFixed(2) + " R";
    }
  }

  localStorage.setItem("Balance", BalanceSlider.value); // save
});

BalanceSlider.value = savedBalance;
BalanceSlider.dispatchEvent(new Event("input", { bubbles: true }));

checkboxInvert.addEventListener("change", () => {
  const enabled = checkboxInvert.checked;
  if (enabled) {
    balanceNode.setInvert(true);
    checkboxInvert.title = "Disable Invert Stereo";
    setTimeout(() => {
      BalanceSlider.dispatchEvent(new Event("input", { bubbles: true }));
    }, 100);
  } else {
    balanceNode.setInvert(false);
    checkboxInvert.title = "Enable Invert Stereo";
    setTimeout(() => {
      BalanceSlider.dispatchEvent(new Event("input", { bubbles: true }));
    }, 100);
  }
  localStorage.setItem("InvertEnabled", enabled);
});

checkboxInvert.checked = savedInvert === "true";
checkboxInvert.dispatchEvent(new Event("change", { bubbles: true }));

let isMono = false;

masterVolume.channelCountMode = "explicit";
masterVolume.channelCount = 8;
masterVolume.channelInterpretation = "discrete";

if (savedFader !== null) {
  faderSlider.value = savedFader;
  const value = Number(faderSlider.value);
  faderValue.textContent = `${value.toFixed(2)}∆`;
  document.getElementById("info_fader").innerHTML = `${value.toFixed(2)}∆`;
  setValueBothFunc();
}

// Update on slider move
faderSlider.addEventListener("input", () => {
  const value = Number(faderSlider.value);

  faderValue.textContent = `${value.toFixed(2)}∆`;
  document.getElementById("info_fader").innerHTML = `${value.toFixed(2)}∆`;

  setValueBothFunc();
  localStorage.setItem("faderGain", value); // save
});


if (savedcutoff !== null) {
  cutoffSlider.value = savedcutoff;
  const value = Number(cutoffSlider.value);

  if (value < 10) {
    cutoffValue.textContent = `${(value * 100).toFixed(0)} Hz`;
  } else {
    cutoffValue.textContent = `${(value).toFixed(2)} kHz`;
  }

  cutoff.setFrequency(value * 1000);
  // document.getElementById("info_fader").innerHTML = `${value.toFixed(2)}∆`;
}

// Update on slider move
cutoffSlider.addEventListener("input", () => {
  const value = Number(cutoffSlider.value);

  if (value < 10) {
    cutoffValue.textContent = `${(value * 100).toFixed(0)} Hz`;
  } else {
    cutoffValue.textContent = `${(value).toFixed(2)} kHz`;
  }

  cutoff.setFrequency(value * 1000);
  localStorage.setItem("cutoffGain", value); // save
});

if (savedcutoff2 !== null) {
  cutoffSlider2.value = savedcutoff2;
  const value = Number(cutoffSlider2.value);

  if (value < 10) {
    cutoffValue2.textContent = `${(value * 100).toFixed(0)} Hz`;
  } else {
    cutoffValue2.textContent = `${(value).toFixed(1)} kHz`;
  }

  cutoffbass.setFrequency(value * 1000);
  // document.getElementById("info_fader").innerHTML = `${value.toFixed(2)}∆`;
}

// Update on slider move
cutoffSlider2.addEventListener("input", () => {
  const value = Number(cutoffSlider2.value);

  if (value < 10) {
    cutoffValue2.textContent = `${(value * 100).toFixed(0)} Hz`;
  } else {
    cutoffValue2.textContent = `${(value).toFixed(1)} kHz`;
  }

  cutoffbass.setFrequency(value * 1000);
  localStorage.setItem("cutoffGain2", value); // save
});

let inputConnected = true;
let outputConnected = true;

function connectionInput(bool) {
  if (bool) {
    inputMixerNode.gain.value = 1.0;
  } else {
    inputMixerNode.gain.value = 0;
  }
}

function connectionOutput(bool) {
  if (bool) {
    outputMixerNode.gain.value = 1.0;
  } else {
    outputMixerNode.gain.value = 0;
  }
}

// Suppose this is your master output (gain, filters, etc.)
const masterGain = audioCtx.createGain();
const dest = audioCtx.createMediaStreamDestination();
mixerNode.connect(compRecord.input);
mixerNode2.connect(compRecord.input);
inputMixerNode.connect(masterGain);
outputMixerNode.connect(compRecord.input);
compRecord.output.connect(masterGain)

// bass.output.connect(masterGain);

masterGain.connect(dest); // optional recorder
let recorder;
recorder = new MediaRecorder(dest.stream);

// Recorder setup
let chunks = [];
let onRecord = false;
let saveRecord = false;
let outputtempDir;

async function getAppDataPath() {
  // 1️⃣ Get appData path from main
  const appDataPath = await ipcRenderer.invoke("get-appdata-path");

  // 2️⃣ Construct full JSON path
  const jsonPath = path.join(
    appDataPath,
    "VJDY FM Sound Effects Studio",
    "output"
  );
  outputtempDir = jsonPath;
}

getAppDataPath();

async function saveRecordnow(name, format, directory) {
  ["audioWatermark"].forEach(id => {
    document.getElementById(id).disabled = true
  })

  const filePathIntro = path.join(__dirname, "audio", "init.wav");
  const filePathOutro = path.join(__dirname, "audio", "closerecord.wav");

  document.getElementById("titleDisplay").textContent = "Stopped";
  document.getElementById("stopRec").disabled = true;

  // Merge
  const mergedBuffer = await mergeRecording(filePathIntro, chunks, filePathOutro);

  // Export to desired format
  const saveBasePath = path.join(outputtempDir, name ? String(name) : generateRecordingFilename());
  const selectedFormat = "audio/wav";
  const outputFile = await exportRecording(mergedBuffer, selectedFormat, saveBasePath);

  ["audioWatermark"].forEach(id => {
    document.getElementById(id).disabled = false
  })

  // 🎯 Target directory (e.g. "Music/vjdy fm sound effects studio/recordings")
  const saveDir = directory ? String(directory) : path.join(os.homedir(), "Music", "VJDY FM Sound Effects Studio Recordings");

  // 🧩 Make sure directory exists
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  // 📁 Compose final path
  const fileName = path.basename(outputFile);
  const savePath = path.join(saveDir, fileName);

  // 🪄 Copy or write the file
  fs.copyFileSync(outputFile, savePath);

  async function clearOutputFolder() {
    const outputFolder = path.join(outputtempDir);

    try {
      const files = await fs.promises.readdir(outputFolder);

      // Delete each file/folder inside the directory
      await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(outputFolder, file);
          const stat = await fs.promises.lstat(filePath);

          if (stat.isDirectory()) {
            await fs.promises.rm(filePath, { recursive: true, force: true });
          } else {
            await fs.promises.unlink(filePath);
          }
        })
      );
    } catch (err) {
      console.error("Failed to clear output folder contents:", err);
    }
  }

  // Usage
  await clearOutputFolder();
  snackbar(`Recording saved!`);
  playRenderSound(true);

  resetStatusRecord();
}

function resetStatusRecord() {
  chunks = [];
  document.getElementById("titleDisplay").textContent = "Record";
  document.getElementById("timerDisplay").textContent = "Inactive";

  document.getElementById("startRec").disabled = false;
  document.getElementById("stopRec").disabled = true;
}

async function recordState(state = 0) {
  onRecord = false;

  if (recorder && recorder.state !== "inactive") {
    saveRecord = true;
    recorder.stop();
    stopTimer();
    elapsedSeconds = 0;
  } else { return }

  if (state == 1) {
    resetStatusRecord();
    snackbar("Recording discarded");
    return;
  } else if (state == 0) {
    saveRecordnow()
  } else if (state == 2) {
    try {
      const { basename, extname } = require('path'); // if Node integration enabled

      document.getElementById("titleDisplay").textContent = "Stopped";
      document.getElementById("stopRec").disabled = true;

      const savedPath = await ipcRenderer.invoke('save-pcm-chunks', chunks);

      if (!savedPath) {
        resetStatusRecord();
        snackbar("Recording discarded");
        return;
      }

      // --- GET FILENAME & MIME TYPE ---
      const fileName = basename(savedPath);              // "audio.wav"
      const directory = path.dirname(savedPath);
      const ext = extname(savedPath).toLowerCase();      // ".wav"

      // Map extension to mimetype
      let mimetype;
      switch (ext) {
        case ".wav": mimetype = "audio/wav"; break;
        case ".mp3": mimetype = "audio/mpeg"; break;
        case ".opus": mimetype = "audio/opus"; break;
        case ".flac": mimetype = "audio/flac"; break;
        default: mimetype = "unknown";
      }

      // Remove extension from filename for saveRecordnow
      const nameWithoutExt = fileName.replace(ext, "");

      saveRecordnow(nameWithoutExt, mimetype, directory);
    } catch (err) {
      playRenderSound(false);
      console.error("Error saving PCM chunks:", err);
      alert(err, "Export Error!");
      resetStatusRecord();
    }
  }
}

const pcmChunks = [];

function onFloatData(float32Array) {
  const pcm16 = floatTo16BitPCM(float32Array);
  pcmChunks.push(pcm16);
}

document.getElementById("startRec").addEventListener("click", () => {
  if (audioCtx.currentTime >= 15) {
    startTimer();
    onRecord = true;
    document.getElementById("startRec").disabled = true;
    document.getElementById("stopRec").disabled = false;

    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.onpause = () => { stopTimer(); console.log("Recording paused"); };
    recorder.onresume = () => { startTimer(); console.log("Recording resumed"); };
    recorder.onstop = () => { };

    recorder.start();
  } else {
    snackbar(`Audio context is not ready for ${(15 - audioCtx.currentTime).toFixed(1)} seconds yet. Please wait a moment and try to record again.`);
  }
});

document.getElementById("startRec").disabled = false;
document.getElementById("stopRec").disabled = true;

// Reset the timer (optional)
function resetTimer() {
  recorder.stop();
  stopTimer();
  elapsedSeconds = 0;
  console.log("Timer reset to 00:00");
}

setInterval(() => {
  document.getElementById('info_samplerate').textContent = `${audioCtx.sampleRate}Hz`;
  document.getElementById('info_baselatency').textContent = `${Number(audioCtx.baseLatency).toFixed(3)}ms`;
  document.getElementById('info_outputlatency').textContent = `${Number(audioCtx.outputLatency).toFixed(3)}ms`;
  document.getElementById('audioCtx_currenttime').textContent = `${formatTimeFromNumber(audioCtx.currentTime)}`
}, 500)

// ======= Load saved settings with defaults and update sliders =======
const savedSettings = JSON.parse(localStorage.getItem("reverbSettings") || "{}");

// Default values
const defaults = {
  dry: 0,
  wet: 0,
  preDelay: 0,
  roomSize: 0,
  irDuration: 0.1,
  irDecay: 0.1
};

// Use saved or defaults
const dryValSaved = savedSettings.dry ?? defaults.dry;
const wetValSaved = savedSettings.wet ?? defaults.wet;
const preValSaved = savedSettings.preDelay ?? defaults.preDelay;
const roomValSaved = savedSettings.roomSize ?? defaults.roomSize;
const irDurationSaved = savedSettings.irDuration ?? defaults.irDuration;
const irDecaySaved = savedSettings.irDecay ?? defaults.irDecay;

// Set reverb values
reverb.setDry(dryValSaved);
reverb.setWet(wetValSaved);
reverb.setPreDelay(preValSaved * 1000); // ms
reverb.setRoomSize(roomValSaved);
reverb.setIR(irDurationSaved, irDecaySaved);

reverbSampler.setDry(dryValSaved);
reverbSampler.setWet(wetValSaved);
reverbSampler.setPreDelay(preValSaved * 1000); // ms
reverbSampler.setRoomSize(roomValSaved);
reverbSampler.setIR(irDurationSaved, irDecaySaved);

// Update sliders and text
document.getElementById("drySlider").value = dryValSaved;
document.getElementById("wetSlider").value = wetValSaved;
document.getElementById("preSlider").value = preValSaved * 1000;
document.getElementById("roomSlider").value = roomValSaved;
document.getElementById("irDurationSlider").value = irDurationSaved;
document.getElementById("irDecaySlider").value = irDecaySaved;

// Update text display
document.getElementById("dryVal").textContent = dryValSaved.toFixed(2);
document.getElementById("wetVal").textContent = wetValSaved.toFixed(2);
document.getElementById("preVal").textContent = (preValSaved * 1000).toFixed(0);
document.getElementById("roomVal").textContent = roomValSaved.toFixed(2);
document.getElementById("irDurationVal").textContent = irDurationSaved.toFixed(2);
document.getElementById("irDecayVal").textContent = irDecaySaved.toFixed(2);

// ======= Save function =======
function saveReverbSettings() {
  const settings = {
    dry: reverb.dry.gain.value,
    wet: reverb.wet.gain.value,
    preDelay: reverb.preDelay.delayTime.value,
    roomSize: reverb.roomSize.gain.value,
    irDuration: reverb.convolver.buffer.length / audioCtx.sampleRate,
    irDecay: Number(document.getElementById("irDecaySlider").value) ?? 0.1
  };
  localStorage.setItem("reverbSettings", JSON.stringify(settings));
}

// ======= Controller wrapper =======
const reverbController = {
  setDry(value) { reverb.setDry(value); reverbSampler.setDry(value); saveReverbSettings(); },
  setWet(value) { reverb.setWet(value); reverbSampler.setWet(value); saveReverbSettings(); },
  setPreDelay(ms) { reverb.setPreDelay(ms); reverbSampler.setPreDelay(ms); saveReverbSettings(); },
  setRoomSize(mult) { reverb.setRoomSize(mult); reverbSampler.setRoomSize(mult); saveReverbSettings(); },
  setIR(duration, decay) { reverb.setIR(duration, decay); reverbSampler.setIR(duration, decay); saveReverbSettings(); }
};

// ======= Sliders + live text update =======
const sliders = [
  { id: "drySlider", controller: reverbController.setDry, textId: "dryVal", textinfoId: "info_dry", decimals: 2 },
  { id: "wetSlider", controller: reverbController.setWet, textId: "wetVal", textinfoId: "info_wet", decimals: 2 },
  { id: "preSlider", controller: reverbController.setPreDelay, textId: "preVal", textinfoId: "info_pre", decimals: 0 },
  { id: "roomSlider", controller: reverbController.setRoomSize, textId: "roomVal", textinfoId: "info_room", decimals: 2 },
  { id: "irDurationSlider", controller: null, textId: "irDurationVal", textinfoId: "info_irduration", decimals: 2 },
  { id: "irDecaySlider", controller: null, textId: "irDecayVal", textinfoId: "info_irdecay", decimals: 2 }
];

sliders.forEach(slider => {
  const el = document.getElementById(slider.id);
  const textEl = document.getElementById(slider.textId);
  const textinfoEl = document.getElementById(slider.textinfoId);

  el.oninput = () => {
    const value = Number(el.value);

    // Update controller if exists
    if (slider.controller) slider.controller(value);

    // IR sliders regenerate IR together
    if (slider.id === "irDurationSlider" || slider.id === "irDecaySlider") {
      const dur = Number(document.getElementById("irDurationSlider").value);
      const dec = Number(document.getElementById("irDecaySlider").value);
      reverbController.setIR(dur, dec);
    }

    textEl.textContent = value.toFixed(slider.decimals);
    textinfoEl.textContent = value.toFixed(slider.decimals);
  };

  // initialize text with current slider value
  textEl.textContent = Number(el.value).toFixed(slider.decimals);
  textinfoEl.textContent = Number(el.value).toFixed(slider.decimals);
});

function setEnhancerfromPreset(preset) {
  document.getElementById('reduceSlider').value = preset.mix;
  document.getElementById('reduceSlider').dispatchEvent(new Event('input'));

  document.getElementById('centerSlider').value = preset.center;
  document.getElementById('centerSlider').dispatchEvent(new Event('input'));

  document.getElementById('sideSlider').value = preset.side;
  document.getElementById('sideSlider').dispatchEvent(new Event('input'));

  document.getElementById('rearSlider').value = preset.rear;
  document.getElementById('rearSlider').dispatchEvent(new Event('input'));

  document.getElementById('frontSlider').value = preset.front;
  document.getElementById('frontSlider').dispatchEvent(new Event('input'));
}

ipcRenderer.on('send_stereoenhancerpreset', (event, preset) => {
  setEnhancerfromPreset(preset);
});

const merger = audioCtx.createChannelMerger(8);
merger.connect(masterVolume);

function setupSRSSliders(name, gainParam) {
  const slider = document.getElementById(`srsslider_${name}`);
  const valueDisplay = document.getElementById(`srsslider_${name}_text`);

  slider.addEventListener('input', () => {
    const gainValue = Number(slider.value);
    gainParam.setTargetAtTime(gainValue, audioCtx.currentTime, 0.05);
    valueDisplay.textContent = gainValue.toFixed(2);
    localStorage.setItem(`andromeda_srs_gain_${name}`, gainValue);
  });

  // Load saved value or default
  const initValue = localStorage.getItem(`andromeda_srs_gain_${name}`) || 1;
  slider.value = initValue;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

setupSRSSliders('side', faderNodeSide.gain);
setupSRSSliders('rear', faderNodeRear.gain);
setupSRSSliders('lfe', faderNodeLFE.gain);
setupSRSSliders('center', faderNodeCenter.gain);

const checkboxUpmix = document.getElementById("UpmixCheckbox");
const upmixValue = document.getElementById('upmixValue');

function setSRSValueDownmix() {
  const enabled = checkboxUpmix.checked;
  if (enabled) {
    enhancer.downmix['C'] = document.getElementById('SRS_CENTER_DOWNMIX').value * upmixValue.value
    enhancer.downmix['LFE'] = document.getElementById('SRS_LFE_DOWNMIX').value * upmixValue.value
    enhancer.downmix['LS'] = document.getElementById('SRS_REARL_DOWNMIX').value * upmixValue.value
    enhancer.downmix['RS'] = document.getElementById('SRS_REARR_DOWNMIX').value * upmixValue.value
    enhancer.downmix['LB'] = document.getElementById('SRS_SIDEL_DOWNMIX').value * upmixValue.value
    enhancer.downmix['RB'] = document.getElementById('SRS_SIDEL_DOWNMIX').value * upmixValue.value
  } else {
    ['C', 'LFE', 'LS', 'RS', 'LB', 'RB'].forEach(channel => {
      enhancer.downmix[channel] = 0;
    })
  }
}

checkboxUpmix.addEventListener("change", () => {
  const enabled = checkboxUpmix.checked;
  if (enabled) {
    masterVolume.channelCount = 2;
  } else {
    masterVolume.channelCount = 8;
  }

  setSRSValueDownmix();
  document.getElementById('upMixValueText').textContent = gainTodB(upmixValue.value)

  localStorage.setItem("UpmixEnabled", enabled);
});

checkboxUpmix.checked = localStorage.getItem("UpmixEnabled") === "true";
checkboxUpmix.dispatchEvent(new Event("change", { bubbles: true }));

upmixValue.addEventListener('input', () => {
  checkboxUpmix.dispatchEvent(new Event("change", { bubbles: true }));
  setSRSValueDownmix();
  localStorage.setItem("UpmixValue", upmixValue.value);
})

const savedUpmix = localStorage.getItem("UpmixValue") || 1;

upmixValue.value = Number(savedUpmix);
upmixValue.dispatchEvent(new Event("input", { bubbles: true }));

function setupSurroundValueFader(channelstring, audioparam) {
  const slider = document.getElementById(`SRS_${channelstring}`)
  const text = document.getElementById(`SRS_${channelstring}_text`)

  const state = localStorage.getItem(`andromeda_audiosettings_save_${channelstring}`) || 1;

  slider.addEventListener('input', (e) => {
    audioparam.gain.value = e.target.value;
    localStorage.setItem(`andromeda_audiosettings_save_${channelstring}`, Number(e.target.value));
    text.textContent = gainTodB(e.target.value);
  })

  slider.value = Number(state);
  slider.dispatchEvent(new Event('input'));
}

function setupSurroundValueDownmixFader(channelstring) {
  const slider = document.getElementById(`SRS_${channelstring}`)
  const text = document.getElementById(`SRS_${channelstring}_text`)

  const state = localStorage.getItem(`andromeda_audiosettings_save_${channelstring}`) || 1;

  slider.addEventListener('input', (e) => {
    setSRSValueDownmix();
    localStorage.setItem(`andromeda_audiosettings_save_${channelstring}`, Number(e.target.value));
    text.textContent = gainTodB(e.target.value);
  })

  slider.value = Number(state);
  slider.dispatchEvent(new Event('input'));
}

setupSurroundValueFader('CENTER', faders[0]);
setupSurroundValueFader('LFE', faders[1]);
setupSurroundValueFader('REARL', faders[2]);
setupSurroundValueFader('REARR', faders[3]);
setupSurroundValueFader('SIDEL', faders[4]);
setupSurroundValueFader('SIDER', faders[5]);

setupSurroundValueDownmixFader('CENTER_DOWNMIX');
setupSurroundValueDownmixFader('LFE_DOWNMIX');
setupSurroundValueDownmixFader('REARL_DOWNMIX');
setupSurroundValueDownmixFader('REARR_DOWNMIX');
setupSurroundValueDownmixFader('SIDEL_DOWNMIX');
setupSurroundValueDownmixFader('SIDER_DOWNMIX');