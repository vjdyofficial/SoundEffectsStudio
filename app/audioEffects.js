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
  bassReducer.gain.value = -6;      // reduce low-end intensity (not remove entirely)

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
      const norm = value / reduceSlider.max;

      gainL.gain.value = norm;
      gainR.gain.value = norm;

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
    filter.Q.value = 1; // bandwidth
    filter.gain.value = 0; // default flat
    return filter;
  });

  // Chain filters in series
  for (let i = 0; i < filters.length - 1; i++) {
    filters[i].connect(filters[i + 1]);
  }

  // Create limiter (placed after last filter)
  const limiter = ctx.createDynamicsCompressor();

  // Catch boosted bass but keep dynamics
  limiter.threshold.value = -12.0;
  limiter.knee.value = 12.0;
  limiter.ratio.value = 8.0;
  limiter.attack.value = 0.01;
  limiter.release.value = 0.25;

  // Connect EQ → Limiter
  filters[filters.length - 1].connect(limiter);

  return {
    input: filters[0],
    output: limiter,
    filters,
    limiter,
  };
}


// 🔹 Create reducer and EQ
const eq = createEqualizer(audioCtx);

// Connect EQ after reducer’s normal path (before destination)
reducer.output.normal.connect(eq.input);

// 🔗 Build chain: source -> reducer -> destination
// Replace with your actual stereo source
mixerNode.connect(eq.input)
mixerNode.connect(reducer.input);
eq.output.connect(audioCtx.destination);

// use separately
reducer.output.normal.connect(audioCtx.destination);  // stereo
reducer.output.cancel.connect(audioCtx.destination);  // cancel

function sendToText(percent) {
  const volumeText = document.getElementById('reduceSliderText');
  if (volumeText) {
    volumeText.innerHTML = `${percent}%`;
  }
}

// 🔹 elements
const reduceSlider = document.getElementById("reduceSlider");
const channelSwitch = document.getElementById("channeltypeSwitchID");

// 🔹 load checkbox state (force to 1 or 2)
const savedSwitch = localStorage.getItem("channeltypeSwitch");
let channelSwitchValue;

if (savedSwitch !== null) {
  channelSwitchValue = parseInt(savedSwitch, 10) || 1; // fallback to 1 if bad value
  channelSwitch.checked = channelSwitchValue === 2;
} else {
  channelSwitchValue = 1; // default
  channelSwitch.checked = false;
}

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

// 🔹 listen for checkbox toggle + save state
channelSwitch.addEventListener("change", () => {
  channelSwitchValue = channelSwitch.checked ? 2 : 1;
  localStorage.setItem("channeltypeSwitch", channelSwitchValue);

  const val = parseFloat(reduceSlider.value);
  reducer.control(val, channelSwitchValue);
  const percent = Math.round(val * 100);
  sendToText(percent);

  console.log("Channel type switch:", channelSwitchValue);
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
  const savedState = localStorage.getItem("eqQFlat");
  if (savedState !== null) {
    eqSwitch.checked = savedState === "true";
    const isEnabled = eqSwitch.checked;

    eq.filters.forEach((f, i) => {
      f.Q.value = isEnabled ? 1 : 0;
      if (!isEnabled) {
        f.gain.value = -12
      } else {
        const saved = localStorage.getItem("eqBand" + i);
        if (saved !== null) f.gain.value = parseFloat(saved);
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
          if (saved !== null) slider.value = saved;
        }
      }
    }
  }
}
