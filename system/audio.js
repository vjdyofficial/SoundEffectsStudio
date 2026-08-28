const micSelector = document.getElementById('micSelector');
let audioCtx;
let source;
let isReady = false;

window.FUNCTION_UPDATE = [];

var sampleRateSettings = localStorage.getItem("audioCtx_sampleRate") || 44100;
var latencySettings = localStorage.getItem("audioCtx_latencyHint") || 'balanced'
var latencyNumber = localStorage.getItem("audioCtx_latencyNumber") || 0.005

const srOption = document.getElementById("audioCtx_sampleRate_selection");
srOption.addEventListener("change", (e) => {
  localStorage.setItem("audioCtx_sampleRate", e.target.value)
})
srOption.value = sampleRateSettings

const lhOption = document.getElementById("audioCtx_latencyhint_selection");
lhOption.addEventListener("change", (e) => {
  localStorage.setItem("audioCtx_latencyHint", e.target.value)
})
lhOption.value = latencySettings

var latencyUse = latencySettings === 'custom' ? Number(latencyNumber) : latencySettings

const lhaOption = document.getElementById("latencySlider");
const lhaOptionText = document.getElementById("latencySliderText");
lhaOption.addEventListener("input", (e) => {
  localStorage.setItem("audioCtx_latencyNumber", e.target.value)
  lhaOptionText.textContent = e.target.value + "s/buffer"
})

lhaOption.value = latencyNumber;
lhaOption.dispatchEvent(new Event("input"));

try {
  // Create an AudioContext with a latency hint
  audioCtx = new AudioContext({
    latencyHint: latencyUse,
    sampleRate: sampleRateSettings          // optional: request a specific sample rate
  });

  console.log("Requested latency hint:", audioCtx.latencyHint);
  console.log("Actual base latency:", audioCtx.baseLatency, "seconds");
} catch (err) {
  console.error("Failed to create AudioContext:", err);
}

let faderNode = audioCtx.createGain();
faderNode.gain.value = 1;
let feedbackNode = audioCtx.createGain();
feedbackNode.gain.value = 1;
const preamp = audioCtx.createGain();
preamp.gain.value = 1;

let meterMixerNode = audioCtx.createGain(); // your node
meterMixerNode.gain.value = 1.0;
let meterOutputNode = audioCtx.createGain(); // your node
meterOutputNode.gain.value = 1.0;

const pitchNode = PitchShift(audioCtx);
pitchNode.transpose = 0;
const pitchNode2 = PitchShift(audioCtx);
pitchNode2.transpose = 0;

const masterGain = audioCtx.createGain();

let listenStream = null;
let listenSource = null;
let listenMixerGain = audioCtx.createGain(); // dedicated mixer node
listenMixerGain.gain.value = 1.0;

let listenMixerGainA = audioCtx.createGain(); // dedicated mixer node
listenMixerGainA.gain.value = 1.0;

let listenMixerNode = audioCtx.createGain(); // dedicated mixer node
let listenMixerNodeB = audioCtx.createGain(); // dedicated mixer node

const nodeToSurround = audioCtx.createGain();
nodeToSurround.gain.value = 1;
const SurroundtoNode = audioCtx.createGain();
SurroundtoNode.gain.value = 1;

const returnSurroundA = new MicSurroundPan(audioCtx, listenMixerNodeB, nodeToSurround);
const returnSurroundB = new MicSurroundPan(audioCtx, listenMixerNode, nodeToSurround);

function initdegreeAngle(id, node) {
  const input = document.getElementById(id);
  const text = document.getElementById(`${id}_text`);

  input.addEventListener('input', () => {
    node.setAngle(input.value);
    localStorage.setItem(id, input.value);
    text.textContent = `${input.value}°`;
  });

  input.value = localStorage.getItem(id) || 0;
  input.dispatchEvent(new Event('input'));
}

initdegreeAngle('SRS_RETURNA', returnSurroundA);
initdegreeAngle('SRS_RETURNB', returnSurroundB);

let devicechanging = false;

let initialiseApp = false
let currentStream = null; // 🧼 Track the active stream

let savedMicId = localStorage.getItem('preferredMicId') || "-2";

let errorCtx = false;

audioCtx.addEventListener("error", (err) => {
  if (!errorCtx) {
    alert(
      `The AudioContext encountered an error from the audio device or the WebAudio renderer. ` +
      `If you made changes to your audio devices and unable to scan for no reason, ` +
      `Restart the app to try again or exit.`,
      "WebAudio Error!", true, true, true);
    errorCtx = true;
  }
});

function audioDeviceIcons(string) {
  let icon = null;

  if (typeof string === "string") {
    const lower = string.toLowerCase();
    if (lower.includes("usb")) icon = "usb";
    else if (lower.includes("default")) icon = "default";
    else if (lower.includes("communications")) icon = "communications";
    else if (lower.includes("bluetooth")) icon = "bluetooth";
    else if (lower.includes("microphone")) icon = "mic";
    else if (lower.includes("headset")) icon = "headset";
    else if (lower.includes("line in")) icon = "line_in";
    else if (lower.includes("stereo mix")) icon = "stereomix";
    else if (lower.includes("voicemeeter")) icon = "voicemeeter";
    else if (lower.includes("cable")) icon = "cable";
    else icon = "unknown";
  }

  return icon;
}

function outputDeviceIcons(string) {
  let icon = null;

  if (typeof string === "string") {
    const lower = string.toLowerCase();
    if (lower.includes("usb")) icon = "usb";
    else if (lower.includes("default")) icon = "speaker";
    else if (lower.includes("bluetooth")) icon = "bluetooth";
    else if (lower.includes("headphones")) icon = "headphones";
    else if (lower.includes("headset")) icon = "headphones";
    else if (lower.includes("headphone")) icon = "headphones";
    else if (lower.includes("headset")) icon = "headphones";
    else if (lower.includes("speakers")) icon = "speaker";
    else if (lower.includes("voicemeeter")) icon = "voicemeeter";
    else if (lower.includes("cable")) icon = "cable";
    else icon = "tv";
  }

  return icon;
}

const mediaDevices = navigator.mediaDevices; // ✅ single reference
let scanDevices = false;

const outputSelector = document.getElementById('outputSelector');

async function loadOutputDevices() {
  isReady = false;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const audioOutputs = devices.filter(d => d.kind === "audiooutput");
  outputSelector.innerHTML = "";

  // Default option
  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.innerHTML = `<img src="icons/monosource/audiodevices/${outputDeviceIcons("default")}.svg" alt="icon" class="topbar_marginright_btn"> Default`;;
  outputSelector.appendChild(defaultOption);

  audioOutputs.forEach(device => {
    if (
      device.label.startsWith("Default -") ||
      device.label.startsWith("Communications -")
    ) {
      return;
    }

    const option = document.createElement("option");
    option.value = device.deviceId;
    option.innerHTML = `<img src="icons/monosource/audiodevices/${outputDeviceIcons(device.label)}.svg" alt="icon" class="topbar_marginright_btn">${device.label || "Unknown Device"}`;
    outputSelector.appendChild(option);
  });

  const value = localStorage.getItem("preferredOutputDevice") || "default";
  outputSelector.value = value;
  isReady = true;
}

// 🎤 Populate mic dropdown
async function populateList() {
  scanDevices = false;
  navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      micSelector.innerHTML = ''; // Clear previous options

      if (audioInputs.length > 0) {
        // ➖ Add disable option at the top
        const disableOption = document.createElement('option');
        disableOption.value = "-2";
        disableOption.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> Disable`;
        micSelector.appendChild(disableOption);
      }

      // 🎙️ Add mic options
      audioInputs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.innerHTML = `<img src="icons/monosource/audiodevices/${audioDeviceIcons(device.label)}.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> ${device.label}` || `Microphone ${index + 1}`;
        micSelector.appendChild(option);
      });

      if (audioInputs.length === 0) {
        // 🚫 No microphones detected
        micSelector.innerHTML = '';
        const option = document.createElement('option');
        option.value = "-2";
        option.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> No audio devices available`;
        micSelector.appendChild(option);
        micSelector.value = "-2";
        disconnectMic();
        return;
      }

      // 🧠 Restore saved mic or default
      if (savedMicId) {
        micSelector.value = savedMicId;
        savedMicId === "-2" ? disconnectMic() : activateMic(savedMicId);
      } else if (audioInputs[0]) {
        micSelector.value = audioInputs[0].deviceId;
        activateMic(audioInputs[0].deviceId);
      }

      ["micSelector"].forEach(id => {
        document.getElementById(id).disabled = false;
      })
    });
  }).catch(() => {
    if (recorder.state !== "inactive" || recorder.state === "paused") {
      recorder.resume();
      startTimer();
    }
    micSelector.innerHTML = '';
    const option = document.createElement('option');
    option.value = "-2";
    option.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> No audio devices available`;
    micSelector.appendChild(option);
    micSelector.value = "-2";
    disconnectMic();

    ["micSelector"].forEach(id => {
      document.getElementById(id).disabled = false;
    })
  });

  navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      listenSelector.innerHTML = '';

      // ➖ Disable option
      const disableOption = document.createElement('option');
      disableOption.value = "-2";
      disableOption.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> Disable`;
      listenSelector.appendChild(disableOption);

      // 🎧 Add devices
      audioInputs.forEach((device, i) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.innerHTML = `<img src="icons/monosource/audiodevices/${audioDeviceIcons(device.label)}.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> ${device.label}` || `Virtual Input ${i + 1}`;
        listenSelector.appendChild(option);
      });

      // 🧠 Restore saved or default
      if (savedListenId === "-2") {
        // Explicitly disable listen
        listenSelector.value = "-2";
        disconnectListen();
      } else if (audioInputs.some(d => d.deviceId === savedListenId)) {
        // Restore saved valid device
        listenSelector.value = savedListenId;
        activateListen(savedListenId);
      } else if (audioInputs.length > 0) {
        // Fallback to first available device
        listenSelector.value = audioInputs[0].deviceId;
        activateListen(audioInputs[0].deviceId);
      } else {
        // No valid devices at all
        listenSelector.value = "-2";
        disconnectListen();
      }

      document.getElementById('reconnectButton').disabled = false;
      ["listenSelector"].forEach(id => {
        document.getElementById(id).disabled = false;
      })
    });
  }).catch(() => {
    listenSelector.innerHTML = '';
    const option = document.createElement('option');
    option.value = "-2";
    option.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px" class="topbar_marginright_btn"> No audio devices available`;
    listenSelector.appendChild(option);
    listenSelector.value = "-2";
    disconnectListen();

    document.getElementById('reconnectButton').disabled = false;
    ["listenSelector"].forEach(id => {
      document.getElementById(id).disabled = false;
    })
    ipcRenderer.send('video-reconnect', false);
  });

  loadOutputDevices();
}

function refreshConnect() {
  document.getElementById('info_defaultoutput').innerHTML = `Searching...`;
  mediaDevices.enumerateDevices()
    .then(devices => {
      if (recorder.state !== "inactive" || recorder.state === "paused") {
        recorder.resume();
      }
      // Filter only audio outputs
      const audioOutputs = devices.filter(d => d.kind === "audiooutput");

      // Find the default output
      const defaultOutput = audioOutputs.find(d => d.deviceId === "default");

      if (defaultOutput) {
        console.info("Default audio output:", defaultOutput.label);
        document.getElementById('info_defaultoutput').innerHTML = `${defaultOutput.label.replace("Default - ", "")}`;
        if (audioOutputs.find(d => d.deviceId === "usb")) {
          document.getElementById('usbdacIndicator').style.visibility = "visible"
        } else {
          document.getElementById('usbdacIndicator').style.visibility = "hidden"
        }
      } else {
        console.error("No default output found");
        document.getElementById('info_defaultoutput').innerHTML = `No default audio device found`;
      }

      const usbDAC = audioOutputs.find(d =>
        /usb|dac/i.test(d.label)
      );

      const isUsbDAC =
        defaultOutput &&
        /usb|dac/i.test(defaultOutput.label);

      const indicator = document.getElementById('usbdacIndicator');

      if (usbDAC) {
        indicator.style.visibility = "visible";
        console.log("USB DAC detected:", usbDAC.label);
      } else {
        indicator.style.visibility = "hidden";
      }

      ipcRenderer.send('video-reconnect', false);
    })
    .catch(err => {
      console.error("Error enumerating devices:", err);
      document.getElementById('info_defaultoutput').innerHTML = `No default audio device found`;
      ipcRenderer.send('video-reconnect', false);
    });
}

loadOutputDevices();

// Initial population
populateList();
refreshConnect();

async function refreshDevices() {
  // --- Reset selectors to disabled ---
  ["micSelector", "listenSelector"].forEach(id => {
    const sel = document.getElementById(id);
    sel.value = "-2";      // reset to "Disable"
    sel.disabled = true;   // prevent user interaction until populated
  });

  // --- Pause recorder if running ---
  if (recorder.state !== "inactive" && recorder.state === "recording") {
    recorder.pause();
  }

  // --- Notify main process ---
  document.getElementById('reconnectButton').disabled = true;

  // --- Populate new devices ---
  await populateList();
}

// 🔄 Mic change handler
micSelector.addEventListener('change', () => {
  const selectedId = micSelector.value;

  selectedId === "-2" ? disconnectMic() :
    selectedId === savedListenId ? alert('You cannot use same audio devices to input and output. Please use different audio device.', 'Input Device Select Error')
      : activateMic(selectedId);

  if (selectedId != savedListenId || selectedId == "-2" && savedListenId == "-2") {
    const micStore = {
      preferredMicId: selectedId,
      lastUsed: new Date().toISOString(),
      flavor: selectedId === "-2" ? "🔕 Ritual Silence" : "🌀 Ceremonial Loopback"
    };
    localStorage.setItem('micRegistry', JSON.stringify(micStore));
    localStorage.setItem('preferredMicId', selectedId);
    savedMicId = localStorage.getItem('preferredMicId') || "-2";
  } else {
    micSelector.value = savedMicId;
  }
});

// 🎧 Activate mic stream
function activateMic(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  };

  const constraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      latencyHint: 'playback'
    }
  };

  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    currentStream = stream;
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(listenMixerGainA);
    listenMixerGainA.connect(listenMixerNodeB);
    listenMixerGainA.connect(meterOutputNode);
    document.getElementById('info_mic1').innerHTML = `${micSelector.options[micSelector.selectedIndex].textContent}`
    const text = `Audio device stream is now active. <br><code>${micSelector.options[micSelector.selectedIndex].textContent}</code>`;
    snackbar(text); // Show snackbar notification
  }).catch(err => {
    const text = `Audio device stream error. <br><code>${err}</code>`
    snackbar(text); // Show snackbar notification
  });

  console.log('Activated Microphone')
}

// 🔇 Disconnect mic stream
function disconnectMic() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    const text = `Audio device stream is now inactive.`;
    document.getElementById('info_mic1').innerHTML = `null`
    snackbar(text); // Show snackbar notification
  }
}

function disconnectonChange() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    const text = `Audio devices list have new changes. Reconnecting...`;
    snackbar(text); // Show snackbar notification
  }
}

// Assume audioCtx is already created
let noiseSource;
let noiseText = "Suspend AudioContext";

let isgoingtoRestart = true;

audioCtx.onstatechange = () => {
  if (audioCtx.state === "suspended") {
    noiseText = "Resume AudioContext";
  } else if (audioCtx.state === "closed") {
    setTimeout(() => { ipcRenderer.send('window-action', 'close-permanent') }, 500);
  } else if (audioCtx.state === "running") {
    noiseText = "Suspend AudioContext";
  }
};

let total = 0;
let total2 = 0;
let total3 = 0;

// 🔀 Mixer node (GainNode works well for combining)
const mixerNode = audioCtx.createGain();
const mixerExecAnnounce = audioCtx.createGain();

const mixerNode2 = audioCtx.createGain();
mixerNode2.gain.value = 1;

const mixerNodegain = audioCtx.createGain();
mixerNodegain.gain.value = 1;
mixerNodegain.connect(pitchNode2);
pitchNode2.connect(mixerNode2);
pitchNode2.connect(meterOutputNode);
pitchNode2.connect(feedbackNode);
feedbackNode.connect(faderNode);

// gain to dB conversion - preamp
function gainTodB(gain) {
  const val = 20 * Math.log10(gain);
  return `${(val === -Infinity) ? '-inf' : (val === Infinity) ? 'inf' : val.toFixed(1) + "dB"}`;
}

function valueToDb(v) {
  const minDb = -60; // how low your EQ goes
  const maxDb = 0;

  const normalized = (v - (-12)) / (1 - (-12));
  const db = minDb + normalized * (maxDb - minDb);

  return db.toFixed(1) + " dB";
}

function setupPreampSlider(sliderId, valueDisplayId, audioParam, storageKey) {
  // Update on slider move
  sliderId.addEventListener("input", (e) => {
    const value = parseFloat(e.target.value);
    valueDisplayId.textContent = gainTodB(value);
    audioParam.gain.value = value;
    localStorage.setItem(storageKey, e.target.value); // save
  });

  let savedData = parseFloat(localStorage.getItem(storageKey)) || 1;
  sliderId.value = savedData;
  sliderId.dispatchEvent(new Event("input", { bubbles: true }));
}

setupPreampSlider(
  document.getElementById("preamp1"),
  document.getElementById("preampValue1"),
  preamp,
  "preampValue1"
)

const samplergainslider = document.getElementById("samplerGainSlider");
const samplergainvalue = document.getElementById("samplerGainValue");

// Update on slider change
samplergainslider.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  mixerNodegain.gain.value = value;
  samplergainvalue.textContent = gainTodB(value);
  localStorage.setItem("samplergainValue", value);
});

// Load stored value or default to 1
let samplergain = parseFloat(localStorage.getItem("samplergainValue")) || 1;
samplergainslider.value = samplergain;
samplergainslider.dispatchEvent(new Event('input', { bubbles: true }));

function inputLoop() {
  const data = total + total2 + total3;
  if (data <= 0) {
    document.getElementById('micStatus').style.display = "flex";
    document.getElementById('micStatus2').style.display = "flex";
    document.getElementById('micStatus3').style.display = "flex";
  } else {
    document.getElementById('micStatus').style.display = "none";
    document.getElementById('micStatus2').style.display = "none";
    document.getElementById('micStatus3').style.display = "none";
  }
  requestAnimationFrame(inputLoop);
};

inputLoop();

const fixedDeckIds = [
  "executeAnnouncementOn",
  "executeAnnouncementOff",
];

function initFixedDecks() {
  fixedDeckIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) connectFixedMedia(el);
  });
}

const fixedSources = new Map();

function connectFixedMedia(mediaEl) {
  if (fixedSources.has(mediaEl)) return;

  try {
    const source = audioCtx.createMediaElementSource(mediaEl);
    source.connect(mixerExecAnnounce);

    fixedSources.set(mediaEl, source);
  }
  catch (err) {
    console.warn(`Cannot connect ${mediaEl.id}:`, err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initFixedDecks();
});

// Master mixer
const masterGainDack = audioCtx.createGain();
masterGainDack.gain.value = 1; // master volume
masterGainDack.connect(pitchNode);
pitchNode.connect(mixerNode);

masterGainDack.connect(meterOutputNode);

async function initDeckPreload(params) {
  async function initDecks(decks) {
    const deckNodes = {};

    decks.forEach(deck => {
      const mediaEl = document.getElementById(deck.id);
      if (!mediaEl) return;

      // Media source
      const source = audioCtx.createMediaElementSource(mediaEl);

      // Gain node
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = deck.gain ?? 1;

      // Connect chain: source -> gain -> pitchShift -> master
      source.connect(gainNode);
      gainNode.connect(masterGainDack);

      // Save references for later control
      deckNodes[deck.id] = { mediaEl, source, gainNode };
    });

    return deckNodes;
  }

  // Example usage:
  const decksConfig = [
    { id: "MediaExtDeck1", gain: parseFloat(localStorage.getItem("gainValue_MediaExtDeck1")) || 1 },
    { id: "MediaExtDeck2", gain: parseFloat(localStorage.getItem("gainValue_MediaExtDeck2")) || 1 },
    { id: "mediaA", gain: parseFloat(localStorage.getItem("gainValue_mediaA")) || 1 },
    { id: "mediaB", gain: parseFloat(localStorage.getItem("gainValue_mediaB")) || 1 },
    { id: "mediaC", gain: parseFloat(localStorage.getItem("gainValue_mediaC")) || 1 },
    { id: "mediaD", gain: parseFloat(localStorage.getItem("gainValue_mediaD")) || 1 },
  ];

  const deckNodes = await initDecks(decksConfig);

  function setupGainSlider(sliderId, valueDisplayId, deckId) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueDisplayId);
    const gainNode = deckNodes[deckId].gainNode;

    // Update on slider change
    slider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      gainValue = value;
      gainNode.gain.value = gainValue;
      valueDisplay.textContent = gainTodB(value);
      document.getElementById(`audioWaveTime_${deckId}`).style.transform = `scaleY(${gainValue})`

      // Store value per deck
      localStorage.setItem("gainValue_" + deckId, value);
    });

    // Load stored value or default to 1
    let gainValue = parseFloat(localStorage.getItem("gainValue_" + deckId)) || 1;
    slider.value = gainValue;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // --- Example usage ---
  setupGainSlider("gainSlider1", "gainValue1", "MediaExtDeck1");
  setupGainSlider("gainSlider2", "gainValue2", "MediaExtDeck2");
  setupGainSlider("gainSliderA", "gainValueA", "mediaA");
  setupGainSlider("gainSliderB", "gainValueB", "mediaB");
  setupGainSlider("gainSliderC", "gainValueC", "mediaC");
  setupGainSlider("gainSliderD", "gainValueD", "mediaD");
  // repeat for other decks
}

const savedpitch = localStorage.getItem("pitchVolume") || 0;
const pitchSlider = document.getElementById('pitchSlider');
const pitchValue = document.querySelector('.pitchSlider_container');

// Update on slider move
pitchSlider.addEventListener("input", (e) => {
  pitchValue.dataset.value = PitchShiftMap.valueToSemitone(e.target.value) + "st";
  localStorage.setItem("pitchVolume", e.target.value); // save

  pitchNode.transpose = e.target.value <= -0.01 ? (e.target.value * 12) : (e.target.value * 12 - 0.2);
  pitchNode2.transpose = e.target.value <= -0.01 ? (e.target.value * 12) : (e.target.value * 12 - 0.2);

  if (e.target.value == 0) {
    pitchNode.wet.value = 0;
    pitchNode.dry.value = 1;
    pitchNode2.wet.value = 0;
    pitchNode2.dry.value = 1;
  } else {
    pitchNode.wet.value = 1;
    pitchNode.dry.value = 0;
    pitchNode2.wet.value = 1;
    pitchNode2.dry.value = 0;
  }
});

pitchSlider.value = savedpitch;
pitchSlider.dispatchEvent(new Event("input", { bubbles: true }));

setTimeout(() => {
  initDeckPreload()
}, 5000);

//

// === Audio Context Listen Stream Setup ===
// 🎧 Elements
const listenSelector = document.getElementById('listenSelector');

// 🧩 Ensure saved key exists and load value
if (localStorage.getItem('preferredListenId') === null) {
  localStorage.setItem('preferredListenId', "-2"); // default to disable
}
let savedListenId = localStorage.getItem('preferredListenId');

// === Activate Listen Stream ===
function activateListen(deviceId) {
  if (listenStream) {
    listenStream.getTracks().forEach(track => track.stop());
    listenStream = null;
  }
  if (listenSource) {
    try { listenSource.disconnect(); } catch { }
    listenSource = null;
  }

  const constraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      latencyHint: 'playback'
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      listenStream = stream;
      // Connect to AudioContext chain
      listenSource = audioCtx.createMediaStreamSource(stream);
      listenSource.connect(listenMixerGain);
      listenMixerGain.connect(listenMixerNode);
      listenMixerGain.connect(meterOutputNode);
      document.getElementById('info_mic2').innerHTML = `${listenSelector.options[listenSelector.selectedIndex].textContent}`
    })
    .catch(err => snackbar(`Listen error<br><code>${err.message}</code>`));
}

const savedListenGain2 = localStorage.getItem("listengainVolume2") || 1;
const listengainSlider2 = document.getElementById('listengainSlider2');
const listengainValue2 = document.getElementById('listengainValue2');

// Update on slider move
listengainSlider2.addEventListener("input", () => {
  const value = Number(listengainSlider2.value);
  listenMixerGain.gain.value = Number(listengainSlider2.value);
  listengainValue2.textContent = gainTodB(value);
  localStorage.setItem("listengainVolume2", listengainSlider2.value); // save
});

listengainSlider2.value = savedListenGain2;
listengainSlider2.dispatchEvent(new Event("input", { bubbles: true }));

const savedListenGain = localStorage.getItem("listengainVolume") || 1;
const listengainSlider = document.getElementById('listengainSlider');
const listengainValue = document.getElementById('listengainValue');

// Update on slider move
listengainSlider.addEventListener("input", () => {
  const value = Number(listengainSlider.value * 100);
  listenMixerNode.gain.value = Number(listengainSlider.value);
  listengainValue.textContent = `${value.toFixed(0)}%`;
  localStorage.setItem("listengainVolume", listengainSlider.value); // save
});

listengainSlider.value = savedListenGain;
listengainSlider.dispatchEvent(new Event("input", { bubbles: true }));

// === RETRUN A

const savedListenGain2_1 = localStorage.getItem("listengainVolume2_1") || 1;
const listengainSlider2_1 = document.getElementById('listengainSlider2_1');
const listengainValue2_1 = document.getElementById('listengainValue2_1');

// Update on slider move
listengainSlider2_1.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  listenMixerGainA.gain.value = Number(e.target.value);
  listengainValue2_1.textContent = gainTodB(value);
  localStorage.setItem("listengainVolume2_1", e.target.value); // save
});

listengainSlider2_1.value = savedListenGain2_1;
listengainSlider2_1.dispatchEvent(new Event("input", { bubbles: true }));

const savedListenGainA = localStorage.getItem("listengainVolumeA") || 1;
const listengainSlider_1 = document.getElementById('listengainSlider_1');
const listengainValue_1 = document.getElementById('listengainValue_1');

// Update on slider move
listengainSlider_1.addEventListener("input", (e) => {
  const value = Number(e.target.value * 100);
  listenMixerNodeB.gain.value = Number(e.target.value);
  listengainValue_1.textContent = `${value.toFixed(0)}%`;
  localStorage.setItem("listengainVolumeA", e.target.value); // save
});

listengainSlider_1.value = savedListenGainA;
listengainSlider_1.dispatchEvent(new Event("input", { bubbles: true }));

// === Disconnect Listen ===
function disconnectListen() {
  document.getElementById('info_mic2').innerHTML = `null`
  if (listenSource) {
    try { listenSource.disconnect(); } catch { }
    listenSource = null;
  }
  if (listenStream) {
    listenStream.getTracks().forEach(track => track.stop());
    listenStream = null;
  }
}

// === Handle selection changes ===
listenSelector.addEventListener('change', () => {
  const selectedId = listenSelector.value;
  selectedId === "-2" ? disconnectListen() :
    selectedId === savedMicId ? alert('You cannot use same audio devices to input and output. Please use different audio device.', 'Output Device Select Error')
      : activateListen(selectedId);

  if (selectedId != savedMicId || selectedId == "-2" && savedMicId == "-2") {
    localStorage.setItem('preferredListenId', selectedId);
    savedListenId = localStorage.getItem('preferredListenId');
  } else {
    listenSelector.value = savedListenId;
  }
});

document.getElementById('reconnectButton').addEventListener("click", () => {
  refreshDevices();
  devicechanging = false;
});

let timeReconnection = 0;
let ReconnectFunction = null;

mediaDevices.ondevicechange = (() => {
  refreshConnect();
  if (!scanDevices) {
    console.log('Device change trigerred')
    disconnectListen();
    disconnectonChange();  // optional extra cleanup
    ipcRenderer.send('show-text', "Audio devices have new changes. Refreshing in 5s...");
    ipcRenderer.send('video-reconnect', true);
    if (recorder.state !== "inactive" || recorder.state === "recording") {
      recorder.pause();
    }
    scanDevices = true;
    ["micSelector", "listenSelector"].forEach(id => {
      const sel = document.getElementById(id);
      sel.value = "-2";      // reset to "Disable"
      sel.disabled = true;   // prevent user interaction until populated
    });
    document.getElementById('reconnectButton').disabled = true;
    ReconnectFunction = setInterval(() => {
      if (timeReconnection >= 5) {
        refreshDevices();
        timeReconnection = 0;
        clearInterval(ReconnectFunction);
        ReconnectFunction = null;
      } else {
        timeReconnection++;
      }
    }, 1000);
  }
});

const ffmpeg = require("./modules/fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const ffmpegBin = require('ffmpeg-static');

// ------------------------ Helpers ------------------------
function generateRecordingFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `SFXStudio_Recording_${y}-${m}-${d}_${h}-${min}-${s}`;
}

function formatNumber(num) {
  if (num < 1000) return num.toString();
  if (num < 1_000_000) return (num / 1000).toFixed(1) + "k";
  if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1) + "m";
  return (num / 1_000_000_000).toFixed(1) + "b";
}

// Save AudioBuffer → WAV on disk
async function saveBufferAsWav(audioBuffer, filePath) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;

  function writeString(str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset++, str.charCodeAt(i));
  }

  // RIFF header
  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");

  // fmt chunk
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4; // chunk size
  view.setUint16(offset, 1, true); offset += 2;  // PCM format
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true); offset += 2;

  // data chunk
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;

  const batch = 8192; // write little chunks per tick
  let count = 0;

  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let s = audioBuffer.getChannelData(ch)[i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
      count++;

      if (count >= batch) {
        await new Promise(r => setTimeout(r, 0)); // let UI breathe
        count = 0;
        let percent = (i / samples) * 100;
        if (percent > 100) percent = 100;
        document.getElementById("titleDisplay").textContent = "Chunking...";
        document.getElementById("timerDisplay").textContent = `Offset: ${percent.toFixed(1)}%`;
      }
    }

    if (i % batch === 0) {
      await new Promise(r => setTimeout(r, 0)); // let UI breathe
    }
  }

  document.getElementById("titleDisplay").textContent = "Rendering...";
  document.getElementById("timerDisplay").textContent = `--%`;

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Convert ArrayBuffer → Buffer
  const wavBuffer = Buffer.from(buffer);

  // Write in stream chunks with progress
  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    const chunkSize = 64 * 1024; // 64KB per write
    let offset = 0;

    function writeNextChunk() {
      const chunk = wavBuffer.subarray(offset, offset + chunkSize);
      offset += chunkSize;

      // Emit progress % to renderer?
      const percent = Math.min((offset / wavBuffer.length) * 100, 100);
      document.getElementById("titleDisplay").textContent = "Rendering...";
      document.getElementById("timerDisplay").textContent = `${percent.toFixed(1)}%`;

      if (!writeStream.write(chunk)) {
        // backpressure: resume when drained
        writeStream.once("drain", writeNextChunk);
      } else if (offset < wavBuffer.length) {
        // keep writing
        setImmediate(writeNextChunk);
      } else {
        // Done
        writeStream.end();
      }
    }

    writeStream.on("finish", () => {
      resolve();
    });

    writeStream.on("error", reject);

    writeNextChunk();
  });

  return filePath;
}

function handleFFmpegEvents() {
  ipcRenderer.on('ffmpeg-event', async (event, msg) => {
    if (msg.type === 'progress') {
      document.getElementById('timerDisplay').textContent = `${msg.percent.toFixed(1)}%`;
    }
    if (msg.type === 'end') {
      const musicFolder = path.join(os.homedir(), 'Music', 'VJDY FM Sound Effects Studio', 'Recordings');
      await fs.promises.mkdir(musicFolder, { recursive: true });

      const destPath = path.join(musicFolder, path.basename(msg.outputPath));
      if (fs.existsSync(msg.outputPath)) fs.copyFileSync(msg.outputPath, destPath);

      console.log('Conversion finished:', destPath);
      document.getElementById('titleDisplay').textContent = 'Done';
    }
    if (msg.type === 'error') {
      console.error(msg.message);
      document.getElementById('titleDisplay').textContent = 'Error';
    }
  });
}

// Export AudioBuffer → selected format
async function exportRecording(audioBuffer, selectedFormat, saveBasePath) {
  const wavPath = `${saveBasePath}.wav`;
  await saveBufferAsWav(audioBuffer, wavPath);
  return wavPath;
}

// ------------------------ Merge Recording ------------------------
async function mergeRecording(existingFileUrl, recordedChunks, outroFileUrl) {
  const introArrayBuffer = await (await fetch(existingFileUrl)).arrayBuffer();
  const introBuffer = await audioCtx.decodeAudioData(introArrayBuffer);

  const recordedBlob = new Blob(recordedChunks, { type: "audio/webm" });
  const recordedArrayBuffer = await recordedBlob.arrayBuffer();
  const recordedBuffer = await audioCtx.decodeAudioData(recordedArrayBuffer);

  let outroBuffer = null;
  if (outroFileUrl) {
    const outroArrayBuffer = await (await fetch(outroFileUrl)).arrayBuffer();
    outroBuffer = await audioCtx.decodeAudioData(outroArrayBuffer);
  }

  const length = document.getElementById("audioWatermark").checked
    ? introBuffer.length + recordedBuffer.length + (outroBuffer ? outroBuffer.length : 0)
    : recordedBuffer.length;

  const numberOfChannels = Math.max(
    introBuffer.numberOfChannels,
    recordedBuffer.numberOfChannels,
    outroBuffer ? outroBuffer.numberOfChannels : 1
  );

  const sampleRate = introBuffer.sampleRate;
  const finalBuffer = audioCtx.createBuffer(numberOfChannels, length, sampleRate);

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const finalData = finalBuffer.getChannelData(ch);

    if (document.getElementById("audioWatermark").checked) {
      const intro = introBuffer.getChannelData(ch % introBuffer.numberOfChannels);
      finalData.set(intro, 0);

      const recorded = recordedBuffer.getChannelData(ch % recordedBuffer.numberOfChannels);
      finalData.set(recorded, intro.length);

      if (outroBuffer) {
        const outro = outroBuffer.getChannelData(ch % outroBuffer.numberOfChannels);
        finalData.set(outro, intro.length + recorded.length);
      }
    } else {
      const recorded = recordedBuffer.getChannelData(ch % recordedBuffer.numberOfChannels);
      finalData.set(recorded, 0);
    }
  }

  return finalBuffer; // return AudioBuffer for export
}

const { mas } = require('process');

let faderNodeSide = audioCtx.createGain();
faderNodeSide.gain.value = 0.85;
let sideoutputgain = audioCtx.createGain();
sideoutputgain.gain.value = 0.85;
let faderNodeCenter = audioCtx.createGain();
faderNodeCenter.gain.value = 0.65;
let faderNodeLFE = audioCtx.createGain();
faderNodeLFE.gain.value = 0.65;
let faderNodeRear = audioCtx.createGain();
faderNodeRear.gain.value = 1;

const enhancer = createStereoEnhancer(audioCtx);

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

const TrueSRS = TrueSurround(audioCtx, nodeToSurround, SurroundtoNode);
TrueSRS.setWidth(1, 1, 1);

const TrueSRSWidthSliders = ["TRUESRS_WIDTH_FRONT", "TRUESRS_WIDTH_REAR", "TRUESRS_WIDTH_SIDE"]

function setWidthTrue() {
  const v1 = document.getElementById(TrueSRSWidthSliders[0]).value;
  const v2 = document.getElementById(TrueSRSWidthSliders[1]).value;
  const v3 = document.getElementById(TrueSRSWidthSliders[2]).value;

  TrueSRS.setWidth(v1, v2, v3);
}

TrueSRSWidthSliders.forEach(id => {
  const Slider = document.getElementById(id);
  const Text = document.getElementById(id + "_VALUE");

  Slider.addEventListener("input", (e) => {
    setWidthTrue();
    Text.textContent = gainTodB(Number(e.target.value));
    localStorage.setItem(id + "_VALUE", Number(e.target.value))
  })

  const savedValue = localStorage.getItem(id + "_VALUE");

  Slider.value = savedValue !== null
    ? Number(savedValue)
    : 1;
  Slider.dispatchEvent(new Event("input"));
});

mixerNode.connect(nodeToSurround);
mixerNode2.connect(effect_mixerNode);
effect_mixerNode.connect(nodeToSurround);

SurroundtoNode.connect(enhancer.input);
SurroundtoNode.connect(enhancer.input);

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

var SurroundtoDSP = audioCtx.createGain();
SurroundtoDSP.gain.value = 1;

const expand = ExpandSurround(audioCtx, SurroundtoNode, SurroundtoDSP);
enhancer.output.normal.connect(SurroundtoDSP);  // stereo

const SFXSTUDIO_FX_PROCESS01_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS02_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS03_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS04_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS05_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS06_OUT = audioCtx.createGain();

const bass = new BassEffect(audioCtx, SurroundtoDSP, SFXSTUDIO_FX_PROCESS01_OUT)
bass.setGain(0);
bass.setFrequency(100);

const mid = new MidEffect(audioCtx, SFXSTUDIO_FX_PROCESS01_OUT, SFXSTUDIO_FX_PROCESS02_OUT)
mid.setGain(0);
mid.setFrequency(500);

const high = new MidEffect(audioCtx, SFXSTUDIO_FX_PROCESS02_OUT, SFXSTUDIO_FX_PROCESS03_OUT)
high.setGain(0);
high.setFrequency(1000);

const lowcut = new CutoffEffect(audioCtx, SFXSTUDIO_FX_PROCESS03_OUT, SFXSTUDIO_FX_PROCESS04_OUT)

lowcut.setType("lowpass");
lowcut.setFrequency(16000);
lowcut.setQ(0);

const highcut = new CutoffEffect(audioCtx, SFXSTUDIO_FX_PROCESS04_OUT, SFXSTUDIO_FX_PROCESS05_OUT)

highcut.setType("highpass");
highcut.setFrequency(20);
highcut.setQ(0);

function setupPassSlider(param, node, def) {
  const freqSlider = document.getElementById(param + "_SLIDER");
  const freqSliderText = document.getElementById(param + "_VALUE");

  freqSlider.addEventListener("input", (e) => {
    node.setFrequency(Number(e.target.value));
    freqSliderText.textContent = Number(e.target.value) + "Hz";
    localStorage.setItem("SFXSTUDIO_FX_FREQ_" + param, Number(e.target.value));
  });

  const savedFreqValue = localStorage.getItem("SFXSTUDIO_FX_FREQ_" + param);
  freqSlider.value = savedFreqValue !== null
    ? Number(savedFreqValue)
    : def;

  freqSlider.dispatchEvent(new Event("input"));

  const QSlider = document.getElementById(param + "_Q_SLIDER");
  const QSliderText = document.getElementById(param + "_Q_VALUE");

  QSlider.addEventListener("input", (e) => {
    node.setGain(Number(e.target.value));
    QSliderText.textContent = Number(e.target.value);
    localStorage.setItem("SFXSTUDIO_FX_Q_" + param, Number(e.target.value));
  });

  const savedQValue = localStorage.getItem("SFXSTUDIO_FX_Q_" + param);
  QSlider.value = savedQValue !== null
    ? Number(savedQValue)
    : 0;

  QSlider.dispatchEvent(new Event("input"));

  const Switch = document.getElementById(param + "_SWITCH");

  Switch.addEventListener("change", (e) => {
    if (e.target.checked) {
      node.Unbypass();
      localStorage.setItem('SFXSTUDIO_FX_' + param + '_ENABLED', 'true');
    } else {
      node.Bypass();
      localStorage.setItem('SFXSTUDIO_FX_' + param + '_ENABLED', 'false');
    }
  });

  Switch.checked =
    localStorage.getItem('SFXSTUDIO_FX_' + param + '_ENABLED') === 'true';

  Switch.dispatchEvent(new Event("change"));
}

window.CUTOFF_ANIMATIONTIME = 1;

function setupCutoffSlider(param, node, def) {
  const Slider = document.getElementById(param + "_SLIDER");
  const SliderText = document.getElementById(param + "_TEXT");
  Slider.addEventListener("input", (e) => {

    const sliderValue = Number(e.target.value);
    const value = sliderValue * 1000;
    SliderText.textContent =
      (value >= 1000)
        ? (value / 1000 + "kHz")
        : (value + "Hz");
    node.setAnimation(
      value,
      window.CUTOFF_ANIMATIONTIME
    );
    // Save the actual slider value
    localStorage.setItem(
      param + "_CUTOFF_VALUE",
      sliderValue
    );
  });

  const savedValue = localStorage.getItem(
    param + "_CUTOFF_VALUE"
  );
  Slider.value = savedValue !== null
    ? Number(savedValue)
    : def;
  Slider.dispatchEvent(new Event("input"));
}

setupCutoffSlider("LOWCUT", lowcut, 0.02);
setupCutoffSlider("HIGHCUT", highcut, 16);

const AnimationSlider = document.getElementById("ANIMATIONTIME_SLIDER");
const AnimationSliderText = document.getElementById("ANIMATIONTIME_TEXT");

AnimationSlider.addEventListener("input", (e) => {
  window.CUTOFF_ANIMATIONTIME = Number(e.target.value)
  AnimationSliderText.textContent = Number(e.target.value) + "sec/run";
  localStorage.setItem(
    "SFXSTUDIO_FX_CUTOFF_ANIMATIONTIMEVALUE",
    Number(e.target.value)
  );
});

const savedAnimtime =
  localStorage.getItem("SFXSTUDIO_FX_CUTOFF_ANIMATIONTIMEVALUE");

AnimationSlider.value =
  savedAnimtime !== null
    ? Number(savedAnimtime)
    : 0;

AnimationSlider.dispatchEvent(new Event("input"));

const CUTOFF_SWITCH = document.getElementById('CUTOFF_SWITCH');

CUTOFF_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    lowcut.Unbypass();
    highcut.Unbypass();
    localStorage.setItem('SFXSTUDIO_FX_CUTOFF_ENABLED', 'true');
  } else {
    lowcut.Bypass();
    highcut.Bypass();
    localStorage.setItem('SFXSTUDIO_FX_CUTOFF_ENABLED', 'false');
  }
});

CUTOFF_SWITCH.checked =
  localStorage.getItem('SFXSTUDIO_FX_CUTOFF_ENABLED') === 'true';

CUTOFF_SWITCH.dispatchEvent(new Event("change"));

setupPassSlider("BASS", bass, 100);
setupPassSlider("MID", mid, 500);
setupPassSlider("HIGH", high, 1000);

const equalizer = new Equalizer(
  audioCtx,
  SFXSTUDIO_FX_PROCESS05_OUT,
  SFXSTUDIO_FX_PROCESS06_OUT,
);

const reverb = new ReverbEffect(
    audioCtx,
    SFXSTUDIO_FX_PROCESS06_OUT,
    preamp
);

reverb.setDry(1.0);
reverb.setWet(0.35);

const reverbWaveform = document.getElementById('reverbWaveform');

const reverbsliders = [
  "DRY",
  "WET",
  "DIFFUSION",
  "DENSITY",
  "REFLECTION",
  "DELAY",
  "DECAY",
  "RATIO"
]

function setupReverbSliders(param, node, def) {
    const Slider = document.getElementById("REVERB_" + param + "_SLIDER");
    const SliderText = document.getElementById("REVERB_" + param + "_SLIDER_VALUE");

    Slider.addEventListener("input", (e) => {
        const value = Number(e.target.value);
        SliderText.textContent = gainTodB(Number(e.target.value));
        node(value);
        localStorage.setItem( "SFXSTUDIO_FX_VALUE_" + param, value );
    });

    const savedValue = localStorage.getItem( "SFXSTUDIO_FX_VALUE_" + param );
    Slider.value = savedValue !== null ? Number(savedValue) : def;
    Slider.dispatchEvent(new Event("input"));
}

function setIR() {
  let arrayvalue = [];

  for (i = 2; i <= 7; i++) {
    const value = document.getElementById("REVERB_" + reverbsliders[i] + "_SLIDER").value;
    arrayvalue.push(value);
  }

  reverb.setIR(
    arrayvalue[0], 
    arrayvalue[1],
    arrayvalue[2], 
    arrayvalue[3], 
    arrayvalue[4],
    arrayvalue[5],
    reverbWaveform
  )
}

function setupReverbSliders_IR(param, def, unit) {
    const Slider = document.getElementById("REVERB_" + param + "_SLIDER");
    const SliderText = document.getElementById("REVERB_" + param + "_SLIDER_VALUE");

    Slider.addEventListener("change", (e) => {
      setIR();
    });

    Slider.addEventListener("input", (e) => {
        const value = Number(e.target.value);
        SliderText.textContent = Number(e.target.value).toFixed(2) + unit;
        localStorage.setItem( "SFXSTUDIO_FX_VALUE_" + param, value );
    });

    const savedValue = localStorage.getItem( "SFXSTUDIO_FX_VALUE_" + param );

    Slider.value = savedValue !== null ? Number(savedValue) : def;

    Slider.dispatchEvent(new Event("input"));
}

function setupReverbSlidersRatio(param, def) {
    const Slider = document.getElementById("REVERB_" + param + "_SLIDER");
    const SliderText = document.getElementById("REVERB_" + param + "_SLIDER_VALUE");

    Slider.addEventListener("change", (e) => {
      setIR();
    });

    Slider.addEventListener("input", (e) => {
        const value = Number(e.target.value);
        SliderText.textContent = Formats.ratioText(Number(e.target.value));
        localStorage.setItem( "SFXSTUDIO_FX_VALUE_" + param, value );
    });

    const savedValue = localStorage.getItem( "SFXSTUDIO_FX_VALUE_" + param );

    Slider.value = savedValue !== null ? Number(savedValue) : def;

    Slider.dispatchEvent(new Event("input"));
}

setupReverbSliders("DRY", reverb.setDry.bind(reverb), 1);
setupReverbSliders("WET", reverb.setWet.bind(reverb), 0.75);
setupReverbSliders_IR("DIFFUSION", 0.2, "s");
setupReverbSliders_IR("DENSITY", 0.8, "s");
setupReverbSliders_IR("REFLECTION", 0.5, "∆");
setupReverbSliders_IR("DELAY", 0.02, "s");
setupReverbSliders_IR("DECAY", 2.5, "s");
setupReverbSlidersRatio("RATIO", 0.6);

setIR();

const REVERB_SWITCH = document.getElementById('REVERB_SWITCH');

REVERB_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    reverb.Unbypass();
    localStorage.setItem('SFXSTUDIO_FX_REVERB_ENABLED', 'true');
  } else {
    reverb.Bypass();
    localStorage.setItem('SFXSTUDIO_FX_REVERB_ENABLED', 'false');
  }
});

REVERB_SWITCH.checked =
  localStorage.getItem('SFXSTUDIO_FX_REVERB_ENABLED') === 'true';

REVERB_SWITCH.dispatchEvent(new Event("change"));

preamp.connect(faderNode);

const eqSliders = ['eq0', 'eq1', 'eq2', 'eq3', 'eq4', 'eq5', 'eq6', 'eq7', 'eq8', 'eq9', 'eq10', 'eq11']

eqSliders.forEach((slider, band) => {
  const el = document.getElementById(slider);
  const el_text = document.getElementById(slider + "_text");

  el.addEventListener("input", (e) => {
    equalizer.setGain(band, Number(el.value));

    el_text.textContent = Formats.formatDecibelLabel(Number(el.value));

    localStorage.setItem(slider + "BandValue", Number(el.value));
  });

  const savedValue = localStorage.getItem(slider + "BandValue");

  el.value = savedValue !== null
    ? Number(savedValue)
    : 0;

  el.dispatchEvent(new Event("input"));
});

const eqSwitch = document.getElementById('eqSwitch');

eqSwitch.addEventListener("change", (e) => {
  if (e.target.checked) {
    equalizer.Unbypass();
    localStorage.setItem('SFXSTUDIO_FX_EQ_ENABLED', 'true');
  } else {
    equalizer.Bypass();
    localStorage.setItem('SFXSTUDIO_FX_EQ_ENABLED', 'false');
  }
});

eqSwitch.checked =
  localStorage.getItem('SFXSTUDIO_FX_EQ_ENABLED') === 'true';

eqSwitch.dispatchEvent(new Event("change"));

const compressor = new Compressor(audioCtx, faderNode, masterVolume);
compressor.setParameters({
  threshold: -30,
  knee: 24,
  ratio: 4,
  attack: 0.005,
  release: 0.2
});

const compsliders = [
  document.getElementById("compthresholdSlider"),
  document.getElementById("compratioSlider"),
  document.getElementById("compattackSlider"),
  document.getElementById("comprelSlider")
];

const compValue = [
  document.getElementById("compthresholdValue"),
  document.getElementById("compratioValue"),
  document.getElementById("compattackValue"),
  document.getElementById("comprelValue")
];

function setCompParam() {
  compressor.setParameters({
    threshold: compsliders[0].value,
    knee: 24,
    ratio: compsliders[1].value,
    attack: compsliders[2].value,
    release: compsliders[3].value
  });
}

compsliders[0].addEventListener("change", (e) => {
  setCompParam();
  compValue[0].textContent = Number(e.target.value) + "ohm";
  localStorage.setItem(
    "SFXSTUDIO_FX_COMP_THRESHOLD",
    Number(e.target.value)
  );
});

const savedThreshold =
  localStorage.getItem("SFXSTUDIO_FX_COMP_THRESHOLD");

compsliders[0].value =
  savedThreshold !== null
    ? Number(savedThreshold)
    : -30;

compsliders[0].dispatchEvent(new Event("change"));


compsliders[1].addEventListener("change", (e) => {
  setCompParam();
  compValue[1].textContent = Number(e.target.value) + "s";
  localStorage.setItem(
    "SFXSTUDIO_FX_COMP_RATIO",
    Number(e.target.value)
  );
});

const savedRatio =
  localStorage.getItem("SFXSTUDIO_FX_COMP_RATIO");

compsliders[1].value =
  savedRatio !== null
    ? Number(savedRatio)
    : 4;

compsliders[1].dispatchEvent(new Event("change"));


compsliders[2].addEventListener("change", (e) => {
  setCompParam();
  compValue[2].textContent = Number(e.target.value) + "s";
  localStorage.setItem(
    "SFXSTUDIO_FX_COMP_ATTACK",
    Number(e.target.value)
  );
});

const savedAttack =
  localStorage.getItem("SFXSTUDIO_FX_COMP_ATTACK");
compsliders[2].value =
  savedAttack !== null
    ? Number(savedAttack)
    : 0.005;
compsliders[2].dispatchEvent(new Event("change"));


compsliders[3].addEventListener("change", (e) => {
  setCompParam();
  compValue[3].textContent = Number(e.target.value) + "s";
  localStorage.setItem(
    "SFXSTUDIO_FX_COMP_RELEASE",
    Number(e.target.value)
  );
});

const savedRelease =
  localStorage.getItem("SFXSTUDIO_FX_COMP_RELEASE");

compsliders[3].value =
  savedRelease !== null
    ? Number(savedRelease)
    : 0.2;

compsliders[3].dispatchEvent(new Event("change"));

const srsoutputsplitter = audioCtx.createChannelSplitter(8);
const srsoutputmerger = audioCtx.createChannelMerger(8);
const srsspectatemp = audioCtx.createGain();
srsspectatemp.gain.value = 1;

SurroundtoNode.connect(srsspectatemp);
feedbackNode.connect(srsspectatemp);
SurroundtoNode.connect(srsoutputsplitter);

mixerExecAnnounce.connect(masterVolume);
masterVolume.connect(audioCtx.destination);
masterVolume.connect(masterGain)

const savedMaster = localStorage.getItem("masterVolume") || 1;
const masterSlider = document.getElementById('masterSlider');
const masterValue = document.querySelector('.masterSlider_container');

// Update on slider move
masterSlider.addEventListener("input", () => {
  masterVolume.gain.value = Number(masterSlider.value);
  masterValue.dataset.value = gainTodB(masterSlider.value);
  localStorage.setItem("masterVolume", masterSlider.value); // save
});

masterSlider.value = savedMaster;
masterSlider.dispatchEvent(new Event("input", { bubbles: true }));

masterVolume.channelCountMode = "explicit";
masterVolume.channelCount = 8;
masterVolume.channelInterpretation = "discrete";

let inputConnected = true;
let outputConnected = true;

// Suppose this is your master output (gain, filters, etc.)
const dest = audioCtx.createMediaStreamDestination();

// bass.output.connect(masterGain);

masterVolume.connect(dest); // optional recorder
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
  document.getElementById('audioCtx_underruntime').textContent = `${formatTimeFromNumber(audioCtx.playbackStats.underrunDuration)}`
  document.getElementById('info_lostbuffer').textContent = `${audioCtx.playbackStats.underrunEvents}`
}, 1000)

// Default values
const defaults = {
  dry: 0,
  wet: 0,
  preDelay: 0,
  roomSize: 0,
  irDuration: 0.1,
  irDecay: 0.1
};

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
  const valueDisplay2 = document.getElementById(`info_srstrue_${name}`);

  slider.addEventListener('input', () => {
    const gainValue = Number(slider.value);
    gainParam.setTargetAtTime(gainValue, audioCtx.currentTime, 0.05);
    valueDisplay.textContent = gainValue.toFixed(2);
    valueDisplay2.textContent = gainValue.toFixed(2);
    localStorage.setItem(`andromeda_srs_gain_${name}`, gainValue);
  });

  // Load saved value or default
  const initValue = localStorage.getItem(`andromeda_srs_gain_${name}`) || 1;
  slider.value = initValue;
  slider.dispatchEvent(new Event('input', { bubbles: true }));
}

const checkboxUpmix = document.getElementById("UpmixCheckbox");
const upmixValue = document.getElementById('upmixValue');
var isCenterMuted = false;
var isSRSEmulation = false;

// channelAssign holds current channel mapping as both array and string
// order: FRONTLEFT, FRONTRIGHT, CENTER, LFE, REARL, REARR, SIDEL, SIDER
var channelAssign = {
  array: [1, 1, 1, 1, 1, 1, 1, 1],
  string: '11111111'
};

function setSRSValueDownmix() {
  const enabled = checkboxUpmix.value;
  enhancer.downmix['L'] = channelAssign.array[0] != 1 ? 0 : document.getElementById('SRS_FRONTLEFT').value
  enhancer.downmix['R'] = channelAssign.array[1] != 1 ? 0 : document.getElementById('SRS_FRONTRIGHT').value

  if (enabled == "mix" || (enabled == "auto" && audioCtx.destination.maxChannelCount <= 3) || enabled == "true") {
    enhancer.downmix['C'] = channelAssign.array[2] != 1 ? 0 : isCenterMuted ? 0 : document.getElementById('SRS_CENTER').value * upmixValue.value
    enhancer.downmix['LFE'] = channelAssign.array[3] != 1 ? 0 : document.getElementById('SRS_LFE').value * upmixValue.value
    enhancer.downmix['LS'] = channelAssign.array[4] != 1 ? 0 : document.getElementById('SRS_REARL').value * upmixValue.value
    enhancer.downmix['RS'] = channelAssign.array[5] != 1 ? 0 : document.getElementById('SRS_REARR').value * upmixValue.value
    enhancer.downmix['LB'] = channelAssign.array[6] != 1 ? 0 : document.getElementById('SRS_SIDEL').value * upmixValue.value
    enhancer.downmix['RB'] = channelAssign.array[7] != 1 ? 0 : document.getElementById('SRS_SIDER').value * upmixValue.value
  } else if ((enabled == "auto" && audioCtx.destination.maxChannelCount >= 3) || enabled == "false") {
    ['C', 'LFE', 'LS', 'RS', 'LB', 'RB'].forEach(channel => {
      enhancer.downmix[channel] = 0;
    })
  }

  expand.expand.C = channelAssign.array[2] != 1 ? 0 : isCenterMuted ? 0 : document.getElementById('SRS_CENTER').value * upmixValue.value;
  expand.expand.LS = channelAssign.array[4] != 1 ? 0 : document.getElementById('SRS_REARL').value * upmixValue.value;
  expand.expand.RS = channelAssign.array[5] != 1 ? 0 : document.getElementById('SRS_REARR').value * upmixValue.value;
  expand.expand.LB = channelAssign.array[6] != 1 ? 0 : document.getElementById('SRS_SIDEL').value * upmixValue.value;
  expand.expand.RB = channelAssign.array[7] != 1 ? 0 : document.getElementById('SRS_SIDER').value * upmixValue.value
  expand.expand.LFE = channelAssign.array[3] != 1 ? 0 : document.getElementById('SRS_LFE').value * upmixValue.value;
}

checkboxUpmix.addEventListener("change", () => {
  const enabled = checkboxUpmix.value;
  if (enabled == "true") {
    masterVolume.channelCount = 2;
  } else if (enabled == "auto") {
    masterVolume.channelCount = audioCtx.destination.maxChannelCount >= 3 ? 8 : 2;
  } else {
    masterVolume.channelCount = 8;
  }

  setSRSValueDownmix();
  document.getElementById('upMixValueText').textContent = gainTodB(upmixValue.value)

  localStorage.setItem("UpmixEnabled", enabled);
});

checkboxUpmix.checked = localStorage.getItem("UpmixEnabled") === "auto";
checkboxUpmix.dispatchEvent(new Event("change"));

upmixValue.addEventListener('input', () => {
  checkboxUpmix.dispatchEvent(new Event("change"));
  setSRSValueDownmix();
  localStorage.setItem("UpmixValue", upmixValue.value);
})

const savedUpmix = localStorage.getItem("UpmixValue") || 1;

upmixValue.value = Number(savedUpmix);
upmixValue.dispatchEvent(new Event("input", { bubbles: true }));

function updateChannelAssignFromValues(values) {
  const order = ['FRONTLEFT', 'FRONTRIGHT', 'CENTER', 'LFE', 'REARL', 'REARR', 'SIDEL', 'SIDER'];
  const arr = order.map(k => Number(values[k] || 0));
  channelAssign.array = arr;
  channelAssign.string = arr.join('');
}

function bindSRSLayoutButton(buttonId, values) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.addEventListener('click', () => {
    updateChannelAssignFromValues(values);
    setSRSValueDownmix();

    const channels = ['CENTER', 'LFE', 'REARL', 'REARR', 'SIDEL', 'SIDER'];

    for (let i = 0; i < 6; i++) {
      const ch = document.getElementById("SRS_" + channels[i]);
    }
  });
}

const srsLayoutPresets = {
  setsrs_stereo: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 0, LFE: 0, REARL: 0, REARR: 0, SIDEL: 0, SIDER: 0 },
  setsrs_stereolfe: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 0, LFE: 1, REARL: 0, REARR: 0, SIDEL: 0, SIDER: 0 },
  setsrs_three: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 1, LFE: 0, REARL: 0, REARR: 0, SIDEL: 0, SIDER: 0 },
  setsrs_threelfe: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 1, LFE: 1, REARL: 0, REARR: 0, SIDEL: 0, SIDER: 0 },
  setsrs_surround: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 1, LFE: 0, REARL: 1, REARR: 1, SIDEL: 0, SIDER: 0 },
  setsrs_surroundlfe: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 1, LFE: 1, REARL: 1, REARR: 1, SIDEL: 0, SIDER: 0 },
  setsrs_side: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 1, LFE: 0, REARL: 1, REARR: 1, SIDEL: 1, SIDER: 1 },
  setsrs_sidelfe: { FRONTLEFT: 1, FRONTRIGHT: 1, CENTER: 1, LFE: 1, REARL: 1, REARR: 1, SIDEL: 1, SIDER: 1 },
  setsrs_centeronly: { FRONTLEFT: 0, FRONTRIGHT: 0, CENTER: 1, LFE: 0, REARL: 0, REARR: 0, SIDEL: 0, SIDER: 0 },
  setsrs_lfeonly: { FRONTLEFT: 0, FRONTRIGHT: 0, CENTER: 0, LFE: 1, REARL: 0, REARR: 0, SIDEL: 0, SIDER: 0 },
  setsrs_rearonly: { FRONTLEFT: 0, FRONTRIGHT: 0, CENTER: 0, LFE: 0, REARL: 1, REARR: 1, SIDEL: 0, SIDER: 0 },
  setsrs_sideonly: { FRONTLEFT: 0, FRONTRIGHT: 0, CENTER: 0, LFE: 0, REARL: 0, REARR: 0, SIDEL: 1, SIDER: 1 }
};

Object.entries(srsLayoutPresets).forEach(([buttonId, values]) => {
  bindSRSLayoutButton(buttonId, values);
});

function muteCenterChannel(isMuted) {
  isCenterMuted = isMuted;
  setSRSValueDownmix();
}

const muteCenterCheckbox = document.getElementById("MuteCenterCheckbox");

muteCenterCheckbox.addEventListener("change", () => {
  const isMuted = muteCenterCheckbox.checked;
  muteCenterChannel(isMuted);
  localStorage.setItem("CenterMuted", isMuted);
});

const savedCenterMuted = localStorage.getItem("CenterMuted") === "true";
muteCenterCheckbox.checked = savedCenterMuted;
muteCenterCheckbox.dispatchEvent(new Event("change"));

const SRSEmulationCheckbox = document.getElementById("SRSEmulationCheckbox");

SRSEmulationCheckbox.addEventListener("change", (e) => {
  TrueSRS.enableEmulation(e.target.checked);
  document.getElementById("srscompIndicator").style.opacity = e.target.checked ? 1 : 0.25;
  localStorage.setItem("SRSEmulation", e.target.checked);
});

const savedSRSEmulation = localStorage.getItem("SRSEmulation") === "true";
SRSEmulationCheckbox.checked = savedSRSEmulation;
SRSEmulationCheckbox.dispatchEvent(new Event("change"));

function setupSurroundValueFader(channelstring) {
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

function setupStereoValueFader(channelstring) {
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

setupStereoValueFader('FRONTLEFT');
setupStereoValueFader('FRONTRIGHT');
setupSurroundValueFader('CENTER');
setupSurroundValueFader('LFE');
setupSurroundValueFader('REARL');
setupSurroundValueFader('REARR');
setupSurroundValueFader('SIDEL');
setupSurroundValueFader('SIDER');

let skipFrames = 0;
let frameCounter = 0;

const skipFramesSelector = document.getElementById('skipFramesSelector');
const frameratevalue = localStorage.getItem('framerate') || 30;

const VISUALCHECK = document.getElementById('toggleVisualiserCheckbox');
const VUCHECK = document.getElementById('toggleVUMeterCheckbox');
const SRSCHECK = document.getElementById('toggleSurroundCheckbox');

const fftbarsizeSelector = document.getElementById('FFTSizeSelector');
const fftbarsizevalue = localStorage.getItem('fftbarsize') || 128;

const audioCanvas = document.getElementById('audioForm');
const audioCanvasCtx = audioCanvas.getContext('2d', { willReadFrequently: true });

const audioCanvasPreview = document.getElementById('audioFormPreview');
const audioCanvasPreviewCtx = audioCanvasPreview.getContext('2d', { willReadFrequently: true });

const audioCanvasPreview2 = document.getElementById('audioFormPreview2');
const audioCanvasPreviewCtx2 = audioCanvasPreview2.getContext('2d', { willReadFrequently: true });

audioCanvas.width = 512;
audioCanvas.height = 256;

audioCanvasPreview.width = 512;
audioCanvasPreview.height = 256;

audioCanvasPreview2.width = 512;
audioCanvasPreview2.height = 256;

const visualizersplit = audioCtx.createChannelSplitter(8);

const analysermeter = audioCtx.createAnalyser();
analysermeter.fftSize = 512;
var dataArrayMeter = new Uint8Array(analysermeter.frequencyBinCount);
var freqData = new Uint8Array(analysermeter.frequencyBinCount);

function valueToAngle(value) {
  const minValue = 0;    // input minimum
  const maxValue = 120;  // input maximum

  // Clamp the input
  const clamped = Math.min(Math.max(value, minValue), maxValue);

  // Convert to percent
  const percent = (clamped - minValue) / (maxValue - minValue); // 0 → 1

  // Map to angle
  return -45 + percent * 90; // -45 → +45
}

const vuLevels = {
  '#micdev': 0,      // start at min dB
  '#sampler': 0
};

function updateNeedleSmooth(query, rms) {
  const needle = document.querySelector(query);
  const targetDB = rms
  const angle = valueToAngle(targetDB);
  needle.style.transform = `rotate(${angle}deg)`;
}

function getPeak(dataArray) {
  let peak = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const amplitude = Math.abs(dataArray[i] - 128) / 128;
    if (amplitude === 0)
      continue;
    // Standard dBFS, then add 6 dB headroom
    const db = 20 * Math.log10(amplitude) + 6;
    let level;

    if (db <= -30) {
      level = 0;
    } else if (db >= 6) {
      level = 1;
    } else if (db >= 0) {
      // 0 dB -> 0.8
      // +6 dB -> 1.0
      level = 0.8 + (db / 6) * 0.2;
    } else {
      // -30 dB -> 0
      // 0 dB -> 0.8
      level = ((db + 30) / 30) * 0.8;
    }

    if (level > peak)
      peak = level;
  }

  return peak;
}

function getPeakScaled(dataArray) {
  return Math.round(getPeak(dataArray) * 120);
}

let FPS_LIMIT = 60; // default FPS
let RATESKIP = 1; // default FPS
let lastSentTime = 0;

const videoElements = [
  document.getElementById('MediaExtDeck1'),
  document.getElementById('MediaExtDeck2')
];

function updateFPSLimit() {
  // If any video has a src, limit to 48fps; otherwise 60fps
  FPS_LIMIT = videoElements.some(video => video.src) ? 30 : 60;
  RATESKIP = videoElements.some(video => video.src) ? 2 : 1;
}

// Observe changes in the 'src' attribute of each video
videoElements.forEach(video => {
  if (!video) return;
  const observer = new MutationObserver(() => {
    updateFPSLimit();
  });
  observer.observe(video, { attributes: true, attributeFilter: ['src'] });
});

// Initial check
updateFPSLimit();

function drawSpectrum(data) {
  audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
  const barWidth = audioCanvas.width / (Number(fftbarsizeSelector.value) || 255);

  for (let i = 0; i < (Number(fftbarsizeSelector.value) || data.length || 128); i++) {
    const value = data[i];
    const barHeight = (value / 255) * audioCanvas.height;
    const x = i * barWidth;
    const y = audioCanvas.height - barHeight;

    // Example for main audio canvas
    const gradient = audioCanvasCtx.createLinearGradient(x, y, x, y + barHeight);

    // Add three color stops
    gradient.addColorStop(0, onRecord ? micDarkColor : micLightColor);        // top
    gradient.addColorStop(0.5, onRecord ? samplerDarkColor : samplerLightColor);  // middle
    gradient.addColorStop(1, onRecord ? listenDarkColor : listenLightColor);     // bottom

    // Apply gradient
    audioCanvasCtx.fillStyle = gradient;
    audioCanvasCtx.fillRect(x, y, barWidth + 2, barHeight);
  }

  // --- Preview copy ---
  const waveformCopy = audioCanvasCtx.getImageData(0, 0, audioCanvas.width, audioCanvas.height);
  audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
  audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
}

function drawSpectrogram(data) {
  const width = audioCanvas.width;
  const height = audioCanvas.height;
  const columnWidth = 2; // scroll speed per frame

  // --- scroll old image left ---
  const oldImage = audioCanvasCtx.getImageData(columnWidth, 0, width - columnWidth, height);
  audioCanvasCtx.putImageData(oldImage, 0, 0);
  audioCanvasCtx.clearRect(width - columnWidth, 0, columnWidth, height);

  for (let i = 0; i < data.length; i++) {
    const value = data[i] / 255; // normalize 0–1
    const y = height - (i / data.length) * height;

    let r = 0, g = 0, b = 0;

    if (value > 0) {
      const t = value;

      if (t < 0.25) {
        // black → dark violet
        const tt = t / 0.25;
        r = 48 * tt;
        g = 0;
        b = 64 * tt;
      } else if (t < 0.5) {
        // dark violet → magenta
        const tt = (t - 0.25) / 0.25;
        r = 48 + (128 - 48) * tt;
        g = 0;
        b = 64 + (128 - 64) * tt;
      } else if (t < 0.75) {
        // magenta → orange
        const tt = (t - 0.5) / 0.25;
        r = 128 + (255 - 128) * tt;
        g = 0 + (128 - 0) * tt;
        b = 128 - (128 * tt);
      } else if (t < 0.95) {
        // orange → yellow
        const tt = (t - 0.75) / 0.2;
        r = 255;
        g = 128 + (127 * tt); // 128 → 255
        b = 0;
      } else {
        // 0.95 → 1.0 : yellow → white
        const tt = (t - 0.95) / 0.05;
        r = 255;
        g = 255;
        b = 0 + 255 * tt; // subtle white overlay
      }
    }

    audioCanvasCtx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
    audioCanvasCtx.fillRect(
      width - columnWidth,
      y,
      columnWidth,
      height / data.length + 1
    );
  }

  // --- preview copy ---
  const frame = audioCanvasCtx.getImageData(0, 0, width, height);
  audioCanvasPreviewCtx.putImageData(frame, 0, 0);
  audioCanvasPreviewCtx2.putImageData(frame, 0, 0);
}

function prepareDataArray(rawData, maxSamples = 50) {
  if (!rawData || rawData.length === 0) {
    // default to single midline value
    return [128];
  }

  // downsample if too many points
  if (rawData.length > maxSamples) {
    const step = rawData.length / maxSamples;
    const newData = [];
    for (let i = 0; i < maxSamples; i++) {
      newData.push(rawData[Math.floor(i * step)]);
    }
    return newData;
  }

  return rawData;
}

function drawWave(rawDataArray, peak1, peak2) {
  const width = audioCanvas.width;
  const height = audioCanvas.height;
  const scrollWidth = 10;

  const dataArray = prepareDataArray(rawDataArray);

  // --- Scroll ---
  const oldImage = audioCanvasCtx.getImageData(scrollWidth, 0, width - scrollWidth, height);
  audioCanvasCtx.putImageData(oldImage, 0, 0);
  audioCanvasCtx.clearRect(width - scrollWidth, 0, scrollWidth, height);

  // ✅ Combine peaks safely (0–1 expected)
  const peakMix = Math.max(peak1, peak2);

  // ✅ Damping curve (more natural response)
  const damping = 0.025 + (peakMix ** 0.6) * 0.9;
  // range ≈ 0.25 → 1.15

  // ✅ Color mapping (no negatives)
  const hue = 180 * damping;
  const hueRecord = 10 + (170 * -damping);

  for (let i = 0; i < dataArray.length; i++) {

    const x = width - scrollWidth + (i * scrollWidth / dataArray.length);

    const normalized = (dataArray[i] - 128) / 128;
    const barHeight = Math.abs(normalized) * height * 0.5 * damping;

    const yTop = height / 2 - barHeight;
    const yBottom = height / 2 + barHeight;

    audioCanvasCtx.fillStyle =
      onRecord
        ? `hsl(${hueRecord},100%,50%)`
        : `hsl(${hue},100%,50%)`;

    audioCanvasCtx.fillRect(
      x - 2,
      yTop,
      scrollWidth / dataArray.length * 25,
      yBottom - yTop
    );
  }

  // --- Preview copy ---
  const waveformCopy = audioCanvasCtx.getImageData(0, 0, width, height);
  audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
  audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
}

function drawScope(peak1, peak2) {
  const width = audioCanvas.width;
  const height = audioCanvas.height;

  audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);

  rawDataArray = dataArrayMeter;

  // --- peak normalize ---
  const peakMix = Math.max(peak1, peak2);
  const gain = 0.4 + peakMix * 1.6; // never flat

  // --- color ---
  const damping = 0.05 + peakMix ** 0.6;
  const hue = 180 * damping;
  const hueRecord = 10 + (170 * -damping);

  const strokeColor = onRecord
    ? `hsl(${hueRecord},100%,55%)`
    : `hsl(${hue},100%,55%)`;

  audioCanvasCtx.strokeStyle = strokeColor;
  audioCanvasCtx.lineWidth = 7.5;
  audioCanvasCtx.lineJoin = "round";
  audioCanvasCtx.lineCap = "round";

  // --- zero-cross trigger ---
  let trigger = 0;
  for (let i = 1; i < rawDataArray.length; i++) {
    if (rawDataArray[i - 1] < 128 && rawDataArray[i] >= 128) {
      trigger = i;
      break;
    }
  }

  // --- draw line ---
  audioCanvasCtx.beginPath();

  for (let x = 0; x < width; x++) {
    const idx =
      (trigger + Math.floor(x * rawDataArray.length / width)) %
      rawDataArray.length;

    const normalized = (rawDataArray[idx] - 128) / 128;
    const y = height / 2 - normalized * height * 0.46 * gain;

    if (x === 0) audioCanvasCtx.moveTo(x, y);
    else audioCanvasCtx.lineTo(x, y);
  }

  audioCanvasCtx.stroke();

  const waveformCopy = audioCanvasCtx.getImageData(0, 0, width, height);
  audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
  audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
}

let VISUALIZER_TYPE = 0;

function clearBeforeSetVisualizer(index) {
  audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
  audioCanvasPreviewCtx.clearRect(0, 0, audioCanvasPreview.width, audioCanvasPreview.height);
  VISUALIZER_TYPE = index;
  localStorage.setItem('VISUALIZER_TYPE', index)
}

clearBeforeSetVisualizer(Number(localStorage.getItem('VISUALIZER_TYPE')) || 0)

let lasttotal = 0;
let detectNoArray = 0;

let dataL = 0;
let dataR = 0;
const analyserL = audioCtx.createAnalyser();
const analyserR = audioCtx.createAnalyser();
let levelL = 0;
let levelR = 0;
let levelLVU = 0;
let levelRVU = 0;

function updateAudioVisualizer(dataArray, peak1, peak2) {
  if (viz.isExporting()) { return }

  if (!VISUALCHECK.checked) {
    switch (VISUALIZER_TYPE) {
      case 3:
        drawSpectrogram(dataArray);
        break;
      case 2:
        drawScope(peak1, peak2);
        break;
      case 1:
        drawWave(dataArray, peak1, peak2);
        break;
      default:
        drawSpectrum(dataArray);
    }
  } else {
    audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
    const waveformCopy = audioCanvasCtx.getImageData(0, 0, audioCanvas.width, audioCanvas.height);
    audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
    audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
  }
}

function createStereoMeter(audioCtx, sourceNode, meterLeft, meterRight) {
  const splitter = audioCtx.createChannelSplitter(8);

  analyserL.fftSize = 512;
  analyserR.fftSize = 512;

  dataL = new Uint8Array(analyserL.frequencyBinCount);
  dataR = new Uint8Array(analyserR.frequencyBinCount);

  sourceNode.connect(splitter);
  splitter.connect(analyserL, 0);
  splitter.connect(analyserR, 1);
  splitter.connect(analyserL, 2);
  splitter.connect(analyserR, 2);
  splitter.connect(analyserL, 3);
  splitter.connect(analyserR, 3);
  splitter.connect(analyserL, 4);
  splitter.connect(analyserR, 5);
  splitter.connect(analyserL, 6);
  splitter.connect(analyserR, 7);

  let frameuse = null;
  let frameType = 'raf'; // Track current frame type: 'raf' or 'interval'
  let lastFrameTime = 0;
  const frameInterval = 1000 / 60; // 60 fps limit

  function update() {
    analyserL.getByteTimeDomainData(dataL);
    analyserR.getByteTimeDomainData(dataR);
    analysermeter.getByteTimeDomainData(dataArrayMeter);
    analysermeter.getByteFrequencyData(freqData);
    levelL = getPeak(dataL);
    levelR = getPeak(dataR);
    levelLVU = getPeakScaled(dataL);
    levelRVU = getPeakScaled(dataR);
  }

  window.FUNCTION_UPDATE[2] = update;

  return { analyserL, analyserR };
}

let smoothL = 0;
let smoothR = 0;

const release = 0.04; // seconds (meter fall speed)
let lastTime = performance.now();

function updateMeters(levelL, levelR) {
  if (viz.isExporting()) { return }
  updateNeedleSmooth(`#leftvu`, levelLVU);
  updateNeedleSmooth(`#rightvu`, levelRVU);
}

const gainmasterMeter = audioCtx.createGain();
gainmasterMeter.gain.value = 1;
gainmasterMeter.channelCount = 8;

createStereoMeter(audioCtx, gainmasterMeter);

masterVolume.connect(gainmasterMeter);
meterMixerNode.connect(gainmasterMeter);

masterVolume.connect(visualizersplit);
meterMixerNode.connect(visualizersplit);

for (let i = 0; i < 8; i++) {
  visualizersplit.connect(analysermeter, i);
}

let canUpdate = 0;
let intervalVisual = null;
let framerate = 1000 / 60;
let vumeterrate = 1000 / 40;
let VisualFrameUpdate = "raf";
let VisualUpdatesStarted = false;

var lastUpdate = 0;

function startVisualUpdatesonRAF() {
  updateAudioVisualizer(freqData, levelL, levelR);
  total = freqData.reduce((sum, value) => sum + value, 0);
  lasttotal = total;
  updateMeters(levelL, levelR);
};

function createMasterMeter(audioCtx, masterVolumeNode, channels = 8) {
  const splitter = audioCtx.createChannelSplitter(channels);
  masterVolumeNode.connect(splitter);
  const analysers = [];
  const dataArrays = [];
  const compressors = [];

  for (let i = 0; i < channels; i++) {
    const compressor = audioCtx.createDynamicsCompressor();

    // Adjust these to taste
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.3;

    splitter.connect(compressor, i);
    compressor.connect(analyser);

    compressors.push(compressor);
    analysers.push(analyser);
    dataArrays.push(new Uint8Array(analyser.fftSize));
  }

  const channel = new BroadcastChannel("master-meter");
  const peakHold = new Array(channels).fill(0);
  const holdDecay = 0.0025;

  function toDB(value) {
    if (value <= 0) return -Infinity;
    return 20 * Math.log10(value);
  }

  function getPeak(dataArray) {
    let peak = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = Math.abs(dataArray[i] - 128) / 128;
      if (value > peak) peak = value;
    }
    return peak;
  }

  function getPeakScaled(dataArray) {
    return Math.round(getPeak(dataArray) * 120);
  }

  let meterDataSRS = [];

  const channelname = {
    0: "left",
    1: "right",
    2: "center",
    3: "lfe",
    4: "rearleft",
    5: "rearright",
    6: "sideleft",
    7: "sideright"
  };

  var activechannels = [];

  function normalizeDB(db) {
    const min = -45;
    const max = 10;
    return Math.max(0, Math.min(1, (db - min) / (max - min)));
  }

  function drawGainmeter(canvas, value, release = 0.75) {
    const ctx = canvas.getContext("2d");

    value = Math.max(0, Math.min(1, value));

    // Store previous meter value on the canvas
    if (canvas._meterValue === undefined) {
      canvas._meterValue = value;
    }

    // Apply release/decay
    canvas._meterValue += (value - canvas._meterValue) * release;

    const width = canvas.width * (1 - canvas._meterValue);
    const height = canvas.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#181818";

    // Align rectangle to the right/top
    ctx.fillRect(
      canvas.width - width,
      0,
      width,
      height
    );
  }

  function updateMeterUI(channelIndex, peakDB, rmsDB, peakHold) {
    const centerMuted = (channelIndex == 2 && isCenterMuted)

    const meter = document.querySelector(`#meter-${channelIndex}`);
    const meterdb = document.querySelector(`#meterdb-${channelIndex}`);

    meter.value = (centerMuted ? 0 : peakDB);
    drawGainmeter(meterdb, (centerMuted ? 0 : peakDB))
    const setup = document.getElementById(`setup_${channelname[channelIndex]}`);
    if (setup) setup.style.opacity = ((peakDB < 0.01) || (centerMuted)) ? 0 : 1; // Example: disable if no signal
    activechannels[channelIndex] = ((peakDB < 0.01) || (centerMuted)) ? 0 : 1; // Example threshold for active channel
  }

  function updateActiveChannels(channelIndex) {
    const setup = document.getElementById(`setup_${channelname[channelIndex]}`);
    const totalActive = Object.values(activechannels).reduce((sum, val) => sum + val, 0);
  }

  function analyze() {
    const meterData = [];
    analysers.forEach((analyser, i) => {
      analyser.getByteTimeDomainData(dataArrays[i]);

      const peak = getPeak(dataArrays[i]);
      const rms = Math.sqrt(
        dataArrays[i].reduce((sum, v) => {
          const sample = (v - 128) / 128;
          return sum + sample * sample;
        }, 0) / dataArrays[i].length
      );

      // Peak hold logic
      if (peak > peakHold[i]) {
        peakHold[i] = peak;
      } else {
        peakHold[i] -= holdDecay;
        if (peakHold[i] < peak) peakHold[i] = peak;
        if (peakHold[i] < 0) peakHold[i] = 0;
      }

      updateMeterUI(i, peak, toDB(rms), peakHold);
      updateActiveChannels(i);
    });

    if (VUCHECK.checked) {
      channel.postMessage({
        type: "vu",
        channels: meterDataSRS
      });
    }
  }

  window.FUNCTION_UPDATE[1] = analyze;

  return {
    splitter,
    analysers
  };
}

let masterMeter = createMasterMeter(audioCtx, srsspectatemp);

window.FUNCTION_UPDATE[0] = startVisualUpdatesonRAF;

skipFramesSelector.addEventListener('change', () => {
  framerate = 1000 / Number(skipFramesSelector.value);
  localStorage.setItem('framerate', skipFramesSelector.value);
  window.SFXSTUDIO_FRAMERATEVALUE = Number(skipFramesSelector.value);
});

ipcRenderer.on('change_frametype_visual', (event, type) => {
  VisualFrameUpdate = type;
  skipFramesSelector.dispatchEvent(new Event('change')); // trigger initial setup
});

SRSCHECK.addEventListener("change", () => {
  const el = document.getElementById('gainmeterparent');
  el.style.opacity = SRSCHECK.checked ? 0.25 : 1;
  el.title = SRSCHECK.checked ? 'Audio Meter was disabled because Surround Spectator widget is enabled.' : 'Audio Meter';
});

VISUALCHECK.addEventListener("change", (e) => {
  if (e.target.checked) {
    ['visualStatus', 'visualStatus2', 'visualStatus3'].forEach(id => {
      document.getElementById(id).hidden = false;
    })
  } else {
    ['visualStatus', 'visualStatus2', 'visualStatus3'].forEach(id => {
      document.getElementById(id).hidden = true;
    })
  }
});

framerate = 1000 / frameratevalue;
skipFramesSelector.value = frameratevalue;
skipFramesSelector.dispatchEvent(new Event('change')); // trigger initial 
VisualUpdatesStarted = true;

// 📝 Update skipFrames and save to localStorage
fftbarsizeSelector.addEventListener('change', (e) => {
  localStorage.setItem('fftbarsize', e.target.value);
});

fftbarsizeSelector.value = fftbarsizevalue;
fftbarsizeSelector.dispatchEvent(new Event('change')); // trigger initial setup

async function outputDeviceConnect(selectedId) {
  await audioCtx.setSinkId(selectedId);
  audioCtx.destination.channelCount = audioCtx.destination.maxChannelCount || 2;
  audioCtx.destination.channelCountMode = 'explicit';
  audioCtx.destination.channelInterpretation = 'speakers';
  localStorage.setItem("preferredOutputDevice", selectedId);
  document.getElementById('channelname').textContent = getChannelSetupName(audioCtx.destination.maxChannelCount);
  const text = (outputSelector.value == 'default') ?
    `Default audio output has now been used` :
    `The audio device: <strong>${outputSelector.options[outputSelector.options.selectedIndex].label}</strong> is now been used for output`

  snackbar(text + ` with <strong>${getChannelSetupName(audioCtx.destination.maxChannelCount)}</strong> speaker configuration.`, 'Audio Output', 5000)
  document.getElementById('srsType').src = `icons/monosource/${getChannelSetupIcon(audioCtx.destination.maxChannelCount)}.svg`;
  document.getElementById('info_preferreddefaultoutput').textContent = outputSelector.options[outputSelector.options.selectedIndex].label;
  document.getElementById('info_outputchannel').textContent = getChannelSetupName(audioCtx.destination.maxChannelCount);
  checkboxUpmix.dispatchEvent(new Event("change"))
}

outputSelector.addEventListener("change", async () => {
  const selectedId = outputSelector.value;

  try {
    outputDeviceConnect(selectedId);
  } catch (err) {
    console.warn("Failed to set output device. Falling back to default.", err);

    try {
      outputDeviceConnect("default");
    } catch (fallbackErr) {
      console.error("Even default device failed:", fallbackErr);
    }
  }
});

function setDevice() {
  const value = localStorage.getItem("preferredOutputDevice") || "default";
  outputSelector.value = value;
  outputSelector.dispatchEvent(new Event("change"));
}

setTimeout(() => {
  if (!isReady) {
    setTimeout(setDevice, 1000);
  } else {
    setDevice();
  }
}, 5000)

function normalizePath(input) {
  if (!input) return input;

  // remove file:///
  if (input.startsWith("file:///")) {
    input = input.replace("file:///", "");
  }

  // decode URL encoding (%20 → space)
  input = decodeURIComponent(input);

  return input;
}

// START
viz.onStart((job) => {
  ["A", "B", "C", "D"].forEach(id => {
    document.getElementById('stopBtn' + id).click();
  });

  document.getElementById('exportPorgress').textContent = '';
  document.getElementById('exportDialog').show();
});

viz.onProgress((p) => {
  document.getElementById('exportPorgress').textContent = p.raw;
});

// END
viz.onEnd((res) => {
  document.getElementById('exportPorgress').textContent = '';

  if (res.status === 'failed') {
    playRenderSound(false);
  } else {
    snackbar(`Video exported!`);
    playRenderSound(true);
    CloseAnimationInit(document.getElementById('exportDialog'))
  }
});

// ERROR
viz.on("error", (err) => {
  CloseAnimationInit(document.getElementById('exportDialog'));
  alert(err.stack, err.message);
});

var samplerSelectIndex = 1;
var smp = [];

for (let i = 1; i <= 64; i++) {
  const HTML = `
  <div class="sampler_row2">
    <p class="sampler_title" data-sampler="${i}"></p>
    <hr class="spacer">
    <button class="sampler_button remove_sample icon_only" data-sampler="${i}" title="Remove Sample">
        <img src="icons/monosource/eject.svg" width="16px" heigh="16px" class="logo-onprimary">
    </button>
    <button class="sampler_button open_sample icon_only" data-sampler="${i}" title="Load Sample from File">
        <img src="icons/monosource/folder_open.svg" width="16px" heigh="16px" class="logo-onprimary">
    </button>
    <button class="sampler_button open_sample_from_pack icon_only" data-sampler="${i}" title="Load Sample from Pack">
        <img src="icons/monosource/sampler.svg" width="16px" heigh="16px" class="logo-onprimary">
    </button>
  </div>
  <div class="sampler_row1" data-sampler="${i}">
  <canvas class="sampler_waveformview" data-sampler="${i}">
  </div>
  <div class="sampler_row2">
  <hr class="spacerelement">
    <h6 class="monospace_font sampler_gaintext" data-sampler="${i}">0 dB</h6>
    <hr class="spacer">
    <input type="range" class="volume_mixer_slider_mini sampler_gain" data-sampler="${i}" id="gainmark${i}" value="1" min="0.020" max="1" step="0.020">
    <datalist class="invisible" id="gainmark${i}">
        <option value="0"></option>
    </datalist>
  </div>
  <div class="sampler_row2">
    <button class="sampler_button_high play icon_only" data-sampler="${i}" title="Play">
        <img src="icons/monosource/play_arrow.svg" width="18px" height="18px" class="logo-onprimaryfill">
    </button>
    <button class="sampler_button oneshot icon_only" data-sampler="${i}" title="One Shot">
        <img src="icons/monosource/oneshot.svg" width="18px" heigh="18px" class="logo-onprimary">
    </button>
    <button class="sampler_button stop icon_only" data-sampler="${i}" title="Stop">
        <img src="icons/monosource/stop.svg" width="18px" heigh="18px" class="logo-onprimary">
    </button>
    <button class="sampler_button loop icon_only" data-sampler="${i}" title="Toggle Loop">
        <img src="icons/monosource/repeat.svg" width="18px" heigh="18px" class="logo-onprimary">
    </button>
    <hr class="spacer">
    <p class="sampler_timelabel" data-sampler="${i}"></p>
  </div>
  `

  const container = document.querySelector(`.sampler_container[data-sampler="${i}"]`);
  container.innerHTML += HTML;

  const playButton = container.querySelector('.play[data-sampler="' + i + '"]');
  const oneshotButton = container.querySelector('.oneshot[data-sampler="' + i + '"]');
  const stopButton = container.querySelector('.stop[data-sampler="' + i + '"]');
  const removeButton = container.querySelector('.remove_sample[data-sampler="' + i + '"]');
  const openButton = container.querySelector('.open_sample[data-sampler="' + i + '"]');
  const loopButton = container.querySelector('.loop[data-sampler="' + i + '"]');
  const openButton2 = container.querySelector('.open_sample_from_pack[data-sampler="' + i + '"]');
  const title = container.querySelector('.sampler_title[data-sampler="' + i + '"]');
  const time = container.querySelector('.sampler_timelabel[data-sampler="' + i + '"]');
  const waveformCanvas = container.querySelector('.sampler_waveformview[data-sampler="' + i + '"]');
  const waveformContainer = container.querySelector('.sampler_row1[data-sampler="' + i + '"]');
  const gainSlider = container.querySelector('.sampler_gain[data-sampler="' + i + '"]');
  const gainSliderText = container.querySelector('.sampler_gaintext[data-sampler="' + i + '"]');

  smp[i] = new Sampler(audioCtx, mixerNodegain);
  const sampler = smp[i];

  openButton.addEventListener('click', async () => {
    const file = await ipcRenderer.invoke("sampler:openFile")

    if (file) {
      const normalizedPath = normalizePath(file);
      sampler.loadAudio(normalizedPath, waveformCanvas);
      await sampler.loadWaveform(waveformCanvas);
    }
  });

  removeButton.addEventListener('click', () => {
    if (sampler.getSourceFile() === "") { return; }

    choice({
      title: "Security Warning",
      message: "Are you sure you want to remove this sample? This action cannot be undone.",
      onConfirm: () => {
        stopButton.click();
        sampler.unloadAudio(waveformCanvas);
        localStorage.setItem(`SAMPLER_SOURCE_${i}`, "")
        const text = ""
        title.textContent = text;
      }
    });
  });

  sampler.onLoaded = (url) => {
    localStorage.setItem(`SAMPLER_SOURCE_${i}`, url)
    const path = require('path')
    const text = String(path.basename(url));

    title.textContent = text;
    title.title = text;
  }

  playButton.addEventListener('click', () => {
    if (sampler.getSourceFile() === "") { return; }
    sampler.play();
  });

  oneshotButton.addEventListener('click', () => {
    if (sampler.getSourceFile() === "") { return; }
    sampler.oneshot();
  });

  stopButton.addEventListener('click', () => {
    if (sampler.getSourceFile() === "") { return; }
    sampler.stop();
  });

  waveformCanvas.addEventListener("click", (e) => {
    e.preventDefault();
    playButton.click();
  });

  waveformCanvas.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      e.preventDefault();
      if (e.button === 2) {
        oneshotButton.click();
      } else {
        playButton.click();
      }
    }
  });

  waveformCanvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    oneshotButton.click();
  });

  sampler.onState = (e) => {
    if (e.status === "LOOP_ENABLED") {
      loopButton.dataset.enabled = true;
    } else if (e.status === "LOOP_DISABLED") {
      loopButton.dataset.enabled = false;
    } else if (e.status === "PLAYING") {
      container.dataset.playing = true;
    } else {
      container.dataset.playing = false;
    }
  };

  loopButton.addEventListener('click', async () => {
    sampler.toggleLoop();
  });

  gainSlider.addEventListener('input', (e) => {
    sampler.setGain(e.target.value)
    gainSliderText.textContent = gainTodB(e.target.value)
    localStorage.setItem(`SAMPLER_GAIN_${i}`, e.target.value)
  })

  const savedGain = localStorage.getItem(`SAMPLER_GAIN_${i}`) || 1;

  gainSlider.value = savedGain;
  gainSlider.dispatchEvent(new Event('input'));

  openButton2.addEventListener('click', async () => {
    samplerSelectIndex = i;
    ipcRenderer.send('select-soundeffect');
  });

  const savedSource = localStorage.getItem(`SAMPLER_SOURCE_${i}`) || ""
  if (savedSource) {
    sampler.loadAudio(savedSource);
    sampler.loadWaveform(waveformCanvas);
  }

  sampler.onCurrent = (e) => {
    waveformContainer.style.setProperty('--value', e.progress)
    time.textContent = formatTimeFromNumber(e.currentTime);
  };
}

document.getElementById('StopAllAudio').addEventListener('click', (e) => {
  for (let i = 1; i <= 64; i++) {
    const stopButton = document.querySelector('.stop[data-sampler="' + i + '"]');
    stopButton.click();
  }
})

ipcRenderer.on("sfx-selected", async (_, filePath) => {
  const normalizedPath = normalizePath(filePath);
  const waveformCanvas = document.querySelector('.sampler_waveformview[data-sampler="' + samplerSelectIndex + '"]');
  smp[samplerSelectIndex].loadAudio(normalizedPath, waveformCanvas);
  await smp[samplerSelectIndex].loadWaveform(waveformCanvas);
});