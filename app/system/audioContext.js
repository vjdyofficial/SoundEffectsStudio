const micSelector = document.getElementById('micSelector');
let audioCtx;
let source;

audioCtx = new (window.AudioContext || window.webkitAudioContext)();
audioCtxforNoise = new (window.AudioContext || window.webkitAudioContext)();

let faderNode = audioCtx.createGain();
faderNode.gain.value = 1

let inputMixerNode = audioCtx.createGain(); // dedicated mixer node
inputMixerNode.gain.value = 1.0;

let meterMixerNode = audioCtx.createGain(); // your node
meterMixerNode.gain.value = 1.0;

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
      "WebAudio Error!", true, true);
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
    else icon = "unknown";
  }

  return icon;
}

const mediaDevices = navigator.mediaDevices; // ✅ single reference
let scanDevices = false;

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

// Suspend/resume to toggle effect
function toggleNoise() {
  if (audioCtx.state === "running") {
    audioCtx.suspend();
  } else if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

audioCtx.onstatechange = () => {
  if (audioCtx.state === "suspended") {
    noiseText = "Resume AudioContext";
    snackbar('AudioContext suspended');
    // --- Start BLEEP (using separate context)
    const osc = audioCtxforNoise.createOscillator();
    const gain = audioCtxforNoise.createGain();

    osc.type = "square";        // bleep style
    osc.frequency.value = 600;  // classic radio beep

    gain.gain.value = 0.05;      // volume
    osc.connect(gain).connect(audioCtxforNoise.destination);

    osc.start();
    noiseSource = { osc, gain }; // store both nodes

  } else if (audioCtx.state === "running") {
    // --- Stop bleep
    if (noiseSource) {
      noiseSource.osc.stop();
      noiseSource.osc.disconnect();
      noiseSource.gain.disconnect();
      noiseSource = null;
      noiseText = "Suspend AudioContext";
      snackbar('AudioContext resumed succesfully');
    }
  }
};

let total = 0;
let total2 = 0;
let total3 = 0;

// 🔀 Mixer node (GainNode works well for combining)
let samplerPitchNode = PitchShift(audioCtx);

const mixerNode = audioCtx.createGain();
mixerNode.connect(faderNode);

const mixerExecAnnounce = audioCtx.createGain();

const mixerNode2 = audioCtx.createGain();
mixerNode2.gain.value = 1;

const mixerNodegain = audioCtx.createGain();
mixerNodegain.gain.value = 1;

samplerPitchNode.connect(mixerNodegain);
mixerNodegain.connect(mixerNode2);
mixerNode2.connect(faderNode);

const savedMasterPitch = localStorage.getItem("masterPitchVolume") || 0;
const masterPitchSlider = document.getElementById('masterPitchSlider');
const masterPitchValue = document.getElementById('masterPitchValue');

const samplergainslider = document.getElementById("samplerGainSlider");
const samplergainvalue = document.getElementById("samplerGainValue");

// Update on slider change
samplergainslider.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  mixerNodegain.gain.value = value;
  samplergainvalue.textContent = Math.round(value * 100) + "%";
  localStorage.setItem("samplergainValue", value);
});

// Load stored value or default to 1
let samplergain = parseFloat(localStorage.getItem("samplergainValue")) || 1;
samplergainslider.value = samplergain;
samplergainslider.dispatchEvent(new Event('input', { bubbles: true }));

// Update on slider move
masterPitchSlider.addEventListener("input", (e) => {
  const value = parseFloat(e.target.value);
  masterPitchValue.textContent = PitchShiftMap.valueToSemitone(e.target.value, 1) + "st";
  samplerPitchNode.transpose = e.target.value <= -0.01 ? (e.target.value * 12) : (e.target.value * 12 - 0.2);

  if (value === 0) {
    samplerPitchNode.wet.value = 0;
    samplerPitchNode.dry.value = 1;
  } else {
    samplerPitchNode.wet.value = 1;
    samplerPitchNode.dry.value = 0;
  }

  localStorage.setItem("masterPitchVolume", e.target.value); // save
});

masterPitchSlider.value = savedMasterPitch;
masterPitchSlider.dispatchEvent(new Event("input", { bubbles: true }));

function inputLoop() {
  const data = total + total2 + total3;
  if (data <= 0) {
    document.getElementById('micStatus').style.display = "flex";
    document.getElementById('micStatus2').style.display = "flex";
  } else {
    document.getElementById('micStatus').style.display = "none";
    document.getElementById('micStatus2').style.display = "none";
  }
  requestAnimationFrame(inputLoop);
};

inputLoop();

const connectedSources = new Map();

function connectMediaElement(mediaEl) {
  if (!connectedSources.has(mediaEl)) {
    try {
      const source = audioCtx.createMediaElementSource(mediaEl);
      source.connect(samplerPitchNode);

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

async function initDeckPreload(params) {
  function initDecks(decks) {
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
    slider.addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      transpose = value;
      valueDisplay.textContent = PitchShiftMap.valueToSemitone(e.target.value, 1) + "st";

      // Set pitchShift values
      pitchNode.transpose = e.target.value <= -0.01 ? (e.target.value * 12) : (e.target.value * 12 - 0.2);

      if (value === 0) {
        pitchNode.wet.value = 0;
        pitchNode.dry.value = 1;
      } else {
        pitchNode.wet.value = 1;
        pitchNode.dry.value = 0;
      }

      // Store value in localStorage
      localStorage.setItem("pitchTranspose_" + deckId, value);
    });

    // 1️⃣ Load stored value or default to 0
    let transpose = parseFloat(localStorage.getItem("pitchTranspose_" + deckId)) || 0;
    slider.value = transpose;
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
      valueDisplay.textContent = Math.round(value * 100) + "%";
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

let listenStream = null;
let listenSource = null;
let listenMixerGain = audioCtx.createGain(); // dedicated mixer node
listenMixerGain.gain.value = 1.0;

let listenMixerNode = audioCtx.createGain(); // dedicated mixer node

let outputMixerNode = audioCtx.createGain(); // dedicated mixer node
outputMixerNode.gain.value = 1.0;

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
            console.log(stream.getAudioTracks())
            // Connect to AudioContext chain
            listenSource = audioCtx.createMediaStreamSource(stream);
            listenSource.connect(listenMixerGain);
            listenMixerGain.connect(listenMixerNode);
            listenMixerNode.connect(faderNode); // optional output
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
  const value = Number(listengainSlider2.value * 100);
  listenMixerGain.gain.value = Number(listengainSlider2.value);
  listengainValue2.textContent = `${value.toFixed(0)}%`;
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
        document.getElementById('audioCtxReconnect').textContent = "Audio devices have new changes. Refreshing in 5s..."
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
                document.getElementById('audioCtxReconnect').textContent = "";
                timeReconnection = 0;
                clearInterval(ReconnectFunction);
                ReconnectFunction = null;
            } else {
                timeReconnection++;
            }
        }, 1000);
    }
});