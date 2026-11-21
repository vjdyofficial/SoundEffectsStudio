class SurroundSoundGain {
  constructor(audioCtx, input, output, channels = 8) {
    this.audioCtx = audioCtx;
    this.input = input;
    this.output = output;
    this.channels = channels;

    this.splitter = audioCtx.createChannelSplitter(channels);
    this.merger = audioCtx.createChannelMerger(channels);
    this.channel = [];

    input.connect(this.splitter);

    for (let i = 0; i < channels; i++) {
      const g = audioCtx.createGain();
      g.gain.value = 1;
      this.splitter.connect(g, i, 0); // splitter output i -> gain
      g.connect(this.merger, 0, i);   // gain -> merger input i
      this.channel.push(g);
    }

    this.merger.connect(output);
  }

  // Set one channel's gain. Optional smoothing time in seconds (0 = instant).
  setGain(index, value, smooth = 0) {
    const g = this.channel[index];
    if (!g) return;
    if (smooth > 0) {
      g.gain.setTargetAtTime(value, this.audioCtx.currentTime, smooth / 3);
    } else {
      g.gain.cancelScheduledValues(this.audioCtx.currentTime);
      g.gain.value = value;
    }
  }

  getGain(index) {
    return this.channel[index] ? this.channel[index].gain.value : undefined;
  }

  // Same gain on every channel
  setAll(value, smooth = 0) {
    for (let i = 0; i < this.channels; i++) this.setGain(i, value, smooth);
  }

  // Array of gains, e.g. [1, 1, 0.8, 0, 0.5, 0.5, 1, 1]
  setGains(values, smooth = 0) {
    values.forEach((v, i) => this.setGain(i, v, smooth));
  }

  reset() {
    this.setAll(1);
  }

  destroy() {
    try { this.input.disconnect(this.splitter); } catch (e) {}
    this.splitter.disconnect();
    this.channel.forEach(g => g.disconnect());
    this.merger.disconnect();
  }
}