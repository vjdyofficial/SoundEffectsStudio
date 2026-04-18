document.addEventListener('DOMContentLoaded', () => {
  let isAudioWatermark = false;

  function toBoolean(value) {
    return value === "true" || value === true;
  }

  function loadEncoderSettings() {
    const audioWatermark = toBoolean(localStorage.getItem("audioWatermark"));
    const InputRecord = toBoolean(localStorage.getItem("connectInputRecord"));
    const OutputRecord = toBoolean(localStorage.getItem("connectOutputRecord"));

    document.getElementById("audioWatermark").checked = audioWatermark;
    document.getElementById("connectInputRecord").checked = InputRecord;
    document.getElementById("connectOutputRecord").checked = OutputRecord;

    connectionInput(InputRecord);
    connectionOutput(OutputRecord);
  }

  loadEncoderSettings();

  document.getElementById("audioWatermark").addEventListener("change", e => {
    const audioWatermark = e.target.checked;
    localStorage.setItem("audioWatermark", audioWatermark);
  });

  document.getElementById("connectInputRecord").addEventListener("change", e => {
    const InputRecord = e.target.checked;
    localStorage.setItem("connectInputRecord", InputRecord);
    connectionInput(InputRecord);
  });

  document.getElementById("connectOutputRecord").addEventListener("change", e => {
    const OutputRecord = e.target.checked;
    localStorage.setItem("connectOutputRecord", OutputRecord);
    connectionOutput(OutputRecord);
  });
});
