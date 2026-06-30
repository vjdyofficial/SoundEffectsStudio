const fileInput = document.getElementById("audioFile");
const pitchSlider = document.getElementById("pitch");
const pitchValue = document.getElementById("pitchValue");

let ctx;
let source;
let buffer;
let workletNode;

pitchSlider.addEventListener("input", () => {
  pitchValue.textContent = pitchSlider.value;

  if (workletNode) {
    const ratio =
      Math.pow(2, pitchSlider.value / 12);

    workletNode.port.postMessage({
      pitch: ratio
    });
  }
});

fileInput.addEventListener("change", async (e) => {

  const file = e.target.files[0];

  if (!file) return;

  if (!ctx) {
    ctx = new AudioContext();

    await ctx.audioWorklet.addModule(
      "pitch-worklet.js"
    );
  }

  const arrayBuffer = await file.arrayBuffer();

  buffer = await ctx.decodeAudioData(
    arrayBuffer
  );

  console.log("Loaded:", buffer.duration);
});

document
  .getElementById("playBtn")
  .addEventListener("click", () => {

    if (!buffer) return;

    source = ctx.createBufferSource();
    source.buffer = buffer;

    workletNode = new AudioWorkletNode(
      ctx,
      "pitch-shift-processor"
    );

    const ratio =
      Math.pow(
        2,
        Number(pitchSlider.value) / 12
      );

    workletNode.port.postMessage({
      pitch: ratio
    });

    source.connect(workletNode);
    workletNode.connect(ctx.destination);

    source.start();
  });

document
  .getElementById("stopBtn")
  .addEventListener("click", () => {

    if (source) {
      source.stop();
      source.disconnect();
      source = null;
    }
  });