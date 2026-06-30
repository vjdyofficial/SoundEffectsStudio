class PitchShiftProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.pitch = 1.0;

    this.bufferSize = 16384;
    this.buffer = new Float32Array(this.bufferSize);

    this.writePos = 0;
    this.readPos = 0;
    this.filled = false;

    this.port.onmessage = (e) => {
      if (typeof e.data.pitch === "number") {
        this.pitch = e.data.pitch;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !output || !input[0] || !output[0]) return true;

    const inCh = input[0];
    const outCh = output[0];

    for (let i = 0; i < inCh.length; i++) {

      const sample = inCh[i];

      // write
      this.buffer[this.writePos] = sample;

      // only start reading after some buffer is filled
      if (!this.filled && this.writePos < this.bufferSize / 2) {
        outCh[i] = sample;
      } else {
        this.filled = true;

        const rp0 = Math.floor(this.readPos);
        const rp1 = (rp0 + 1) % this.bufferSize;
        const frac = this.readPos - rp0;

        outCh[i] =
          this.buffer[rp0] * (1 - frac) +
          this.buffer[rp1] * frac;

        this.readPos += this.pitch;

        // prevent runaway
        const dist =
          (this.writePos - this.readPos + this.bufferSize) %
          this.bufferSize;

        if (dist < 2) {
          this.readPos =
            (this.writePos - 2 + this.bufferSize) %
            this.bufferSize;
        }
      }

      this.writePos = (this.writePos + 1) % this.bufferSize;
    }

    return true;
  }
}

registerProcessor("pitch-shift-processor", PitchShiftProcessor);