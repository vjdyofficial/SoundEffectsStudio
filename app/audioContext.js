const micSelector = document.getElementById('micSelector');
let audioCtx;
let source;

audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const analyser = audioCtx.createAnalyser();
analyser.fftSize = 128;

let faderNode = audioCtx.createGain();
faderNode.gain.value = 1

let inputMixerNode = audioCtx.createGain(); // dedicated mixer node
inputMixerNode.gain.value = 1.0;

let meterMixerNode = audioCtx.createGain(); // your node
meterMixerNode.gain.value = 1.0;

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
      latencyHint: 'interactive'
    }
  };

  navigator.mediaDevices.getUserMedia(constraints).then(stream => {
    currentStream = stream;
    source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    source.connect(inputMixerNode);
    source.connect(meterMixerNode);
    document.getElementById('info_mic1').innerHTML = `${micSelector.options[micSelector.selectedIndex].textContent}`
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

// 🌈 Draw spectrum

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
mixerNode.connect(meterMixerNode);
analyser2.connect(faderNode); // Optional: allows playback

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
          console.log("Media finished, keeping connection alive:", mediaEl.src || "[inline]");
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

// 🚀 Start fusion visualizer
function startFusionVisualizer() {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  connectAllMediaElements();
}

// 🌀 Trigger when any audio plays
document.addEventListener('play', event => {
  if (event.target.tagName === 'AUDIO') {
    startFusionVisualizer();
  }
}, true);

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