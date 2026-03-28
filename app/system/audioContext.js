const micSelector = document.getElementById('micSelector');
let audioCtx;
let source;

audioCtx = new AudioContext({ latencyHint: "interactive" });

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
meterMixerNode.channelCount = 8;
meterMixerNode.gain.value = 1.0;
let meterOutputNode = audioCtx.createGain(); // your node
meterOutputNode.gain.value = 1.0;
meterOutputNode.channelCount = 8;

let listenStream = null;
let listenSource = null;
let listenMixerGain = audioCtx.createGain(); // dedicated mixer node
listenMixerGain.gain.value = 1.0;

let listenMixerNode = audioCtx.createGain(); // dedicated mixer node
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

function outputDeviceConnect(selectedId) {
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
}

async function loadOutputDevices() {
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
  await audioCtx.setSinkId(value);
  outputDeviceConnect(outputSelector.value);
}

outputSelector.addEventListener("change", async () => {
  const selectedId = outputSelector.value;

  try {
    await audioCtx.setSinkId(selectedId);
    outputDeviceConnect(selectedId);
  } catch (err) {
    console.warn("Failed to set output device. Falling back to default.", err);

    try {
      await audioCtx.setSinkId("default");
      outputSelector.value = "default";
      outputDeviceConnect(outputSelector.value);
    } catch (fallbackErr) {
      console.error("Even default device failed:", fallbackErr);
    }
  }
});

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
      channelCount: 8,
      latencyHint: 'playback'
    }
  };

  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    currentStream = stream;
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(inputMixerNode);
    source.connect(meterMixerNode);
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
      channelCount: 8,
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