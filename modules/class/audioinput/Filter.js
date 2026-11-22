class AudioInputFilter extends GainNode {
  constructor(audioCtx, outputNode, opts = {}) {
    super(audioCtx);                                  // this = input node
    this._ctx = audioCtx;
    this._out = outputNode;
    this._low = 1; this._mid = 1; this._high = 1;

    const lowHz = opts.lowHz ?? 300;                  // low  = below this
    const highHz = opts.highHz ?? 3000;               // high = above this, mid = in between
    const Q = -3.0103;                                // Butterworth (0.7071) -- Web Audio LP/HP Q is in dB

    const bq = (type, f) => new BiquadFilterNode(audioCtx, { type, frequency: f, Q });

    // two Butterworth filters in series = Linkwitz-Riley 4th order (bands add back up flat)
    this._lp1 = [bq('lowpass', lowHz),  bq('lowpass', lowHz)];
    this._hp1 = [bq('highpass', lowHz), bq('highpass', lowHz)];
    this._lp2 = [bq('lowpass', highHz), bq('lowpass', highHz)];
    this._hp2 = [bq('highpass', highHz), bq('highpass', highHz)];

    this._lowGain  = new GainNode(audioCtx);
    this._midGain  = new GainNode(audioCtx);
    this._highGain = new GainNode(audioCtx);
    this._mix      = new GainNode(audioCtx);

    const chain = (src, nodes, dst) => {
      let n = src;
      for (const f of nodes) { n.connect(f); n = f; }
      n.connect(dst);
    };

    chain(this,        this._lp1, this._lowGain);                     // low
    chain(this,        this._hp1, this._hp1Out = new GainNode(audioCtx));
    chain(this._hp1Out, this._lp2, this._midGain);                    // mid
    chain(this._hp1Out, this._hp2, this._highGain);                   // high

    this._lowGain.connect(this._mix);
    this._midGain.connect(this._mix);
    this._highGain.connect(this._mix);
    this._mix.connect(outputNode);
  }

  _set(param, v) {
    v = Math.max(0, Math.min(2, v));
    param.setTargetAtTime(v, this._ctx.currentTime, 0.01);            // smooth, no clicks
    return v;
  }

  setLow(v)  { this._low  = this._set(this._lowGain.gain, v); }       // 0 = removed, 1 = on
  setMid(v)  { this._mid  = this._set(this._midGain.gain, v); }
  setHigh(v) { this._high = this._set(this._highGain.gain, v); }

  set(low, mid, high) { this.setLow(low); this.setMid(mid); this.setHigh(high); }

  get low()  { return this._low; }
  get mid()  { return this._mid; }
  get high() { return this._high; }

  setCrossover(lowHz, highHz) {                                       // move the band edges
    const t = this._ctx.currentTime;
    for (const f of this._lp1) f.frequency.setTargetAtTime(lowHz, t, 0.01);
    for (const f of this._hp1) f.frequency.setTargetAtTime(lowHz, t, 0.01);
    for (const f of this._lp2) f.frequency.setTargetAtTime(highHz, t, 0.01);
    for (const f of this._hp2) f.frequency.setTargetAtTime(highHz, t, 0.01);
  }

  destroy() {
    const all = [this, ...this._lp1, ...this._hp1, ...this._lp2, ...this._hp2,
                 this._hp1Out, this._lowGain, this._midGain, this._highGain, this._mix];
    for (const n of all) { try { n.disconnect(); } catch (e) {} }
  }
}