const micSelector = document.getElementById('micSelector');
let audioCtx;
let source;
let isReady = false;

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
const preampSRS = audioCtx.createGain();
preampSRS.gain.value = 1;
const preamp = audioCtx.createGain();
preamp.gain.value = 1;

let inputMixerNode = audioCtx.createGain(); // dedicated mixer node
inputMixerNode.gain.value = 1.0;
let meterMixerNode = audioCtx.createGain(); // your node
meterMixerNode.gain.value = 1.0;
let meterOutputNode = audioCtx.createGain(); // your node
meterOutputNode.gain.value = 1.0;

let listenStream = null;
let listenSource = null;
let listenMixerGain = audioCtx.createGain(); // dedicated mixer node
listenMixerGain.gain.value = 1.0;

let listenMixerGainA = audioCtx.createGain(); // dedicated mixer node
listenMixerGainA.gain.value = 1.0;

let listenMixerNode = audioCtx.createGain(); // dedicated mixer node
let listenMixerNodeB = audioCtx.createGain(); // dedicated mixer node
let outputMixerNode = audioCtx.createGain(); // dedicated mixer node
outputMixerNode.gain.value = 1.0;

let devicechanging = false;

const peakText = document.getElementById('peaktext');
const avgText = document.getElementById('avgtext');

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
    listenMixerNodeB.connect(outputMixerNode); // optional output
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
mixerNodegain.connect(mixerNode2);
mixerNodegain.connect(meterOutputNode);
mixerNodegain.connect(feedbackNode);
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

setupPreampSlider(
  document.getElementById("preamp2"),
  document.getElementById("preampValue2"),
  preampSRS,
  "preampValue2"
)

const savedMasterPitch = localStorage.getItem("masterPitchVolume") || 0;
const masterPitchSlider = document.getElementById('masterPitchSlider');
const masterPitchValue = document.getElementById('masterPitchValue');

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

const connectedSources = new Map();

function connectMediaElement(mediaEl) {
  if (!connectedSources.has(mediaEl)) {
    try {
      const source = audioCtx.createMediaElementSource(mediaEl);
      source.connect(mixerNodegain);

      const onPause = () => {
        if (mediaEl.currentTime === mediaEl.duration) { }
      };

      mediaEl.addEventListener("pause", onPause);
      connectedSources.set(mediaEl, { source, handlers: { onPause } });

    } catch (err) {
      console.warn("Already connected:", err);
    }
  }
}

function disconnectMediaElement(mediaEl) {
  const entry = connectedSources.get(mediaEl);
  if (!entry) return;

  const { source, handlers } = entry;

  try {
    source.disconnect();
    mediaEl.removeEventListener("pause", handlers.onPause);
    connectedSources.delete(mediaEl);
  } catch (err) {
    console.warn("Disconnect failed:", err);
  }
}

function connectAllStoreDataMedia() {
  const mediaElements = storeData.querySelectorAll("audio, video");
  mediaElements.forEach(el => connectMediaElement(el));
}

document.addEventListener("play", event => {
  if (event.target.closest("#storedata") &&
    ["AUDIO", "VIDEO"].includes(event.target.tagName)) {
    connectMediaElement(event.target);
    startFusionVisualizer();
  }
}, true);

const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    mutation.removedNodes.forEach(node => {

      if (node.nodeType === Node.ELEMENT_NODE) {

        // Direct audio/video removed
        if (node.matches("audio, video")) {
          disconnectMediaElement(node);
        }

        // Nested audio/video removed
        node.querySelectorAll?.("audio, video").forEach(child => {
          disconnectMediaElement(child);
        });
      }
    });
  });
});

observer.observe(storeData, { childList: true, subtree: true });

function startFusionVisualizer() {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  connectAllStoreDataMedia();
}

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
masterGainDack.connect(mixerNode);
masterGainDack.connect(meterOutputNode);

const pitchDeckNode = {};

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

      // Pitch shift node
      const pitchNode = PitchShift(audioCtx);
      pitchNode.transpose = (deck.pitch * 10) ?? 0;
      pitchNode.smoothTranspose = (deck.pitch * 12) ?? 0;

      // Connect chain: source -> gain -> pitchShift -> master
      source.connect(gainNode);
      gainNode.connect(pitchNode);
      pitchDeckNode[deck.id] = pitchNode; // Save for master control
      pitchNode.connect(masterGainDack);

      // Save references for later control
      deckNodes[deck.id] = { mediaEl, source, gainNode, pitchNode };
    });

    return deckNodes;
  }

  // Example usage:
  const decksConfig = [
    { id: "MediaExtDeck1", gain: parseFloat(localStorage.getItem("gainValue_MediaExtDeck1")) || 1, pitch: parseFloat(localStorage.getItem("pitchTranspose_MediaExtDeck1")) || 0 },
    { id: "MediaExtDeck2", gain: parseFloat(localStorage.getItem("gainValue_MediaExtDeck2")) || 1, pitch: parseFloat(localStorage.getItem("pitchTranspose_MediaExtDeck2")) || 0 },
    { id: "mediaA", gain: parseFloat(localStorage.getItem("gainValue_mediaA")) || 1, pitch: parseFloat(localStorage.getItem("pitchTranspose_mediaA")) || 0 },
    { id: "mediaB", gain: parseFloat(localStorage.getItem("gainValue_mediaB")) || 1, pitch: parseFloat(localStorage.getItem("pitchTranspose_mediaB")) || 0 },
    { id: "mediaC", gain: parseFloat(localStorage.getItem("gainValue_mediaC")) || 1, pitch: parseFloat(localStorage.getItem("pitchTranspose_mediaC")) || 0 },
    { id: "mediaD", gain: parseFloat(localStorage.getItem("gainValue_mediaD")) || 1, pitch: parseFloat(localStorage.getItem("pitchTranspose_mediaD")) || 0 },
  ];

  const deckNodes = await initDecks(decksConfig);

  function setupPitchSlider(sliderId, valueDisplayId, deckId) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(valueDisplayId);
    const pitchNode = deckNodes[deckId].pitchNode;

    // 3️⃣ Update on slider change
    slider.addEventListener('change', (e) => {
      const value = parseFloat(e.target.value);
      pitchNode.transpose = e.target.value <= -0.01 ? (e.target.value * 12) : (e.target.value * 12 - 0.2);

      if (value === 0) {
        pitchNode.wet.value = 0;
        pitchNode.dry.value = 1;
      } else {
        pitchNode.wet.value = 1;
        pitchNode.dry.value = 0;
      }
    });

    slider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      transpose = value;
      valueDisplay.textContent = PitchShiftMap.valueToSemitone(e.target.value, 1) + "st";
      localStorage.setItem("pitchTranspose_" + deckId, value);
    });

    // 1️⃣ Load stored value or default to 0
    let transpose = parseFloat(localStorage.getItem("pitchTranspose_" + deckId)) || 0;
    slider.value = transpose;
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // --- Example usage ---
  setupPitchSlider("pitchSliderD", "pitchValueD", "mediaD");
  setupPitchSlider("pitchSliderC", "pitchValueC", "mediaC");
  setupPitchSlider("pitchSliderB", "pitchValueB", "mediaB");
  setupPitchSlider("pitchSliderA", "pitchValueA", "mediaA");
  setupPitchSlider("pitchSlider1", "pitchValue1", "MediaExtDeck1");
  setupPitchSlider("pitchSlider2", "pitchValue2", "MediaExtDeck2");

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
      listenMixerNode.connect(outputMixerNode); // optional output
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

const reduceSlider = document.getElementById("reduceSlider");
const frontSlider = document.getElementById("frontSlider");
const sideSlider = document.getElementById("sideSlider");
const rearSlider = document.getElementById("rearSlider");
const centerSlider = document.getElementById("centerSlider");

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
    const value = Number(slider.value);

    // apply gain
    eq.filters[i].gain.value = eqSwitch.checked ? value : -12
    SET_EQ_SRS(value, i)

    // save
    localStorage.setItem("eqBand" + i, value)
    document.getElementById("eq" + i + "_text").textContent = valueToDb(slider.value);

    // apply Q based on switch
    const Q_SWITCH = eqSwitch.checked ? 1 : -24;
    eq.filters[i].Q.value = Q_SWITCH
    SET_EQ_SRS(value, i)
    SET_EQ_SRS_Q(Q_SWITCH, i)
  })
}

// Load EQ values from storage
eq.filters.forEach((f, i) => {
  const saved = localStorage.getItem("eqBand" + i);
  if (saved !== null) {
    f.gain.value = parseFloat(saved);
    const slider = document.getElementById("eq" + i);
    if (slider) slider.value = saved;
    slider.dispatchEvent(new Event("input"));
  }
});

const savedEqEnabled = localStorage.getItem("eqEnabled");
if (savedEqEnabled !== null) {
  eqSwitch.checked = savedEqEnabled === "1";
}

eqSwitch.addEventListener("change", () => {
  const isEnabled = eqSwitch.checked;
  localStorage.setItem("eqEnabled", isEnabled ? "1" : "0");
  const Q_SWITCH = isEnabled ? 1 : -24 // safer than 0

  for (let i = 0; i < eq.filters.length; i++) {
    const slider = document.getElementById("eq" + i)
    const f = eq.filters[i]
    const value = Number(slider.value);
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
  faderNode.gain.setTargetAtTime(Number(faderSlider.value), audioCtx.currentTime, 0.5);
  faderNode_SRS.gain.setTargetAtTime(Number(faderSlider.value * 0.707), audioCtx.currentTime, 0.5);
  const bool = Number(bassSlider.value) == 0 ? true : false;
  document.getElementById("bassIndicator").style.opacity = Number(bassSlider.value) >= 0.01 ? 1 : 0.25;
  document.getElementById("bassSliderText").innerHTML = gainTodB(bassSlider.value);
  document.getElementById("info_bassgain").innerHTML = gainTodB(bassSlider.value);
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

const nodeToSurround = audioCtx.createGain();
nodeToSurround.gain.value = 1;
const SurroundtoNode = audioCtx.createGain();
SurroundtoNode.gain.value = 1;

const TrueSRS = TrueSurround(audioCtx, nodeToSurround, SurroundtoNode);
TrueSRS.setWidth(0.35);
TrueSRS.setFarLevel(0.25);
TrueSRS.setLFELevel(1);

mixerNode.connect(nodeToSurround);
mixerNode2.connect(effect_mixerNode);
effect_mixerNode.connect(nodeToSurround);
listenMixerNode.connect(nodeToSurround);
listenMixerNodeB.connect(nodeToSurround);

SurroundtoNode.connect(enhancer.input);
side_width.control(0.5);

centerEffect.output.connect(faderNode);
centerEffect.centerNode.gain.value = 0; // start muted

// Connect EQ after enhancer’s normal path (before destination)

const savedCenter = localStorage.getItem("centerGain") || 0;
centerSlider.value = savedCenter;

function sendToText(percent) {
  const volumeText = document.getElementById('reduceSliderText');
  if (volumeText) {
    volumeText.innerHTML = `${percent}%`;

    document.getElementById('info_srs').innerHTML = `${percent}%`
    document.getElementById('info_srsincrement').innerHTML = gainTodB(sideSlider.value);
    document.getElementById('info_srscenter').innerHTML = gainTodB(centerSlider.value);
    document.getElementById('info_srsgain').innerHTML = gainTodB(frontSlider.value);
    document.getElementById('info_srsdouble').innerHTML = gainTodB(rearSlider.value);

    document.getElementById('frontSliderText').innerHTML = gainTodB(frontSlider.value);
    document.getElementById('sideSliderText').innerHTML = gainTodB(sideSlider.value);
    document.getElementById('rearSliderText').innerHTML = gainTodB(rearSlider.value);
  }

  const bool = Number(percent) == 0 ? true : false;
  frontSlider.disabled = bool;
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

bass.output.connect(limiter);
bass.output.connect(reverb.input2);

var SurroundtoDSP = audioCtx.createGain();
SurroundtoDSP.gain.value = 1;

enhancer.output.normal.connect(SurroundtoDSP);  // stereo
enhancer.output.cancel.connect(SurroundtoDSP);  // cancel
enhancer.output.orig.connect(SurroundtoDSP);  // stereo
enhancer.output.adjust.connect(SurroundtoDSP);  // cancel

SurroundtoDSP.connect(reverb.input);
SurroundtoDSP.connect(bass.input);
SurroundtoDSP.connect(centerEffect.input);
SurroundtoDSP.connect(rearEffect.input);
SurroundtoDSP.connect(faderNode);

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
comp.output.connect(masterSound);
masterSound.connect(masterSound2);
masterSound2.connect(masterVolume);

const srsoutputsplitter = audioCtx.createChannelSplitter(8);
const srsoutputmerger = audioCtx.createChannelMerger(8);
const srsspectatemp = audioCtx.createGain();
srsspectatemp.gain.value = 1;

SurroundtoNode.connect(srsspectatemp);
SurroundtoNode.connect(srsoutputsplitter);

const faders = [];

for (let i = 2; i < 8; i++) {
  const fader = audioCtx.createGain();
  faders.push(fader);

  srsoutputsplitter.connect(fader, i);     // take channel i
  fader.connect(srsoutputmerger, 0, i);    // send back to channel i
}

const centerSplitter = audioCtx.createChannelSplitter(8);
const centerMerger = audioCtx.createChannelMerger(8);
const centerChannelGain = audioCtx.createGain();
centerChannelGain.gain.value = 1;

srsoutputmerger.connect(centerSplitter);

for (let i = 0; i < 8; i++) {
  if (i === 2) {
    // Center channel (index 2) routes through gain node for mute control
    centerSplitter.connect(centerChannelGain, i);
    centerChannelGain.connect(centerMerger, 0, i);
  } else {
    // Other channels pass through directly
    centerSplitter.connect(centerMerger, i, i);
  }
}

centerMerger.connect(preampSRS);

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
  cutoff.setFrequency(value * 1000);
  // document.getElementById("info_fader").innerHTML = `${value.toFixed(2)}∆`;
}

// Update on slider move
cutoffSlider.addEventListener("input", () => {
  const value = Number(cutoffSlider.value);

  if (value < 10) {
    cutoffValue.textContent = `${(value * 100).toFixed(0)} Hz`;
    document.getElementById('info_highp').textContent = `${(value * 100).toFixed(0)} Hz`;
  } else {
    cutoffValue.textContent = `${(value).toFixed(2)} kHz`;
    document.getElementById('info_highp').textContent = `${(value).toFixed(2)} kHz`;
  }

  cutoff.setFrequency(value * 1000);
  localStorage.setItem("cutoffGain", value); // save
});

cutoffSlider.dispatchEvent(new Event("input"))

if (savedcutoff2 !== null) {
  cutoffSlider2.value = savedcutoff2;
  const value = Number(cutoffSlider2.value);
  cutoffbass.setFrequency(value * 1000);
  // document.getElementById("info_fader").innerHTML = `${value.toFixed(2)}∆`;
}

// Update on slider move
cutoffSlider2.addEventListener("input", () => {
  const value = Number(cutoffSlider2.value);

  if (value < 10) {
    cutoffValue2.textContent = `${(value * 100).toFixed(0)} Hz`;
    document.getElementById('info_lowp').textContent = `${(value * 100).toFixed(0)} Hz`;
  } else {
    cutoffValue2.textContent = `${(value).toFixed(1)} kHz`;
    document.getElementById('info_lowp').textContent = `${(value).toFixed(1)} kHz`;
  }

  cutoffbass.setFrequency(value * 1000);
  localStorage.setItem("cutoffGain2", value); // save
});

cutoffSlider2.dispatchEvent(new Event("input"))

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
SurroundtoNode.connect(compRecord.input);
inputMixerNode.connect(compRecord.input);
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
  document.getElementById('audioCtx_underruntime').textContent = `${formatTimeFromNumber(audioCtx.playbackStats.underrunDuration)}`
  document.getElementById('info_lostbuffer').textContent = `${audioCtx.playbackStats.underrunEvents}`
}, 1000)

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

function setupSurroundValueFader(channelstring, audioparam, assignarray) {
  const slider = document.getElementById(`SRS_${channelstring}`)
  const text = document.getElementById(`SRS_${channelstring}_text`)

  const state = localStorage.getItem(`andromeda_audiosettings_save_${channelstring}`) || 1;

  slider.addEventListener('input', (e) => {
    audioparam.gain.value = channelAssign.array[assignarray] != 1 ? 0 : e.target.value;
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
setupSurroundValueFader('CENTER', faders[0], 2);
setupSurroundValueFader('LFE', faders[1], 3);
setupSurroundValueFader('REARL', faders[2], 4);
setupSurroundValueFader('REARR', faders[3], 5);
setupSurroundValueFader('SIDEL', faders[4], 6);
setupSurroundValueFader('SIDER', faders[5], 7);

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
      faders[i].gain.value = channelAssign.array[i + 2] != 1 ? 0 : ch.value;
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
  centerChannelGain.gain.value = isMuted ? 0 : 1;
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

let skipFrames = 0;
let frameCounter = 0;

const powerpeakL = document.getElementById('powerpeakL')
const powerpeakR = document.getElementById('powerpeakR')
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

const VUMeter = new BroadcastChannel('vumeter');
const ChannelWidget_External = new BroadcastChannel('widget_external');

audioCanvas.width = 512;
audioCanvas.height = 256;

audioCanvasPreview.width = 512;
audioCanvasPreview.height = 256;

audioCanvasPreview2.width = 512;
audioCanvasPreview2.height = 256;

const visualizersplit = audioCtx.createChannelSplitter(8);

const analysermeter = audioCtx.createAnalyser();
analysermeter.fftSize = 256;
const dataArrayMeter = new Uint8Array(analysermeter.frequencyBinCount);
const freqData = new Uint8Array(analysermeter.frequencyBinCount);

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
    const value = Math.abs(dataArray[i] - 128) / 128;
    if (value > peak) peak = value;
  }
  return peak;
}

function getPeakScaled(dataArray) {
  let peak = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const value = Math.abs(dataArray[i] - 128) / 128; // normalize [-1,1] → [0,1]
    if (value > peak) peak = value;
  }

  // Map 0 → 0 and 1 → 120
  return Math.round(peak * 120);
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

function updateDB(dataArray) {
  total = dataArray.reduce((sum, value) => sum + value, 0);
  lasttotal = total;

  const dBArray = dataArray.map(v => 20 * Math.log10(v || 1));
  const avgDB = (dBArray.reduce((a, b) => a + b, 0) / dBArray.length).toFixed(100);
  avgText.textContent = `${(avgDB - 30).toFixed(1)} dB`;
}

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

    if (!toggleExternal) {
      ChannelWidget_External.postMessage({
        type: 'DATA_ARRAY',
        array: dataArray,
        peaks: { levelL, levelR }  // names must match receiver
      });
    }
  }
}

function createStereoMeter(audioCtx, sourceNode, meterLeft, meterRight) {
  const splitter = audioCtx.createChannelSplitter(8);

  analyserL.fftSize = 256;
  analyserR.fftSize = 256;

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

  function getFrameInterval() {
    update();
  }

  function getFrameonFrame() {
    const now = performance.now();
    if (now - lastFrameTime >= frameInterval) {
      update();
      lastFrameTime = now;
    }
    requestAnimationFrame(getFrameonFrame);
  }

  frameuse = requestAnimationFrame(getFrameonFrame);

  ipcRenderer.on('change_frametype', (event, type) => {
    if (type === 'raf') {
      if (frameType === 'interval') {
        clearInterval(frameuse);
        frameType = 'raf';
        frameuse = requestAnimationFrame(getFrameonFrame);
      }
    } else if (type === 'interval') {
      if (frameType === 'raf') {
        cancelAnimationFrame(frameuse);
        frameType = 'interval';
        frameuse = setInterval(getFrameInterval, 20);
      }
    }
  });

  return { analyserL, analyserR };
}

let smoothL = 0;
let smoothR = 0;

const release = 0.04; // seconds (meter fall speed)
let lastTime = performance.now();

function updateMeters(levelL, levelR) {
  if (viz.isExporting()) { return }

  if (meterL) meterL.style.setProperty('--value', levelL);
  if (meterR) meterR.style.setProperty('--value', levelR);
  updateNeedleSmooth(`#leftvu`, levelLVU);
  updateNeedleSmooth(`#rightvu`, levelRVU);

  if (VUCHECK.checked) {
    VUMeter.postMessage({
      type: 'VU_METER',
      data: { levelLVU, levelRVU }
    });
  }
}

const meterL = document.getElementById("meterL");
const meterR = document.getElementById("meterR");

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

function RevokeVisualUpdates() {
  if (!VisualUpdatesStarted) return;

  if (VisualFrameUpdate === "raf") {
    cancelAnimationFrame(intervalVisual);
  } else {
    clearInterval(intervalVisual);
  }
}

function startVisualUpdates() {
  if (intervalVisual) {
    intervalVisual = null;
    VisualFrameUpdate = "interval";
  }

  intervalVisual = setInterval(() => {
    updateAudioVisualizer(freqData, levelL, levelR);
  }, framerate);
};

function startVisualUpdatesonRAF() {
  if (intervalVisual) {
    clearInterval(intervalVisual);
    intervalVisual = null;
    VisualFrameUpdate = "raf";
  }
  let lastUpdate = 0;
  let lastUpdate2 = 0;
  function loop(timestamp) {
    if (timestamp - lastUpdate >= framerate) {
      updateAudioVisualizer(freqData, levelL, levelR);
      lastUpdate = timestamp;
    }

    if (timestamp - lastUpdate2 >= vumeterrate) {
      updateMeters(levelL, levelR);
      lastUpdate2 = timestamp;
    }
    intervalVisual = requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
};

function createMasterMeter(audioCtx, masterVolumeNode, channels = 8) {
  const splitter = audioCtx.createChannelSplitter(channels);
  masterVolumeNode.connect(splitter);
  const analysers = [];
  const dataArrays = [];

  for (let i = 0; i < channels; i++) {
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.3;

    splitter.connect(analyser, i);

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

  function updateMeterUI(channelIndex, peakDB, rmsDB, peakHold) {
    const meter = document.querySelector(`#meter-${channelIndex}`);
    meter.value = peakDB;
    const setup = document.getElementById(`setup_${channelname[channelIndex]}`);
    if (setup) setup.style.opacity = (peakDB < 0.01) ? 0 : 1; // Example: disable if no signal
    activechannels[channelIndex] = peakDB < 0.01 ? 0 : 1; // Example threshold for active channel
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

  let lastFrameTime = 0;
  let frameRate = (1000 / 24);

  function updateRAF() {
    const now = performance.now();
    if (now - lastFrameTime >= frameRate) {
      analyze();
      lastFrameTime = now;
    }

    requestAnimationFrame(updateRAF);
  }

  var interval = requestAnimationFrame(updateRAF);
  let onpause = false;
  let lastUpdateType = "raf";

  return {
    splitter,
    analysers,
    setUpdate(type, frame) {
      if (type === "raf") {
        if (lastUpdateType === "interval") {
          lastUpdateType = "raf";
          clearInterval(interval);
          interval = null;
          interval = requestAnimationFrame(updateRAF);
        }
      } else if (type === "interval") {
        if (lastUpdateType === "raf") {
          lastUpdateType = "interval";
          cancelAnimationFrame(interval);
          interval = null;
          interval = setInterval(analyze, 16);
        }
      }
    }
  };
}

let masterMeter = createMasterMeter(audioCtx, srsspectatemp);

skipFramesSelector.addEventListener('change', () => {
  framerate = 1000 / Number(skipFramesSelector.value);
  localStorage.setItem('framerate', skipFramesSelector.value);
  RevokeVisualUpdates();

  if (VisualFrameUpdate === "raf") {
    startVisualUpdatesonRAF();
  } else {
    startVisualUpdates();
  }

  masterMeter.setUpdate(VisualFrameUpdate, framerate);
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

setInterval(() => {
  updateDB(freqData);
  const ispL = (levelL >= 0.70)
  powerpeakL.dataset.peak = ispL;
  const ispR = (levelR >= 0.70)
  powerpeakR.dataset.peak = ispR;
}, 150);

// Suspend/resume to toggle effect
function toggleNoise() {
  if (audioCtx.state === "running") {
    audioCtx.suspend();
  } else if (audioCtx.state === "suspended") {
    canUpdate = 0;
    audioCtx.resume();
  }
}

const audioInfoChannel = new BroadcastChannel("sfx-audio-info");

function sendAudioCtxInfo() {
  if (!audioCtx) return;

  audioInfoChannel.postMessage({
    type: "audio-info",
    currentTime: audioCtx.currentTime,
    baseLatency: audioCtx.baseLatency || 0,
    outputLatency: audioCtx.outputLatency || 0,
    sampleRate: audioCtx.sampleRate,
    state: audioCtx.state,
    timestamp: performance.now()
  });
}

// Send every 500ms (don't spam every frame)
setInterval(sendAudioCtxInfo, 2000);

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