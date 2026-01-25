function playOsc(ms, st = 0, wave = "sine", adsr = { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 }) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  const midiNote = 60 + st;
  const freq = 440 * Math.pow(2, (midiNote - 69) / 12);
  osc.frequency.value = freq;
  osc.type = wave;

  osc.connect(gain);
  gain.connect(mixerNode2);

  const now = audioCtx.currentTime;
  const { attack, decay, sustain, release } = adsr;
  const noteDuration = ms / 1000;

  // ADSR envelope
  gain.gain.setValueAtTime(0, now); // start at 0
  gain.gain.linearRampToValueAtTime(1, now + attack); // attack up to 1
  gain.gain.linearRampToValueAtTime(sustain, now + attack + decay); // decay down to sustain
  gain.gain.setValueAtTime(sustain, now + noteDuration - release); // hold sustain until release
  gain.gain.linearRampToValueAtTime(0, now + noteDuration); // release to 0

  osc.start(now);
  osc.stop(now + noteDuration);
}

// 🔹 elements
const reduceSlider = document.getElementById("reduceSlider");

// 🧠 Restore saved or default to Stereo
let pitchNode;
let pitchParams;

function createStereoEnhancer(ctx) {
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

  // 🎚️ Bass enhancer only for cancel path
  const bassEnhancer = ctx.createBiquadFilter();
  bassEnhancer.type = "lowshelf";
  bassEnhancer.frequency.value = 200; // cutoff around 150 Hz
  bassEnhancer.gain.value = 0

  // Compressors
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10.0;
  limiter.ratio.value = 8.0;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.25;

  const limiter2 = ctx.createDynamicsCompressor();
  limiter2.threshold.value = -12;
  limiter2.knee.value = 10.0;
  limiter2.ratio.value = 8.0;
  limiter2.attack.value = 0.01;
  limiter2.release.value = 0.25;

  // ✅ Correct routing
  merger.connect(limiter);             // normal stereo → limiter
  merger2.connect(bassEnhancer);        // cancel → bass enhancer
  bassEnhancer.connect(limiter2);       // → limiter

  return {
    input: splitter,
    output: {
      normal: limiter,    // untouched bass path
      cancel: limiter2    // low-shelf applied
    },
    control: (value, multiplier) => {
      const norm = (reduceSlider.value - reduceSlider.min) / (reduceSlider.max - reduceSlider.min);

      gainL.gain.value = (norm / multiplier);
      gainR.gain.value = (norm / multiplier);

      document.getElementById("srsIndicator").style.display = norm >= 0.01 ? "block" : "none";

      const cancel = -(norm / multiplier);
      invertL.gain.value = cancel;
      invertR.gain.value = cancel;
    }
  };
}

const enhancer = createStereoEnhancer(audioCtx);

function createEqualizer(ctx) {
  const frequencies = [125, 150, 175, 200, 250, 500, 750, 1000, 2000, 4000, 8000, 16000];
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

// 🔹 Create enhancer and EQ
const eq = createEqualizer(audioCtx);
const eq2 = createEqualizer(audioCtx);

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

const centerEffect = createCenterSpeakerEffect(audioCtx);

// 🔹 EQ Slider Handling
function setEqGain(band, gain) {
  // Prevent gain adjustment and saving if EQ is disabled (flat mode)
  if (!eqSwitch.checked) return;

  eq.filters[band].gain.value = gain;
  eq2.filters[band].gain.value = gain;
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

// Load EQ values from storage
eq2.filters.forEach((f, i) => {
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

// 🔹 EQ Q Value Switch (toggle)
const eqSwitch = document.getElementById("eqSwitch");
if (eqSwitch) {
  eqSwitch.addEventListener("change", () => {
    const isEnabled = eqSwitch.checked; // true = enable EQ, false = flat/off

    eq.filters.forEach((f, i) => {
      f.Q.value = isEnabled ? 1 : 0;

      // When disabled, don't overwrite stored EQ — just mute visually
      if (!isEnabled) {
        f.gain.value = -12
      }

      // Restore saved gains when re-enabled
      if (isEnabled) {
        const saved = localStorage.getItem("eqBand" + i);
        if (saved !== null) f.gain.value = parseFloat(saved);
      }
    });

    eq2.filters.forEach((f, i) => {
      f.Q.value = isEnabled ? 1 : 0;

      // When disabled, don't overwrite stored EQ — just mute visually
      if (!isEnabled) {
        f.gain.value = -12
      }

      // Restore saved gains when re-enabled
      if (isEnabled) {
        const saved = localStorage.getItem("eqBand" + i);
        if (saved !== null) f.gain.value = parseFloat(saved);
      }
    });

    // Disable or enable sliders
    for (let i = 0; i < eq.filters.length; i++) {
      const slider = document.getElementById("eq" + i);
      if (slider) {
        slider.disabled = !isEnabled;

        // When disabled: show -12 visually, but don’t save
        if (!isEnabled) {
          slider.value = -12;
        } else {
          const saved = localStorage.getItem("eqBand" + i);
          if (saved !== null) slider.value = saved;
        }
      }
    }

    for (let i = 0; i < eq2.filters.length; i++) {
      const slider = document.getElementById("eq" + i);
      if (slider) {
        slider.disabled = !isEnabled;

        // When disabled: show -12 visually, but don’t save
        if (!isEnabled) {
          slider.value = -12;
        } else {
          const saved = localStorage.getItem("eqBand" + i);
          if (saved !== null) slider.value = saved;
        }
      }
    }

    localStorage.setItem("eqQFlat", isEnabled);
    document.getElementById('info_eq').textContent = isEnabled;
  });

  // 🔹 Load saved switch state on startup
  const savedState = localStorage.getItem("eqQFlat") || "false";
  if (savedState !== null) {
    eqSwitch.checked = savedState === "true";
    const isEnabled = eqSwitch.checked;

    eq.filters.forEach((f, i) => {
      f.Q.value = isEnabled ? 1 : 0;
      if (!isEnabled) {
        f.gain.value = -12
      } else {
        const saved = localStorage.getItem("eqBand" + i);
        f.gain.value = parseFloat(saved) || -12;
      }
    });

    for (let i = 0; i < eq.filters.length; i++) {
      const slider = document.getElementById("eq" + i);
      if (slider) {
        slider.disabled = !isEnabled;
        if (!isEnabled) {
          slider.value = -12;
        } else {
          const saved = localStorage.getItem("eqBand" + i);
          slider.value = saved || -12;
        }
      }
    }

    eq2.filters.forEach((f, i) => {
      f.Q.value = isEnabled ? 1 : 0;
      if (!isEnabled) {
        f.gain.value = -12
      } else {
        const saved = localStorage.getItem("eqBand" + i);
        f.gain.value = parseFloat(saved) || -12;
      }
    });

    for (let i = 0; i < eq2.filters.length; i++) {
      const slider = document.getElementById("eq" + i);
      if (slider) {
        slider.disabled = !isEnabled;
        if (!isEnabled) {
          slider.value = -12;
        } else {
          const saved = localStorage.getItem("eqBand" + i);
          slider.value = saved || -12;
        }
      }
    }
  }
}

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
const centerSlider = document.getElementById("centerSlider");
const centerValue = document.getElementById("centerValue");
const bassSlider = document.getElementById("bassSlider");
const savedFader = localStorage.getItem("faderGain") || 1;

function setValueBothFunc() {
  bass.setValue(Number(bassSlider.value));
  bass2.setValue(Number(bassSlider.value));
  faderNode.gain.value = Number(bassSlider.value) == 0 ? 1 : Number(faderSlider.value);
  const bool = Number(bassSlider.value) == 0 ? true : false;
  document.getElementById("faderSlider_graphic").dataset.boolean = bool
  document.getElementById("bassIndicator").style.display = Number(bassSlider.value) >= 0.1 ? "block" : "none";
  document.getElementById("bassSliderText").innerHTML = `${bassSlider.value}dB`;
  document.getElementById("info_bassgain").innerHTML = `${Number(bassSlider.value)}dB`;
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
let effect_mixerNodeReverb = audioCtx.createGain();

function adjustSamplerEffect(val) {
  effect_mixerNode.gain.value = Number(val);
  effect_mixerNodeReverb.gain.value = Number(val);
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

enhancer.output.normal.connect(eq.input);
mixerNode.connect(eq.input)
mixerNode2.connect(eq2.input)
listenMixerNode.connect(eq.input)

mixerNode.connect(enhancer.input);
mixerNode2.connect(effect_mixerNode);
effect_mixerNode.connect(enhancer.input);
listenMixerNode.connect(enhancer.input);

mixerNode.connect(bass.input);
mixerNode2.connect(bass2.input);
listenMixerNode.connect(bass.input);

// Connect your existing node to center input
mixerNode.connect(centerEffect.input);
effect_mixerNode.connect(centerEffect.input);
listenMixerNode.connect(centerEffect.input);

centerEffect.output.connect(faderNode);
centerEffect.centerNode.gain.value = 0; // start muted

const savedCenter = localStorage.getItem("centerGain") || 0;

if (savedCenter !== null) {
  centerSlider.value = savedCenter;
  centerEffect.centerNode.gain.value = savedCenter;
  const value = Number(centerSlider.value);
  centerValue.textContent = `${value.toFixed(2)}∆`;
  document.getElementById('info_srscenter').innerHTML = `${value.toFixed(2)}∆`;
}

// Update on slider move
centerSlider.addEventListener("input", () => {
  const value = Number(centerSlider.value);
  centerEffect.centerNode.gain.value = value;
  centerValue.textContent = `${value.toFixed(2)}∆`;
  document.getElementById('info_srscenter').innerHTML = `${value.toFixed(2)}∆`;
  localStorage.setItem("centerGain", value); // save
});

// Connect EQ after enhancer’s normal path (before destination)
const reduceThresholdSlider = document.getElementById("reduceThresholdSlider");

function sendToText(percent) {
  const volumeText = document.getElementById('reduceSliderText');
  if (volumeText) {
    volumeText.innerHTML = `${percent}%`;
    document.getElementById('info_srs').innerHTML = `${percent}%`
    document.getElementById('info_srsincrement').innerHTML = `${parseFloat(reduceThresholdSlider.value)}=${Number(1 / reduceThresholdSlider.value).toFixed(2)}&micro;T`;
    document.getElementById('reduceThresholdSliderText').innerHTML = `${Number(1 / reduceThresholdSlider.value).toFixed(2)}&micro;T`;
  }

  const bool = Number(percent) == 0 ? true : false;
  reduceThresholdSlider.disabled = bool;
  document.getElementById("reduceThresholdSlider_graphic").dataset.boolean = bool
  document.getElementById("centerSlider_graphic").dataset.boolean = bool
  centerSlider.disabled = bool;
  centerEffect.centerNode.gain.value = bool ? 0 : parseFloat(centerSlider.value);
}

const savedThreshold = localStorage.getItem("reduceThreshold");
let channelSwitchValue = savedThreshold ? parseFloat(savedThreshold) || 1 : 1;
reduceThresholdSlider.value = channelSwitchValue;
reduceThresholdSlider.style.setProperty('--factor', `${1 / channelSwitchValue * 10}px`);

// 💾 Listen for changes and save
reduceThresholdSlider.addEventListener("input", () => {
  channelSwitchValue = parseFloat(reduceThresholdSlider.value) || 1;
  localStorage.setItem("reduceThreshold", channelSwitchValue);
  reduceThresholdSlider.style.setProperty('--factor', `${1 / channelSwitchValue * 10}px`);
  const val = parseFloat(reduceSlider.value);
  enhancer.control(val, channelSwitchValue);
  localStorage.setItem("reduceLevel", val);
  const percent = Math.round(val * 100);
  sendToText(percent);
});

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

function createReverb(audioCtx) {

  // --- IR generator ---
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

const reverb = createReverb(audioCtx);
const reverbSampler = createReverb(audioCtx);
const comp = createParallelCompressor(audioCtx);
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
effect_mixerNode.connect(reverbSampler.input);
listenMixerNode.connect(reverb.input);

eq.output.connect(faderNode);
eq.output.connect(reverb.input);
eq2.output2.connect(faderNode);
eq2.output2.connect(reverbSampler.input);

bass.output.connect(limiter);
bass.output.connect(reverb.input2);
bass2.output2.connect(limiter);
bass2.output2.connect(reverbSampler.input2);

enhancer.output.normal.connect(faderNode);  // stereo
enhancer.output.cancel.connect(faderNode);  // cancel
reverb.output2.connect(limiter);
reverb.output.connect(faderNode);

reverbSampler.output2.connect(effect_mixerNodeReverb);
reverbSampler.output.connect(effect_mixerNodeReverb);

effect_mixerNodeReverb.connect(limiter);
effect_mixerNodeReverb.connect(faderNode);

limiter.connect(comp.input);
faderNode.connect(comp.input);
comp.output.connect(balanceNode.input)
balanceNode.output.connect(masterSound);

masterSound.connect(masterSound2);
masterSound2.connect(masterVolume);
mixerExecAnnounce.connect(masterVolume);

masterVolume.connect(audioCtx.destination);
masterVolume.connect(meterMixerNode);

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
    values: [-96, -48, -40, -32, -24, -16],
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

    audioParam.value = value;
    audioParamRecord.value = value;
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
  ["formatSelector", "audioWatermark", "bitrateSelector"].forEach(id => {
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
  const selectedFormat = format ? String(format) : document.getElementById("formatSelector").value || "audio/wav";
  const outputFile = await exportRecording(mergedBuffer, selectedFormat, saveBasePath);

  ["formatSelector", "audioWatermark", "bitrateSelector"].forEach(id => {
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

  document.getElementById("titleDisplay").textContent = "Record";
  document.getElementById("timerDisplay").textContent = "Inactive";
  document.getElementById("startRec").disabled = false;

  chunks = [];
}

async function recordState(state = 0) {
  if (recorder && recorder.state !== "inactive") {
    saveRecord = true;
    recorder.stop();
    stopTimer();
    elapsedSeconds = 0;
  } else { return }

  if (state == 1) {
    chunks = [];
    document.getElementById("titleDisplay").textContent = "Record";
    document.getElementById("timerDisplay").textContent = "Inactive";

    document.getElementById("startRec").disabled = false;
    document.getElementById("stopRec").disabled = true;
    snackbar("Recording discarded");
    return;
  } else if (state == 0) {
    saveRecordnow()
  } else if (state == 2) {
    const { basename, extname } = require('path'); // if Node integration enabled

    document.getElementById("titleDisplay").textContent = "Stopped";
    document.getElementById("stopRec").disabled = true;

    const savedPath = await ipcRenderer.invoke('save-pcm-chunks', chunks);

    if (!savedPath) {
      chunks = [];
      document.getElementById("titleDisplay").textContent = "Record";
      document.getElementById("timerDisplay").textContent = "Inactive";

      document.getElementById("startRec").disabled = false;
      document.getElementById("stopRec").disabled = true;
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
  }
}

const pcmChunks = [];

function onFloatData(float32Array) {
  const pcm16 = floatTo16BitPCM(float32Array);
  pcmChunks.push(pcm16);
}

document.getElementById("startRec").addEventListener("click", () => {
  startTimer();
  onRecord = true;
  document.getElementById("startRec").disabled = true;
  document.getElementById("stopRec").disabled = false;

  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onpause = () => { stopTimer(); console.log("Recording paused"); };
  recorder.onresume = () => { startTimer(); console.log("Recording resumed"); };
  recorder.onstop = () => { };

  recorder.start();
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