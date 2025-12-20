// 🔹 elements
const reduceSlider = document.getElementById("reduceSlider");


// 🧠 Restore saved or default to Stereo
let pitchNode;
let pitchParams;

function createVocalReducer(ctx) {
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

  // 🎚️ Bass reducer only for cancel path
  const bassReducer = ctx.createBiquadFilter();
  bassReducer.type = "lowshelf";
  bassReducer.frequency.value = 200; // cutoff around 150 Hz
  bassReducer.gain.value = 0

  // Compressors
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10.0;
  limiter.knee.value = 10.0;
  limiter.ratio.value = 8.0;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.25;

  const limiter2 = ctx.createDynamicsCompressor();
  limiter2.threshold.value = -10.0;
  limiter2.knee.value = 10.0;
  limiter2.ratio.value = 8.0;
  limiter2.attack.value = 0.01;
  limiter2.release.value = 0.25;

  // ✅ Correct routing
  merger.connect(limiter);             // normal stereo → limiter
  merger2.connect(bassReducer);        // cancel → bass reducer
  bassReducer.connect(limiter2);       // → limiter

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

const reducer = createVocalReducer(audioCtx);

function createEqualizer(ctx) {
  const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
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
    filters,
    limiter,
    smoothSet, // expose helper
  };
}

// 🔹 Create reducer and EQ
const eq = createEqualizer(audioCtx);

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
    output: limiter,
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
const faderSlider = document.getElementById("faderSlider");
const faderValue = document.getElementById("faderValue");
const centerSlider = document.getElementById("centerSlider");
const centerValue = document.getElementById("centerValue");
const bassSlider = document.getElementById("bassSlider");
const savedFader = localStorage.getItem("faderGain") || 1;

function setValueBothFunc() {
  bass.setValue(Number(bassSlider.value));
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
}

// update + save
filterSlider.addEventListener("input", (e) => {
  const value = Number(filterSlider.value);
  filterValue.innerHTML = `${value}∆`;
  document.getElementById("info_bassfilter").innerHTML = `${Number(value)}∆`;
  bass.lowpass.Q.value = Number(value)
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

reducer.output.normal.connect(eq.input);
mixerNode.connect(eq.input)
mixerNode2.connect(eq.input)
listenMixerNode.connect(eq.input)

mixerNode.connect(reducer.input);
mixerNode2.connect(reducer.input);
listenMixerNode.connect(reducer.input);

mixerNode.connect(bass.input);
mixerNode2.connect(bass.input);
listenMixerNode.connect(bass.input);

// Connect your existing node to center input
mixerNode.connect(centerEffect.input);
mixerNode2.connect(centerEffect.input);
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

// Connect EQ after reducer’s normal path (before destination)
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
  document.getElementById("surroundthreshold_graphic").dataset.boolean = bool;
  reduceThresholdSlider.disabled = bool;
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
  reducer.control(val, channelSwitchValue);
  localStorage.setItem("reduceLevel", val);
  const percent = Math.round(val * 100);
  sendToText(percent);
});

// 🔹 load slider state
const savedValue = localStorage.getItem("reduceLevel");
if (savedValue !== null) {
  reduceSlider.value = savedValue;
  const val = parseFloat(savedValue);
  reducer.control(val, channelSwitchValue);
  const percent = Math.round(val * 100);
  sendToText(percent);
} else {
  reduceSlider.value = 0; // default
  reducer.control(0, channelSwitchValue);
  const percent = 0;
  sendToText(percent);
}

// 🔹 listen for slider changes + save state
reduceSlider.addEventListener("input", () => {
  const val = parseFloat(reduceSlider.value);
  reducer.control(val, channelSwitchValue);
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

const reverb = createReverb(audioCtx);

reverb.setHighPassFreq(500);  // remove more bass from reverb

mixerNode.connect(reverb.input);
mixerNode2.connect(reverb.input);
listenMixerNode.connect(reverb.input);
eq.output.connect(faderNode);
bass.output.connect(limiter);
bass.output.connect(reverb.input2);
reducer.output.normal.connect(faderNode);  // stereo
reducer.output.cancel.connect(faderNode);  // cancel
reverb.output2.connect(limiter);
reverb.output.connect(faderNode);
limiter.connect(audioCtx.destination);
faderNode.connect(audioCtx.destination);

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
mixerNode.connect(masterGain);
mixerNode2.connect(masterGain);
inputMixerNode.connect(masterGain);
outputMixerNode.connect(masterGain);

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
    "vjdyfm-sfxstudio",
    "output"
  );

  console.log("Full SFX JSON path:", jsonPath);
  outputtempDir = jsonPath;
}

getAppDataPath();

document.getElementById("startRec").addEventListener("click", () => {
  startTimer();
  onRecord = true;
  document.getElementById("startRec").style.display = "none";
  document.getElementById("stopRec").style.display = "inherit";

  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onpause = () => { stopTimer(); console.log("Recording paused"); };
  recorder.onresume = () => { startTimer(); console.log("Recording resumed"); };
  recorder.onstop = async () => {
    onRecord = false;
    document.getElementById("stopRec").disabled = true;
    if (!saveRecord) {
      chunks = [];
      document.getElementById("titleDisplay").textContent = "Record";
      document.getElementById("timerDisplay").textContent = "Inactive";

      document.getElementById("startRec").style.display = "inherit";
      document.getElementById("stopRec").style.display = "none";
      document.getElementById("stopRec").disabled = false;
      snackbar("Recording discarded");
      return;
    } else {
      ["formatSelector", "audioWatermark", "bitrateSelector"].forEach(id => {
        document.getElementById(id).disabled = true
      })

      const filePathIntro = path.join(__dirname, "audio", "init.wav");
      const filePathOutro = path.join(__dirname, "audio", "closerecord.wav");

      document.getElementById("titleDisplay").textContent = "Stopped";

      // Merge
      const mergedBuffer = await mergeRecording(filePathIntro, chunks, filePathOutro);

      // Export to desired format
      const saveBasePath = path.join(outputtempDir, generateRecordingFilename());
      const selectedFormat = document.getElementById("formatSelector").value || "audio/wav";
      const outputFile = await exportRecording(mergedBuffer, selectedFormat, saveBasePath);

      console.log("Final exported file:", outputFile);

      ["formatSelector", "audioWatermark", "bitrateSelector"].forEach(id => {
        document.getElementById(id).disabled = false
      })

      // 🎯 Target directory (e.g. "Music/vjdy fm sound effects studio/recordings")
      const saveDir = path.join(os.homedir(), "Music", "VJDY FM Sound Effects Studio Recordings");

      // 🧩 Make sure directory exists
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
      }

      // 📁 Compose final path
      const fileName = path.basename(outputFile);
      const savePath = path.join(saveDir, fileName);

      // 🪄 Copy or write the file
      fs.copyFileSync(outputFile, savePath);

      console.log(`Saved recording to: ${savePath}`);

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

          console.log("Output folder contents cleared.");
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

      document.getElementById("startRec").style.display = "inherit";
      document.getElementById("stopRec").style.display = "none";
      document.getElementById("stopRec").disabled = false;

      chunks = [];
    }
  };

  recorder.start();
  console.log("🎙️ Recording started");
});

document.getElementById("stopRec").addEventListener("click", () => {
  if (recorder && recorder.state !== "inactive") {
    saveRecord = true;
    recorder.stop();
    stopTimer();
    elapsedSeconds = 0;
    console.log("🛑 Recording stopped");
  }
});

document.getElementById("stopRec").addEventListener("contextmenu", () => {
  if (recorder && recorder.state !== "inactive") {
    saveRecord = false;
    recorder.stop();
    stopTimer();
    elapsedSeconds = 0;
  }
});


document.getElementById("startRec").style.display = "inherit";
document.getElementById("stopRec").style.display = "none";

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
    irDecay: savedSettings.irDecay ?? 0.1
  };
  localStorage.setItem("reverbSettings", JSON.stringify(settings));
}

// ======= Controller wrapper =======
const reverbController = {
  setDry(value) { reverb.setDry(value); saveReverbSettings(); },
  setWet(value) { reverb.setWet(value); saveReverbSettings(); },
  setPreDelay(ms) { reverb.setPreDelay(ms); saveReverbSettings(); },
  setRoomSize(mult) { reverb.setRoomSize(mult); saveReverbSettings(); },
  setIR(duration, decay) { reverb.setIR(duration, decay); saveReverbSettings(); }
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

// ======= Reverb visualization (2D) =======
const reverbScreen = document.getElementById("reverbCanvas");
const reverbCtx = reverbScreen.getContext("2d");
const centerX = reverbScreen.width / 2;
const centerY = reverbScreen.height / 2;
let rotAngle = 0;

function drawReverbFX() {
  reverbCtx.clearRect(0, 0, reverbScreen.width, reverbScreen.height);

  const wet = reverb.wet.gain.value;           // 0 -> 1
  const roomSize = reverb.roomSize.gain.value; // 0 -> 3
  const radius = 30 + roomSize * 50;           // cylinder radius
  const lineCount = 16;                        // number of vertical bars
  const glow = 2 + wet * 16;                   // glow based on wet
  const tiltAngle = 35 * Math.PI / 180;        // tilt in radians

  rotAngle += 0.002; // slow rotation

  reverbCtx.save();
  reverbCtx.translate(centerX, centerY);

  const topPoints = [];
  const bottomPoints = [];

  // Compute top/bottom polygons first (scale with roomSize)
  const cylinderHeight = 30 + roomSize * 80; // height of cylinder floors (can scale)
  for (let i = 0; i < lineCount; i++) {
    const angleStep = (Math.PI * 2 / lineCount) * i;
    const x = Math.cos(angleStep + rotAngle) * radius;
    const z = Math.sin(angleStep + rotAngle) * radius;

    const yTop = -cylinderHeight / 2 * Math.cos(tiltAngle) + z * Math.sin(tiltAngle);
    const yBottom = cylinderHeight / 2 * Math.cos(tiltAngle) + z * Math.sin(tiltAngle);

    topPoints.push({ x, y: yTop });
    bottomPoints.push({ x, y: yBottom });
  }

  const isDarkMode = matchMedia('(prefers-color-scheme: dark)').matches;

  // Draw vertical bars connecting top/bottom points
  for (let i = 0; i < lineCount; i++) {
    const top = topPoints[i];
    const bottom = bottomPoints[i];

    reverbCtx.strokeStyle = isDarkMode ? `rgba(223, 255, 147, ${0.2 + wet * 0.8})` : `rgba(107, 122, 73, ${0.2 + wet * 0.8})`;
    reverbCtx.lineWidth = 2;
    reverbCtx.shadowBlur = glow;
    reverbCtx.shadowColor = isDarkMode ? `rgba(223, 255, 147, ${wet})` : `rgba(107, 122, 73, ${wet})`;

    reverbCtx.beginPath();
    reverbCtx.moveTo(top.x, top.y);
    reverbCtx.lineTo(bottom.x, bottom.y);
    reverbCtx.stroke();
  }

  // Draw top polygon
  reverbCtx.beginPath();
  topPoints.forEach((p, i) => (i === 0 ? reverbCtx.moveTo(p.x, p.y) : reverbCtx.lineTo(p.x, p.y)));
  reverbCtx.closePath();
  reverbCtx.stroke();

  // Draw bottom polygon
  reverbCtx.beginPath();
  bottomPoints.forEach((p, i) => (i === 0 ? reverbCtx.moveTo(p.x, p.y) : reverbCtx.lineTo(p.x, p.y)));
  reverbCtx.closePath();
  reverbCtx.stroke();

  reverbCtx.restore();
  requestAnimationFrame(drawReverbFX);
}

drawReverbFX();

const cubeCanvas2 = document.getElementById("subCanvas");
const cubeCtx2 = cubeCanvas2.getContext("2d");
const cubeCenterX = cubeCanvas2.width / 2;
const cubeCenterY = cubeCanvas2.height / 2;
let cubeRotAngle = 0;

function drawCubeFX2() {
  cubeCtx2.clearRect(0, 0, cubeCanvas2.width, cubeCanvas2.height);

  const passValue2 = parseFloat(passSlider.value); // 0-100 scale
  const filterValue2 = parseFloat(filterSlider.value); // -24 -> 12, mapped to opacity

  // Map passSlider: 50 → perfect cube
  const baseSize = 100; // base size for cubeHeight and Depth
  const scaleFactor = passValue2 / 50; // 1 = perfect cube
  const cubeWidth = baseSize * scaleFactor;
  const cubeHeight = baseSize;
  const cubeDepth = baseSize * scaleFactor;

  // Map filterSlider (-24 -> 12) to opacity (0.2 -> 1)
  const opacity = 0.2 + ((filterValue2 + 24) / 36) * 0.8;

  cubeRotAngle += 0.01;

  const perspective = 400; // camera distance
  const topAngle = 0 * Math.PI / 180; // tilt

  const isDarkMode = matchMedia('(prefers-color-scheme: dark)').matches;

  // 3D cube corners
  const corners2 = [];
  for (let i = 0; i < 8; i++) {
    let x = (i & 1 ? 1 : -1) * cubeWidth / 2;
    let y = (i & 2 ? 1 : -1) * cubeHeight / 2;
    let z = (i & 4 ? 1 : -1) * cubeDepth / 2;

    // Rotate X for top tilt
    let yr = y * Math.cos(topAngle) - z * Math.sin(topAngle);
    let zr = y * Math.sin(topAngle) + z * Math.cos(topAngle);

    // Rotate Y
    const xr = x * Math.cos(cubeRotAngle) - zr * Math.sin(cubeRotAngle);
    const zr2 = x * Math.sin(cubeRotAngle) + zr * Math.cos(cubeRotAngle);

    // Perspective projection
    const scale = perspective / (perspective + zr2);
    const screenX = xr * scale + cubeCenterX;
    const screenY = yr * scale + cubeCenterY;
    corners2.push({ x: screenX, y: screenY, z: zr2 });
  }

  // Draw cube edges
  const edges2 = [
    [0, 1], [1, 3], [3, 2], [2, 0], // bottom
    [4, 5], [5, 7], [7, 6], [6, 4], // top
    [0, 4], [1, 5], [2, 6], [3, 7]  // verticals
  ];
  cubeCtx2.lineWidth = 2;
  edges2.forEach(([a, b]) => {
    cubeCtx2.strokeStyle = isDarkMode ? `rgba(223, 255, 147, ${opacity}` : `rgba(107, 122, 73, ${opacity})`;
    cubeCtx2.beginPath();
    cubeCtx2.moveTo(corners2[a].x, corners2[a].y);
    cubeCtx2.lineTo(corners2[b].x, corners2[b].y);
    cubeCtx2.stroke();
  });

  requestAnimationFrame(drawCubeFX2);
}

drawCubeFX2();

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