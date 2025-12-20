// pitch-processor.js
class PitchShiftProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0][0];
    const output = outputs[0][0];
    // DSP here (granular / FFT)
    output.set(input);
    return true;
  }
}

registerProcessor("pitch-shift", PitchShiftProcessor);
