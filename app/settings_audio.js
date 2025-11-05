// === Global audio setting variables ===
let sampleRate = 44100;
let sampleSize = 16;
let latency = 0;

const sampleRateSelect = document.getElementById("sampleRateSelect");
const sampleSizeSelect = document.getElementById("sampleSizeSelect");
const latencySelect = document.getElementById("latencySelect");

// === Load saved values ===
const savedAudioSettings = JSON.parse(localStorage.getItem("audioSettings"));

if (savedAudioSettings) {
  sampleRate = savedAudioSettings.sampleRate ?? sampleRate;
  sampleSize = savedAudioSettings.sampleSize ?? sampleSize;
  latency = savedAudioSettings.latency ?? latency;
}

// === Save function ===
function saveAudioSettings() {
  localStorage.setItem("audioSettings", JSON.stringify({
    sampleRate,
    sampleSize,
    latency
  }));
}

// Apply saved values to selects
sampleRateSelect.value = sampleRate;
sampleSizeSelect.value = sampleSize;
latencySelect.value = latency;

// Update and save
sampleRateSelect.addEventListener("change", e => {
  sampleRate = Number(e.target.value);
  saveAudioSettings();
});

sampleSizeSelect.addEventListener("change", e => {
  sampleSize = Number(e.target.value);
  saveAudioSettings();
});

latencySelect.addEventListener("change", e => {
  latency = Number(e.target.value);
  saveAudioSettings();
});
