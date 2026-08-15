document.addEventListener('DOMContentLoaded', () => {
  let isAudioWatermark = false;

  function toBoolean(value) {
    return value === "true" || value === true;
  }

  function loadEncoderSettings() {
    const audioWatermark = toBoolean(localStorage.getItem("audioWatermark"));

    document.getElementById("audioWatermark").checked = audioWatermark;
  }

  loadEncoderSettings();

  document.getElementById("audioWatermark").addEventListener("change", e => {
    const audioWatermark = e.target.checked;
    localStorage.setItem("audioWatermark", audioWatermark);
  });
});
