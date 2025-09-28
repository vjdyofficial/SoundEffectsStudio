const micSelector = document.getElementById('micSelector');
const audioCanvas = document.getElementById('audioForm');
const audioCanvasCtx = audioCanvas.getContext('2d');

const audioCanvasPreview = document.getElementById('audioFormPreview');
const audioCanvasPreviewCtx = audioCanvasPreview.getContext('2d');

audioCanvas.width = 100;
audioCanvas.height = 38;

audioCanvasPreview.width = 100;
audioCanvasPreview.height = 38;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 128;

const dataArray = new Uint8Array(analyser.frequencyBinCount);
const peakText = document.getElementById('peaktext');
const avgText = document.getElementById('avgtext');

// 🖼️ Canvas setup
const audioSFX = document.getElementById('audioSFX');
const ctx2 = audioSFX.getContext('2d');
const audioSFXPreview = document.getElementById('audioSFXPreview');
const ctx2Preview = audioSFXPreview.getContext('2d');

audioSFX.width = 100;
audioSFX.height = 38;

audioSFXPreview.width = 100;
audioSFXPreview.height = 38;

let initialiseApp = false
let currentStream = null; // 🧼 Track the active stream

const savedMicId = localStorage.getItem('preferredMicId') || "-2";

audioCtx.addEventListener("error", (err) => {
    const { ipcRenderer } = require('electron');
    ipcRenderer.invoke('show-audiocontexterror');
});

function GetMicSuccess() {
  initialiseApp = true;
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('request-window-state');
  ipcRenderer.send('window-action', 'initSound');
}

// 🎤 Populate mic dropdown
function populateMicList() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      micSelector.innerHTML = ''; // Clear previous options

      if (audioInputs.length > 0) {
        // ➖ Add disable option at the top
        const disableOption = document.createElement('option');
        disableOption.value = "-2";
        disableOption.textContent = "Disable";
        micSelector.appendChild(disableOption);
      }

      // 🎙️ Add mic options
      audioInputs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent = device.label || `Microphone ${index + 1}`;
        micSelector.appendChild(option);
      });

      if (audioInputs.length === 0) {
        // 🚫 No microphones detected
        micSelector.innerHTML = '';
        const option = document.createElement('option');
        option.value = "-2";
        option.textContent = "No audio devices available";
        micSelector.appendChild(option);
        micSelector.value = "-2";
        disconnectMic();
        GetMicSuccess(); // Still call main to open
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
      
      GetMicSuccess();
    });
  }).catch(() => {
    // 🚫 getUserMedia failed (no permission or no device)
    micSelector.innerHTML = '';
    const option = document.createElement('option');
    option.value = "-2";
    option.textContent = "No audio devices available";
    micSelector.appendChild(option);
    micSelector.value = "-2";
    disconnectMic();
    GetMicSuccess(); // Still call main to open
  });
}

// Initial population
populateMicList();

// Refresh mic list when devices change
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', event => {
    if (initialiseApp) {
      populateMicList();
      disconnectMiconChange();
    }
  });
}

// 🔄 Mic change handler
micSelector.addEventListener('change', () => {
  const selectedId = micSelector.value;

  localStorage.setItem('preferredMicId', selectedId);

  selectedId === "-2" ? disconnectMic() : activateMic(selectedId);

  // 🌀 Ritual registry update
  const micStore = {
    preferredMicId: selectedId,
    lastUsed: new Date().toISOString(),
    flavor: selectedId === "-2" ? "🔕 Ritual Silence" : "🌀 Ceremonial Loopback"
  };
  localStorage.setItem('micRegistry', JSON.stringify(micStore));
});

// 🎧 Activate mic stream
function activateMic(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId } }
  }).then(stream => {
    currentStream = stream;
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    const text = `Audio device stream is now active. <br><code>${micSelector.options[micSelector.selectedIndex].textContent}</code>`;
    snackbar(text); // Show snackbar notification
  }).catch(err => {
    const text = `Audio device stream error. <br><code>${err}</code>`
    snackbar(text); // Show snackbar notification
  });
}

// 🔇 Disconnect mic stream
function disconnectMic() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    const text = `Audio device stream is now inactive.`;
    snackbar(text); // Show snackbar notification
  }
}

function disconnectMiconChange() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
    const text = `Audio devices list have new changes. Reconnecting...`;
    snackbar(text); // Show snackbar notification
  }
}

// 🌈 Draw spectrum
function drawSpectrum(data) {
  audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
  audioCanvasPreviewCtx.clearRect(0, 0, audioCanvasPreview.width, audioCanvasPreview.height);
  const barWidth = audioCanvas.width / data.length;
  const barWidthPreview = audioCanvasPreview.width / data.length;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    const barHeight = (value / 255) * audioCanvas.height;
    const barHeightPreview = (value / 255) * audioCanvasPreview.height;
    const x = i * barWidth;
    const xPrev = i * barWidthPreview;
    const y = audioCanvas.height - barHeight;
    const yPrev = audioCanvasPreview.height - barHeightPreview;

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    audioCanvasCtx.fillStyle = isDarkMode ? micDarkColor : micLightColor;
    audioCanvasCtx.fillRect(x, y, barWidth + 2, barHeight);
    audioCanvasPreviewCtx.fillStyle = isDarkMode ? micDarkColor : micLightColor;
    audioCanvasPreviewCtx.fillRect(xPrev, yPrev, barWidthPreview + 2, barHeightPreview);
  }
}

function sendDatafromMain(dataArray) {
  const { ipcRenderer } = require('electron');

  function sendVisualizerData(dataArray) {
    ipcRenderer.send('send-visualizer-data', dataArray);
  }

  sendVisualizerData(dataArray);
}

let total = 0;
let total2 = 0;

// 🔊 Shared AudioContext and Analyser
const analyser2 = audioCtx.createAnalyser();
analyser2.fftSize = 128;

const dataArray2 = new Uint8Array(analyser2.frequencyBinCount);

// 🔀 Mixer node (GainNode works well for combining)
const mixerNode = audioCtx.createGain();
mixerNode.connect(analyser2);
analyser2.connect(audioCtx.destination); // Optional: allows playback

// 🔗 Keep track of connected sources and listeners
const connectedSources = new Map(); 
// key = audio element, value = { source, handlers }

function connectAudioElement(audioEl) {
  if (!connectedSources.has(audioEl)) {
    try {
      const source = audioCtx.createMediaElementSource(audioEl);
      source.connect(mixerNode);

      // Create handlers
      const onEnded = () => disconnectAudioElement(audioEl);
      const onPause = () => {
        if (audioEl.currentTime === audioEl.duration) {
          disconnectAudioElement(audioEl);
        }
      };

      // Attach listeners
      audioEl.addEventListener("ended", onEnded);
      audioEl.addEventListener("pause", onPause);

      // Save source + handlers
      connectedSources.set(audioEl, { source, handlers: { onEnded, onPause } });

    } catch (err) {
      console.warn("Already connected:", err);
    }
  }
}

function disconnectAudioElement(audioEl) {
  const entry = connectedSources.get(audioEl);
  if (entry) {
    const { source, handlers } = entry;
    try {
      source.disconnect();
      // Remove listeners
      audioEl.removeEventListener("ended", handlers.onEnded);
      audioEl.removeEventListener("pause", handlers.onPause);

      connectedSources.delete(audioEl);
      console.log("🔌 Disconnected and cleaned up:", audioEl.src || "[removed]");
    } catch (err) {
      console.warn("Failed to disconnect:", err);
    }
  }
}

// 🔗 Connect all audio elements (bulk)
function connectAllAudioElements() {
  const audioElements = document.querySelectorAll("audio");
  if (isElectron()) {
    audioElements.forEach(audioEl => {
      connectAudioElement(audioEl);
    });
  }
}

// 🌀 Trigger when any audio plays
document.addEventListener("play", event => {
  if (event.target.tagName === "AUDIO") {
    connectAudioElement(event.target);
    startFusionVisualizer();
  }
}, true);

// 👀 Watch for removed <audio> elements
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    mutation.removedNodes.forEach(node => {
      if (node.tagName === "AUDIO") {
        disconnectAudioElement(node);
      }
    });
  });
});

observer.observe(document.body, { childList: true, subtree: true });


// 🌈 Draw combined waveform
function drawSpectrum2(data) {
  ctx2.clearRect(0, 0, audioSFX.width, audioSFX.height);
  ctx2Preview.clearRect(0, 0, audioSFX.width, audioSFX.height);

  const barWidth = audioSFX.width / data.length;
  const barWidthPreview = audioSFXPreview.width / data.length;

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    const barHeight = (value / 255) * audioSFX.height;
    const barHeightPreview = (value / 255) * audioSFX.height;
    const x = i * barWidth;
    const xPrev = i * barWidth;
    const y = audioSFX.height - barHeight;
    const yPrev = audioSFXPreview.height - barHeightPreview;

    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (isDarkMode) {
      ctx2.fillStyle = samplerDarkColor;
      ctx2.fillRect(x, y, barWidth + 2, barHeight);
      ctx2Preview.fillStyle = samplerDarkColor;
      ctx2Preview.fillRect(xPrev, yPrev, barWidthPreview + 2, barHeightPreview);
    } else {
      ctx2.fillStyle = samplerLightColor;
      ctx2.fillRect(x, y, barWidth + 2, barHeight);
      ctx2Preview.fillStyle = samplerLightColor;
      ctx2Preview.fillRect(xPrev, yPrev, barWidthPreview + 2, barHeightPreview);
    }
  }
}

const avgText2 = document.getElementById('avgtext2');

function sendDatafromMain2(dataArray) {
  const { ipcRenderer } = require('electron');
  function sendVisualizerData2(dataArray) {
    ipcRenderer.send('send-visualizer-data2', dataArray);
  }
  sendVisualizerData2(dataArray);
}

// 🔁 Visualizer loop
function updateAudioVisualizer() {
  analyser.getByteFrequencyData(dataArray);
  drawSpectrum(dataArray);
  sendDatafromMain(dataArray);

  total = dataArray.reduce((sum, value) => sum + value, 0);
  const dBArray = dataArray.map(v => 20 * Math.log10(v || 1));
  const avgDB = (dBArray.reduce((a, b) => a + b, 0) / dBArray.length).toFixed(100);
  avgText.textContent = `${(avgDB - 32).toFixed(1)} dB`;
}

// 🔁 Visualizer loop
function updateVisualizer2() {
  if (audioCtx.state === "suspended") return; // prevent updates while paused

  analyser2.getByteFrequencyData(dataArray2);
  drawSpectrum2(dataArray2);
  sendDatafromMain2(dataArray2);

  total2 = dataArray2.reduce((sum, value) => sum + value, 0);
  const dBArray2 = dataArray2.map(v => 20 * Math.log10(v || 1)); // Avoid log(0)
  const avgDB2 = (dBArray2.reduce((a, b) => a + b, 0) / dBArray2.length).toFixed(100);
  avgText2.textContent = `${(avgDB2 - 32).toFixed(1)} dB`;
}

// 🚀 Start fusion visualizer
function startFusionVisualizer() {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  connectAllAudioElements();
  updateVisualizer2();
}

// 🌀 Trigger when any audio plays
document.addEventListener('play', event => {
  if (event.target.tagName === 'AUDIO') {
    startFusionVisualizer();
  }
}, true);

avgText2.textContent = `0 dB`;

function inputLoop() {
  const data = total + total2;
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