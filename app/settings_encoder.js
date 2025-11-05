// Load on startup
const savedFormat = localStorage.getItem("format") || "audio/wav";
const savedBitrate = localStorage.getItem("bitrate") || "320k";

document.getElementById("formatSelector").value = savedFormat;
document.getElementById("bitrateSelector").value = savedBitrate;

// Save when changed
document.getElementById("formatSelector").addEventListener("change", e => {
  localStorage.setItem("format", e.target.value);
});

document.getElementById("bitrateSelector").addEventListener("change", e => {
  localStorage.setItem("bitrate", e.target.value);
});
