const { start } = require('tone');

const micSelector = document.getElementById('micSelector');
const audioCanvas = document.getElementById('audioForm');
const audioCanvasCtx = audioCanvas.getContext('2d');

const audioCanvasPreview = document.getElementById('audioFormPreview');
const audioCanvasPreviewCtx = audioCanvasPreview.getContext('2d');

audioCanvas.width = 100;
audioCanvas.height = 38;

audioCanvasPreview.width = 100;
audioCanvasPreview.height = 38;
let audioCtx;
let source;

audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 128;

let inputMixerNode = audioCtx.createGain(); // dedicated mixer node
inputMixerNode.gain.value = 1.0;

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

let savedMicId = localStorage.getItem('preferredMicId') || "-2";

audioCtx.addEventListener("error", (err) => {
  const { ipcRenderer } = require('electron');
  ipcRenderer.invoke('show-audiocontexterror');
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

// 🎤 Populate mic dropdown
function populateList() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
    if (recorder.state !== "inactive" || recorder.state === "paused") {
      recorder.resume();
    }

    navigator.mediaDevices.enumerateDevices().then(devices => {
      const audioInputs = devices.filter(device => device.kind === 'audioinput');

      micSelector.innerHTML = ''; // Clear previous options

      if (audioInputs.length > 0) {
        // ➖ Add disable option at the top
        const disableOption = document.createElement('option');
        disableOption.value = "-2";
        disableOption.innerHTML = `<img src="images/icons-audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> Disable`;
        micSelector.appendChild(disableOption);
      }

      // 🎙️ Add mic options
      audioInputs.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.innerHTML = `<img src="images/icons-audiodevices/${audioDeviceIcons(device.label)}.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> ${device.label}` || `Microphone ${index + 1}`;
        micSelector.appendChild(option);
      });

      if (audioInputs.length === 0) {
        // 🚫 No microphones detected
        micSelector.innerHTML = '';
        const option = document.createElement('option');
        option.value = "-2";
        option.innerHTML = `<img src="images/icons-audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> No audio devices available`;
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
    option.innerHTML = `<img src="images/icons-audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> No audio devices available`;
    micSelector.appendChild(option);
    micSelector.value = "-2";
    disconnectMic();

    ["micSelector"].forEach(id => {
      document.getElementById(id).disabled = false;
    })
  });

  navigator.mediaDevices.getUserMedia({ audio: true }).then(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      // 🎛 Filter virtual / loopback devices only
      const audioInputs = devices.filter(d =>
        d.kind === 'audioinput' &&
        /voicemeeter|virtual|cable|loopback|mix|stereo mix|output/i.test(d.label)
      );

      listenSelector.innerHTML = '';

      // ➖ Disable option
      const disableOption = document.createElement('option');
      disableOption.value = "-2";
      disableOption.innerHTML = `<img src="images/icons-audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> Disable`;
      listenSelector.appendChild(disableOption);

      // 🎧 Add devices
      audioInputs.forEach((device, i) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.innerHTML = `<img src="images/icons-audiodevices/${audioDeviceIcons(device.label)}.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> ${device.label}` || `Virtual Input ${i + 1}`;
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
      ipcRenderer.send('video-reconnect', false);
    });
  }).catch(() => {
    listenSelector.innerHTML = '';
    const option = document.createElement('option');
    option.value = "-2";
    option.innerHTML = `<img src="images/icons-audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> No audio devices available`;
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

// Initial population
populateList();

function refreshDevices() {
  populateList();
  disconnectListen();
  disconnectonChange();
  document.getElementById('reconnectButton').disabled = true;
  ["listenSelector", "micSelector"].forEach(id => {
    document.getElementById(id).disabled = true
  })
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
  }

  const constraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    }
  };

  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    currentStream = stream;
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    source.connect(inputMixerNode);
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

function disconnectonChange() {
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
  function sendVisualizerData(dataArray) {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('send-visualizer-data', dataArray);
  }

  sendVisualizerData(dataArray);
}

let total = 0;
let total2 = 0;
let total3 = 0;

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
// key = media element (<audio> or <video>), value = { source, handlers }

function connectMediaElement(mediaEl) {
  if (!connectedSources.has(mediaEl)) {
    try {
      const source = audioCtx.createMediaElementSource(mediaEl);
      source.connect(mixerNode);

      // Handlers (we no longer auto-disconnect on "ended")
      const onPause = () => {
        if (mediaEl.currentTime === mediaEl.duration) {
          console.log("⏹ Media finished, keeping connection alive:", mediaEl.src || "[inline]");
        }
      };

      // Attach listeners
      mediaEl.addEventListener("pause", onPause);

      // Save source + handlers
      connectedSources.set(mediaEl, { source, handlers: { onPause } });

    } catch (err) {
      console.warn("Already connected:", err);
    }
  }
}

function disconnectMediaElement(mediaEl) {
  const entry = connectedSources.get(mediaEl);
  if (entry) {
    const { source, handlers } = entry;
    try {
      source.disconnect();
      // Remove listeners
      mediaEl.removeEventListener("pause", handlers.onPause);

      connectedSources.delete(mediaEl);
      console.log("🔌 Disconnected and cleaned up:", mediaEl.src || "[removed]");
    } catch (err) {
      console.warn("Failed to disconnect:", err);
    }
  }
}

// 🔗 Connect all <audio> + <video> elements (bulk)
function connectAllMediaElements() {
  const mediaElements = document.querySelectorAll("audio, video");
  if (isElectron()) {
    mediaElements.forEach(el => connectMediaElement(el));
  }
}

// 🌀 Trigger when any media plays
document.addEventListener("play", event => {
  if (["AUDIO", "VIDEO"].includes(event.target.tagName)) {
    connectMediaElement(event.target);
    startFusionVisualizer();
  }
}, true);

// 👀 Watch for removed <audio> or <video> elements
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    mutation.removedNodes.forEach(node => {
      if (["AUDIO", "VIDEO"].includes(node.tagName)) {
        disconnectMediaElement(node);
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
const avgText3 = document.getElementById('avgtext3');

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
  connectAllMediaElements();
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