function createSweepRadar(container, o = {}) {
  const {
    rNear = 25,
    rFar = 100,
    thickness = 30,
    minSweep = 25,
    maxSweep = 270,
    baseW = 240,
    minZoom = 0.4,
    maxZoom = 4,
    margin = 8,
    multMinRadius = 10,
    multMaxRadius = 20,
  } = o;

  container.classList.add("sweep-radar");

  container.innerHTML = `
      <svg
        id="${o.svgId || "radar-svg"}"
        viewBox="${-baseW / 2} ${-baseW / 4} ${baseW} ${baseW / 2}"
      >
        <g class="world">
          <g class="grid">
            <circle r="25"/>
            <circle r="50"/>
            <circle r="75"/>
            <circle r="100"/>
            <circle r="125"/>
            <line x1="-130" x2="130"/>
            <line y1="-130" y2="130"/>
          </g>

          <circle
            class="mult"
            id="${o.multId || "mult"}"
            r="${multMinRadius}"
          />

          <circle
            class="sweep"
            id="${o.arcId || "radar-arc"}"
            pathLength="360"
          />

          <circle class="dot" r="4"/>
        </g>
      </svg>`;

  const style = container.style;
  style.setProperty("--thickness", thickness);

  function setValue(value, instant = false, mult = 1) {
    // Preserve the original radar value mapping
    const t = (Math.min(1, Math.max(-1, value)) + 1) / 2;

    const sweep = minSweep + t * (maxSweep - minSweep);

    const rIn = rNear + (rFar - rNear) * t;

    const rOut = rIn + thickness;

    const zoom = Math.min(
      maxZoom,
      Math.max(minZoom, baseW / (4 * (rOut + margin))),
    );

    // New: grow the mult circle only for positive values
    const positive = Math.max(0, Math.min(1, value));

    const multRadius =
      multMinRadius + positive * (multMaxRadius - multMinRadius) * mult;

    if (instant) {
      container.classList.add("instant");
    }

    style.setProperty("--sweep", sweep.toFixed(2));
    style.setProperty("--r", (rIn + thickness / 2).toFixed(2));
    style.setProperty("--zoom", zoom.toFixed(3));
    style.setProperty("--mult-r", multRadius.toFixed(2));

    if (instant) {
      void container.offsetWidth;
      container.classList.remove("instant");
    }
  }

  setValue(0, true, 1);

  return {
    setValue,
    svg: container.querySelector("svg"),
    mult: container.querySelector("#" + CSS.escape(o.multId || "mult")),
  };
}

var radar = createSweepRadar(document.getElementById("view"), {
  multId: "mult",
  multMinRadius: 25,
  multMaxRadius: 125,
});

function TrueSurround(ctx, input, output) {
  const CHANNELS = 32;

  /* =========================
     MAIN OUTPUT MERGER
  ========================== */

  const merger = ctx.createChannelMerger(CHANNELS);

  const outputBus = ctx.createGain();
  outputBus.channelCount = CHANNELS;
  outputBus.channelCountMode = "explicit";
  outputBus.channelInterpretation = "discrete";

  /* =========================
     GAIN CONTROLS
  ========================== */

  const inputGain = ctx.createGain(); // Side width
  const inputGain2 = ctx.createGain(); // Front width
  const inputGain3 = ctx.createGain(); // Back width
  const inputRawGain = ctx.createGain();

  /* =========================
     DEDICATED MONO ROUTING
     Input 1 → Outputs 1, 2
     Input 6 → Outputs 5, 6
     Input 8 → Outputs 7, 8
  ========================== */

  const monoSplitter = ctx.createChannelSplitter(CHANNELS);
  const monoMerger = ctx.createChannelMerger(CHANNELS);
  const monoGain = ctx.createGain();

  monoGain.gain.value = 0;

  input.connect(monoSplitter);

  // Input channel 1 → output channels 1 and 2
  monoSplitter.connect(monoMerger, 0, 0);
  monoSplitter.connect(monoMerger, 1, 0);
  monoSplitter.connect(monoMerger, 0, 1);
  monoSplitter.connect(monoMerger, 1, 1);

  monoSplitter.connect(monoMerger, 2, 2);
  monoSplitter.connect(monoMerger, 3, 3);

  // Input channel 6 → output channels 5 and 6
  monoSplitter.connect(monoMerger, 4, 5);
  monoSplitter.connect(monoMerger, 5, 4);
  monoSplitter.connect(monoMerger, 5, 5);
  monoSplitter.connect(monoMerger, 4, 4);

  // Input channel 8 → output channels 7 and 8
  monoSplitter.connect(monoMerger, 6, 7);
  monoSplitter.connect(monoMerger, 7, 6);
  monoSplitter.connect(monoMerger, 7, 7);
  monoSplitter.connect(monoMerger, 6, 6);

  monoMerger.connect(monoGain);
  monoGain.connect(outputBus);

  /* =========================
     RAW AUDIO PATH
  ========================== */

  inputRawGain.gain.value = 1;
  let mult = 1;
  let gain = 1;

  input.connect(inputRawGain);
  inputRawGain.connect(output);

  /* =========================
     STEREO WIDTH PROCESSORS
  ========================== */

  const wideOut = ctx.createChannelSplitter(2);
  const wideOut2 = ctx.createChannelSplitter(2);
  const wideOut3 = ctx.createChannelSplitter(2);

  const front_width = createStereoWidth(ctx, 0, 1);
  const back_width = createStereoWidth(ctx, 4, 5);
  const side_width = createStereoWidth(ctx, 6, 7);

  front_width.control(1, 1);
  back_width.control(1, 1);
  side_width.control(0.75, 1);

  input.connect(inputGain2);
  input.connect(inputGain3);
  input.connect(inputGain);

  inputGain2.connect(front_width.input);
  inputGain3.connect(back_width.input);
  inputGain.connect(side_width.input);

  /* =========================
     FRONT WIDTH → OUTPUTS 1–2
  ========================== */

  front_width.output.normal.connect(wideOut3);
  front_width.output.side.connect(wideOut3);

  wideOut3.connect(merger, 0, 0);
  wideOut3.connect(merger, 1, 1);

  /* =========================
     BACK WIDTH → OUTPUTS 5–6
  ========================== */

  back_width.output.normal.connect(wideOut2);
  back_width.output.side.connect(wideOut2);

  wideOut2.connect(merger, 0, 4);
  wideOut2.connect(merger, 1, 5);

  /* =========================
     SIDE WIDTH → OUTPUTS 7–8
  ========================== */

  side_width.output.normal.connect(wideOut);
  side_width.output.side.connect(wideOut);

  wideOut.connect(merger, 0, 6);
  wideOut.connect(merger, 1, 7);

  merger.connect(outputBus);
  outputBus.connect(output);

  /* =========================
     INPUT MODE CONTROL

     -1 = dedicated mono routing
      0 = raw audio
      1 = raw audio + stereo width
  ========================== */

  let enabled = false;

  function setInput(value) {
    const requested = Number(value);


    const level = Number.isFinite(requested)
      ? Math.max(-1, Math.min(1, requested))
      : -1;

    if (!Number.isFinite(requested) || level !== requested) {
      console.warn(
        `TrueSurround input level clamped to ${level} (expected -1 to 1).`,
      );
    }

    const mono = Math.max(0, -level);
    const raw = level < 0 ? 1 + level : 1;
    const width = Math.max(0, level);
    gain = requested
    radar.setValue(gain, false, mult); // 270°, far circle

    const t = ctx.currentTime;
    const ramp = 0.02;

    for (const gain of [inputGain, inputGain2, inputGain3]) {
      gain.gain.setTargetAtTime(width, t, ramp);
    }

    inputRawGain.gain.setTargetAtTime(raw, t, ramp);
    monoGain.gain.setTargetAtTime(mono, t, ramp);

    // Preserve the original meaning of enabled.
    enabled = width > 0;
  }

  /* =========================
     PUBLIC API
  ========================== */

  return {
    setInput,

    isEnabled() {
      return enabled;
    },

    setWidth(v1 = 1, v2 = 1, v3 = 1, v4 = 1) {
      mult = v4;
      front_width.control(v1, v4);
      back_width.control(v2, v4);
      side_width.control(v3, v4);

      radar.setValue(gain, false, mult); // 270°, far circle
    },

    setMono(boolean = false) {
      front_width.setMono(boolean)
      back_width.setMono(boolean);
      side_width.setMono(boolean);
    }
  };
}
