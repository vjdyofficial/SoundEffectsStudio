const MeterProcessorCode = `
    class VolumeMeter extends AudioWorkletProcessor {
      constructor(options) {
        super();
        const o = options.processorOptions || {};
        this.channels = o.channels || 8;
        this.smoothing = o.smoothing ?? 0.8;
        this.interval = sampleRate / (o.fps || 60);
        this.peaks = new Float32Array(this.channels);
        this.sums = new Float32Array(this.channels);
        this.smoothed = new Float32Array(this.channels);
        this.frames = 0;
      }

      process(inputs) {
        const input = inputs[0];
        let blockLen = 128;
        if (input && input.length && input[0]) blockLen = input[0].length;

        for (let ch = 0; ch < this.channels; ch++) {
          const s = input && input[ch];
          if (!s) continue;
          let peak = this.peaks[ch];
          let sum = this.sums[ch];
          for (let i = 0; i < s.length; i++) {
            const v = s[i];
            const a = v < 0 ? -v : v;
            if (a > peak) peak = a;
            sum += v * v;
          }
          this.peaks[ch] = peak;
          this.sums[ch] = sum;
        }

        this.frames += blockLen;

        if (this.frames >= this.interval) {
          const out = new Float32Array(this.channels * 2);
          for (let ch = 0; ch < this.channels; ch++) {
            const rms = Math.sqrt(this.sums[ch] / this.frames);
            this.smoothed[ch] = Math.max(rms, this.smoothed[ch] * this.smoothing);
            out[ch * 2] = this.peaks[ch];
            out[ch * 2 + 1] = this.smoothed[ch];
            this.peaks[ch] = 0;
            this.sums[ch] = 0;
          }
          this.frames = 0;
          this.port.postMessage(out, [out.buffer]);
        }

        return true;
      }
    }

    // AudioWorklet modules can be evaluated more than once in the same
    // worklet scope (for example, if this renderer script is loaded twice).
    if (!globalThis.__volumeMeterProcessorRegistered) {
      registerProcessor("volume-meter", VolumeMeter);
      globalThis.__volumeMeterProcessorRegistered = true;
    }
  `;

const micSelector = document.getElementById("micSelector");
let audioCtx;
let source;
let isReady = false;

window.FUNCTION_UPDATE = [];

var sampleRateSettings = localStorage.getItem("audioCtx_sampleRate") || 48000;
var latencySettings =
  localStorage.getItem("audioCtx_latencyHint") || "balanced";
var latencyNumber = localStorage.getItem("audioCtx_latencyNumber") || 0.005;

const srOption = document.getElementById("audioCtx_sampleRate_selection");
srOption.addEventListener("change", (e) => {
  localStorage.setItem("audioCtx_sampleRate", e.target.value);
});
srOption.value = sampleRateSettings;

const lhOption = document.getElementById("audioCtx_latencyhint_selection");
lhOption.addEventListener("change", (e) => {
  localStorage.setItem("audioCtx_latencyHint", e.target.value);
});
lhOption.value = latencySettings;

var latencyUse =
  latencySettings === "custom" ? Number(latencyNumber) : latencySettings;

const lhaOption = document.getElementById("latencySlider");
const lhaOptionText = document.getElementById("latencySliderText");
lhaOption.addEventListener("input", (e) => {
  localStorage.setItem("audioCtx_latencyNumber", e.target.value);
  lhaOptionText.textContent = e.target.value + "s/buffer";
});

lhaOption.value = latencyNumber;
lhaOption.dispatchEvent(new Event("input"));

try {
  // Create an AudioContext with a latency hint
  audioCtx = new AudioContext({
    latencyHint: latencyUse,
    sampleRate: sampleRateSettings, // optional: request a specific sample rate
  });

  console.log("Requested latency hint:", audioCtx.latencyHint);
  console.log("Actual base latency:", audioCtx.baseLatency, "seconds");
} catch (err) {
  console.error("Failed to create AudioContext:", err);
}

let faderNode = audioCtx.createGain();
faderNode.gain.value = 1;
const preamp = audioCtx.createGain();
preamp.gain.value = 1;

const pitchNode = PitchShift(audioCtx, {
  grain: 0.05,
  search: 0.016,
  compare: 0.024,
});
pitchNode.transpose = 0;

const masterGain = audioCtx.createGain();

let listenStream = null;
let listenSource = null;
let listenMixerNodeA = audioCtx.createGain(); // dedicated mixer node
let listenMixerNodeB = audioCtx.createGain(); // dedicated mixer node

const nodeToSurround = audioCtx.createGain();
nodeToSurround.gain.value = 1;
const SurroundtoNode = audioCtx.createGain();
SurroundtoNode.gain.value = 1;

const returnSurroundA = new MicSurroundPan(
  audioCtx,
  listenMixerNodeB,
  pitchNode,
);
const returnSurroundB = new MicSurroundPan(
  audioCtx,
  listenMixerNodeA,
  pitchNode,
);

function initdegreeAngle(id, node) {
  const input = document.getElementById(id);
  const text = document.getElementById(`${id}_text`);

  input.addEventListener("input", () => {
    node.setAngle(input.value);
    localStorage.setItem(id, input.value);
    text.textContent = `${input.value}°`;
  });

  input.value = localStorage.getItem(id) || 0;
  input.dispatchEvent(new Event("input"));
}

initdegreeAngle("SRS_RETURNA", returnSurroundA);
initdegreeAngle("SRS_RETURNB", returnSurroundB);

let devicechanging = false;

let initialiseApp = false;
let currentStream = null; // 🧼 Track the active stream

let savedMicId = localStorage.getItem("preferredMicId") || "-2";

let errorCtx = false;

audioCtx.addEventListener("error", (err) => {
  if (!errorCtx) {
    alert(
      `The AudioContext encountered an error from the audio device or the WebAudio renderer. ` +
        `If you made changes to your audio devices and unable to scan for no reason, ` +
        `Restart the app to try again or exit.`,
      "WebAudio Error!",
      true,
      true,
      true,
    );
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

const SFXSTUDIO_MEDIADEVICES_AUDIO = navigator.mediaDevices;
let scanDevices = false;

const outputSelector = document.getElementById("outputSelector");

async function loadOutputDevices() {
  isReady = false;
  const devices = await SFXSTUDIO_MEDIADEVICES_AUDIO.enumerateDevices();
  const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
  outputSelector.innerHTML = "";

  // Default option
  const defaultOption = document.createElement("option");
  defaultOption.value = "default";
  defaultOption.innerHTML = `<img src="icons/monosource/audiodevices/${outputDeviceIcons("default")}.svg" alt="icon" class="topbar_marginright_btn"> Default`;
  outputSelector.appendChild(defaultOption);

  audioOutputs.forEach((device) => {
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
  SFXSTUDIO_MEDIADEVICES_AUDIO.getUserMedia({ audio: true })
    .then(() => {
      return SFXSTUDIO_MEDIADEVICES_AUDIO.enumerateDevices().then((devices) => {
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput",
        );

        micSelector.innerHTML = ""; // Clear previous options

        if (audioInputs.length > 0) {
          // ➖ Add disable option at the top
          const disableOption = document.createElement("option");
          disableOption.value = "-2";
          disableOption.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> Disable`;
          micSelector.appendChild(disableOption);
        }

        // 🎙️ Add mic options
        audioInputs.forEach((device, index) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.innerHTML =
            `<img src="icons/monosource/audiodevices/${audioDeviceIcons(device.label)}.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> ${device.label}` ||
            `Microphone ${index + 1}`;
          micSelector.appendChild(option);
        });

        if (audioInputs.length === 0) {
          // 🚫 No microphones detected
          micSelector.innerHTML = "";
          const option = document.createElement("option");
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

        ["micSelector"].forEach((id) => {
          document.getElementById(id).disabled = false;
        });

        listenSelector.innerHTML = "";

        // ➖ Disable option
        const disableOption = document.createElement("option");
        disableOption.value = "-2";
        disableOption.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> Disable`;
        listenSelector.appendChild(disableOption);

        // 🎧 Add devices
        audioInputs.forEach((device, i) => {
          const option = document.createElement("option");
          option.value = device.deviceId;
          option.innerHTML =
            `<img src="icons/monosource/audiodevices/${audioDeviceIcons(device.label)}.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> ${device.label}` ||
            `Virtual Input ${i + 1}`;
          listenSelector.appendChild(option);
        });

        // 🧠 Restore saved or default
        if (savedListenId === "-2") {
          // Explicitly disable listen
          listenSelector.value = "-2";
          disconnectListen();
        } else if (audioInputs.some((d) => d.deviceId === savedListenId)) {
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

        document.getElementById("reconnectButton").disabled = false;
        ["listenSelector"].forEach((id) => {
          document.getElementById(id).disabled = false;
        });
      });
    })
    .catch(() => {
      micSelector.innerHTML = "";
      const micOption = document.createElement("option");
      micOption.value = "-2";
      micOption.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px"class="topbar_marginright_btn"> No audio devices available`;
      micSelector.appendChild(micOption);
      micSelector.value = "-2";
      disconnectMic();

      ["micSelector"].forEach((id) => {
        document.getElementById(id).disabled = false;
      });

      listenSelector.innerHTML = "";
      const listenOption = document.createElement("option");
      listenOption.value = "-2";
      listenOption.innerHTML = `<img src="icons/monosource/audiodevices/disable.svg" alt="icon" width="24px" height="24px" class="topbar_marginright_btn"> No audio devices available`;
      listenSelector.appendChild(listenOption);
      listenSelector.value = "-2";
      disconnectListen();

      document.getElementById("reconnectButton").disabled = false;
      ["listenSelector"].forEach((id) => {
        document.getElementById(id).disabled = false;
      });
      ipcRenderer.send("video-reconnect", false);
    });
}

loadOutputDevices();

function refreshConnect() {
  document.getElementById("info_defaultoutput").innerHTML = `Searching...`;
  SFXSTUDIO_MEDIADEVICES_AUDIO.enumerateDevices()
    .then((devices) => {
      // Filter only audio outputs
      const audioOutputs = devices.filter((d) => d.kind === "audiooutput");

      // Find the default output
      const defaultOutput = audioOutputs.find((d) => d.deviceId === "default");

      if (defaultOutput) {
        console.info("Default audio output:", defaultOutput.label);
        document.getElementById("info_defaultoutput").innerHTML =
          `${defaultOutput.label.replace("Default - ", "")}`;
        if (audioOutputs.find((d) => d.deviceId === "usb")) {
          document.getElementById("usbdacIndicator").style.visibility =
            "visible";
        } else {
          document.getElementById("usbdacIndicator").style.visibility =
            "hidden";
        }
      } else {
        console.error("No default output found");
        document.getElementById("info_defaultoutput").innerHTML =
          `No default audio device found`;
      }

      const usbDAC = audioOutputs.find((d) => /usb|dac/i.test(d.label));

      const isUsbDAC = defaultOutput && /usb|dac/i.test(defaultOutput.label);

      const indicator = document.getElementById("usbdacIndicator");

      if (usbDAC) {
        indicator.style.visibility = "visible";
        console.log("USB DAC detected:", usbDAC.label);
      } else {
        indicator.style.visibility = "hidden";
      }

      ipcRenderer.send("video-reconnect", false);
    })
    .catch((err) => {
      console.error("Error enumerating devices:", err);
      document.getElementById("info_defaultoutput").innerHTML =
        `No default audio device found`;
      ipcRenderer.send("video-reconnect", false);
    });
}

loadOutputDevices();
populateList();
refreshConnect();

async function refreshDevices() {
  // --- Reset selectors to disabled ---
  ["micSelector", "listenSelector"].forEach((id) => {
    const sel = document.getElementById(id);
    sel.value = "-2"; // reset to "Disable"
    sel.disabled = true; // prevent user interaction until populated
  });
  // --- Notify main process ---
  document.getElementById("reconnectButton").disabled = true;

  // --- Populate new devices ---
  await populateList();
}

// 🔄 Mic change handler
micSelector.addEventListener("change", () => {
  const selectedId = micSelector.value;

  selectedId === "-2"
    ? disconnectMic()
    : selectedId === savedListenId
      ? alert(
          "You cannot use same audio devices to input and output. Please use different audio device.",
          "Input Device Select Error",
        )
      : activateMic(selectedId);

  if (
    selectedId != savedListenId ||
    (selectedId == "-2" && savedListenId == "-2")
  ) {
    const micStore = {
      preferredMicId: selectedId,
      lastUsed: new Date().toISOString(),
      flavor:
        selectedId === "-2" ? "🔕 Ritual Silence" : "🌀 Ceremonial Loopback",
    };
    localStorage.setItem("micRegistry", JSON.stringify(micStore));
    localStorage.setItem("preferredMicId", selectedId);
    savedMicId = localStorage.getItem("preferredMicId") || "-2";
  } else {
    micSelector.value = savedMicId;
  }
});

// 🎧 Activate mic stream
function activateMic(deviceId) {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }

  const constraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      latencyHint: "playback",
    },
  };

  SFXSTUDIO_MEDIADEVICES_AUDIO.getUserMedia(constraints)
    .then((stream) => {
      currentStream = stream;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(listenMixerNodeA);
      document.getElementById("info_mic1").innerHTML =
        `${micSelector.options[micSelector.selectedIndex].textContent}`;
      const text = `Audio device stream is now active. <br><code>${micSelector.options[micSelector.selectedIndex].textContent}</code>`;
      snackbar(text); // Show snackbar notification
    })
    .catch((err) => {
      const text = `Audio device stream error. <br><code>${err}</code>`;
      snackbar(text); // Show snackbar notification
    });
}

// 🔇 Disconnect mic stream
function disconnectMic() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
    const text = `Audio device stream is now inactive.`;
    document.getElementById("info_mic1").innerHTML = `null`;
    snackbar(text); // Show snackbar notification
  }
}

function disconnectonChange() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
    const text = `Audio devices list have new changes. Reconnecting...`;
    snackbar(text); // Show snackbar notification
  }
}

// Assume audioCtx is already created
let noiseSource;
let noiseText = "Suspend AudioContext";

let isgoingtoRestart = true;
window.TYPE_FUNCTION = "";

audioCtx.onstatechange = () => {
  if (audioCtx.state === "suspended") {
    noiseText = "Resume AudioContext";
  } else if (audioCtx.state === "closed") {
    if (window.TYPE_FUNCTION === "RESET") { return }
    ipcRenderer.send("window-action", "close-permanent", window.TYPE_FUNCTION);
  } else if (audioCtx.state === "running") {
    noiseText = "Suspend AudioContext";
  }
};

let total = 0;
let total2 = 0;
let total3 = 0;

// 🔀 Mixer node (GainNode works well for combining)
const mixerNode = audioCtx.createGain();

const mixerNodegain = audioCtx.createGain();
mixerNodegain.gain.value = 1;
mixerNodegain.connect(pitchNode);

const mixerNodegain2 = audioCtx.createGain();
mixerNodegain2.gain.value = 1;
mixerNodegain2.connect(pitchNode);

// gain to dB conversion - preamp
function gainTodB(gain) {
  if (gain <= 0) {
    return "-60.0dB";
  }

  const val = 20 * Math.log10(gain);

  return `${val === Infinity ? "inf" : val.toFixed(1) + "dB"}`;
}

function valueToDb(v) {
  const minDb = -60; // how low your EQ goes
  const maxDb = 0;

  const normalized = (v - -12) / (1 - -12);
  const db = minDb + normalized * (maxDb - minDb);

  return db.toFixed(1) + " dB";
}

function setupPreampSlider(sliderId, valueDisplayId, audioParam, storageKey) {
  // Update on slider move
  sliderId.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    valueDisplayId.textContent = gainTodB(value);
    audioParam.gain.value = value;
    document.getElementById(`info_preamp`).textContent = gainTodB(value);
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
  "preampValue1",
);

const samplergainslider = document.getElementById("samplerGainSlider");
const samplergainvalue = document.getElementById("samplerGainValue");

// Update on slider change
samplergainslider.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  mixerNodegain.gain.value = value;
  samplergainvalue.textContent = gainTodB(value);
  localStorage.setItem("samplergainValue", value);
});

// Load stored value or default to 1
let samplergain = parseFloat(localStorage.getItem("samplergainValue")) || 1;
samplergainslider.value = samplergain;
samplergainslider.dispatchEvent(new Event("input", { bubbles: true }));

const loopergainslider = document.getElementById("looperGainSlider");
const loopergainvalue = document.getElementById("looperGainValue");

// Update on slider change
loopergainslider.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  mixerNodegain2.gain.value = value;
  loopergainvalue.textContent = gainTodB(value);
  localStorage.setItem("loopergainValue", value);
});

// Load stored value or default to 1
let loopergain = parseFloat(localStorage.getItem("loopergainValue")) || 1;
loopergainslider.value = loopergain;
loopergainslider.dispatchEvent(new Event("input", { bubbles: true }));

function inputLoop() {
  const data = total + total2 + total3;
  if (data <= 0) {
    document.getElementById("micStatus").style.display = "flex";
  } else {
    document.getElementById("micStatus").style.display = "none";
  }
  requestAnimationFrame(inputLoop);
}

inputLoop();

let masterSound; // your GainNode
masterSound = audioCtx.createGain();
masterSound.gain.value = 1;

const tuning_gain = audioCtx.createGain();

// Master mixer
const masterGainDack = audioCtx.createGain();
masterGainDack.gain.value = 1; // master volume
masterGainDack.connect(pitchNode);

const idents = IdentEffects(audioCtx, pitchNode);

idents.load();

idents.onState = (i, playing) => {
  // update your indicator for ident i
  document.getElementById("ident" + i).classList.toggle("on", playing);
};

for (let i = 0; i < 9; i++) {
  document.getElementById("ident" + i).addEventListener("click", () => {
    if (idents.isPlaying(i)) {
      idents.stop(i);
    } else {
      idents.play(i);
    }
  })
}

const identgainslider = document.getElementById("identGainSlider");
const identgainvalue = document.getElementById("identGainValue");

// Update on slider change
identgainslider.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  idents.volume(value)
  identgainvalue.textContent = gainTodB(value);
  localStorage.setItem("identgainValue", value);
});

// Load stored value or default to 1
let identgain = parseFloat(localStorage.getItem("identgainValue")) || 1;
identgainslider.value = identgain;
identgainslider.dispatchEvent(new Event("input", { bubbles: true }));

pitchNode.connect(masterSound);

const SFXSTUDIO_TRUESURROUND_PLUS_SPLITTER = audioCtx.createChannelSplitter(32);

const SFXSTUDIO_TRUESURROUND_PLUS_MERGER = audioCtx.createChannelMerger(8);

const tuning = new A4Tuning(audioCtx, masterSound, tuning_gain)
tuning.init();

tuning_gain.connect(SFXSTUDIO_TRUESURROUND_PLUS_SPLITTER);

// Channels 1–8 → standard 8-channel outputs
for (let i = 0; i < 8; i++) {
  SFXSTUDIO_TRUESURROUND_PLUS_SPLITTER.connect(
    SFXSTUDIO_TRUESURROUND_PLUS_MERGER,
    i,
    i,
  );
}

// Channels 9–32 → rear/middle channels only
for (let i = 8; i < 32; i++) {
  const targetChannel = 4 + ((i - 8) % 4);

  SFXSTUDIO_TRUESURROUND_PLUS_SPLITTER.connect(
    SFXSTUDIO_TRUESURROUND_PLUS_MERGER,
    i,
    targetChannel,
  );
}

// 8-channel output → enhancer
SFXSTUDIO_TRUESURROUND_PLUS_MERGER.connect(mixerNode);

async function initDeckPreload(params) {
  async function initDecks(decks) {
    const deckNodes = {};

    decks.forEach((deck) => {
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
    {
      id: "MediaExtDeck1",
      gain: parseFloat(localStorage.getItem("gainValue_MediaExtDeck1")) || 1,
    },
    {
      id: "MediaExtDeck2",
      gain: parseFloat(localStorage.getItem("gainValue_MediaExtDeck2")) || 1,
    },
    {
      id: "mediaA",
      gain: parseFloat(localStorage.getItem("gainValue_mediaA")) || 1,
    },
    {
      id: "mediaB",
      gain: parseFloat(localStorage.getItem("gainValue_mediaB")) || 1,
    },
    {
      id: "mediaC",
      gain: parseFloat(localStorage.getItem("gainValue_mediaC")) || 1,
    },
    {
      id: "mediaD",
      gain: parseFloat(localStorage.getItem("gainValue_mediaD")) || 1,
    },
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
      document.getElementById(`audioWaveTime_${deckId}`).style.transform =
        `scaleY(${gainValue})`;

      // Store value per deck
      localStorage.setItem("gainValue_" + deckId, value);
    });

    // Load stored value or default to 1
    let gainValue =
      parseFloat(localStorage.getItem("gainValue_" + deckId)) || 1;
    slider.value = gainValue;
    slider.dispatchEvent(new Event("input", { bubbles: true }));
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
const pitchValue = document.getElementById("pitchSliderValue");

function valueToSemitone(value) {
  const v = Math.min(1, Math.max(-1, parseFloat(value) || 0));
  return v * 12; // -1 -> -12, 0 -> 0, 1 -> 12
}

const pitchSlider = document.getElementById("pitchSlider");

// Update on slider move
pitchSlider.addEventListener("input", (e) => {
  pitchValue.textContent = Number(e.target.value).toFixed(2) + "st";
  localStorage.setItem("pitchVolume", e.target.value); // save
  document.getElementById(`info_pitch`).textContent = pitchValue.textContent;
});

pitchSlider.addEventListener("change", (e) => {
  pitchNode.transpose = e.target.value;

  if (e.target.value == 0) {
    pitchNode.wet.value = 0;
    pitchNode.dry.value = 1;
  } else {
    pitchNode.wet.value = 1;
    pitchNode.dry.value = 0;
  }
});

pitchSlider.addEventListener("contextmenu", () => {
  pitchSlider.value = 0;
  pitchSlider.dispatchEvent(new Event("input", { bubbles: true }));
  pitchSlider.dispatchEvent(new Event("change", { bubbles: true }));
});

pitchSlider.value = savedpitch;
pitchSlider.dispatchEvent(new Event("input", { bubbles: true }));
pitchSlider.dispatchEvent(new Event("change", { bubbles: true }));

const tuning_s = document.getElementById("tuning_s");
const tuning_t = document.getElementById("tuning_t");

// Update on slider move
tuning_s.addEventListener("input", (e) => {
  tuning_t.textContent = Number(e.target.value).toFixed(0) + "Hz";
  localStorage.setItem("TUNING", e.target.value); // save
});

tuning_s.addEventListener("change", (e) => {
  tuning.setFrequency(e.target.value);
});

tuning_s.addEventListener("contextmenu", () => {
  tuning_s.value = 440;
  tuning_s.dispatchEvent(new Event("input", { bubbles: true }));
  tuning_s.dispatchEvent(new Event("change", { bubbles: true }));
});

tuning_s.value = localStorage.getItem("TUNING") || 440;
tuning_s.dispatchEvent(new Event("input", { bubbles: true }));
tuning_s.dispatchEvent(new Event("change", { bubbles: true }));

setTimeout(() => {
  initDeckPreload();
}, 5000);

//

// === Audio Context Listen Stream Setup ===
// 🎧 Elements
const listenSelector = document.getElementById("listenSelector");

// 🧩 Ensure saved key exists and load value
if (localStorage.getItem("preferredListenId") === null) {
  localStorage.setItem("preferredListenId", "-2"); // default to disable
}
let savedListenId = localStorage.getItem("preferredListenId");

// === Activate Listen Stream ===
function activateListen(deviceId) {
  if (listenStream) {
    listenStream.getTracks().forEach((track) => track.stop());
    listenStream = null;
  }
  if (listenSource) {
    try {
      listenSource.disconnect();
    } catch {}
    listenSource = null;
  }

  const constraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
      latencyHint: "playback",
    },
  };

  SFXSTUDIO_MEDIADEVICES_AUDIO.getUserMedia(constraints)
    .then((stream) => {
      listenStream = stream;
      // Connect to AudioContext chain
      listenSource = audioCtx.createMediaStreamSource(stream);
      listenSource.connect(listenMixerNodeB);
      document.getElementById("info_mic2").innerHTML =
        `${listenSelector.options[listenSelector.selectedIndex].textContent}`;
    })
    .catch((err) => snackbar(`Listen error<br><code>${err.message}</code>`));
}

const savedListenGain = localStorage.getItem("RETURN_A_GAIN") || 1;
const listengainSlider = document.getElementById("listengainSlider");
const listengainValue = document.getElementById("listengainValue");

// Update on slider move
listengainSlider.addEventListener("input", (e) => {
  const v = Number(e.target.value);
  listenMixerNodeA.gain.value = Number(v);
  listengainValue.textContent = gainTodB(v);
  localStorage.setItem("RETURN_A_GAIN", v); // save
});

listengainSlider.value = savedListenGain;
listengainSlider.dispatchEvent(new Event("input", { bubbles: true }));

const savedListenGain2 = localStorage.getItem("RETURN_B_GAIN") || 1;
const listengainSlider2 = document.getElementById("listengainSlider2");
const listengainValue2 = document.getElementById("listengainValue2");

listengainSlider2.addEventListener("input", (e) => {
  const v = Number(e.target.value);
  listenMixerNodeB.gain.value = Number(v);
  listengainValue2.textContent = gainTodB(v);
  localStorage.setItem("RETURN_A_GAIN", v); // save
});

listengainSlider2.value = savedListenGain2;
listengainSlider2.dispatchEvent(new Event("input", { bubbles: true }));

// === Disconnect Listen ===
function disconnectListen() {
  document.getElementById("info_mic2").innerHTML = `null`;
  if (listenSource) {
    try {
      listenSource.disconnect();
    } catch {}
    listenSource = null;
  }
  if (listenStream) {
    listenStream.getTracks().forEach((track) => track.stop());
    listenStream = null;
  }
}

// === Handle selection changes ===
listenSelector.addEventListener("change", () => {
  const selectedId = listenSelector.value;
  selectedId === "-2"
    ? disconnectListen()
    : selectedId === savedMicId
      ? alert(
          "You cannot use same audio devices to input and output. Please use different audio device.",
          "Output Device Select Error",
        )
      : activateListen(selectedId);

  if (selectedId != savedMicId || (selectedId == "-2" && savedMicId == "-2")) {
    localStorage.setItem("preferredListenId", selectedId);
    savedListenId = localStorage.getItem("preferredListenId");
  } else {
    listenSelector.value = savedListenId;
  }
});

document.getElementById("reconnectButton").addEventListener("click", () => {
  refreshDevices();
  devicechanging = false;
});

let timeReconnection = 0;
let ReconnectFunction = null;

SFXSTUDIO_MEDIADEVICES_AUDIO.ondevicechange = () => {
  refreshConnect();
  if (!scanDevices) {
    console.log("Device change trigerred");
    disconnectListen();
    disconnectonChange(); // optional extra cleanup
    ipcRenderer.send(
      "show-text",
      "Audio devices have new changes. Refreshing in 5s...",
    );
    ipcRenderer.send("video-reconnect", true);
    scanDevices = true;
    ["micSelector", "listenSelector"].forEach((id) => {
      const sel = document.getElementById(id);
      sel.value = "-2"; // reset to "Disable"
      sel.disabled = true; // prevent user interaction until populated
    });
    document.getElementById("reconnectButton").disabled = true;
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
};

const virtualizer = new Virtualizer(audioCtx, nodeToSurround, SurroundtoNode);
virtualizer.setRearSurroundOutput(1);
virtualizer.setSideSurroundOutput(0.5);
virtualizer.setSeparation(0);

const virtualizerWidthSliders = [
  "virtualizer_WIDTH_FRONT",
  "virtualizer_WIDTH_REAR",
  "virtualizer_WIDTH_SIDE",
  "virtualizer_WIDTH_MULTIPLIER",
];

function setWidthTrue() {
  const v1 = document.getElementById(virtualizerWidthSliders[0]).value;
  const v2 = document.getElementById(virtualizerWidthSliders[1]).value;
  const v3 = document.getElementById(virtualizerWidthSliders[2]).value;
  const v4 = document.getElementById(virtualizerWidthSliders[3]).value;

  virtualizer.setFrontStereoOutput(Number(v1));
  virtualizer.setRearSurroundOutput(Number(v2));
  virtualizer.setSideSurroundOutput(Number(v3));
  virtualizer.setMultiplier(Number(v4));
}

virtualizerWidthSliders.forEach((id) => {
  const Slider = document.getElementById(id);
  const Text = document.getElementById(id + "_VALUE");

  Slider.addEventListener("input", (e) => {
    setWidthTrue();
    Text.textContent = gainTodB(Number(e.target.value));
    localStorage.setItem(id + "_VALUE", Number(e.target.value));
  });

  const savedValue = localStorage.getItem(id + "_VALUE");

  Slider.value = savedValue !== null ? Number(savedValue) : 1;
  Slider.dispatchEvent(new Event("input"));
});

const virtualizerEchoGainSlider = document.getElementById(
  "virtualizer_ECHOEFFECT_GAIN",
);
const virtualizerEchoGainText = document.getElementById(
  "virtualizer_ECHOEFFECT_GAIN_VALUE",
);
const virtualizerEchoDelaySlider = document.getElementById("virtualizer_ECHOEFFECT");
const virtualizerEchoDelayText = document.getElementById(
  "virtualizer_ECHOEFFECT_VALUE",
);
const virtualizerDelay = document.getElementById("virtualizerDelay");

function updatevirtualizerEcho() {
  const delayTime = Number(virtualizerEchoDelaySlider.value);
  const delayGain = Number(virtualizerEchoGainSlider.value);

  virtualizer.setDelayTime(delayTime);
  virtualizer.setDelayGain(virtualizerDelay.checked ? delayGain : 0);
  virtualizerEchoDelayText.textContent = delayTime;
  virtualizerEchoGainText.textContent = gainTodB(delayGain);
}

[virtualizerEchoGainSlider, virtualizerEchoDelaySlider].forEach((slider) => {
  const savedValue = localStorage.getItem(slider.id + "_VALUE");
  if (savedValue !== null) slider.value = Number(savedValue);

  slider.addEventListener("input", () => {
    localStorage.setItem(slider.id + "_VALUE", Number(slider.value));
    updatevirtualizerEcho();
  });
  slider.dispatchEvent(new Event("input"));
});

const savedvirtualizerDelay = localStorage.getItem("virtualizerDelay");
if (savedvirtualizerDelay !== null) {
  virtualizerDelay.checked = savedvirtualizerDelay === "true";
}
virtualizerDelay.addEventListener("change", () => {
  localStorage.setItem("virtualizerDelay", virtualizerDelay.checked);
  virtualizer.enableDelay(virtualizerDelay.checked);
  updatevirtualizerEcho();
});
virtualizerDelay.dispatchEvent(new Event("change"));

const virtualizerEncoded = document.getElementById("virtualizer_ENCODED");
const savedvirtualizerEncoded = localStorage.getItem("virtualizer_ENCODED");
if (savedvirtualizerEncoded !== null) {
  virtualizerEncoded.checked = savedvirtualizerEncoded === "true";
}

const savedInput = localStorage.getItem("virtualizerInput") || 0;
const virtualizer_WIDTH_INPUT = document.getElementById("virtualizer_WIDTH_INPUT");
const virtualizer_WIDTH_INPUT_VALUE = document.getElementById(
  "virtualizer_WIDTH_INPUT_VALUE",
);

// Update on slider move
virtualizer_WIDTH_INPUT.addEventListener("input", (e) => {
  const v = Number(e.target.value);
  const p = String((Math.abs(v) * 100).toFixed(0) + "%");
  virtualizer_WIDTH_INPUT_VALUE.textContent =
    v <= -0.01 ? p + " MERGE" : v >= 0.01 ? p + " SEPARATE" : "NORMAL";

  const s = v <= -0.01 ? v : virtualizerEncoded.checked ? v * 0.75 : v;

  virtualizer.setSeparation(s);
  localStorage.setItem("virtualizerInput", v);
});

virtualizer_WIDTH_INPUT.value = savedInput;
virtualizer_WIDTH_INPUT.dispatchEvent(new Event("input", { bubbles: true }));

virtualizerEncoded.addEventListener("change", () => {
  localStorage.setItem("virtualizer_ENCODED", virtualizerEncoded.checked);
  virtualizer.setOutputMode(virtualizerEncoded.checked ? "encoded" : "decoded");
  virtualizer_WIDTH_INPUT.dispatchEvent(new Event("input", { bubbles: true }));
});
virtualizerEncoded.dispatchEvent(new Event("change"));

mixerNode.connect(nodeToSurround);

const masterVolume = audioCtx.createGain();

let animationInterval = null;
let animationInterval2 = null;

function animateGain(direction) {
  if (!masterSound) return;
  clearInterval(animationInterval);

  const step = 0.01;
  const intervalTime = 10;
  const target = direction ? 1 : 0;

  animationInterval = setInterval(() => {
    if (direction) {
      // Animate up
      masterSound.gain.value += step;
      if (masterSound.gain.value >= target) {
        masterSound.gain.value = target;
        clearInterval(animationInterval);
      }
    } else {
      // Animate down
      masterSound.gain.value -= step;
      if (masterSound.gain.value <= target) {
        masterSound.gain.value = target;
        clearInterval(animationInterval);
      }
    }
  }, intervalTime);
}

var SurroundtoDSP = audioCtx.createGain();
SurroundtoDSP.gain.value = 1;
SurroundtoNode.connect(SurroundtoDSP);

const SFXSTUDIO_FX_PROCESS01_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS02_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS03_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS04_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS05_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS06_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS07_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS08_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS09_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS10_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS11_OUT = audioCtx.createGain();
const SFXSTUDIO_FX_PROCESS12_OUT = audioCtx.createGain();
const SFXSTUDIO_OSC = audioCtx.createGain();

const bass = new BassEffect(
  audioCtx,
  SurroundtoDSP,
  SFXSTUDIO_FX_PROCESS01_OUT,
);
bass.setGain(0);
bass.setFrequency(100);

const mid = new MidEffect(
  audioCtx,
  SFXSTUDIO_FX_PROCESS01_OUT,
  SFXSTUDIO_FX_PROCESS02_OUT,
);
mid.setGain(0);
mid.setFrequency(500);

const high = new TrebleEffect(
  audioCtx,
  SFXSTUDIO_FX_PROCESS02_OUT,
  SFXSTUDIO_FX_PROCESS03_OUT,
);
high.setGain(0);
high.setFrequency(1000);

const lowcut = new CutoffEffect(
  audioCtx,
  SFXSTUDIO_FX_PROCESS03_OUT,
  SFXSTUDIO_FX_PROCESS04_OUT,
);

lowcut.setType("lowpass");
lowcut.setFrequency(16000);
lowcut.setQ(0);

const highcut = new CutoffEffect(
  audioCtx,
  SFXSTUDIO_FX_PROCESS04_OUT,
  SFXSTUDIO_FX_PROCESS05_OUT,
);

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
  freqSlider.value = savedFreqValue !== null ? Number(savedFreqValue) : def;
  freqSlider.dispatchEvent(new Event("input"));

  const QSlider = document.getElementById(param + "_Q_SLIDER");
  const QSliderValue = document.getElementById(param + "_Q_VALUE");

  QSlider.addEventListener("input", (e) => {
    node.setGain(Number(e.target.value));
    QSliderValue.textContent = Number(e.target.value).toFixed(2);
    localStorage.setItem("SFXSTUDIO_FX_Q_" + param, Number(e.target.value));
  });

  const savedQValue = localStorage.getItem("SFXSTUDIO_FX_Q_" + param);
  QSlider.value = savedQValue !== null ? Number(savedQValue) : 0;
  QSlider.dispatchEvent(new Event("input"));

  const Switch = document.getElementById(param + "_SWITCH");

  Switch.addEventListener("change", (e) => {
    if (e.target.checked) {
      node.Unbypass();
      localStorage.setItem("SFXSTUDIO_FX_" + param + "_ENABLED", "true");
    } else {
      node.Bypass();
      localStorage.setItem("SFXSTUDIO_FX_" + param + "_ENABLED", "false");
    }
  });

  Switch.checked =
    localStorage.getItem("SFXSTUDIO_FX_" + param + "_ENABLED") === "true";

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
      value >= 1000 ? value / 1000 + "kHz" : value + "Hz";

    node.setAnimation(value, window.CUTOFF_ANIMATIONTIME);
    // Save the actual slider value
    localStorage.setItem(param + "_CUTOFF_VALUE", sliderValue);
  });

  const savedValue = localStorage.getItem(param + "_CUTOFF_VALUE");
  Slider.value = savedValue !== null ? Number(savedValue) : def;
  Slider.dispatchEvent(new Event("input"));
}

setupCutoffSlider("LOWCUT", lowcut, 0.02);
setupCutoffSlider("HIGHCUT", highcut, 16);

const AnimationSlider = document.getElementById("ANIMATIONTIME_SLIDER");
const AnimationSliderText = document.getElementById("ANIMATIONTIME_TEXT");

AnimationSlider.addEventListener("input", (e) => {
  window.CUTOFF_ANIMATIONTIME = Number(e.target.value);
  AnimationSliderText.textContent = Number(e.target.value) + "sec/run";
  localStorage.setItem(
    "SFXSTUDIO_FX_CUTOFF_ANIMATIONTIMEVALUE",
    Number(e.target.value),
  );
});

const savedAnimtime = localStorage.getItem(
  "SFXSTUDIO_FX_CUTOFF_ANIMATIONTIMEVALUE",
);

AnimationSlider.value = savedAnimtime !== null ? Number(savedAnimtime) : 0;

AnimationSlider.dispatchEvent(new Event("input"));

const CUTOFF_SWITCH = document.getElementById("CUTOFF_SWITCH");

CUTOFF_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    lowcut.Unbypass();
    highcut.Unbypass();
    localStorage.setItem("SFXSTUDIO_FX_CUTOFF_ENABLED", "true");
  } else {
    lowcut.Bypass();
    highcut.Bypass();
    localStorage.setItem("SFXSTUDIO_FX_CUTOFF_ENABLED", "false");
  }
});

CUTOFF_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_CUTOFF_ENABLED") === "true";

CUTOFF_SWITCH.dispatchEvent(new Event("change"));

setupPassSlider("BASS", bass, 100);
setupPassSlider("MID", mid, 500);
setupPassSlider("HIGH", high, 1000);

const equalizer = new Equalizer(
  audioCtx,
  SFXSTUDIO_FX_PROCESS05_OUT,
  SFXSTUDIO_FX_PROCESS06_OUT,
);

const flanger = new Flanger(
  audioCtx,
  SFXSTUDIO_FX_PROCESS06_OUT,
  SFXSTUDIO_FX_PROCESS07_OUT,
);

const FLANGER_PRESETS = {
  subtle: {
    wet: 0.35,
    depth: 0.4,
    cycleBeats: 16,
    bpm: 120,
    clipThr: 1.0,
    clipMax: 0,
    fb: 0.3,
  },
  classic: {
    wet: 0.6,
    depth: 0.7,
    cycleBeats: 8,
    bpm: 120,
    clipThr: 1.0,
    clipMax: 0,
    fb: 0.55,
  },
  jet: {
    wet: 0.8,
    depth: 1.0,
    cycleBeats: 32,
    bpm: 128,
    clipThr: 1.0,
    clipMax: 0,
    fb: 0.8,
  },
  slowWash: {
    wet: 0.7,
    depth: 0.9,
    cycleBeats: 128,
    bpm: 90,
    clipThr: 1.0,
    clipMax: 0,
    fb: 0.6,
  },
  fastWobble: {
    wet: 0.5,
    depth: 0.3,
    cycleBeats: 2,
    bpm: 160,
    clipThr: 1.0,
    clipMax: 0,
    fb: 0.4,
  },
  gritty: {
    wet: 0.75,
    depth: 0.8,
    cycleBeats: 8,
    bpm: 140,
    clipThr: 0.85,
    clipMax: 6,
    fb: 0.9,
  },
};

function applyFlangerPreset(fl, name) {
  const p = FLANGER_PRESETS[name];
  if (!p) return;
  fl.setWet(p.wet);
  fl.setDepth(p.depth);
  fl.setCycleBeats(p.cycleBeats);
  fl.setBpm(p.bpm);
  fl.setClipperThreshold(p.clipThr);
  fl.setClipperMax(p.clipMax);
  fl.setFeedback(p.fb);
}

applyFlangerPreset(flanger, "classic");

function setupFlangerSlider(param, node, def, cfg) {
  const Slider = document.getElementById("FLANGER_" + param + "_SLIDER");
  const SliderText = document.getElementById(
    "FLANGER_" + param + "_SLIDER_VALUE",
  );
  if (!Slider) return;

  // slider range comes from the config below
  Slider.min = cfg.min;
  Slider.max = cfg.max;
  Slider.step = cfg.step;

  Slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    const text = cfg.fmt(value);

    if (SliderText) SliderText.textContent = text;

    node(value);
    localStorage.setItem("SFXSTUDIO_FLANGER_VALUE_" + param, value);
  });

  const savedValue = localStorage.getItem("SFXSTUDIO_FLANGER_VALUE_" + param);
  Slider.value = savedValue !== null ? Number(savedValue) : def;
  Slider.dispatchEvent(new Event("input"));
}

function setupFlangerSliders(fl) {
  // min / max / step / default / display format for each of the 7 sliders
  const FLANGER_SLIDERS = {
    wet: {
      min: 0,
      max: 1,
      step: 0.01,
      def: 0.5,
      fmt: (v) => Math.round(v * 100) + " %",
      set: (v) => fl.setWet(v),
    },
    depth: {
      min: 0,
      max: 1,
      step: 0.01,
      def: 0.5,
      fmt: (v) => Math.round(v * 100) + " %",
      set: (v) => fl.setDepth(v),
    },
    cycleBeats: {
      min: 2,
      max: 128,
      step: 1,
      def: 8,
      fmt: (v) => v + " beats",
      set: (v) => fl.setCycleBeats(v),
    },
    bpm: {
      min: 40,
      max: 250,
      step: 1,
      def: 120,
      fmt: (v) => v + " BPM",
      set: (v) => fl.setBpm(v),
    },
    clipThreshold: {
      // slider 0..1 -> -100..0 dB
      min: 0.85,
      max: 1,
      step: 0.01,
      def: 1,
      fmt: (v) => (-100 + v * 100).toFixed(0) + " dB",
      set: (v) => fl.setClipperThreshold(v),
    },
    clipMax: {
      min: -48,
      max: 3,
      step: 0.5,
      def: 0,
      fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " dB",
      set: (v) => fl.setClipperMax(v),
    },
    feedback: {
      min: 0,
      max: 0.95,
      step: 0.01,
      def: 0.5,
      fmt: (v) => Math.round(v * 100) + " %",
      set: (v) => fl.setFeedback(v),
    },
  };

  for (const param in FLANGER_SLIDERS) {
    const c = FLANGER_SLIDERS[param];
    setupFlangerSlider(param, c.set, c.def, c);
  }
}

setupFlangerSliders(flanger);

const FLANGER_SWITCH = document.getElementById("FLANGER_SWITCH");

FLANGER_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    flanger.unbypass();
    localStorage.setItem("SFXSTUDIO_FX_FLANGER_ENABLED", "true");
  } else {
    flanger.bypass();
    localStorage.setItem("SFXSTUDIO_FX_FLANGER_ENABLED", "false");
  }
});

FLANGER_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_FLANGER_ENABLED") === "true";

FLANGER_SWITCH.dispatchEvent(new Event("change"));

function setupBitCrusherSlider(param, node, def, cfg) {
  const Slider = document.getElementById("BITCRUSHER_" + param + "_SLIDER");
  const SliderText = document.getElementById(
    "BITCRUSHER_" + param + "_SLIDER_VALUE",
  );
  if (!Slider) return;

  // slider range comes from the config below
  Slider.min = cfg.min;
  Slider.max = cfg.max;
  Slider.step = cfg.step;

  Slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    const text = cfg.fmt(value);

    if (SliderText) SliderText.textContent = text;

    node(value);
    localStorage.setItem("SFXSTUDIO_BITCRUSHER_VALUE_" + param, value);
  });

  const savedValue = localStorage.getItem(
    "SFXSTUDIO_BITCRUSHER_VALUE_" + param,
  );
  Slider.value = savedValue !== null ? Number(savedValue) : def;
  Slider.dispatchEvent(new Event("input"));
}

function setupBitCrusherSliders(bc) {
  const sr = bc.audioCtx.sampleRate;

  // min / max / step / default / display format for each slider
  const BITCRUSHER_SLIDERS = {
    bits: {
      min: 6,
      max: 16,
      step: 1,
      def: 8,
      fmt: (v) => v + (v === 1 ? " bit" : " bits"),
      set: (v) => bc.setBits(v),
    },
    downsample: {
      min: 1,
      max: 64,
      step: 1,
      def: 4,
      fmt: (v) => "x" + v + " (" + Math.round(sr / v) + " Hz)",
      set: (v) => bc.setDownsample(v),
    },
    wet: {
      min: 0,
      max: 1,
      step: 0.01,
      def: 1,
      fmt: (v) => Math.round(v * 100) + " %",
      set: (v) => bc.setWet(v),
    },
    outputGain: {
      min: -48,
      max: 48,
      step: 0.5,
      def: 0,
      fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " dB",
      set: (v) => bc.setOutputGain(v),
    },
  };

  for (const param in BITCRUSHER_SLIDERS) {
    const c = BITCRUSHER_SLIDERS[param];
    setupBitCrusherSlider(param, c.set, c.def, c);
  }
}

const bc = new BitCrusher(
  audioCtx,
  SFXSTUDIO_FX_PROCESS07_OUT,
  SFXSTUDIO_FX_PROCESS08_OUT,
);
setupBitCrusherSliders(bc);

const BITCRUSHER_SWITCH = document.getElementById("BITCRUSHER_SWITCH");

BITCRUSHER_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    bc.unbypass();
    localStorage.setItem("SFXSTUDIO_FX_BITCRUSHER_ENABLED", "true");
  } else {
    bc.bypass();
    localStorage.setItem("SFXSTUDIO_FX_BITCRUSHER_ENABLED", "false");
  }
});

BITCRUSHER_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_BITCRUSHER_ENABLED") === "true";

BITCRUSHER_SWITCH.dispatchEvent(new Event("change"));

const phaser = new Phaser(
  audioCtx,
  SFXSTUDIO_FX_PROCESS09_OUT,
  SFXSTUDIO_FX_PROCESS10_OUT,
);

function setupPhaserSlider(param, def, cfg) {
  const slider = document.getElementById("PHASER_" + param + "_SLIDER");
  const sliderText = document.getElementById(
    "PHASER_" + param + "_SLIDER_VALUE",
  );
  if (!slider) return;

  slider.min = cfg.min;
  slider.max = cfg.max;
  slider.step = cfg.step;

  slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    const text = cfg.fmt(value);

    if (sliderText) sliderText.textContent = text;

    phaser[param](value);
    localStorage.setItem("SFXSTUDIO_PHASER_VALUE_" + param, value);
  });

  const savedValue = localStorage.getItem("SFXSTUDIO_PHASER_VALUE_" + param);
  slider.value = savedValue !== null ? Number(savedValue) : def;
  slider.dispatchEvent(new Event("input"));
}

const PHASER_SLIDERS = {
  rate: {
    min: 0.01,
    max: 8,
    step: 0.01,
    def: 0.4,
    fmt: (v) => v.toFixed(2) + " Hz",
  },
  depth: {
    min: 0,
    max: 1,
    step: 0.01,
    def: 0.6,
    fmt: (v) => Math.round(v * 100) + " %",
  },
  center: {
    min: 20,
    max: 20000,
    step: 1,
    def: 800,
    fmt: (v) => Math.round(v) + " Hz",
  },
  stages: {
    min: 2,
    max: 12,
    step: 1,
    def: 6,
    fmt: (v) => v + " stages",
  },
  feedback: {
    min: 0,
    max: 0.95,
    step: 0.01,
    def: 0.5,
    fmt: (v) => Math.round(v * 100) + " %",
  },
  wet: {
    min: 0,
    max: 1,
    step: 0.01,
    def: 0.5,
    fmt: (v) => Math.round(v * 100) + " %",
  },
};

for (const param in PHASER_SLIDERS) {
  const cfg = PHASER_SLIDERS[param];
  setupPhaserSlider(param, cfg.def, cfg);
}

const PHASER_CHECK = document.getElementById("PHASER_CHECK");

PHASER_CHECK.addEventListener("change", (e) => {
  if (e.target.checked) {
    phaser.unbypass();
    localStorage.setItem("SFXSTUDIO_FX_PHASER_ENABLED", "true");
  } else {
    phaser.bypass();
    localStorage.setItem("SFXSTUDIO_FX_PHASER_ENABLED", "false");
  }
});

PHASER_CHECK.checked =
  localStorage.getItem("SFXSTUDIO_FX_PHASER_ENABLED") === "true";

PHASER_CHECK.dispatchEvent(new Event("change"));

const echo = new Echo(audioCtx, SFXSTUDIO_FX_PROCESS10_OUT, SFXSTUDIO_FX_PROCESS11_OUT);

function setupEchoSlider(param, cfg) {
  const name = param.toUpperCase();
  const slider = document.getElementById("ECHO_" + name + "_SLIDER");
  if (!slider) return;

  const sliderText = document.getElementById("ECHO_" + name + "_SLIDER_VALUE");
  const storageKey = "SFXSTUDIO_ECHO_VALUE_" + name;

  slider.min = cfg.min;
  slider.max = cfg.max;
  slider.step = cfg.step;
  slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    const text = cfg.fmt(value);
    if (sliderText) sliderText.textContent = text;
    echo[param](value);
    localStorage.setItem(storageKey, value);
  });

  const savedValue = localStorage.getItem(storageKey);
  slider.value = savedValue !== null ? Number(savedValue) : cfg.def;
  slider.dispatchEvent(new Event("input"));
}

const ECHO_SLIDERS = {
  wet: {
    min: 0,
    max: 1,
    step: 0.01,
    def: 0.5,
    fmt: (v) => Math.round(v * 100) + " %",
  },
  feedback: {
    min: 0,
    max: 1,
    step: 0.01,
    def: 0.5,
    fmt: (v) => Math.round(v * 100) + " %",
  },
  echoes: {
    min: 1,
    max: 10,
    step: 1,
    def: 3,
    fmt: (v) => v + (v === 1 ? " repeat" : " repeats"),
  },
  time: {
    min: 1,
    max: 2000,
    step: 1,
    def: 250,
    fmt: (v) => v + " ms",
  },
  tempo: {
    min: 40,
    max: 250,
    step: 1,
    def: 120,
    fmt: (v) => v + " BPM",
  },
  beat: {
    min: 0.25,
    max: 1,
    step: 0.25,
    def: 0.5,
    fmt: (v) => v + (v === 1 ? " beat" : " beats"),
  },
};

for (const param in ECHO_SLIDERS) {
  setupEchoSlider(param, ECHO_SLIDERS[param]);
}

const ECHO_CHECK = document.getElementById("ECHO_CHECK");

ECHO_CHECK.addEventListener("change", (e) => {
  if (e.target.checked) {
    echo.unbypass();
    localStorage.setItem("SFXSTUDIO_FX_ECHO_ENABLED", "true");
  } else {
    echo.bypass();
    localStorage.setItem("SFXSTUDIO_FX_ECHO_ENABLED", "false");
  }
});

ECHO_CHECK.checked =
  localStorage.getItem("SFXSTUDIO_FX_ECHO_ENABLED") === "true";

ECHO_CHECK.dispatchEvent(new Event("change"));

const reverb = new ReverbEffect(audioCtx, SFXSTUDIO_FX_PROCESS11_OUT, SFXSTUDIO_FX_PROCESS12_OUT);
const truesound3d = new TrueSound(audioCtx, SFXSTUDIO_FX_PROCESS12_OUT, preamp, true);

const TrueSound_SLIDERS = {
  strength: { min: 0.5, max: 1, step: 0.01, def: 0.5, format: (v) => `${Math.round(v * 100)}%` },
  mix: { min: 0, max: 1, step: 0.01, def: 0.5, format: (v) => `${Math.round(v * 100)}%` },
  focus: { min: 100, max: 8000, step: 1, def: 1000, format: (v) => `${Math.round(v)} Hz` },
  delay: { min: -5, max: 5, step: 0.1, def: 0, format: (v) => `${v}` },
  chorusRate: { min: 0, max: 1, step: 0.01, def: 0.5, format: (v) => `${gainTodB(v)}` },
  chorusDepth: { min: 0, max: 1, step: 0.01, def: 0.5, format: (v) => `${gainTodB(v)}` },
  wide: { min: 0, max: 1, step: 0.01, def: 50, format: (v) => `${Math.round(v * 100)}%` },
  juno: { min: 0, max: 1, step: 0.01, def: 50, format: (v) => `${Math.round(v * 100)}%` },
  atmosphere: { min: 0, max: 1, step: 0.01, def: 100, format: (v) => `${Math.round(v * 100)} %` },
};

const TrueSoundSliderElements = {};
for (const [param, cfg] of Object.entries(TrueSound_SLIDERS)) {
  const slider = document.getElementById(`TrueSound_${param.toUpperCase()}_SLIDER`);
  if (!slider) continue;

  slider.min = cfg.min;
  slider.max = cfg.max;
  slider.step = cfg.step;
  const saved = localStorage.getItem(`SFXSTUDIO_TrueSound_${param.toUpperCase()}`);
  slider.value = saved !== null ? Number(saved) : cfg.def;
  TrueSoundSliderElements[param] = slider;
}

for (const [param, slider] of Object.entries(TrueSoundSliderElements)) {
  const cfg = TrueSound_SLIDERS[param];
  const label = document.getElementById(`TrueSound_${param.toUpperCase()}_SLIDER_VALUE`);

  slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    const text = cfg.format(value);
    if (label) label.textContent = text;
    localStorage.setItem(`SFXSTUDIO_TrueSound_${param.toUpperCase()}`, value);
    truesound3d[param](value);
  });
}

for (const slider of Object.values(TrueSoundSliderElements)) {
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

const TRUESOUND_CHECK = document.getElementById("TRUESOUND_CHECK");

TRUESOUND_CHECK.addEventListener("change", (e) => {
  if (e.target.checked) {
    truesound3d.unbypass();
    localStorage.setItem("SFXSTUDIO_FX_TRUESOUND_ENABLED", "true");
  } else {
    truesound3d.bypass();
    localStorage.setItem("SFXSTUDIO_FX_TRUESOUND_ENABLED", "false");
  }
});

TRUESOUND_CHECK.checked =
  localStorage.getItem("SFXSTUDIO_FX_TRUESOUND_ENABLED") === "true";

TRUESOUND_CHECK.dispatchEvent(new Event("change"));

reverb.setDry(1.0);
reverb.setWet(0.35);

const reverbWaveform = document.getElementById("reverbWaveform");

const reverbsliders = [
  "DRY",
  "WET",
  "DIFFUSION",
  "DENSITY",
  "REFLECTION",
  "DELAY",
  "DECAY",
  "RATIO",
];

function setupReverbSliders(param, node, def) {
  const Slider = document.getElementById("REVERB_" + param + "_SLIDER");
  const SliderText = document.getElementById(
    "REVERB_" + param + "_SLIDER_VALUE",
  );

  Slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    SliderText.textContent = gainTodB(Number(e.target.value));
    node(value);
    localStorage.setItem("SFXSTUDIO_FX_VALUE_" + param, value);
  });

  const savedValue = localStorage.getItem("SFXSTUDIO_FX_VALUE_" + param);
  Slider.value = savedValue !== null ? Number(savedValue) : def;
  Slider.dispatchEvent(new Event("input"));
}

function setIR() {
  let arrayvalue = [];

  for (i = 2; i <= 7; i++) {
    const value = document.getElementById(
      "REVERB_" + reverbsliders[i] + "_SLIDER",
    ).value;
    arrayvalue.push(value);
  }

  reverb.setIR(
    arrayvalue[0],
    arrayvalue[1],
    arrayvalue[2],
    arrayvalue[3],
    arrayvalue[4],
    arrayvalue[5],
    reverbWaveform,
  );
}

function setupReverbSliders_IR(param, def, unit) {
  const Slider = document.getElementById("REVERB_" + param + "_SLIDER");
  const SliderText = document.getElementById(
    "REVERB_" + param + "_SLIDER_VALUE",
  );

  Slider.addEventListener("change", (e) => {
    setIR();
  });

  Slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    SliderText.textContent = Number(e.target.value).toFixed(2) + unit;
    localStorage.setItem("SFXSTUDIO_FX_VALUE_" + param, value);
  });

  const savedValue = localStorage.getItem("SFXSTUDIO_FX_VALUE_" + param);

  Slider.value = savedValue !== null ? Number(savedValue) : def;

  Slider.dispatchEvent(new Event("input"));
}

function setupReverbSlidersRatio(param, def) {
  const Slider = document.getElementById("REVERB_" + param + "_SLIDER");
  const SliderText = document.getElementById(
    "REVERB_" + param + "_SLIDER_VALUE",
  );

  Slider.addEventListener("change", (e) => {
    setIR();
  });

  Slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    SliderText.innerHTML =
      (value >= 1 ? "B" : value >= 0.5 ? "N" : "D") +
      " " +
      Formats.ratioText(Number(e.target.value));
    localStorage.setItem("SFXSTUDIO_FX_VALUE_" + param, value);
  });

  const savedValue = localStorage.getItem("SFXSTUDIO_FX_VALUE_" + param);

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

const REVERB_SWITCH = document.getElementById("REVERB_SWITCH");

REVERB_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    reverb.Unbypass();
    localStorage.setItem("SFXSTUDIO_FX_REVERB_ENABLED", "true");
  } else {
    reverb.Bypass();
    localStorage.setItem("SFXSTUDIO_FX_REVERB_ENABLED", "false");
  }
});

REVERB_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_REVERB_ENABLED") === "true";

REVERB_SWITCH.dispatchEvent(new Event("change"));

const eqSliders = [
  "eq0",
  "eq1",
  "eq2",
  "eq3",
  "eq4",
  "eq5",
  "eq6",
  "eq7",
  "eq8",
  "eq9",
  "eq10",
  "eq11",
];

eqSliders.forEach((slider, band) => {
  const el = document.getElementById(slider);
  const el_text = document.getElementById(slider + "_text");

  el.addEventListener("input", (e) => {
    equalizer.setGain(band, Number(el.value));
    el_text.textContent = Formats.formatDecibelLabel(Number(el.value));
    localStorage.setItem(slider + "BandValue", Number(el.value));
  });

  const savedValue = localStorage.getItem(slider + "BandValue");

  el.value = savedValue !== null ? Number(savedValue) : 0;

  el.dispatchEvent(new Event("input"));
});

const eqSwitch = document.getElementById("eqSwitch");

eqSwitch.addEventListener("change", (e) => {
  if (e.target.checked) {
    equalizer.Unbypass();
    localStorage.setItem("SFXSTUDIO_FX_EQ_ENABLED", "true");
  } else {
    equalizer.Bypass();
    localStorage.setItem("SFXSTUDIO_FX_EQ_ENABLED", "false");
  }
});

eqSwitch.checked = localStorage.getItem("SFXSTUDIO_FX_EQ_ENABLED") === "true";

eqSwitch.dispatchEvent(new Event("change"));

const semi = audioCtx.createGain();
const final = audioCtx.createGain();
const compressor = new Compressor(audioCtx, semi, final);

const srsspectatemp = audioCtx.createGain();
srsspectatemp.gain.value = 1;

const ONAIR_GAIN = audioCtx.createGain();

const osc_fx = new OscillatorEffect(audioCtx, SFXSTUDIO_OSC);
const OSC_SWITCH = document.getElementById("OSC_SWITCH");

OSC_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    localStorage.setItem("SFXSTUDIO_FX_OSC_SWITCH", "true");
  } else {
    localStorage.setItem("SFXSTUDIO_FX_OSC_SWITCH", "false");
  }

  osc_fx.switch(e.target.checked);
});

OSC_SWITCH.checked = localStorage.getItem("SFXSTUDIO_FX_OSC_SWITCH") === "true";
OSC_SWITCH.dispatchEvent(new Event("change"));

const OSC_FREQUENCY = document.getElementById("OSC_FREQUENCY");
const OSC_FREQUENCY_VALUE = document.getElementById("OSC_FREQUENCY_VALUE");

// Update on slider move
OSC_FREQUENCY.addEventListener("input", (e) => {
  OSC_FREQUENCY_VALUE.textContent = Number(e.target.value).toFixed(0) + "Hz";
  localStorage.setItem("SFXSTUDIO_FX_OSC_FREQUENCY", e.target.value); // save
  osc_fx.frequency(Number(e.target.value));
});

OSC_FREQUENCY.addEventListener("contextmenu", () => {
  OSC_FREQUENCY.value = 440;
  OSC_FREQUENCY.dispatchEvent(new Event("input", { bubbles: true }));
});

OSC_FREQUENCY.value = localStorage.getItem("SFXSTUDIO_FX_OSC_FREQUENCY") || 440;
OSC_FREQUENCY.dispatchEvent(new Event("input", { bubbles: true }));

document.querySelectorAll(".osctype_set").forEach((btn) => {
  const type = btn.dataset.type;

  btn.addEventListener("click", () => {
    osc_fx.waveshape(type);
    localStorage.setItem("OSC_TYPE", type);
  });
});

osc_fx.waveshape(localStorage.getItem("OSC_TYPE") || "sine");

document.querySelectorAll(".oscch_set").forEach((btn) => {
  const type = btn.dataset.type;

  btn.addEventListener("click", () => {
    osc_fx.setChannel(type);
    localStorage.setItem("OSC_CHANNEL", type);
  });
});

osc_fx.waveshape(localStorage.getItem("OSC_CHANNEL") || "0");

const OSC_GAIN = document.getElementById("OSC_GAIN");
const OSC_GAIN_VALUE = document.getElementById("OSC_GAIN_VALUE");

// Update on slider move
OSC_GAIN.addEventListener("input", (e) => {
  OSC_GAIN_VALUE.textContent = gainTodB(Number(e.target.value));
  localStorage.setItem("SFXSTUDIO_FX_OSC_GAIN", e.target.value); // save
  SFXSTUDIO_OSC.gain.value = Number(e.target.value);
});

OSC_GAIN.addEventListener("contextmenu", () => {
  OSC_GAIN.value = 1;
  OSC_GAIN.dispatchEvent(new Event("input", { bubbles: true }));
});

OSC_GAIN.value = localStorage.getItem("SFXSTUDIO_FX_OSC_GAIN") || 1;
OSC_GAIN.dispatchEvent(new Event("input", { bubbles: true }));

SFXSTUDIO_OSC.connect(faderNode);

const chorus = new Chorus(
  audioCtx,
  SFXSTUDIO_FX_PROCESS08_OUT,
  SFXSTUDIO_FX_PROCESS09_OUT,
);

const chorusControls = [
  {
    id: "chorus_wet",
    method: "wet",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.5,
  },
  {
    id: "chorus_depth",
    method: "depth",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0.5,
  },
  {
    id: "chorus_rate",
    method: "rate",
    min: 0.05,
    max: 10,
    step: 0.01,
    defaultValue: 1,
    unit: "Hz",
  },
  {
    id: "chorus_delay",
    method: "delay",
    min: 5,
    max: 50,
    step: 0.1,
    defaultValue: 20,
    unit: "ms",
  },
  {
    id: "chorus_voices",
    method: "voices",
    min: 1,
    max: 6,
    step: 1,
    defaultValue: 3,
  },
  {
    id: "chorus_spread",
    method: "spread",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 1,
  },
  {
    id: "chorus_feedback",
    method: "feedback",
    min: 0,
    max: 0.7,
    step: 0.01,
    defaultValue: 0,
  },
  {
    id: "chorus_lowcut",
    method: "lowcut",
    min: 20,
    max: 1000,
    step: 1,
    defaultValue: 20,
    unit: "Hz",
  },
];

chorusControls.forEach(
  ({ id, method, min, max, step, defaultValue, unit = "" }) => {
    const slider = document.getElementById(id);
    if (!slider) return;

    slider.min = min;
    slider.max = max;
    slider.step = step;

    const valueElement = document.getElementById(`${id}_text`);
    const updateChorusControl = () => {
      const value = Number(slider.value);
      chorus[method](value);
      localStorage.setItem(`SFXSTUDIO_FX_${id.toUpperCase()}`, value);
      if (valueElement)
        valueElement.textContent = unit ? `${value} ${unit}` : String(value);
    };

    const savedValue = localStorage.getItem(`SFXSTUDIO_FX_${id.toUpperCase()}`);
    slider.value = savedValue !== null ? Number(savedValue) : defaultValue;
    slider.addEventListener("input", updateChorusControl);
    slider.dispatchEvent(new Event("input"));
  },
);

const CHORUS_SWITCH = document.getElementById("CHORUS_SWITCH");

CHORUS_SWITCH.addEventListener("change", (e) => {
  if (e.target.checked) {
    chorus.unbypass();
    localStorage.setItem("SFXSTUDIO_FX_CHORUS_SWITCH", "true");
  } else {
    chorus.bypass();
    localStorage.setItem("SFXSTUDIO_FX_CHORUS_SWITCH", "false");
  }
});

CHORUS_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_CHORUS_SWITCH") === "true";
CHORUS_SWITCH.dispatchEvent(new Event("change"));

final.connect(masterVolume);
final.connect(ONAIR_GAIN);

const sg = new SurroundSoundGain(audioCtx, preamp, faderNode);
const dm = new SurroundSoundDownmix(audioCtx, faderNode, semi);

const compsliders = [
  document.getElementById("compthresholdSlider"),
  document.getElementById("compratioSlider"),
  document.getElementById("compattackSlider"),
  document.getElementById("comprelSlider"),
  document.getElementById("compkneeSlider"),
];

const compValue = [
  document.getElementById("compthresholdValue"),
  document.getElementById("compratioValue"),
  document.getElementById("compattackValue"),
  document.getElementById("comprelValue"),
  document.getElementById("compkneeValue"),
];

const compInfo = [
  document.getElementById("info_compthreshold"),
  document.getElementById("info_compratio"),
  document.getElementById("info_compattack"),
  document.getElementById("info_comprel"),
  document.getElementById("info_compknee"),
];

const compSettings = [
  {
    storageKey: "SFXSTUDIO_FX_COMP_THRESHOLD",
    defaultValue: 80,
    text: (value) => `${(value - 100).toFixed(2)}ohm`,
    parameter: (value) => value - 100,
  },
  {
    storageKey: "SFXSTUDIO_FX_COMP_RATIO",
    defaultValue: 4,
    text: (value) => Formats.ratioText(value),
  },
  {
    storageKey: "SFXSTUDIO_FX_COMP_ATTACK",
    defaultValue: 0.005,
    text: (value) => `${value}s`,
  },
  {
    storageKey: "SFXSTUDIO_FX_COMP_RELEASE",
    defaultValue: 0.2,
    text: (value) => `${value}s`,
  },
  {
    storageKey: "SFXSTUDIO_FX_COMP_KNEE",
    defaultValue: 24,
    text: (value) => `${value}ohm`,
  },
];

function setCompParam() {
  compressor.setParameters({
    threshold: compSettings[0].parameter(Number(compsliders[0].value)),
    ratio: Number(compsliders[1].value),
    attack: Number(compsliders[2].value),
    release: Number(compsliders[3].value),
    knee: Number(compsliders[4].value),
  });
}

compsliders.forEach((slider, index) => {
  const setting = compSettings[index];
  const savedValue = localStorage.getItem(setting.storageKey);

  slider.value = savedValue !== null ? Number(savedValue) : setting.defaultValue;

  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    const text = setting.text(value);

    compValue[index].textContent = text;
    compInfo[index].textContent = text;
    localStorage.setItem(setting.storageKey, value);
    setCompParam();
  });

  slider.dispatchEvent(new Event("input"));
});

masterVolume.connect(audioCtx.destination);
masterVolume.connect(masterGain);

const savedMaster = localStorage.getItem("masterVolume") || 1;
const masterSlider = document.getElementById("masterSlider");
const masterValue = document.querySelector(".masterSlider_container");

// Update on slider move
masterSlider.addEventListener("input", (e) => {
  faderNode.gain.value = Number(e.target.value);
  masterValue.dataset.value =
    gainTodB(e.target.value) +
    " " +
    (Number(e.target.value) * 100).toFixed(0) +
    "%";
  document.getElementById("info_master").textContent =
    masterValue.dataset.value;
  e.target.title = `VOLUME: \n` + masterValue.dataset.value;
  localStorage.setItem("masterVolume", e.target.value); // save
});

masterSlider.addEventListener("contextmenu", (e) => {
  masterSlider.value = 1;
  masterSlider.dispatchEvent(new Event("input", { bubbles: true }));
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

const audioCanvas = document.getElementById("audioForm");
const visualizer = new Visualizer(audioCanvas);
visualizer.resize(1024, 256);

window.UPDATECOLORS = () => {
  visualizer.setColors({
      micDark: micDarkColor,
      micLight: micLightColor,
      samplerDark: samplerDarkColor,
      samplerLight: samplerLightColor,
      listenDark: listenDarkColor,
      listenLight: listenLightColor,
      scopeColor: window.SCOPECOLOR[0],
      scopeColoronRecord: window.SCOPECOLOR[1],
  })
};

window.UPDATECOLORS();

window.SFXSTUDIOGAIN_SCOPE = 0.85;

const recTitle = document.getElementById("titleDisplay");
const recTimer = document.getElementById("timerDisplay");

const REC_BUTTONS = ["startRec", "resumeRec", "pauseRec", "stopRec", "discardRec"];

const REC_STATES = {
  idle:       [1, 0, 0, 0, 0],
  recording:  [0, 0, 1, 1, 1],
  paused:     [0, 1, 0, 1, 1],
  limit:      [0, 0, 0, 1, 0],  // limit reached: can only stop/export
  exporting:  [0, 0, 0, 0, 0],  // busy writing the WAV
};

function StatusRecord(state) {
  const flags = REC_STATES[state] || REC_STATES.idle;

  if (state === "idle") {
    recTimer.textContent = "Inactive";
    recTitle.textContent = "Record";
    visualizer.setRecording(false);
  } else if (state === "exporting") {
    recTitle.textContent = "Record";
    recTimer.textContent = "Exporting...";
    visualizer.setRecording(false);
  } else if (state === "recording") {
    recTitle.textContent = "Recording";
    visualizer.setRecording(true);
  } else if (state === "paused") {
    recTitle.textContent = "Paused";
    visualizer.setRecording(false);
  } else if (state === "limit") {
    recTitle.textContent = "Limit Reached";
    visualizer.setRecording(false);
  }

  REC_BUTTONS.forEach((id, i) => {
    document.getElementById(id).disabled = !flags[i];
  });
}

const rec = new Recorder(audioCtx, faderNode);
rec.onUpdate = (sec, hhmmss) => recTimer.textContent = hhmmss;
rec.onState = (s) => {console.log(s)};
rec.onComplete = (file) => {snackbar("Recording Saved!")};
rec.onFailed = (err) => {snackbar("Recording failed to save!")};

document.getElementById("startRec").onclick  = () => rec.start();
document.getElementById("resumeRec").onclick = () => rec.resume();
document.getElementById("pauseRec").onclick  = () => rec.pause();
document.getElementById("stopRec").onclick   = () => rec.export();
document.getElementById("discardRec").onclick   = () => rec.discard();

rec.onState = StatusRecord;
StatusRecord("idle"); // initial look

const SFXSTUDIO_RECORDER_WATERMARK = document.getElementById("SFXSTUDIO_RECORDER_WATERMARK");

SFXSTUDIO_RECORDER_WATERMARK.addEventListener("change", (e) => {
  const v = e.target.checked;
  rec.enableWatermark(v);
  localStorage.setItem("SFXSTUDIO_RECORDER_WATERMARK", v);
});

SFXSTUDIO_RECORDER_WATERMARK.checked = Boolean(localStorage.getItem("SFXSTUDIO_RECORDER_WATERMARK") === "true") || false;
SFXSTUDIO_RECORDER_WATERMARK.dispatchEvent(new Event("change"));

const SFXSTUDIO_RECORDER_LIMITER = document.getElementById("SFXSTUDIO_RECORDER_LIMITER");
SFXSTUDIO_RECORDER_LIMITER.addEventListener("change", (e) => {
  const v = e.target.checked;
  rec.enableLimiter(v);
  localStorage.setItem("SFXSTUDIO_RECORDER_LIMITER", v);
});

SFXSTUDIO_RECORDER_LIMITER.checked = Boolean(localStorage.getItem("SFXSTUDIO_RECORDER_LIMITER") === "true") || true;
SFXSTUDIO_RECORDER_LIMITER.dispatchEvent(new Event("change"));

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function bindRecorderSetting({ id, labelId, key, min, max, def, apply }) {
  const el = document.getElementById(id);
  el.min = min;
  el.max = max;

  el.addEventListener("change", (e) => {
    const v = clamp(Math.round(Number(e.target.value)) || min, min, max);
    e.target.value = v;                       // snap the box to the allowed value
    apply(v);
    document.getElementById(labelId).textContent = Formats.formatTimeFromNumber(v);
    localStorage.setItem(key, v);
  });

  el.value = localStorage.getItem(key) || def;
  el.dispatchEvent(new Event("change"));      // old saved values get snapped too
}

bindRecorderSetting({
  id: "SFXSTUDIO_RECORDER_MINUTELIMIT",
  labelId: "recordlimit",
  key: "SFXSTUDIO_RECORDER_MINUTELIMIT",
  min: 10, max: 180, def: 30,
  apply: (v) => rec.setMinuteLimit(v),
});

bindRecorderSetting({
  id: "SFXSTUDIO_RECORDER_MINUTESPLIT",
  labelId: "recordlimit2",
  key: "SFXSTUDIO_RECORDER_MINUTESPLIT",
  min: 1, max: 10, def: 1,
  apply: (v) => rec.setMinuteSplit(v),
});

const SFXSTUDIO_RECORDER_CHANNEL = document.getElementById("SFXSTUDIO_RECORDER_CHANNEL");
SFXSTUDIO_RECORDER_CHANNEL.addEventListener("change", (e) => {
  const v = Number(e.target.value);
  rec.setChannel(v);
  localStorage.setItem("SFXSTUDIO_RECORDER_CHANNEL", v);
});
SFXSTUDIO_RECORDER_CHANNEL.value = localStorage.getItem("SFXSTUDIO_RECORDER_CHANNEL") || 2;
SFXSTUDIO_RECORDER_CHANNEL.dispatchEvent(new Event("change"));

const SFXSTUDIO_RECORDER_PCMSIGN = document.getElementById("SFXSTUDIO_RECORDER_PCMSIGN");
SFXSTUDIO_RECORDER_PCMSIGN.addEventListener("change", (e) => {
  const v = Number(e.target.value);
  rec.setPCMSign(v);
  localStorage.setItem("SFXSTUDIO_RECORDER_PCMSIGN", v);
});
SFXSTUDIO_RECORDER_PCMSIGN.value = localStorage.getItem("SFXSTUDIO_RECORDER_PCMSIGN") || 24;
SFXSTUDIO_RECORDER_PCMSIGN.dispatchEvent(new Event("change"));

const rendererchannel = new BroadcastChannel("renderer-channel");

setInterval(() => {
  document.getElementById("info_samplerate").textContent =
    `${audioCtx.sampleRate}Hz`;
  document.getElementById("info_baselatency").textContent =
    `${Number(audioCtx.baseLatency).toFixed(3)}ms`;
  document.getElementById("info_outputlatency").textContent =
    `${Number(audioCtx.outputLatency).toFixed(3)}ms`;
  document.getElementById("audioCtx_currenttime").textContent =
    `${formatTimeFromNumber(audioCtx.currentTime)}`;
  document.getElementById("audioCtx_underruntime").textContent =
    `${formatTimeFromNumber(audioCtx.playbackStats.underrunDuration)}`;
  document.getElementById("info_lostbuffer").textContent =
    `${audioCtx.playbackStats.underrunEvents}`;

  rendererchannel.postMessage({
    sampleRate: audioCtx.sampleRate,
    underrunEvents: audioCtx.playbackStats.underrunEvents,
    underruntime: audioCtx.playbackStats.underrunDuration,
    currentTime: audioCtx.currentTime,
    baseLatency: audioCtx.baseLatency,
    outputLatency: audioCtx.outputLatency,
  });
}, 1000);

// Default values
const defaults = {
  dry: 0,
  wet: 0,
  preDelay: 0,
  roomSize: 0,
  irDuration: 0.1,
  irDecay: 0.1,
};

const merger = audioCtx.createChannelMerger(8);
merger.connect(masterVolume);

const checkboxUpmix = document.getElementById("UpmixCheckbox");
const upmixValue = document.getElementById("upmixValue");
var isCenterMuted = false;

// channelAssign holds current channel mapping as both array and string
// order: FRONTLEFT, FRONTRIGHT, CENTER, LFE, REARL, REARR, SIDEL, SIDER
var channelAssign = {
  array: [1, 1, 1, 1, 1, 1, 1, 1],
  string: "11111111",
};

function setSRSValueDownmix() {
  const enabled = checkboxUpmix.value;
  sg.channel[0].gain.value = channelAssign.array[0] != 1 ? 0 : document.getElementById("SRS_FRONTLEFT").value;
  sg.channel[1].gain.value = channelAssign.array[1] != 1 ? 0 : document.getElementById("SRS_FRONTRIGHT").value;
  sg.channel[2].gain.value = isCenterMuted ? 0 : channelAssign.array[2] != 1 ? 0 : document.getElementById("SRS_CENTER").value;
  sg.channel[3].gain.value = channelAssign.array[3] != 1 ? 0 : document.getElementById("SRS_LFE").value;
  sg.channel[4].gain.value = channelAssign.array[4] != 1 ? 0 : document.getElementById("SRS_REARL").value;
  sg.channel[5].gain.value = channelAssign.array[5] != 1 ? 0 : document.getElementById("SRS_REARR").value;
  sg.channel[6].gain.value = channelAssign.array[6] != 1 ? 0 : document.getElementById("SRS_SIDEL").value;
  sg.channel[7].gain.value = channelAssign.array[7] != 1 ? 0 : document.getElementById("SRS_SIDER").value;

  for (let i = 3; i < 8; i++) {
    dm.setGain(i, Number(upmixValue.value));        // LFE at half level
  }

  if (
    enabled == "mix" ||
    (enabled == "auto" && audioCtx.destination.maxChannelCount <= 3) ||
    enabled == "true"
  ) {
    dm.stereoMode = true;          // fold everything into L/R
  } else if (
    (enabled == "auto" && audioCtx.destination.maxChannelCount >= 3) ||
    enabled == "false"
  ) {
    dm.stereoMode = false;          // fold everything into L/R
  }
}

checkboxUpmix.addEventListener("change", () => {
  const enabled = checkboxUpmix.value;
  if (enabled == "true") {
    masterVolume.channelCount = 2;
  } else if (enabled == "auto") {
    masterVolume.channelCount =
      audioCtx.destination.maxChannelCount >= 3 ? 8 : 2;
  } else {
    masterVolume.channelCount = 8;
  }

  setSRSValueDownmix();
  document.getElementById("upMixValueText").textContent = gainTodB(
    upmixValue.value,
  );

  localStorage.setItem("UpmixEnabled", enabled);
});

checkboxUpmix.checked = localStorage.getItem("UpmixEnabled") === "auto";
checkboxUpmix.dispatchEvent(new Event("change"));

upmixValue.addEventListener("input", () => {
  checkboxUpmix.dispatchEvent(new Event("change"));
  setSRSValueDownmix();
  localStorage.setItem("UpmixValue", upmixValue.value);
});

const savedUpmix = localStorage.getItem("UpmixValue") || 1;

upmixValue.value = Number(savedUpmix);
upmixValue.dispatchEvent(new Event("input", { bubbles: true }));

function updateChannelAssignFromValues(values) {
  const order = [
    "FRONTLEFT",
    "FRONTRIGHT",
    "CENTER",
    "LFE",
    "REARL",
    "REARR",
    "SIDEL",
    "SIDER",
  ];
  const arr = order.map((k) => Number(values[k] || 0));
  channelAssign.array = arr;
  channelAssign.string = arr.join("");
}

function bindSRSLayoutButton(buttonId, values) {
  const button = document.getElementById(buttonId);
  if (!button) return;

  button.addEventListener("click", () => {
    updateChannelAssignFromValues(values);
    setSRSValueDownmix();

    const channels = ["CENTER", "LFE", "REARL", "REARR", "SIDEL", "SIDER"];

    for (let i = 0; i < 6; i++) {
      const ch = document.getElementById("SRS_" + channels[i]);
    }
  });
}

const srsLayoutPresets = {
  setsrs_stereo: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 0,
    LFE: 0,
    REARL: 0,
    REARR: 0,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_stereolfe: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 0,
    LFE: 1,
    REARL: 0,
    REARR: 0,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_three: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 1,
    LFE: 0,
    REARL: 0,
    REARR: 0,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_threelfe: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 1,
    LFE: 1,
    REARL: 0,
    REARR: 0,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_surround: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 1,
    LFE: 0,
    REARL: 1,
    REARR: 1,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_surroundlfe: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 1,
    LFE: 1,
    REARL: 1,
    REARR: 1,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_side: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 1,
    LFE: 0,
    REARL: 1,
    REARR: 1,
    SIDEL: 1,
    SIDER: 1,
  },
  setsrs_sidelfe: {
    FRONTLEFT: 1,
    FRONTRIGHT: 1,
    CENTER: 1,
    LFE: 1,
    REARL: 1,
    REARR: 1,
    SIDEL: 1,
    SIDER: 1,
  },
  setsrs_centeronly: {
    FRONTLEFT: 0,
    FRONTRIGHT: 0,
    CENTER: 1,
    LFE: 0,
    REARL: 0,
    REARR: 0,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_lfeonly: {
    FRONTLEFT: 0,
    FRONTRIGHT: 0,
    CENTER: 0,
    LFE: 1,
    REARL: 0,
    REARR: 0,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_rearonly: {
    FRONTLEFT: 0,
    FRONTRIGHT: 0,
    CENTER: 0,
    LFE: 0,
    REARL: 1,
    REARR: 1,
    SIDEL: 0,
    SIDER: 0,
  },
  setsrs_sideonly: {
    FRONTLEFT: 0,
    FRONTRIGHT: 0,
    CENTER: 0,
    LFE: 0,
    REARL: 0,
    REARR: 0,
    SIDEL: 1,
    SIDER: 1,
  },
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

function setupSurroundValueFader(channelstring) {
  const slider = document.getElementById(`SRS_${channelstring}`);
  const text = document.getElementById(`SRS_${channelstring}_text`);
  const text2 = document.getElementById(
    `info_srs_${channelstring.toLowerCase()}`,
  );

  const state =
    localStorage.getItem(`andromeda_audiosettings_save_${channelstring}`) || 1;

  slider.addEventListener("input", (e) => {
    setSRSValueDownmix();
    localStorage.setItem(
      `andromeda_audiosettings_save_${channelstring}`,
      Number(e.target.value),
    );
    text.textContent = gainTodB(e.target.value);
    text2.textContent = gainTodB(e.target.value);
  });

  slider.value = Number(state);
  slider.dispatchEvent(new Event("input"));
}

setupSurroundValueFader("FRONTLEFT");
setupSurroundValueFader("FRONTRIGHT");
setupSurroundValueFader("CENTER");
setupSurroundValueFader("LFE");
setupSurroundValueFader("REARL");
setupSurroundValueFader("REARR");
setupSurroundValueFader("SIDEL");
setupSurroundValueFader("SIDER");

let skipFrames = 0;
let frameCounter = 0;

const skipFramesSelector = document.getElementById("skipFramesSelector");
const frameratevalue = localStorage.getItem("framerate") || 30;

const fftbarsizeSelector = document.getElementById("FFTSizeSelector");
const fftbarsizevalue = localStorage.getItem("fftbarsize") || 512;

const visualizersplit = audioCtx.createChannelSplitter(8);

const analysermeter = audioCtx.createAnalyser();
analysermeter.fftSize = 2048;
analysermeter.minDecibels = -120;
analysermeter.maxDecibels = 6;
var timeData = new Uint8Array(analysermeter.frequencyBinCount);
var freqData = new Uint8Array(analysermeter.frequencyBinCount);

function valueToAngle(value) {
  const minValue = 0; // input minimum
  const maxValue = 120; // input maximum

  // Clamp the input
  const clamped = Math.min(Math.max(value, minValue), maxValue);

  // Convert to percent
  const percent = (clamped - minValue) / (maxValue - minValue); // 0 → 1

  // Map to angle
  return -45 + percent * 90; // -45 → +45
}

const vuLevels = {
  "#micdev": 0, // start at min dB
  "#sampler": 0,
};

function updateNeedleSmooth(query, rms) {
  const needle = document.querySelector(query);
  const targetDB = rms;
  const angle = valueToAngle(targetDB);
  needle.style.transform = `rotate(${angle}deg)`;
}

const videoElements = [
  document.getElementById("MediaExtDeck1"),
  document.getElementById("MediaExtDeck2"),
];

function updateFPSLimit() {
  // If any video has a src, limit to 48fps; otherwise 60fps
  FPS_LIMIT = videoElements.some((video) => video.src) ? 30 : 60;
  RATESKIP = videoElements.some((video) => video.src) ? 2 : 1;
}

// Observe changes in the 'src' attribute of each video
videoElements.forEach((video) => {
  if (!video) return;
  const observer = new MutationObserver(() => {
    updateFPSLimit();
  });
  observer.observe(video, { attributes: true, attributeFilter: ["src"] });
});

// Initial check
updateFPSLimit();

let VISUALIZER_TYPE = 0;

function clearBeforeSetVisualizer(index) {
  VISUALIZER_TYPE = index;
  localStorage.setItem("VISUALIZER_TYPE", index);
}

clearBeforeSetVisualizer(Number(localStorage.getItem("VISUALIZER_TYPE")) || 0);

let lasttotal = 0;
let detectNoArray = 0;

let dataL = 0;
let dataR = 0;
let levelL = 0;
let levelR = 0;
let levelLVU = 0;
let levelRVU = 0;

const meter = new LoudnessMeter(audioCtx, faderNode);
const totalpeaks_voltage = document.getElementById("totalpeaks_voltage");
const totalpeaks_watts = document.getElementById("totalpeaks_watts");

meter.onUpdate = (channels, total, volts, watts) => {
  totalpeaks_voltage.textContent = volts.total.text;
  totalpeaks_watts.textContent = watts.total.text;
  channels.forEach((ch, i) => {
    const el = document.querySelector(`.gainmeter_db[data-channel="${i}"]`);
    if (!el) return;
    el.dataset.value = ch.text;   // string like "-12.3 dB"
    // el.dataset.level = ch.level; // 0..1 if you also want the bar position
  });
};

meter.setMode('peak'); // 'peak' | 'rms' | 'lufs' | 'youtube' | 'disney'
meter.setUpdateMs(350);
meter.setSpeakerImpedance(8);
meter.setFullScaleDbu(24);

const voltageSelect = document.getElementById("meterVoltageSelect");
const VOLTAGE_KEY = "meterVoltageSelect";

// current reference voltage, always a number
function getVoltageRef() {
  return parseFloat(voltageSelect.value) || 0.7746;
}

voltageSelect.addEventListener("change", () => {
  try { localStorage.setItem(VOLTAGE_KEY, voltageSelect.value); } catch (e) {}
  meter.voltageReference = getVoltageRef();
});

// restore saved value (falls back to the default if missing or invalid)
try {
  const saved = localStorage.getItem(VOLTAGE_KEY);
  if (saved !== null && [...voltageSelect.options].some(o => o.value === saved)) {
    voltageSelect.value = saved;
    voltageSelect.dispatchEvent(new Event("change"));
  }
} catch (e) {}

const METER_MODES = [
  ['peak', 'Standard dB'],
  ['rms', 'RMS dB'],
  ['lufs', 'Standard LUFS'],
  ['youtube', 'YouTube LUFS'],
  ['disney', 'Disney LUFS'],
  ['blits', 'BLITS'],
  ['smpte', 'SMPTE'],
  ['isdb-t', 'Japanese ISDB-T'],
  ['voltage', 'Power Voltage'],
  ['ohm', 'Power Ohms'],
  ['watts', 'Power Wattage'],
];
const METER_MODE_KEY = 'meterMode';

function setupMeterModeSelect(meter, select) {
  if (!select || select.tagName !== 'SELECT') {
    console.error('setupMeterModeSelect needs a <select> element, got:', select);
    return;
  }

  // fill the options
  select.innerHTML = '';
  for (const [value, label] of METER_MODES) select.appendChild(new Option(label, value));

  // user picks a mode: apply it and save it
  select.addEventListener('change', () => {
    const selectedOption = select.options[select.selectedIndex];
    document.getElementById('audiometerformat').textContent = selectedOption ? selectedOption.text : '';
    meter.setMode(select.value);
    try { localStorage.setItem(METER_MODE_KEY, select.value); } catch (e) {}
  });

  // restore the saved mode, then fire 'change' so the handler above applies it
  let saved = 'peak';
  try { saved = localStorage.getItem(METER_MODE_KEY) || 'peak'; } catch (e) {}
  if (!METER_MODES.some((m) => m[0] === saved)) saved = 'peak';
  select.value = saved;
  select.dispatchEvent(new Event('change'));
}

setupMeterModeSelect(meter, document.getElementById('meterModeSelect'));

const meters = document.querySelector(".ANDROMEDA_METERS");
meters.dataset.orientation = localStorage.getItem("ANDROMEDA_METERS") || "portrait";

function updateAudioVisualizer(dataArray, timedata, peak1, peak2) {
  switch (VISUALIZER_TYPE) {
    case 2:
      visualizer.drawScope(timedata, window.SFXSTUDIOGAIN_SCOPE);
      break;
    default:
      visualizer.drawSpectrum(dataArray);
  }
}

let peakToLevel = (amplitude) => {
  if (amplitude <= 0) return 0;
  const db = 20 * Math.log10(amplitude);
  return Math.min(1, Math.max(0, (db + 60) / 72));
};

const _vumeterModuleLoaded = new WeakSet();
function createStereoMeter(audioCtx, sourceNode) {
  const channels = 8;
  let meterNode = null;
  let silentSink = null;

  const ready = (async () => {
    if (!_vumeterModuleLoaded.has(audioCtx)) {
      const blob = new Blob([MeterProcessorCode], { type: "text/javascript" });
      const moduleURL = URL.createObjectURL(blob);
      try {
        await audioCtx.audioWorklet.addModule(moduleURL);
        _vumeterModuleLoaded.add(audioCtx);
      } finally {
        URL.revokeObjectURL(moduleURL);
      }
    }

    meterNode = new AudioWorkletNode(audioCtx, "volume-meter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [channels],
      channelCount: channels,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      processorOptions: { channels, smoothing: 0.8, fps: 60 },
    });

    meterNode.port.onmessage = ({ data }) => {
      levelL = peakToLevel(data[0]);
      levelR = peakToLevel(data[2]);
      levelLVU = Math.round(levelL * 120);
      levelRVU = Math.round(levelR * 120);
    };
    meterNode.onprocessorerror = (error) =>
      console.error("[Stereo meter] Processor error:", error);

    sourceNode.connect(meterNode);
    silentSink = audioCtx.createGain();
    silentSink.gain.value = 0;
    meterNode.connect(silentSink);
    silentSink.connect(audioCtx.destination);
  })();

  ready.catch((error) => console.error("[Stereo meter] Setup failed:", error));

  let frameuse = null;
  let frameType = "raf"; // Track current frame type: 'raf' or 'interval'
  let lastFrameTime = 0;
  const frameInterval = 1000 / 60; // 60 fps limit

  function update() {
    analysermeter.getByteTimeDomainData(timeData);
    analysermeter.getByteFrequencyData(freqData);
  }

  window.FUNCTION_UPDATE[2] = update;

  return {
    get meterNode() {
      return meterNode;
    },
    ready,
  };
}

let smoothL = 0;
let smoothR = 0;

const release = 0.04; // seconds (meter fall speed)
let lastTime = performance.now();

function updateMeters() {
  updateNeedleSmooth(`#leftvu`, levelLVU);
  updateNeedleSmooth(`#rightvu`, levelRVU);
}

const gainmasterMeter = audioCtx.createGain();
gainmasterMeter.gain.value = 1;
gainmasterMeter.channelCount = 32;

createStereoMeter(audioCtx, gainmasterMeter);

masterVolume.connect(gainmasterMeter);
masterVolume.connect(visualizersplit);

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
  updateMeters(levelL, levelR);
  updateAudioVisualizer(freqData, timeData, levelL, levelR);

  total = freqData.reduce((sum, value) => sum + value, 0);
  lasttotal = total;
}

// Remember which contexts already registered the processor
// (registerProcessor throws if the same name is registered twice).
const _meterModuleLoaded = new WeakSet();

function createMasterMeter(audioCtx, masterVolumeNode, channels = 8) {
  // Prevent update-loop errors during initialization.
  window.FUNCTION_UPDATE ??= [];
  window.FUNCTION_UPDATE[1] = () => {};

  // Worklet + silent sink are created once the module has loaded.
  let meterNode = null;
  let silentSink = null;

  const ready = (async () => {
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch (e) {
        console.warn("[Meter] Could not resume AudioContext:", e);
      }
    }

    if (!_meterModuleLoaded.has(audioCtx)) {
      const blob = new Blob([MeterProcessorCode], { type: "text/javascript" });
      const moduleURL = URL.createObjectURL(blob);
      try {
        await audioCtx.audioWorklet.addModule(moduleURL);
        _meterModuleLoaded.add(audioCtx);
      } finally {
        URL.revokeObjectURL(moduleURL);
      }
    }

    meterNode = new AudioWorkletNode(audioCtx, "volume-meter", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [channels],
      channelCount: channels,
      channelCountMode: "explicit",
      channelInterpretation: "discrete",
      processorOptions: { channels, smoothing: 0.8, fps: 60 },
    });

    meterNode.onprocessorerror = (e) =>
      console.error("[Meter] Processor error:", e);

    // The worklet only stores levels; drawing happens in analyze(),
    // which your existing update loop calls (keeps drawGainmeter's
    // release behaviour identical to before).
    meterNode.port.onmessage = (e) => {
      const data = e.data;
      
      for (let i = 0; i < channels; i++) {
        latestLevels[i].peak = data[i * 2];
        latestLevels[i].rms = data[i * 2 + 1];
      }
    };

    masterVolumeNode.connect(meterNode);

    silentSink = audioCtx.createGain();
    silentSink.gain.value = 0;
    meterNode.connect(silentSink);
    silentSink.connect(audioCtx.destination);
  })();

  ready.catch((e) => console.error("[Meter] Setup failed:", e));

  // ---------------------------------------------------------------
  // UI / analysis (your original code)
  // ---------------------------------------------------------------
  const latestLevels = Array.from({ length: channels }, () => ({
    peak: 0,
    rms: 0,
  }));

  const channel = new BroadcastChannel("master-meter");
  const peakHold = new Array(channels).fill(0);
  const holdDecay = 0.0025;

  function toDB(value) {
    if (value <= 0) return -Infinity;
    return 20 * Math.log10(value);
  }

  const channelname = {
    0: "left",
    1: "right",
    2: "center",
    3: "lfe",
    4: "rearleft",
    5: "rearright",
    6: "sideleft",
    7: "sideright",
  };

  const activechannels = [];

  function drawGainmeter(canvas, value, release = 0.75) {
    if (!canvas) return;
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
    ctx.fillRect(canvas.width - width, 0, width, height);
  }

  function updateMeterUI(channelIndex, peak, rmsDB, peakHoldArr) {
    const meterdb = document.querySelector(`#meterdb-${channelIndex}`);
    drawGainmeter(meterdb, peak);
    const setup = document.getElementById(`setup_${channelname[channelIndex]}`);
    if (setup) {
      setup.style.opacity = peak < 0.01 ? 0 : 1;
    }

    activechannels[channelIndex] = peak < 0.01 ? 0 : 1;
  }

  function updateActiveChannels(channelIndex) {
    const setup = document.getElementById(`setup_${channelname[channelIndex]}`);
    const totalActive = Object.values(activechannels).reduce(
      (sum, val) => sum + val,
      0,
    );
  }

  function analyze() {
    const meterData = [];

    for (let i = 0; i < channels; i++) {
      const { peak, rms } = latestLevels[i];

      // Peak hold logic
      if (peak > peakHold[i]) {
        peakHold[i] = peak;
      } else {
        peakHold[i] -= holdDecay;
        if (peakHold[i] < peak) peakHold[i] = peak;
        if (peakHold[i] < 0) peakHold[i] = 0;
      }

      updateMeterUI(i, peakToLevel(peak), toDB(rms), peakHold);
      updateActiveChannels(i);

      meterData.push({ peak, rms, peakHold: peakHold[i] });
    }
  }

  window.FUNCTION_UPDATE[1] = analyze;

  return {
    ready,
    analysers: [],
    get meterNode() {
      return meterNode;
    },

    disconnect() {
      window.FUNCTION_UPDATE[1] = () => {};

      masterVolumeNode.disconnect(splitter);
      splitter.disconnect();
      compressors.forEach((c) => c.disconnect());
      merger.disconnect();

      if (meterNode) {
        meterNode.port.onmessage = null;
        meterNode.disconnect();
      }
      if (silentSink) silentSink.disconnect();

      channel.close();
    },
  };
}

let masterMeter = createMasterMeter(audioCtx, faderNode);

window.FUNCTION_UPDATE[0] = startVisualUpdatesonRAF;

skipFramesSelector.addEventListener("change", () => {
  framerate = 1000 / Number(skipFramesSelector.value);
  localStorage.setItem("framerate", skipFramesSelector.value);
  window.SFXSTUDIO_FRAMERATEVALUE = Number(skipFramesSelector.value);
});

ipcRenderer.on("change_frametype_visual", (event, type) => {
  VisualFrameUpdate = type;
  skipFramesSelector.dispatchEvent(new Event("change")); // trigger initial setup
});

framerate = 1000 / frameratevalue;
skipFramesSelector.value = frameratevalue;
skipFramesSelector.dispatchEvent(new Event("change")); // trigger initial
VisualUpdatesStarted = true;

// 📝 Update skipFrames and save to localStorage
fftbarsizeSelector.addEventListener("change", (e) => {
  localStorage.setItem("fftbarsize", e.target.value);
  analysermeter.fftSize = Number(e.target.value);
  timeData = new Uint8Array(analysermeter.frequencyBinCount);
  freqData = new Uint8Array(analysermeter.frequencyBinCount);
});

fftbarsizeSelector.value = fftbarsizevalue;
fftbarsizeSelector.dispatchEvent(new Event("change")); // trigger initial setup

async function outputDeviceConnect(selectedId) {
  await audioCtx.setSinkId(selectedId);
  audioCtx.destination.channelCount = audioCtx.destination.maxChannelCount || 2;
  audioCtx.destination.channelCountMode = "explicit";
  audioCtx.destination.channelInterpretation = "speakers";
  localStorage.setItem("preferredOutputDevice", selectedId);
  document.getElementById("channelname").textContent = getChannelSetupName(
    audioCtx.destination.maxChannelCount,
  );
  const text =
    outputSelector.value == "default"
      ? `Default audio output has now been used`
      : `The audio device: <strong>${outputSelector.options[outputSelector.options.selectedIndex].label}</strong> is now been used for output`;

  snackbar(
    text +
      ` with <strong>${getChannelSetupName(audioCtx.destination.maxChannelCount)}</strong> speaker configuration.`,
    "Audio Output",
    5000,
  );
  document.getElementById("srsType").src =
    `icons/monosource/${getChannelSetupIcon(audioCtx.destination.maxChannelCount)}.svg`;
  document.getElementById("info_preferreddefaultoutput").textContent =
    outputSelector.options[outputSelector.options.selectedIndex].label;
  document.getElementById("info_outputchannel").textContent =
    getChannelSetupName(audioCtx.destination.maxChannelCount);
  checkboxUpmix.dispatchEvent(new Event("change"));
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
}, 5000);

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

var samplerSelectIndex = 1;
var smp = [];
var smpname = [];

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
  `;

  const container = document.querySelector(
    `.sampler_container[data-sampler="${i}"]`,
  );
  container.innerHTML += HTML;

  const playButton = container.querySelector('.play[data-sampler="' + i + '"]');
  const oneshotButton = container.querySelector(
    '.oneshot[data-sampler="' + i + '"]',
  );
  const stopButton = container.querySelector('.stop[data-sampler="' + i + '"]');
  const removeButton = container.querySelector(
    '.remove_sample[data-sampler="' + i + '"]',
  );
  const openButton = container.querySelector(
    '.open_sample[data-sampler="' + i + '"]',
  );
  const loopButton = container.querySelector('.loop[data-sampler="' + i + '"]');
  const openButton2 = container.querySelector(
    '.open_sample_from_pack[data-sampler="' + i + '"]',
  );
  const title = container.querySelector(
    '.sampler_title[data-sampler="' + i + '"]',
  );
  const time = container.querySelector(
    '.sampler_timelabel[data-sampler="' + i + '"]',
  );
  const waveformCanvas = container.querySelector(
    '.sampler_waveformview[data-sampler="' + i + '"]',
  );
  const waveformContainer = container.querySelector(
    '.sampler_row1[data-sampler="' + i + '"]',
  );
  const gainSlider = container.querySelector(
    '.sampler_gain[data-sampler="' + i + '"]',
  );
  const gainSliderText = container.querySelector(
    '.sampler_gaintext[data-sampler="' + i + '"]',
  );

  smp[i] = new Sampler(audioCtx, mixerNodegain);
  const sampler = smp[i];

  openButton.addEventListener("click", async () => {
    const file = await ipcRenderer.invoke("sampler:openFile");

    if (file) {
      const normalizedPath = normalizePath(file);
      sampler.loadAudio(normalizedPath, waveformCanvas);
      await sampler.loadWaveform(waveformCanvas);
    }
  });

  removeButton.addEventListener("click", () => {
    if (sampler.getSourceFile() === "") {
      return;
    }

    choice({
      title: "Security Warning",
      message:
        "Are you sure you want to remove this sample? This action cannot be undone.",
      onConfirm: () => {
        stopButton.click();
        sampler.unloadAudio(waveformCanvas);
        localStorage.setItem(`SAMPLER_SOURCE_${i}`, "");
        const text = "";
        smpname[i] = null;
        title.textContent = text;
      },
    });
  });

  sampler.onLoaded = (url) => {
    localStorage.setItem(`SAMPLER_SOURCE_${i}`, url);
    const path = require("path");
    const text = String(path.basename(url));

    title.textContent = text;
    title.title = text;

    smpname[i] = text;
  };

  playButton.addEventListener("click", () => {
    if (sampler.getSourceFile() === "") {
      return;
    }
    sampler.play();
  });

  oneshotButton.addEventListener("click", () => {
    if (sampler.getSourceFile() === "") {
      return;
    }
    sampler.oneshot();
  });

  stopButton.addEventListener("click", () => {
    if (sampler.getSourceFile() === "") {
      return;
    }
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

  loopButton.addEventListener("click", async () => {
    sampler.toggleLoop();
  });

  gainSlider.addEventListener("input", (e) => {
    sampler.setGain(e.target.value);
    gainSliderText.textContent = gainTodB(e.target.value);
    localStorage.setItem(`SAMPLER_GAIN_${i}`, e.target.value);
  });

  const savedGain = localStorage.getItem(`SAMPLER_GAIN_${i}`) || 1;

  gainSlider.value = savedGain;
  gainSlider.dispatchEvent(new Event("input"));

  openButton2.addEventListener("click", async () => {
    samplerSelectIndex = i;
    ipcRenderer.send("select-soundeffect");
  });

  const savedSource = localStorage.getItem(`SAMPLER_SOURCE_${i}`) || "";
  async function loadSavedSource() {
    if (savedSource) {
      await sampler.loadAudio(savedSource);
      await sampler.loadWaveform(waveformCanvas);
    }
  }

  loadSavedSource();

  sampler.onCurrent = (e) => {
    if (window.DECKBARMAIN_EDITORID === "A") {
      waveformContainer.style.setProperty("--value", e.progress);
      time.textContent = formatTimeFromNumber(e.currentTime);
    }
  };
}

document.getElementById("StopAllAudio").addEventListener("click", (e) => {
  for (let i = 1; i <= 64; i++) {
    const stopButton = document.querySelector(
      '.stop[data-sampler="' + i + '"]',
    );
    stopButton.click();
  }
});

ipcRenderer.on("sfx-selected", async (_, filePath) => {
  const normalizedPath = normalizePath(filePath);
  const waveformCanvas = document.querySelector(
    '.sampler_waveformview[data-sampler="' + samplerSelectIndex + '"]',
  );
  await smp[samplerSelectIndex].loadAudio(normalizedPath, waveformCanvas);
  await smp[samplerSelectIndex].loadWaveform(waveformCanvas);
});

document
  .getElementById("clickImportSampler")
  .addEventListener("click", async () => {
    closeImportDialog(true);
    const value = document.getElementById("samplerImportIndex").value;
    const normalizedPath = normalizePath(file);
    const waveformCanvas = document.querySelector(
      '.sampler_waveformview[data-sampler="' + value + '"]',
    );
    await smp[value].loadAudio(normalizedPath, waveformCanvas);
    await smp[value].loadWaveform(waveformCanvas);
  });

document.getElementById("samplerImportIndex").addEventListener("input", (e) => {
  const value = e.target.value;
  document.getElementById("samplerImportIndexDisplay").textContent = smp[
    value
  ].getSourceFile()
    ? "Overwrite with " + smpname[value]
    : "No sample loaded";
});

const osc1 = new Oscillator();

osc1.param(
  audioCtx,
  [
    {
      type: "sine",
      frequency: 853,
    },
    {
      type: "triangle",
      frequency: 960,
    },
  ],
  {
    channels: 8,
  },
);

const beepGain = audioCtx.createGain();
beepGain.gain.value = 0.05;
beepGain.channelCount = 8;

osc1.output.connect(beepGain);

window.FUNCTION_OSCILLATOR_START = osc1.start.bind(osc1);
window.FUNCTION_OSCILLATOR_STOP = osc1.stop.bind(osc1);

const osc2 = new Oscillator();

osc2.param(audioCtx, [], {
  channels: 8,
});

osc2.output.connect(beepGain);

window.FUNCTION_OSCILLATOR2_START = osc2.start.bind(osc2);
window.FUNCTION_OSCILLATOR2_STOP = osc2.stop.bind(osc2);

beepGain.connect(masterSound);

const osc3 = new Oscillator();

osc3.param(
  audioCtx,
  [
    {
      type: "sine",
      frequency: 460,
    },
  ],
  {
    channels: 8,
  },
);

osc3.output.connect(beepGain);

window.FUNCTION_OSCILLATOR3_START = osc3.start.bind(osc3);
window.FUNCTION_OSCILLATOR3_STOP = osc3.stop.bind(osc3);

beepGain.connect(masterSound);

const ituTest = new ITUSurroundTest(audioCtx, faderNode);

const looper = new LooperModule();

looper.param(audioCtx, null, mixerNodegain2);

looper.onBarGlobal = (state) => {
  if (window.DECKBARMAIN_EDITORID === "E") {
    for (let x = 1; x <= 24; x++) {
      const button = document.getElementById("looperPad" + x);
      button.dataset.beat = state;
    }
  }
};

const pathModule = require("path");
const SFXSTUDIO_LOOPER_PACK_SELECTION = document.getElementById(
  "SFXSTUDIO_LOOPER_PACK_SELECTION",
);
const SFXSTUDIO_LOOPER_STOP = document.getElementById("SFXSTUDIO_LOOPER_STOP");

const loopsRoot = pathModule.join(
  os.homedir(),
  "Documents",
  "VJDY FM Sound Effects Studio",
  "Loops",
);

function findSFXLRecursive(directory, rootDirectory = directory) {
  const results = [];

  if (!fs.existsSync(directory)) {
    return results;
  }

  const entries = fs.readdirSync(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = pathModule.join(directory, entry.name);

    if (entry.isDirectory()) {
      results.push(...findSFXLRecursive(fullPath, rootDirectory));
    } else if (
      entry.isFile() &&
      pathModule.extname(entry.name).toLowerCase() === ".sfxl"
    ) {
      try {
        const raw = fs.readFileSync(fullPath, "utf8");
        const data = JSON.parse(raw);

        results.push({
          name: data.name || pathModule.basename(entry.name, ".sfxl"),

          path: fullPath,

          relativePath: pathModule.relative(rootDirectory, fullPath),

          data,
        });
      } catch (error) {
        console.error(`[Looper] Failed to read ${fullPath}`, error);
      }
    }
  }

  return results;
}

SFXSTUDIO_LOOPER_PACK_SELECTION.addEventListener("change", async (e) => {
  SFXSTUDIO_LOOPER_PACK_SELECTION.disabled = true;
  await looper.loadBank(e.target.value);
  SFXSTUDIO_LOOPER_PACK_SELECTION.disabled = false;
});

function scanLooperPacks(selectElement) {
  selectElement.innerHTML = "";

  // ⭐ Built-in default
  const defaultOption = document.createElement("option");

  defaultOption.value = path.join(__dirname, "/core/default_loops/index.sfxl");
  defaultOption.textContent = "Default";

  selectElement.appendChild(defaultOption);

  // 📁 User Loops directory
  const loopers = findSFXLRecursive(loopsRoot);

  for (const looper of loopers) {
    const option = document.createElement("option");

    option.value = looper.path;
    option.textContent = looper.name;

    // Keep the parsed SFXL data available
    option._sfxlData = looper.data;

    selectElement.appendChild(option);
  }

  console.log(`[Looper] Found ${loopers.length} SFXL pack(s)`);

  SFXSTUDIO_LOOPER_PACK_SELECTION.dispatchEvent(new Event("change"));

  return loopers;
}

scanLooperPacks(SFXSTUDIO_LOOPER_PACK_SELECTION);

SFXSTUDIO_LOOPER_STOP.addEventListener("click", () => {
  looper.stopAll();
});

looper.onUpdate = (event) => {
  for (let x = 0; x < 24; x++) {
    const timebar = document.getElementById("looperTimeBar_" + (x + 1));
    timebar.style.setProperty("--timevalue", event[x].currentTime);
  }
};

const SFXSTUDIO_BROADCAST_BUTTON = document.getElementById(
  "SFXSTUDIO_BROADCAST_BUTTON",
);
window.SFXSTUDIO_BROADCASTING_BOOLEAN = false;

window.SFXSTUDIO_BROADCASTING_STYLE = (state) => {
  SFXSTUDIO_BROADCAST_BUTTON.dataset.active = state;
};

window.SFXSTUDIO_TEXTBOX = [
  document.getElementById("SFXSTUDIO_TEXTBOX_LOCALHOST"),
  document.getElementById("SFXSTUDIO_TEXTBOX_LAN"),
];

const hoststream = require("./server/audio_webrtc.js");

SFXSTUDIO_BROADCAST_BUTTON.addEventListener("click", () => {
  if (!window.SFXSTUDIO_BROADCASTING_BOOLEAN) {
    hoststream.startStream();
  } else {
    choice({
      title: "Confirmation",
      message:
        "All clients, especially Raspberry Pi clients used on most speakers " +
        "will be able to cut the connection once you turn off On-Air. " +
        "Are you sure you want to proceed?",
      onConfirm: () => {
        hoststream.stopStream();
      },
    });
  }
});

const floatingcard = document.getElementById("SFXSTUDIO_LANPORT");

SFXSTUDIO_BROADCAST_BUTTON_MORE.onclick = (e) => {
  const boolean = floatingcard.hidden;
  floatingcard.hidden = !boolean;
};

const floatingcard2 = document.getElementById("SFXSTUDIO_OSCILLATOR");

window.SFXSTUDIO_OSCILLATOR_BUTTON_MORE = document.getElementById(
  "SFXSTUDIO_OSCILLATOR_BUTTON_MORE",
);

SFXSTUDIO_OSCILLATOR_BUTTON_MORE.onclick = (e) => {
  const boolean = floatingcard2.hidden;
  floatingcard2.hidden = !boolean;
};

const floatingcard3 = document.getElementById("SFXSTUDIO_EVENT");

window.SFXSTUDIO_EVENT_BUTTON_MORE = document.getElementById(
  "SFXSTUDIO_EVENT_BUTTON_MORE",
);

window.SFXSTUDIO_EVENT_BUTTON = document.getElementById(
  "SFXSTUDIO_EVENT_BUTTON",
);

SFXSTUDIO_EVENT_BUTTON.onclick = (e) => {
  window.SFXSTUDIO_EVENT_DIALOG.show();
};

SFXSTUDIO_EVENT_BUTTON_MORE.onclick = (e) => {
  const boolean = floatingcard3.hidden;
  floatingcard3.hidden = !boolean;
};

var closeFloatingCard = (e) => {
  if (
    !floatingcard.hidden &&
    !floatingcard.contains(e.target) &&
    e.target !== SFXSTUDIO_BROADCAST_BUTTON_MORE
  ) {
    floatingcard.hidden = true;
  }

  if (
    !floatingcard2.hidden &&
    !floatingcard2.contains(e.target) &&
    e.target !== SFXSTUDIO_OSCILLATOR_BUTTON_MORE
  ) {
    floatingcard2.hidden = true;
  }

  if (
    !floatingcard3.hidden &&
    !floatingcard3.contains(e.target) &&
    e.target !== SFXSTUDIO_EVENT_BUTTON_MORE
  ) {
    floatingcard3.hidden = true;
  }
};

document.addEventListener("click", closeFloatingCard);
document.addEventListener("touchstart", closeFloatingCard);

var sourcetest_id = document.getElementById("speakertest");
var sourcetest_node = audioCtx.createMediaElementSource(sourcetest_id);
sourcetest_node.connect(mixerNode);

const speakerTest = document.getElementById("speakertest");

let audiotestvalue;

function startTest() {
  document.getElementById("testspkDialog").show();
  masterSound.gain.setTargetAtTime(0.005, audioCtx.currentTime, 0.25);
}

function endtest() {
  const dialogOnInit = document.getElementById("testspkDialog");
  speakerTest.src = ``;
  CloseAnimationInit(dialogOnInit);
  masterSound.gain.setTargetAtTime(1, audioCtx.currentTime, 0.75);
}

document.getElementById('cancelTest').addEventListener("click", () => {
  endtest();
  snackbar("Speaker test cancelled.");
  ituTest.destroy();
})

function audiotest() {
  document.getElementById("testspkDialog").show();
  speakerTest.src = `audio/speakertest.mp3`;
  speakerTest.currentTime = 0;
  speakerTest.play();
  startTest();
}

speakerTest.addEventListener("ended", () => {
  snackbar("Speaker test completed.");
  endtest();
});

function audiotestSurround() {
  document.getElementById("testspkDialog").show();
  if (!ituTest.running) {
    ituTest.start();
  } else {
    ituTest.destroy();
  }
  startTest();
}

ituTest.onend = () => {
  endtest();
};
