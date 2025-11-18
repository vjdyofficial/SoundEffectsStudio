// 🔹 elements
const reduceSlider = document.getElementById("reduceSlider");
const channelSelect = document.getElementById("channelTypeSelect");
const savedSwitch = localStorage.getItem("channeltypeSwitch");

// 🧠 Restore saved or default to Stereo
let pitchNode;
let pitchParams;
let channelSwitchValue = savedSwitch ? parseFloat(savedSwitch) || 1 : 1;
channelSelect.value = channelSwitchValue;

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

  const getMultiplierforLowShelf = channelSwitchValue <= 0.7 ? 0 : -6;

  // 🎚️ Bass reducer only for cancel path
  const bassReducer = ctx.createBiquadFilter();
  bassReducer.type = "lowshelf";
  bassReducer.frequency.value = 200; // cutoff around 150 Hz
  bassReducer.gain.value = getMultiplierforLowShelf

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

// Connect EQ after reducer’s normal path (before destination)
reducer.output.normal.connect(eq.input);

// 🔗 Build chain: source -> reducer -> destination
// Replace with your actual stereo source
mixerNode.connect(eq.input)
listenMixerNode.connect(eq.input)

mixerNode.connect(reducer.input);
listenMixerNode.connect(reducer.input);

eq.output.connect(audioCtx.destination);
reducer.output.normal.connect(audioCtx.destination);  // stereo
reducer.output.cancel.connect(audioCtx.destination);  // cancel

function sendToText(percent) {
  const volumeText = document.getElementById('reduceSliderText');
  if (volumeText) {
    volumeText.innerHTML = `${percent}%`;
    document.getElementById('info_srs').innerHTML = `${percent}%`
    document.getElementById('info_srsincrement').innerHTML = `1 / ${parseFloat(channelSelect.value)} = ${1 / parseFloat(channelSelect.value)}∆`
    document.getElementById('info_srsmode').innerHTML = `${channelSelect.options[channelSelect.selectedIndex].textContent}`
  }
}

// 💾 Listen for changes and save
channelSelect.addEventListener("change", () => {
  channelSwitchValue = channelSwitchValue = parseFloat(channelSelect.value) || 1;
  localStorage.setItem("channeltypeSwitch", channelSwitchValue);

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
inputMixerNode.connect(masterGain);
outputMixerNode.connect(masterGain);

masterGain.connect(dest); // optional recorder
let recorder;
recorder = new MediaRecorder(dest.stream);

// Recorder setup
let chunks = [];
let onRecord = false;

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

    ["formatSelector", "audioWatermark", "bitrateSelector"].forEach(id => {
      document.getElementById(id).disabled = true
    })

    const filePathIntro = path.join(__dirname, "audio", "init.wav");
    const filePathOutro = path.join(__dirname, "audio", "closerecord.wav");

    document.getElementById("titleDisplay").textContent = "Stopped";

    // Merge
    const mergedBuffer = await mergeRecording(filePathIntro, chunks, filePathOutro);

    // Export to desired format
    const saveBasePath = path.join(__dirname, "output", generateRecordingFilename());
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
      const outputFolder = path.join(__dirname, "output");

      try {
        await fs.promises.rm(outputFolder, { recursive: true, force: true });
        await fs.promises.mkdir(outputFolder, { recursive: true });
        console.log("Output folder cleaned.");
      } catch (err) {
        console.error("Failed to clean output folder:", err);
      }
    }
    await clearOutputFolder();

    snackbar(`Recording saved!`);

    playRenderSound(true);

    document.getElementById("titleDisplay").textContent = "Record";
    document.getElementById("timerDisplay").textContent = "Inactive";

    document.getElementById("startRec").style.display = "inherit";
    document.getElementById("stopRec").style.display = "none";
    document.getElementById("stopRec").disabled = false;

    chunks = [];
  };

  recorder.start();
  console.log("🎙️ Recording started");
});

document.getElementById("stopRec").addEventListener("click", () => {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
    stopTimer();
    elapsedSeconds = 0;
    console.log("🛑 Recording stopped");
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
  document.getElementById('info_baselatency').textContent = `${audioCtx.baseLatency}ms`;
  document.getElementById('info_outputlatency').textContent = `${audioCtx.outputLatency}ms`;
}, 500)