class A4Tuning {
  constructor(audioCtx, input, output) {
    this.ctx = audioCtx;
    this.input = input;
    this.output = output;
    this.node = null;
    this.bypassed = null; // unknown until the first setFrequency
    this.hz = 440;
  }

  async init() {
    const code = `
      class A4TuningProcessor extends AudioWorkletProcessor {
        static get parameterDescriptors() {
          return [{ name: 'ratio', defaultValue: 1, minValue: 0.5, maxValue: 2, automationRate: 'k-rate' }];
        }
        constructor() {
          super();
          this.CH = 8;
          this.SIZE = 8192;          // power of 2
          this.MASK = this.SIZE - 1;
          this.W = 2048;             // window in samples (~43 ms at 48 kHz)
          this.buf = [];
          for (let c = 0; c < this.CH; c++) this.buf.push(new Float32Array(this.SIZE));
          this.w = 0;
          this.phase = 0;
          this.port.onmessage = (e) => {
            if (e.data === 'reset') {
              for (let c = 0; c < this.CH; c++) this.buf[c].fill(0);
              this.phase = 0;
            }
          };
        }
        process(inputs, outputs, params) {
          const input = inputs[0];
          const output = outputs[0];
          if (!output || !output.length) return true;
          if (!input || !input.length) {
            for (let c = 0; c < output.length; c++) output[c].fill(0);
            return true;
          }
          const n = output[0].length;
          const nch = Math.min(output.length, input.length, this.CH);
          const W = this.W, SIZE = this.SIZE, MASK = this.MASK;
          const inc = (1 - params.ratio[0]) / W;
          const TWO_PI = 6.283185307179586;
          let w = this.w, phase = this.phase;

          for (let i = 0; i < n; i++) {
            // write input into every channel's ring buffer
            for (let c = 0; c < nch; c++) this.buf[c][w] = input[c][i];

            // tap A and tap B (half a window apart), Hann crossfade
            const pB = phase >= 0.5 ? phase - 0.5 : phase + 0.5;
            const gA = 0.5 - 0.5 * Math.cos(TWO_PI * phase);
            const gB = 1 - gA;

            const rA = w - phase * W + SIZE;
            const a0 = Math.floor(rA);
            const fA = rA - a0;
            const a1i = (a0 + 1) & MASK, a0i = a0 & MASK;

            const rB = w - pB * W + SIZE;
            const b0 = Math.floor(rB);
            const fB = rB - b0;
            const b1i = (b0 + 1) & MASK, b0i = b0 & MASK;

            for (let c = 0; c < nch; c++) {
              const bf = this.buf[c];
              const sA = bf[a0i] + (bf[a1i] - bf[a0i]) * fA;
              const sB = bf[b0i] + (bf[b1i] - bf[b0i]) * fB;
              output[c][i] = sA * gA + sB * gB;
            }

            w = (w + 1) & MASK;
            phase += inc;
            if (phase >= 1) phase -= 1;
            else if (phase < 0) phase += 1;
          }
          this.w = w;
          this.phase = phase;
          return true;
        }
      }
      registerProcessor('a4-tuning', A4TuningProcessor);
    `;
    const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    this.node = new AudioWorkletNode(this.ctx, 'a4-tuning', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 8,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      outputChannelCounts: [8]
    });
    this.ratioParam = this.node.parameters.get('ratio');
    this.setFrequency(440); // starts bypassed
  }

  setFrequency(hz) {
    hz = Math.min(475, Math.max(415, hz));
    this.hz = hz;
    if (Math.abs(hz - 440) < 0.005) {
      this.bypass();
      return;
    }
    const ratio = hz / 440;
    const t = this.ctx.currentTime;
    this.ratioParam.setTargetAtTime(ratio, t, 0.02); // smooth, no zipper noise
    this.unbypass();
  }

  bypass() {
    if (this.bypassed === true) return;
    try { this.input.disconnect(this.node); } catch (e) {}
    try { this.node.disconnect(this.output); } catch (e) {}
    this.input.connect(this.output);
    this.bypassed = true;
  }

  unbypass() {
    if (this.bypassed === false) return;
    try { this.input.disconnect(this.output); } catch (e) {}
    this.node.port.postMessage('reset'); // clear stale audio from the buffer
    this.input.connect(this.node);
    this.node.connect(this.output);
    this.bypassed = false;
  }

  destroy() {
    try { this.input.disconnect(this.node); } catch (e) {}
    try { this.node.disconnect(); } catch (e) {}
    this.node = null;
  }
}