class SurroundSoundDownmix {
  constructor(audioCtx, input, output, stereoMode = false) {
    this.audioCtx = audioCtx;
    this.input = input;
    this.output = output;
    this._stereoMode = stereoMode;

    this.splitter = audioCtx.createChannelSplitter(8);
    this.merger = audioCtx.createChannelMerger(8);
    input.connect(this.splitter);
    this.merger.connect(output);

    // Per-channel gain stage for LFE (3) and surrounds (4-7)
    // Channels 0, 1, 2 have no gain stage (null)
    this.level = [];
    for (let i = 0; i < 8; i++) {
      if (i >= 3) {
        const g = audioCtx.createGain();
        this.splitter.connect(g, i, 0);
        this.level.push(g);
      } else {
        this.level.push(null);
      }
    }

    // Where each channel's signal comes from (gain stage if it has one)
    const source = (i) => this.level[i] || this.splitter;
    const out = (i) => (this.level[i] ? 0 : i);

    // Direct routes: source channel i -> output channel i
    this.direct = [];
    for (let i = 0; i < 8; i++) {
      const g = audioCtx.createGain();
      source(i).connect(g, out(i), 0);
      g.connect(this.merger, 0, i);
      this.direct.push(g);
    }

    // Stereo routes: 2 (C) and 3 (LFE) go to both L and R,
    // 4/6 go to L, 5/7 go to R
    const stereoTargets = {
      2: [0, 1],
      3: [0, 1],
      4: [0],
      5: [1],
      6: [0],
      7: [1]
    };

    this.stereo = [];
    for (const src in stereoTargets) {
      const i = Number(src);
      for (const dst of stereoTargets[src]) {
        const g = audioCtx.createGain();
        source(i).connect(g, out(i), 0);
        g.connect(this.merger, 0, dst);
        this.stereo.push(g);
      }
    }

    this._apply(0);
  }

  get stereoMode() {
    return this._stereoMode;
  }

  set stereoMode(enabled) {
    this.setStereoMode(enabled);
  }

  setStereoMode(enabled, smooth = 0.01) {
    this._stereoMode = !!enabled;
    this._apply(smooth);
  }

  // Gain for LFE (3) and surround channels (4-7) only.
  // Indexes 0, 1, 2 (L, R, C) are ignored.
  setGain(index, value, smooth = 0) {
    const g = this.level[index];
    if (!g) return;
    this._set(g.gain, value, smooth);
  }

  getGain(index) {
    const g = this.level[index];
    return g ? g.gain.value : undefined;
  }

  _set(param, value, smooth) {
    const t = this.audioCtx.currentTime;
    param.cancelScheduledValues(t);
    if (smooth > 0) param.setTargetAtTime(value, t, smooth / 3);
    else param.value = value;
  }

  _apply(smooth) {
    const on = this._stereoMode;

    this._set(this.direct[0].gain, 1, smooth);
    this._set(this.direct[1].gain, 1, smooth);

    for (let i = 2; i < 8; i++) {
      this._set(this.direct[i].gain, on ? 0 : 1, smooth);
    }

    this.stereo.forEach(g => this._set(g.gain, on ? 1 : 0, smooth));
  }

  destroy() {
    try { this.input.disconnect(this.splitter); } catch (e) {}
    this.splitter.disconnect();
    this.level.forEach(g => g && g.disconnect());
    this.direct.forEach(g => g.disconnect());
    this.stereo.forEach(g => g.disconnect());
    this.merger.disconnect();
  }
}