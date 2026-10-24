
const SMOOTHING_FACTOR = 0.8;
const FRAME_INTERVAL = 1 / 60;
const CHANNEL_COUNT = 8;

class VolumeMeter extends AudioWorkletProcessor {
  constructor() {
    super();

    this._lastUpdate = currentTime;
    this._volume = new Float32Array(CHANNEL_COUNT);
  }

  process(inputs, outputs) {
    const input = inputs[0];

    if (!input || input.length === 0) {
      return true;
    }

    // Process every available channel independently.
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const samples = input[ch];
      let rms = 0;

      if (samples && samples.length > 0) {
        let sum = 0;

        for (let i = 0; i < samples.length; i++) {
          sum += samples[i] * samples[i];
        }

        rms = Math.sqrt(sum / samples.length);
      }

      // Fast attack, gradual release.
      this._volume[ch] = Math.max(
        rms,
        this._volume[ch] * SMOOTHING_FACTOR
      );
    }

    // Send all eight readings in one message.
    if (currentTime - this._lastUpdate >= FRAME_INTERVAL) {
      this.port.postMessage(Array.from(this._volume));
      this._lastUpdate = currentTime;
    }

    return true;
  }
}

registerProcessor("volume-meter", VolumeMeter);
