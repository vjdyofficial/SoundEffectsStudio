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

function getFrequency(x) {
  const v = x * 12;

  if (v === 0) {
    return 440;
  } else {
    return 440 * Math.pow(2, v / 12);
  }
}

var sampleRateSettings = localStorage.getItem("audioCtx_sampleRate") || 44100;
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
let feedbackNode = audioCtx.createGain();
feedbackNode.gain.value = 1;
const preamp = audioCtx.createGain();
preamp.gain.value = 1;

let meterMixerNode = audioCtx.createGain(); // your node
meterMixerNode.gain.value = 1.0;
let meterOutputNode = audioCtx.createGain(); // your node
meterOutputNode.gain.value = 1.0;

const pitchNode = PitchShift(audioCtx, {
  grain: 0.048,
  search: 0.016,
  compare: 0.024,
});
pitchNode.transpose = 0;

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

const returnSurroundA = new MicSurroundPan(
  audioCtx,
  listenMixerNodeB,
  pitchNode,
);
const returnSurroundB = new MicSurroundPan(
  audioCtx,
  listenMixerNode,
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
      if (recorder.state !== "inactive" || recorder.state === "paused") {
        recorder.resume();
        startTimer();
      }
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
      if (recorder.state !== "inactive" || recorder.state === "paused") {
        recorder.resume();
      }
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

// Initial population
populateList();
refreshConnect();

async function refreshDevices() {
  // --- Reset selectors to disabled ---
  ["micSelector", "listenSelector"].forEach((id) => {
    const sel = document.getElementById(id);
    sel.value = "-2"; // reset to "Disable"
    sel.disabled = true; // prevent user interaction until populated
  });

  // --- Pause recorder if running ---
  if (recorder.state !== "inactive" && recorder.state === "recording") {
    recorder.pause();
  }

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
      source.connect(listenMixerGainA);
      listenMixerGainA.connect(listenMixerNodeB);
      listenMixerGainA.connect(meterOutputNode);
      document.getElementById("info_mic1").innerHTML =
        `${micSelector.options[micSelector.selectedIndex].textContent}`;
      const text = `Audio device stream is now active. <br><code>${micSelector.options[micSelector.selectedIndex].textContent}</code>`;
      snackbar(text); // Show snackbar notification
    })
    .catch((err) => {
      const text = `Audio device stream error. <br><code>${err}</code>`;
      snackbar(text); // Show snackbar notification
    });

  console.log("Activated Microphone");
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
    setTimeout(() => {
      ipcRenderer.send("window-action", "close-permanent");
      if (window.TYPE_FUNCTION == "RESTART") {
        exec("shutdown -r -t 0");
      }
    }, 500);
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
    document.getElementById("micStatus2").style.display = "flex";
    document.getElementById("micStatus3").style.display = "flex";
  } else {
    document.getElementById("micStatus").style.display = "none";
    document.getElementById("micStatus2").style.display = "none";
    document.getElementById("micStatus3").style.display = "none";
  }
  requestAnimationFrame(inputLoop);
}

inputLoop();

const fixedDeckIds = ["executeAnnouncementOn", "executeAnnouncementOff"];

function initFixedDecks() {
  fixedDeckIds.forEach((id) => {
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
  } catch (err) {
    console.warn(`Cannot connect ${mediaEl.id}:`, err);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initFixedDecks();
});

let masterSound; // your GainNode
masterSound = audioCtx.createGain();
masterSound.gain.value = 1;

// Master mixer
const masterGainDack = audioCtx.createGain();
masterGainDack.gain.value = 1; // master volume
masterGainDack.connect(pitchNode);
pitchNode.connect(masterSound);

const SFXSTUDIO_TRUESURROUND_PLUS_SPLITTER = audioCtx.createChannelSplitter(32);

const SFXSTUDIO_TRUESURROUND_PLUS_MERGER = audioCtx.createChannelMerger(8);

// 32-channel input
masterSound.connect(SFXSTUDIO_TRUESURROUND_PLUS_SPLITTER);

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

masterGainDack.connect(meterOutputNode);

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
const pitchSlider = document.getElementById("pitchSlider");
const pitchValue = document.querySelector(".pitchSlider_container");

function valueToSemitone(value) {
  const v = Math.min(1, Math.max(-1, parseFloat(value) || 0));
  return v * 12; // -1 -> -12, 0 -> 0, 1 -> 12
}

// Update on slider move
pitchSlider.addEventListener("input", (e) => {
  pitchValue.dataset.value =
    valueToSemitone(e.target.value).toFixed(2) +
    "st " +
    getFrequency(e.target.value).toFixed(0) +
    "Hz";

  localStorage.setItem("pitchVolume", e.target.value); // save
  document.getElementById(`info_pitch`).textContent = pitchValue.dataset.value;

  const semitoneValue = valueToSemitone(e.target.value);
  const semitones = Math.trunc(semitoneValue);
  const cents = Math.round(Math.abs(semitoneValue - semitones) * 100);

  e.target.title =
    `PITCH: \n` +
    `${semitones} semitones, ${cents} cents\n` +
    `Frequency: ${getFrequency(e.target.value).toFixed(0)} Hz`;

  pitchNode.transpose = e.target.value * 12;

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
});

pitchSlider.value = savedpitch;
pitchSlider.dispatchEvent(new Event("input", { bubbles: true }));

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
      listenSource.connect(listenMixerGain);
      listenMixerGain.connect(listenMixerNode);
      listenMixerGain.connect(meterOutputNode);
      document.getElementById("info_mic2").innerHTML =
        `${listenSelector.options[listenSelector.selectedIndex].textContent}`;
    })
    .catch((err) => snackbar(`Listen error<br><code>${err.message}</code>`));
}

const savedListenGain2 = localStorage.getItem("listengainVolume2") || 1;
const listengainSlider2 = document.getElementById("listengainSlider2");
const listengainValue2 = document.getElementById("listengainValue2");

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
const listengainSlider = document.getElementById("listengainSlider");
const listengainValue = document.getElementById("listengainValue");

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
const listengainSlider2_1 = document.getElementById("listengainSlider2_1");
const listengainValue2_1 = document.getElementById("listengainValue2_1");

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
const listengainSlider_1 = document.getElementById("listengainSlider_1");
const listengainValue_1 = document.getElementById("listengainValue_1");

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
    if (recorder.state !== "inactive" || recorder.state === "recording") {
      recorder.pause();
    }
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

const ffmpeg = require("./modules/fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const ffmpegBin = require("ffmpeg-static");

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
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset++, str.charCodeAt(i));
  }

  // RIFF header
  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");

  // fmt chunk
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4; // chunk size
  view.setUint16(offset, 1, true);
  offset += 2; // PCM format
  view.setUint16(offset, numChannels, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true);
  offset += 2;

  // data chunk
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

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
        await new Promise((r) => setTimeout(r, 0)); // let UI breathe
        count = 0;
        let percent = (i / samples) * 100;
        if (percent > 100) percent = 100;
        document.getElementById("titleDisplay").textContent = "Chunking...";
        document.getElementById("timerDisplay").textContent =
          `Offset: ${percent.toFixed(1)}%`;
      }
    }

    if (i % batch === 0) {
      await new Promise((r) => setTimeout(r, 0)); // let UI breathe
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
      document.getElementById("timerDisplay").textContent =
        `${percent.toFixed(1)}%`;

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
  ipcRenderer.on("ffmpeg-event", async (event, msg) => {
    if (msg.type === "progress") {
      document.getElementById("timerDisplay").textContent =
        `${msg.percent.toFixed(1)}%`;
    }
    if (msg.type === "end") {
      const musicFolder = path.join(
        os.homedir(),
        "Music",
        "VJDY FM Sound Effects Studio",
        "Recordings",
      );
      await fs.promises.mkdir(musicFolder, { recursive: true });

      const destPath = path.join(musicFolder, path.basename(msg.outputPath));
      if (fs.existsSync(msg.outputPath))
        fs.copyFileSync(msg.outputPath, destPath);

      console.log("Conversion finished:", destPath);
      document.getElementById("titleDisplay").textContent = "Done";
    }
    if (msg.type === "error") {
      console.error(msg.message);
      document.getElementById("titleDisplay").textContent = "Error";
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
    ? introBuffer.length +
      recordedBuffer.length +
      (outroBuffer ? outroBuffer.length : 0)
    : recordedBuffer.length;

  const numberOfChannels = Math.max(
    introBuffer.numberOfChannels,
    recordedBuffer.numberOfChannels,
    outroBuffer ? outroBuffer.numberOfChannels : 1,
  );

  const sampleRate = introBuffer.sampleRate;
  const finalBuffer = audioCtx.createBuffer(
    numberOfChannels,
    length,
    sampleRate,
  );

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const finalData = finalBuffer.getChannelData(ch);

    if (document.getElementById("audioWatermark").checked) {
      const intro = introBuffer.getChannelData(
        ch % introBuffer.numberOfChannels,
      );
      finalData.set(intro, 0);

      const recorded = recordedBuffer.getChannelData(
        ch % recordedBuffer.numberOfChannels,
      );
      finalData.set(recorded, intro.length);

      if (outroBuffer) {
        const outro = outroBuffer.getChannelData(
          ch % outroBuffer.numberOfChannels,
        );
        finalData.set(outro, intro.length + recorded.length);
      }
    } else {
      const recorded = recordedBuffer.getChannelData(
        ch % recordedBuffer.numberOfChannels,
      );
      finalData.set(recorded, 0);
    }
  }

  return finalBuffer; // return AudioBuffer for export
}

const { mas } = require("process");

const enhancer = createStereoEnhancer(audioCtx);

const TrueSRS = TrueSurround(audioCtx, nodeToSurround, SurroundtoNode);
TrueSRS.setWidth(1, 1, 1);
TrueSRS.setInput(-1);

const TrueSRSWidthSliders = [
  "TRUESRS_WIDTH_FRONT",
  "TRUESRS_WIDTH_REAR",
  "TRUESRS_WIDTH_SIDE",
  "TRUESRS_WIDTH_MULTIPLIER",
];

function setWidthTrue() {
  const v1 = document.getElementById(TrueSRSWidthSliders[0]).value;
  const v2 = document.getElementById(TrueSRSWidthSliders[1]).value;
  const v3 = document.getElementById(TrueSRSWidthSliders[2]).value;
  const v4 = document.getElementById(TrueSRSWidthSliders[3]).value;

  document.getElementById("info_widener_front").textContent = gainTodB(
    Number(v1),
  );
  document.getElementById("info_widener_rear").textContent = gainTodB(
    Number(v2),
  );
  document.getElementById("info_widener_side").textContent = gainTodB(
    Number(v3),
  );
  document.getElementById("info_widener_multi").textContent = gainTodB(
    Number(v4),
  );

  TrueSRS.setWidth(v1, v2, v3, v4);
}

TrueSRSWidthSliders.forEach((id) => {
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
    document.getElementById("info_" + param + "_freq").textContent =
      Number(e.target.value) + "Hz";

    localStorage.setItem("SFXSTUDIO_FX_FREQ_" + param, Number(e.target.value));
  });

  const savedFreqValue = localStorage.getItem("SFXSTUDIO_FX_FREQ_" + param);
  freqSlider.value = savedFreqValue !== null ? Number(savedFreqValue) : def;

  freqSlider.dispatchEvent(new Event("input"));

  const QSlider = document.getElementById(param + "_Q_SLIDER");
  const QSliderText = document.getElementById(param + "_Q_VALUE");

  QSlider.addEventListener("input", (e) => {
    node.setGain(Number(e.target.value));
    QSliderText.textContent = Number(e.target.value);
    localStorage.setItem("SFXSTUDIO_FX_Q_" + param, Number(e.target.value));
    document.getElementById("info_" + param + "_gain").textContent = Number(
      e.target.value,
    );
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

    document.getElementById("info_" + param + "_bool").textContent = e.target
      .checked
      ? "Enabled"
      : "Bypassed";
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

    document.getElementById("info_cutoff_" + param).textContent =
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
  document.getElementById("info_cutoff_animationtime").textContent =
    Number(e.target.value) + "sec/run";

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

  document.getElementById("info_cutoff_bool").textContent = e.target.checked
    ? "Enabled"
    : "Bypassed";
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

const flanger = new Flanger(audioCtx, SFXSTUDIO_FX_PROCESS06_OUT, SFXSTUDIO_FX_PROCESS07_OUT)

const FLANGER_PRESETS = {
  subtle:   { wet: 0.35, depth: 0.4, cycleBeats: 16,  bpm: 120, clipThr: 1.0,  clipMax: 0,  fb: 0.3 },
  classic:  { wet: 0.6,  depth: 0.7, cycleBeats: 8,   bpm: 120, clipThr: 1.0,  clipMax: 0,  fb: 0.55 },
  jet:      { wet: 0.8,  depth: 1.0, cycleBeats: 32,  bpm: 128, clipThr: 1.0,  clipMax: 0,  fb: 0.8 },
  slowWash: { wet: 0.7,  depth: 0.9, cycleBeats: 128, bpm: 90,  clipThr: 1.0,  clipMax: 0,  fb: 0.6 },
  fastWobble:{ wet: 0.5, depth: 0.3, cycleBeats: 2,   bpm: 160, clipThr: 1.0,  clipMax: 0,  fb: 0.4 },
  gritty:   { wet: 0.75, depth: 0.8, cycleBeats: 8,   bpm: 140, clipThr: 0.85, clipMax: 6,  fb: 0.9 }
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

applyFlangerPreset(flanger, 'classic');

function setupFlangerSlider(param, node, def, cfg) {
  const Slider = document.getElementById("FLANGER_" + param + "_SLIDER");
  const SliderText = document.getElementById(
    "FLANGER_" + param + "_SLIDER_VALUE",
  );
  const Info = document.getElementById("info_flanger_" + param);
  if (!Slider) return;
 
  // slider range comes from the config below
  Slider.min = cfg.min;
  Slider.max = cfg.max;
  Slider.step = cfg.step;
 
  Slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    const text = cfg.fmt(value);
 
    if (SliderText) SliderText.textContent = text;
    if (Info) Info.textContent = text;
 
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
      min: 0, max: 1, step: 0.01, def: 0.5,
      fmt: (v) => Math.round(v * 100) + " %",
      set: (v) => fl.setWet(v),
    },
    depth: {
      min: 0, max: 1, step: 0.01, def: 0.5,
      fmt: (v) => Math.round(v * 100) + " %",
      set: (v) => fl.setDepth(v),
    },
    cycleBeats: {
      min: 2, max: 128, step: 1, def: 8,
      fmt: (v) => v + " beats",
      set: (v) => fl.setCycleBeats(v),
    },
    bpm: {
      min: 40, max: 250, step: 1, def: 120,
      fmt: (v) => v + " BPM",
      set: (v) => fl.setBpm(v),
    },
    clipThreshold: {
      // slider 0..1 -> -100..0 dB
      min: 0.85, max: 1, step: 0.01, def: 1,
      fmt: (v) => (-100 + v * 100).toFixed(0) + " dB",
      set: (v) => fl.setClipperThreshold(v),
    },
    clipMax: {
      min: -48, max: 3, step: 0.5, def: 0,
      fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " dB",
      set: (v) => fl.setClipperMax(v),
    },
    feedback: {
      min: 0, max: 0.95, step: 0.01, def: 0.5,
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

  // document.getElementById("info_reverb_bool").textContent = e.target.checked
  //  ? "Enabled"
  //  : "Bypassed";
});

FLANGER_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_FLANGER_ENABLED") === "true";

FLANGER_SWITCH.dispatchEvent(new Event("change"));

function setupBitCrusherSlider(param, node, def, cfg) {
  const Slider = document.getElementById("BITCRUSHER_" + param + "_SLIDER");
  const SliderText = document.getElementById(
    "BITCRUSHER_" + param + "_SLIDER_VALUE",
  );
  const Info = document.getElementById("info_bitcrusher_" + param);
  if (!Slider) return;
 
  // slider range comes from the config below
  Slider.min = cfg.min;
  Slider.max = cfg.max;
  Slider.step = cfg.step;
 
  Slider.addEventListener("input", (e) => {
    const value = Number(e.target.value);
    const text = cfg.fmt(value);
 
    if (SliderText) SliderText.textContent = text;
    if (Info) Info.textContent = text;
 
    node(value);
    localStorage.setItem("SFXSTUDIO_BITCRUSHER_VALUE_" + param, value);
  });
 
  const savedValue = localStorage.getItem("SFXSTUDIO_BITCRUSHER_VALUE_" + param);
  Slider.value = savedValue !== null ? Number(savedValue) : def;
  Slider.dispatchEvent(new Event("input"));
}
 
function setupBitCrusherSliders(bc) {
  const sr = bc.audioCtx.sampleRate;
 
  // min / max / step / default / display format for each slider
  const BITCRUSHER_SLIDERS = {
    bits: {
      min: 1, max: 16, step: 1, def: 8,
      fmt: (v) => v + (v === 1 ? " bit" : " bits"),
      set: (v) => bc.setBits(v),
    },
    downsample: {
      min: 1, max: 64, step: 1, def: 4,
      fmt: (v) => "x" + v + " (" + Math.round(sr / v) + " Hz)",
      set: (v) => bc.setDownsample(v),
    },
    wet: {
      min: 0, max: 1, step: 0.01, def: 1,
      fmt: (v) => Math.round(v * 100) + " %",
      set: (v) => bc.setWet(v),
    },
    outputGain: {
      min: -48, max: 48, step: 0.5, def: 0,
      fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) + " dB",
      set: (v) => bc.setOutputGain(v),
    },
  };
 
  for (const param in BITCRUSHER_SLIDERS) {
    const c = BITCRUSHER_SLIDERS[param];
    setupBitCrusherSlider(param, c.set, c.def, c);
  }
}

const bc = new BitCrusher(audioCtx, SFXSTUDIO_FX_PROCESS07_OUT, SFXSTUDIO_FX_PROCESS08_OUT);
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

  // document.getElementById("info_reverb_bool").textContent = e.target.checked
  //  ? "Enabled"
  //  : "Bypassed";
});

BITCRUSHER_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_BITCRUSHER_ENABLED") === "true";

BITCRUSHER_SWITCH.dispatchEvent(new Event("change"));

const reverb = new ReverbEffect(audioCtx, SFXSTUDIO_FX_PROCESS08_OUT, preamp);

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

    document.getElementById("info_reverb_" + param).textContent = gainTodB(
      Number(e.target.value),
    );
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
    document.getElementById("info_reverb_" + param).textContent =
      Number(e.target.value).toFixed(2) + unit;
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
    document.getElementById("info_reverb_" + param).textContent =
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

  document.getElementById("info_reverb_bool").textContent = e.target.checked
    ? "Enabled"
    : "Bypassed";
});

REVERB_SWITCH.checked =
  localStorage.getItem("SFXSTUDIO_FX_REVERB_ENABLED") === "true";

REVERB_SWITCH.dispatchEvent(new Event("change"));

preamp.connect(faderNode);

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

    document.getElementById("info_" + slider).textContent =
      Formats.formatDecibelLabel(Number(el.value));
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

  document.getElementById("info_eq_bool").textContent = e.target.checked
    ? "Enabled"
    : "Bypassed";
});

eqSwitch.checked = localStorage.getItem("SFXSTUDIO_FX_EQ_ENABLED") === "true";

eqSwitch.dispatchEvent(new Event("change"));

const semi = audioCtx.createGain();
const final = audioCtx.createGain();
const expand = ExpandSurround(audioCtx, faderNode, semi);
enhancer.output.normal.connect(semi);
const compressor = new Compressor(audioCtx, semi, final);

const srsspectatemp = audioCtx.createGain();
srsspectatemp.gain.value = 1;

const ONAIR_GAIN = audioCtx.createGain();

srsspectatemp.connect(enhancer.input);
final.connect(masterVolume);
final.connect(ONAIR_GAIN);

compressor.setParameters({
  threshold: -30,
  knee: 24,
  ratio: 4,
  attack: 0.005,
  release: 0.2,
});

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

function setCompParam() {
  compressor.setParameters({
    threshold: compsliders[0].value - 100,
    knee: compsliders[4].value,
    ratio: compsliders[1].value,
    attack: compsliders[2].value,
    release: compsliders[3].value,
  });
}

compsliders[0].addEventListener("change", (e) => {
  setCompParam();
  compValue[0].textContent = Number(e.target.value - 100).toFixed(2) + "ohm";
  compInfo[0].textContent = Number(e.target.value - 100).toFixed(2) + "ohm";

  localStorage.setItem("SFXSTUDIO_FX_COMP_THRESHOLD", Number(e.target.value));
});

const savedThreshold = localStorage.getItem("SFXSTUDIO_FX_COMP_THRESHOLD");

compsliders[0].value = savedThreshold !== null ? Number(savedThreshold) : 80;

compsliders[0].dispatchEvent(new Event("change"));

compsliders[1].addEventListener("change", (e) => {
  setCompParam();
  compValue[1].textContent = Formats.ratioText(Number(e.target.value));
  compInfo[1].textContent = Formats.ratioText(Number(e.target.value));
  localStorage.setItem("SFXSTUDIO_FX_COMP_RATIO", Number(e.target.value));
});

const savedRatio = localStorage.getItem("SFXSTUDIO_FX_COMP_RATIO");

compsliders[1].value = savedRatio !== null ? Number(savedRatio) : 4;

compsliders[1].dispatchEvent(new Event("change"));

compsliders[2].addEventListener("change", (e) => {
  setCompParam();
  compValue[2].textContent = Number(e.target.value) + "s";
  compInfo[2].textContent = Number(e.target.value) + "s";
  localStorage.setItem("SFXSTUDIO_FX_COMP_ATTACK", Number(e.target.value));
});

const savedAttack = localStorage.getItem("SFXSTUDIO_FX_COMP_ATTACK");
compsliders[2].value = savedAttack !== null ? Number(savedAttack) : 0.005;
compsliders[2].dispatchEvent(new Event("change"));

compsliders[3].addEventListener("change", (e) => {
  setCompParam();
  compValue[3].textContent = Number(e.target.value) + "s";
  compInfo[3].textContent = Number(e.target.value) + "s";
  localStorage.setItem("SFXSTUDIO_FX_COMP_RELEASE", Number(e.target.value));
});

const savedRelease = localStorage.getItem("SFXSTUDIO_FX_COMP_RELEASE");

compsliders[3].value = savedRelease !== null ? Number(savedRelease) : 0.2;

compsliders[3].dispatchEvent(new Event("change"));

compsliders[4].addEventListener("change", (e) => {
  setCompParam();
  compValue[4].textContent = Number(e.target.value) + "ohm";
  compInfo[4].textContent = Number(e.target.value) + "ohm";
  localStorage.setItem("SFXSTUDIO_FX_COMP_KNEE", Number(e.target.value));
});

const savedKnee = localStorage.getItem("SFXSTUDIO_FX_COMP_KNEE");

compsliders[4].value = savedKnee !== null ? Number(savedKnee) : 24;

compsliders[4].dispatchEvent(new Event("change"));

mixerExecAnnounce.connect(masterVolume);
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
    "output",
  );
  outputtempDir = jsonPath;
}

getAppDataPath();

async function saveRecordnow(name, format, directory) {
  ["audioWatermark"].forEach((id) => {
    document.getElementById(id).disabled = true;
  });

  const filePathIntro = path.join(__dirname, "audio", "init.wav");
  const filePathOutro = path.join(__dirname, "audio", "closerecord.wav");

  document.getElementById("titleDisplay").textContent = "Stopped";
  document.getElementById("stopRec").disabled = true;

  // Merge
  const mergedBuffer = await mergeRecording(
    filePathIntro,
    chunks,
    filePathOutro,
  );

  // Export to desired format
  const saveBasePath = path.join(
    outputtempDir,
    name ? String(name) : generateRecordingFilename(),
  );
  const selectedFormat = "audio/wav";
  const outputFile = await exportRecording(
    mergedBuffer,
    selectedFormat,
    saveBasePath,
  );

  ["audioWatermark"].forEach((id) => {
    document.getElementById(id).disabled = false;
  });

  // 🎯 Target directory (e.g. "Music/vjdy fm sound effects studio/recordings")
  const saveDir = directory
    ? String(directory)
    : path.join(
        os.homedir(),
        "Music",
        "VJDY FM Sound Effects Studio Recordings",
      );

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
        }),
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
  } else {
    return;
  }

  if (state == 1) {
    resetStatusRecord();
    snackbar("Recording discarded");
    return;
  } else if (state == 0) {
    saveRecordnow();
  } else if (state == 2) {
    try {
      const { basename, extname } = require("path"); // if Node integration enabled

      document.getElementById("titleDisplay").textContent = "Stopped";
      document.getElementById("stopRec").disabled = true;

      const savedPath = await ipcRenderer.invoke("save-pcm-chunks", chunks);

      if (!savedPath) {
        resetStatusRecord();
        snackbar("Recording discarded");
        return;
      }

      // --- GET FILENAME & MIME TYPE ---
      const fileName = basename(savedPath); // "audio.wav"
      const directory = path.dirname(savedPath);
      const ext = extname(savedPath).toLowerCase(); // ".wav"

      // Map extension to mimetype
      let mimetype;
      switch (ext) {
        case ".wav":
          mimetype = "audio/wav";
          break;
        case ".mp3":
          mimetype = "audio/mpeg";
          break;
        case ".opus":
          mimetype = "audio/opus";
          break;
        case ".flac":
          mimetype = "audio/flac";
          break;
        default:
          mimetype = "unknown";
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

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onpause = () => {
      stopTimer();
      console.log("Recording paused");
    };
    recorder.onresume = () => {
      startTimer();
      console.log("Recording resumed");
    };
    recorder.onstop = () => {};

    recorder.start();
  } else {
    snackbar(
      `Audio context is not ready for ${(15 - audioCtx.currentTime).toFixed(1)} seconds yet. Please wait a moment and try to record again.`,
    );
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

function setEnhancerfromPreset(preset) {
  document.getElementById("reduceSlider").value = preset.mix;
  document.getElementById("reduceSlider").dispatchEvent(new Event("input"));

  document.getElementById("centerSlider").value = preset.center;
  document.getElementById("centerSlider").dispatchEvent(new Event("input"));

  document.getElementById("sideSlider").value = preset.side;
  document.getElementById("sideSlider").dispatchEvent(new Event("input"));

  document.getElementById("rearSlider").value = preset.rear;
  document.getElementById("rearSlider").dispatchEvent(new Event("input"));

  document.getElementById("frontSlider").value = preset.front;
  document.getElementById("frontSlider").dispatchEvent(new Event("input"));
}

ipcRenderer.on("send_stereoenhancerpreset", (event, preset) => {
  setEnhancerfromPreset(preset);
});

const merger = audioCtx.createChannelMerger(8);
merger.connect(masterVolume);

const checkboxUpmix = document.getElementById("UpmixCheckbox");
const upmixValue = document.getElementById("upmixValue");
var isCenterMuted = false;
var isSRSEmulation = false;

// channelAssign holds current channel mapping as both array and string
// order: FRONTLEFT, FRONTRIGHT, CENTER, LFE, REARL, REARR, SIDEL, SIDER
var channelAssign = {
  array: [1, 1, 1, 1, 1, 1, 1, 1],
  string: "11111111",
};

function setSRSValueDownmix() {
  const enabled = checkboxUpmix.value;
  enhancer.downmix["L"] =
    channelAssign.array[0] != 1
      ? 0
      : document.getElementById("SRS_FRONTLEFT").value;
  enhancer.downmix["R"] =
    channelAssign.array[1] != 1
      ? 0
      : document.getElementById("SRS_FRONTRIGHT").value;

  if (
    enabled == "mix" ||
    (enabled == "auto" && audioCtx.destination.maxChannelCount <= 3) ||
    enabled == "true"
  ) {
    enhancer.downmix["C"] =
      channelAssign.array[2] != 1
        ? 0
        : isCenterMuted
          ? 0
          : document.getElementById("SRS_CENTER").value;
    enhancer.downmix["LFE"] =
      channelAssign.array[3] != 1
        ? 0
        : document.getElementById("SRS_LFE").value;
    enhancer.downmix["LS"] =
      channelAssign.array[4] != 1
        ? 0
        : document.getElementById("SRS_REARL").value * upmixValue.value;
    enhancer.downmix["RS"] =
      channelAssign.array[5] != 1
        ? 0
        : document.getElementById("SRS_REARR").value * upmixValue.value;
    enhancer.downmix["LB"] =
      channelAssign.array[6] != 1
        ? 0
        : document.getElementById("SRS_SIDEL").value * upmixValue.value;
    enhancer.downmix["RB"] =
      channelAssign.array[7] != 1
        ? 0
        : document.getElementById("SRS_SIDER").value * upmixValue.value;
  } else if (
    (enabled == "auto" && audioCtx.destination.maxChannelCount >= 3) ||
    enabled == "false"
  ) {
    ["C", "LFE", "LS", "RS", "LB", "RB"].forEach((channel) => {
      enhancer.downmix[channel] = 0;
    });
  }

  expand.expand.C =
    channelAssign.array[2] != 1
      ? 0
      : isCenterMuted
        ? 0
        : document.getElementById("SRS_CENTER").value * upmixValue.value;
  expand.expand.LS =
    channelAssign.array[4] != 1
      ? 0
      : document.getElementById("SRS_REARL").value * upmixValue.value;
  expand.expand.RS =
    channelAssign.array[5] != 1
      ? 0
      : document.getElementById("SRS_REARR").value * upmixValue.value;
  expand.expand.LB =
    channelAssign.array[6] != 1
      ? 0
      : document.getElementById("SRS_SIDEL").value * upmixValue.value;
  expand.expand.RB =
    channelAssign.array[7] != 1
      ? 0
      : document.getElementById("SRS_SIDER").value * upmixValue.value;
  expand.expand.LFE =
    channelAssign.array[3] != 1
      ? 0
      : document.getElementById("SRS_LFE").value * upmixValue.value;
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

const savedInput = localStorage.getItem("truesrsInput") || -1;
const TRUESRS_WIDTH_INPUT = document.getElementById("TRUESRS_WIDTH_INPUT");
const TRUESRS_WIDTH_INPUT_VALUE = document.getElementById(
  "TRUESRS_WIDTH_INPUT_VALUE",
);

// Update on slider move
TRUESRS_WIDTH_INPUT.addEventListener("input", (e) => {
  const v = Number(e.target.value);
  const p = String((Math.abs(v) * 100).toFixed(0) + "%");
  TRUESRS_WIDTH_INPUT_VALUE.textContent =
    v <= -0.01 ? p + " MERGE" : v >= 0.01 ? p + " SEPARATE" : "NORMAL";
  TrueSRS.setInput(v);
  localStorage.setItem("truesrsInput", v);
});

TRUESRS_WIDTH_INPUT.value = savedInput;
TRUESRS_WIDTH_INPUT.dispatchEvent(new Event("input", { bubbles: true }));

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

const audioCanvas = document.getElementById("audioForm");
const audioCanvasCtx = audioCanvas.getContext("2d", {
  willReadFrequently: true,
});

const audioCanvasPreview = document.getElementById("audioFormPreview");
const audioCanvasPreviewCtx = audioCanvasPreview.getContext("2d", {
  willReadFrequently: true,
});

const audioCanvasPreview2 = document.getElementById("audioFormPreview2");
const audioCanvasPreviewCtx2 = audioCanvasPreview2.getContext("2d", {
  willReadFrequently: true,
});

audioCanvas.width = 2048;
audioCanvas.height = 256;

audioCanvasPreview.width = 2048;
audioCanvasPreview.height = 256;

audioCanvasPreview2.width = 2048;
audioCanvasPreview2.height = 256;

const visualizersplit = audioCtx.createChannelSplitter(8);

const analysermeter = audioCtx.createAnalyser();
analysermeter.fftSize = 2048;
var dataArrayMeter = new Uint8Array(analysermeter.frequencyBinCount);
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

function drawSpectrum(data) {
  audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
  const barWidth = audioCanvas.width / (Number(analysermeter.fftSize) / 2);

  for (let i = 0; i < Number(analysermeter.fftSize) / 2; i++) {
    const value = data[i];
    const barHeight = (value / 255) * audioCanvas.height;
    const x = i * barWidth;
    const y = audioCanvas.height - barHeight;

    // Example for main audio canvas
    const gradient = audioCanvasCtx.createLinearGradient(
      x,
      y,
      x,
      y + barHeight,
    );

    // Add three color stops
    gradient.addColorStop(0, onRecord ? micDarkColor : micLightColor); // top
    gradient.addColorStop(0.5, onRecord ? samplerDarkColor : samplerLightColor); // middle
    gradient.addColorStop(1, onRecord ? listenDarkColor : listenLightColor); // bottom

    // Apply gradient
    audioCanvasCtx.fillStyle = gradient;
    audioCanvasCtx.fillRect(x, y, barWidth + 2, barHeight);
  }

  // --- Preview copy ---
  const waveformCopy = audioCanvasCtx.getImageData(
    0,
    0,
    audioCanvas.width,
    audioCanvas.height,
  );
  audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
  audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
}

function drawSpectrogram(data) {
  const width = audioCanvas.width;
  const height = audioCanvas.height;
  const columnWidth = 2; // scroll speed per frame

  // --- scroll old image left ---
  const oldImage = audioCanvasCtx.getImageData(
    columnWidth,
    0,
    width - columnWidth,
    height,
  );
  audioCanvasCtx.putImageData(oldImage, 0, 0);
  audioCanvasCtx.clearRect(width - columnWidth, 0, columnWidth, height);

  for (let i = 0; i < data.length; i++) {
    const value = data[i] / 255; // normalize 0–1
    const y = height - (i / data.length) * height;

    let r = 0,
      g = 0,
      b = 0;

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
        b = 128 - 128 * tt;
      } else if (t < 0.95) {
        // orange → yellow
        const tt = (t - 0.75) / 0.2;
        r = 255;
        g = 128 + 127 * tt; // 128 → 255
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
      height / data.length + 1,
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
  const oldImage = audioCanvasCtx.getImageData(
    scrollWidth,
    0,
    width - scrollWidth,
    height,
  );
  audioCanvasCtx.putImageData(oldImage, 0, 0);
  audioCanvasCtx.clearRect(width - scrollWidth, 0, scrollWidth, height);

  // ✅ Combine peaks safely (0–1 expected)
  const peakMix = Math.max(peak1, peak2);

  // ✅ Damping curve (more natural response)
  const damping = 0.025 + peakMix ** 0.6 * 0.9;
  // range ≈ 0.25 → 1.15

  // ✅ Color mapping (no negatives)
  const hue = 180 * damping;
  const hueRecord = 10 + 170 * -damping;

  for (let i = 0; i < dataArray.length; i++) {
    const x = width - scrollWidth + (i * scrollWidth) / dataArray.length;

    const normalized = (dataArray[i] - 128) / 128;
    const barHeight = Math.abs(normalized) * height * 0.5 * damping;

    const yTop = height / 2 - barHeight;
    const yBottom = height / 2 + barHeight;

    audioCanvasCtx.fillStyle = onRecord
      ? `hsl(${hueRecord},100%,50%)`
      : `hsl(${hue},100%,50%)`;

    audioCanvasCtx.fillRect(
      x - 2,
      yTop,
      (scrollWidth / dataArray.length) * 25,
      yBottom - yTop,
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
  const hueRecord = 10 + 170 * -damping;

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
      (trigger + Math.floor((x * rawDataArray.length) / width)) %
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
  audioCanvasPreviewCtx.clearRect(
    0,
    0,
    audioCanvasPreview.width,
    audioCanvasPreview.height,
  );
  VISUALIZER_TYPE = index;
  localStorage.setItem("VISUALIZER_TYPE", index);
}

clearBeforeSetVisualizer(Number(localStorage.getItem("VISUALIZER_TYPE")) || 0);

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
}

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
      const peakToLevel = (amplitude) => {
        if (amplitude <= 0) return 0;
        const db = 20 * Math.log10(amplitude) + 6;
        if (db <= -30) return 0;
        if (db >= 6) return 1;
        return db >= 0 ? 0.8 + (db / 6) * 0.2 : ((db + 30) / 30) * 0.8;
      };

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
    analysermeter.getByteTimeDomainData(dataArrayMeter);
    analysermeter.getByteFrequencyData(freqData);
  }

  window.FUNCTION_UPDATE[2] = update;

  return {
    analyserL,
    analyserR,
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
  updateMeters(levelL, levelR);
  updateAudioVisualizer(freqData, levelL, levelR);

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

  // ---------------------------------------------------------------
  // Audio graph
  // ---------------------------------------------------------------
  const splitter = audioCtx.createChannelSplitter(channels);
  masterVolumeNode.connect(splitter);

  const compressors = [];
  const merger = audioCtx.createChannelMerger(channels);

  for (let i = 0; i < channels; i++) {
    const compressor = audioCtx.createDynamicsCompressor();

    // Adjust these to taste
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    splitter.connect(compressor, i);
    compressor.connect(merger, 0, i);

    compressors.push(compressor);
  }

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

    merger.connect(meterNode);

    // A worklet is only processed if it leads to the destination,
    // so give it a muted path there.
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
    const centerMuted =
      channelIndex == 2 &&
      typeof isCenterMuted !== "undefined" &&
      isCenterMuted;
    const meterdb = document.querySelector(`#meterdb-${channelIndex}`);
    drawGainmeter(meterdb, centerMuted ? 0 : peak);
    const setup = document.getElementById(`setup_${channelname[channelIndex]}`);
    if (setup) setup.style.opacity = peak < 0.01 || centerMuted ? 0 : 1;
    activechannels[channelIndex] = peak < 0.01 || centerMuted ? 0 : 1;
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

      updateMeterUI(i, peak, toDB(rms), peakHold);
      updateActiveChannels(i);

      meterData.push({ peak, rms, peakHold: peakHold[i] });
    }
  }

  window.FUNCTION_UPDATE[1] = analyze;

  return {
    ready,
    splitter,
    analysers: [],
    compressors,
    merger,
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

masterMeter.merger.connect(srsspectatemp);

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
  dataArrayMeter = new Uint8Array(analysermeter.frequencyBinCount);
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

// START
viz.onStart((job) => {
  ["A", "B", "C", "D"].forEach((id) => {
    document.getElementById("stopBtn" + id).click();
  });

  document.getElementById("exportPorgress").textContent = "";
  document.getElementById("exportDialog").show();
});

viz.onProgress((p) => {
  document.getElementById("exportPorgress").textContent = p.raw;
});

// END
viz.onEnd((res) => {
  document.getElementById("exportPorgress").textContent = "";

  if (res.status === "failed") {
    playRenderSound(false);
  } else {
    snackbar(`Video exported!`);
    playRenderSound(true);
    CloseAnimationInit(document.getElementById("exportDialog"));
  }
});

// ERROR
viz.on("error", (err) => {
  CloseAnimationInit(document.getElementById("exportDialog"));
  alert(err.stack, err.message);
});

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
    waveformContainer.style.setProperty("--value", e.progress);
    time.textContent = formatTimeFromNumber(e.currentTime);
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
  for (let x = 1; x <= 24; x++) {
    const button = document.getElementById("looperPad" + x);
    button.dataset.beat = state;
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

  defaultOption.value = "core/default_loops/index.sfxl";
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
  snackbar("Speaker test completed.");
  masterSound.gain.setTargetAtTime(1, audioCtx.currentTime, 0.75);
}

function audiotest() {
  document.getElementById("testspkDialog").show();
  speakerTest.src = `audio/speakertest.mp3`;
  speakerTest.currentTime = 0;
  speakerTest.play();
  startTest();
}

speakerTest.addEventListener("ended", () => {
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
