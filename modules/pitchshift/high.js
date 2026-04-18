const createAudioNode = require('custom-audio-node')

// Original PitchShift code wrapped
function PitchShift(audioContext) {
  var instance = new Jungle(audioContext)
  var input = audioContext.createGain()
  var wet = audioContext.createGain()
  var dry = audioContext.createGain()
  var output = audioContext.createGain()

  dry.gain.value = 0

  input.connect(wet)
  input.connect(dry)

  wet.connect(instance.input)
  instance.output.connect(output)

  dry.connect(output)

  var node = createAudioNode(input, output, {
    dry: {
      min: 0,
      defaultValue: 0,
      target: dry.gain
    },
    wet: {
      min: 0,
      defaultValue: 1,
      target: wet.gain
    }
  })

  instance.setPitchOffset(getMultiplier(12))

  // --- Original transpose property ---
  var transpose = 0
  var ramp = 0
  var buffer = 0.100;

  Object.defineProperty(node, 'transpose', {
    set: function (value) {
      transpose = getMultiplier(value).toFixed(2)
      instance.setPitchOffset(transpose, ramp)
    },
    get: function () {
      return transpose
    }
  })

  return node
}

module.exports = PitchShift

// --- Original helper functions (unchanged) ---
function getMultiplier(x) {
  if (x < 0) {
    return x / 12
  } else {
    var a5 = 1.8149080040913423e-7
    var a4 = -0.000019413043101157434
    var a3 = 0.0009795096626987743
    var a2 = -0.014147877819596033
    var a1 = 0.23005591195033048
    var a0 = 0.02278153473118749

    var x1 = x
    var x2 = x * x
    var x3 = x * x * x
    var x4 = x * x * x * x
    var x5 = x * x * x * x * x

    return a0 + x1 * a1 + x2 * a2 + x3 * a3 + x4 * a4 + x5 * a5
  }
}

function createFadeBuffer(context, activeTime, fadeTime) {
  const sr = context.sampleRate; // use actual context rate (more accurate)
  const length = Math.round(activeTime * sr);
  const fadeLength = Math.min(Math.round(fadeTime * sr), Math.floor(length / 2));

  const buffer = context.createBuffer(1, length, sr);
  const data = buffer.getChannelData(0);

  // Precompute constants for speed + precision
  const pi = Math.PI;

  for (let i = 0; i < length; i++) {
    let gain;

    if (i < fadeLength) {
      // Equal-power fade-in (√Hann)
      const x = i / (fadeLength - 1);
      gain = Math.sqrt(0.5 * (1 - Math.cos(pi * x)));

    } else if (i >= length - fadeLength) {
      // Equal-power fade-out (phase-aligned with fade-in)
      const x = (i - (length - fadeLength)) / (fadeLength - 1);
      gain = Math.sqrt(0.5 * (1 + Math.cos(pi * x)));

    } else {
      // Flat unity gain
      gain = 1.0;
    }

    data[i] = gain;
  }

  return buffer;
}

function createDelayTimeBuffer(context, activeTime, fadeTime, shiftUp, semitoneShift = 0) {
  const sampleRate = 48000;
  const length1 = activeTime * sampleRate;
  const length2 = (activeTime - 2 * fadeTime) * sampleRate;
  const length = length1 + length2;

  const buffer = context.createBuffer(2, length, sampleRate);
  const p0 = buffer.getChannelData(0);
  const p1 = buffer.getChannelData(1);

  // ---- cubic interpolation helper (Hermite style, smoother) ----
  function cubicHermite(y0, y1, y2, y3, t) {
    const c0 = y1;
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
    return ((c3 * t + c2) * t + c1) * t + c0;
  }

  if (shiftUp) {
    const ref = new Float64Array(length1); // use higher precision internally

    for (let i = 0; i < length1; i++) {
      ref[i] = (semitoneShift >= 0)
        ? (length1 - 2 * fadeTime - i) / length1
        : i / length1;
    }

    const factor = Math.pow(2, semitoneShift); // keep your custom mapping

    for (let i = 0; i < length1; i++) {
      let readPos = i * factor;

      if (readPos < 1) readPos = 1;
      if (readPos > length1 - 3) readPos = length1 - 3;

      const i1 = Math.floor(readPos);
      const frac = readPos - i1;

      const value = cubicHermite(
        ref[Math.max(i1 - 1, 0)],
        ref[i1],
        ref[i1 + 1],
        ref[i1 + 2],
        frac
      );

      p0[i] = value;
      p1[i] = value;
    }

  } else {
    const ref = new Float64Array(length1);
    for (let i = 0; i < length1; i++) {
      ref[i] = i / length1;
    }

    const factor = Math.pow(2, -semitoneShift);

    for (let i = 0; i < length1; i++) {
      let readPos = i * factor;

      if (readPos < 1) readPos = 1;
      if (readPos > length1 - 3) readPos = length1 - 3;

      const i1 = Math.floor(readPos);
      const frac = readPos - i1;

      const value = cubicHermite(
        ref[Math.max(i1 - 1, 0)],
        ref[i1],
        ref[i1 + 1],
        ref[i1 + 2],
        frac
      );

      p0[i] = value;
      p1[i] = value;
    }
  }

  for (let i = length1; i < length; i++) {
    p0[i] = 0;
    p1[i] = 0;
  }

  return buffer;
}

var delayTime = 0.1;
var fadeTime = 0.050;
var bufferTime = 0.100;

function Jungle(context) {
  this.context = context;
  // Create nodes for the input and output of this "module".
  var input = context.createGain();
  var output = context.createGain();
  this.input = input;
  this.output = output;

  // Delay modulation.
  var mod1 = context.createBufferSource();
  var mod2 = context.createBufferSource();
  var mod3 = context.createBufferSource();
  var mod4 = context.createBufferSource();
  this.shiftDownBuffer = createDelayTimeBuffer(context, bufferTime, fadeTime, false);
  this.shiftUpBuffer = createDelayTimeBuffer(context, bufferTime, fadeTime, true);
  mod1.buffer = this.shiftDownBuffer;
  mod2.buffer = this.shiftDownBuffer;
  mod3.buffer = this.shiftUpBuffer;
  mod4.buffer = this.shiftUpBuffer;
  mod1.loop = true;
  mod2.loop = true;
  mod3.loop = true;
  mod4.loop = true;

  // for switching between oct-up and oct-down
  var mod1Gain = context.createGain();
  var mod2Gain = context.createGain();
  var mod3Gain = context.createGain();
  mod3Gain.gain.value = 0;
  var mod4Gain = context.createGain();
  mod4Gain.gain.value = 0;

  mod1.connect(mod1Gain);
  mod2.connect(mod2Gain);
  mod3.connect(mod3Gain);
  mod4.connect(mod4Gain);

  // Delay amount for changing pitch.
  var modGain1 = context.createGain();
  var modGain2 = context.createGain();

  var delay1 = context.createDelay();
  var delay2 = context.createDelay();
  mod1Gain.connect(modGain1);
  mod2Gain.connect(modGain2);
  mod3Gain.connect(modGain1);
  mod4Gain.connect(modGain2);
  modGain1.connect(delay1.delayTime);
  modGain2.connect(delay2.delayTime);

  // Crossfading.
  var fade1 = context.createBufferSource();
  var fade2 = context.createBufferSource();
  var fadeBuffer = createFadeBuffer(context, bufferTime, fadeTime);
  fade1.buffer = fadeBuffer
  fade2.buffer = fadeBuffer;
  fade1.loop = true;
  fade2.loop = true;

  var mix1 = context.createGain();
  var mix2 = context.createGain();
  mix1.gain.value = 0;
  mix2.gain.value = 0;

  fade1.connect(mix1.gain);
  fade2.connect(mix2.gain);

  // Connect processing graph.
  input.connect(delay1);
  input.connect(delay2);
  delay1.connect(mix1);
  delay2.connect(mix2);
  mix1.connect(output);
  mix2.connect(output);

  // Start
  var t = 8 + 0.250;
  var t2 = t + 0.250 - 2;
  mod1.start(t);
  mod2.start(t2);
  mod3.start(t);
  mod4.start(t2);
  fade1.start(t);
  fade2.start(t2);

  this.mod1 = mod1;
  this.mod2 = mod2;
  this.mod1Gain = mod1Gain;
  this.mod2Gain = mod2Gain;
  this.mod3Gain = mod3Gain;
  this.mod4Gain = mod4Gain;
  this.modGain1 = modGain1;
  this.modGain2 = modGain2;
  this.fade1 = fade1;
  this.fade2 = fade2;
  this.mix1 = mix1;
  this.mix2 = mix2;
  this.delay1 = delay1;
  this.delay2 = delay2;

  this.setDelay(delayTime);
}

Jungle.prototype.setDelay = function (delayTime) {
  const value = (0.5 * delayTime).toFixed(3)

  this.modGain1.gain.value = value;
  this.modGain2.gain.value = value
}

Jungle.prototype.setPitchOffset = function (mult, ramp = 0.05) {
  const now = 0.1;
  const rampTime = ramp; // seconds for smoothing

  if (mult > 0) { // pitch up
    this.mod1Gain.gain.value = 0
    this.mod2Gain.gain.value = 0
    this.mod3Gain.gain.value = 1
    this.mod4Gain.gain.value = 1
  } else { // pitch down
    this.mod1Gain.gain.value = 1
    this.mod2Gain.gain.value = 1
    this.mod3Gain.gain.value = 0
    this.mod4Gain.gain.value = 0
  }

  this.setDelay(delayTime * Math.abs(mult));
};