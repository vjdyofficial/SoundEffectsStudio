// VirtualizerLite.js
//
// Same parameters as Virtualizer.js, but built only from native Web Audio nodes:
// no AudioWorklet, no Blob, no async loading, nothing runs in JavaScript per sample.
//
// Why this works: for every channel pair (a = L, b = R) the whole worklet math
// (mono merge, side output, decoded/encoded mode, multiplier, levels) is a linear,
// symmetric 2x2 matrix
//     out a = X*a + Y*b
//     out b = Y*a + X*b
// with
//     X = mono*(mul/2 - 1) + g*(mul - mode)
//     Y = mono*mul/2 - g*mul
//     mono = max(0, -separation), g = max(0, separation) * level, mode = 0 decoded / 1 encoded
// so each pair is 4 GainNodes between a ChannelSplitter and a ChannelMerger.
// The echo is a native DelayNode feeding the same kind of matrix:
//     X = gain*(1 - m/2), Y = gain*m/2, m = -delaySeparation
//
// The original (dry) signal is passed through untouched; the processed signal is summed on top.
//
// setSeparation(-1..1), continuous:
//   -1   0.5 mono, per pair: (L+R) * 0.5 on 0/1, on 4/5 and on 6/7 separately
//    0   normal, original output only
//    1   separate: L-R / R-L of each pair added on top
//   values in between blend toward the nearest end
//
// setOutputMode('decoded' | 'encoded'), applies to the side output (separation > 0):
//   decoded  L-R on the pair's first channel and R-L on its second, added on top of the original
//   encoded  the pair becomes L-R on its first channel and R-L on its second, replacing the original
//
// Delay (echo), fed with the RAW input and summed onto the output next to the original:
//   enableDelay(true | false)   false = bypassed, the delay path is disconnected
//   setDelayTime(0.015 .. 0.08) seconds, warns when the value is clamped; values from 1.5 up are
//                               read as hundredths of a second (1.5 -> 0.015, 3 -> 0.03, 8 -> 0.08)
//   setDelayGain(0 .. 1)        echo level
//   setDelaySeparation(-1 .. 0) -1 = echo merged to mono per pair (0/1, 4/5, 6/7), 0 = normal
// Only the six pair channels are echoed (center and LFE are not).
//
// Channel layout (Web Audio 7.1):
//   0 L, 1 R, 2 C, 3 LFE, 4 SL, 5 SR, 6 RL, 7 RR   (C and LFE are never touched)
//   front stereo -> 0/1, side surround -> 4/5, rear surround -> 6/7

class Virtualizer {
  constructor(audioCtx, input, output) {
    this.audioCtx = audioCtx;
    this.input = input;
    this.output = output;
    this._destroyed = false;
    this._timers = [];
    this._state = {
      separation: 1, multiplier: 1, front: 1, side: 1, rear: 1, mode: 0,
      delayOn: 0, delayTime: 0.03, delayGain: 0.5, delaySep: 0
    };
    this.ready = Promise.resolve(); // same shape as Virtualizer, nothing to wait for

    const ctx = audioCtx;
    this.A = [0, 4, 6]; // first channel of each pair: front, side, rear
    this.B = [1, 5, 7]; // second channel of each pair

    // 8-channel "speakers" bus, same up-mix as the worklet version (stereo -> L R, rest silent)
    this.pre = ctx.createGain();
    this.pre.channelCount = 8;
    this.pre.channelCountMode = 'explicit';
    this.pre.channelInterpretation = 'speakers';

    this.split = ctx.createChannelSplitter(8);
    this.merge = ctx.createChannelMerger(8);

    // echo path: DelayNode -> splitter -> its own matrix
    this.delay = ctx.createDelay(0.1);
    this.delay.channelCount = 8;
    this.delay.channelCountMode = 'explicit';
    this.delay.channelInterpretation = 'speakers';
    this.delay.delayTime.value = this._state.delayTime;
    this.dSplit = ctx.createChannelSplitter(8);

    this.main = [];
    this.echo = [];
    for (let p = 0; p < 3; p++) {
      this.main.push(this._matrix(this.split, this.A[p], this.B[p]));
      this.echo.push(this._matrix(this.dSplit, this.A[p], this.B[p]));
    }

    // the original output always stays as it is
    this.input.connect(this.output);

    this.input.connect(this.pre);
    this.pre.connect(this.split);
    this.merge.connect(this.output);
    // the delay path stays disconnected until enableDelay(true)

    this._update();
  }

  // 4 gain nodes for one pair: a->a (X), b->a (Y), a->b (Y), b->b (X)
  _matrix(splitter, a, b) {
    const ctx = this.audioCtx;
    const make = () => { const g = ctx.createGain(); g.gain.value = 0; return g; };
    const xa = make(), yb = make(), ya = make(), xb = make();
    splitter.connect(xa, a, 0); xa.connect(this.merge, 0, a);
    splitter.connect(yb, b, 0); yb.connect(this.merge, 0, a);
    splitter.connect(ya, a, 0); ya.connect(this.merge, 0, b);
    splitter.connect(xb, b, 0); xb.connect(this.merge, 0, b);
    return { x: [xa, xb], y: [yb, ya] };
  }

  _ramp(m, x, y, tc) {
    const t = this.audioCtx.currentTime;
    for (const n of m.x) n.gain.setTargetAtTime(x, t, tc);
    for (const n of m.y) n.gain.setTargetAtTime(y, t, tc);
  }

  // recompute every coefficient from the current state
  _update() {
    const st = this._state;
    const t = this.audioCtx.currentTime;
    const mul = st.multiplier;
    const mono = st.separation < 0 ? -st.separation : 0;
    const side = st.separation > 0 ? st.separation : 0;
    const levels = [st.front, st.side, st.rear];

    for (let p = 0; p < 3; p++) {
      const g = side * levels[p];
      const X = mono * (mul / 2 - 1) + g * (mul - st.mode);
      const Y = mono * mul / 2 - g * mul;
      this._ramp(this.main[p], X, Y, 0.01);
    }

    const dg = st.delayOn ? st.delayGain : 0;
    const dm = -st.delaySep;
    for (let p = 0; p < 3; p++) {
      this._ramp(this.echo[p], dg * (1 - dm / 2), dg * dm / 2, 0.01);
    }
    this.delay.delayTime.setTargetAtTime(st.delayTime, t, 0.05);
  }

  // label (optional): warn in the console when the value is invalid or gets clamped
  _set(name, value, min, max, label, shown = value) {
    const v = Number(value); // true/false work too
    if (!Number.isFinite(v)) {
      if (label) console.warn(`VirtualizerLite.${label}: invalid value ${shown}, ignored`);
      return this;
    }
    const c = Math.min(max, Math.max(min, v));
    if (label && c !== v) {
      const asked = shown === value ? `${shown}` : `${shown} (read as ${value})`;
      console.warn(`VirtualizerLite.${label}(${asked}) is outside ${min} to ${max}, clamped to ${c}`);
    }
    this._state[name] = c;
    if (!this._destroyed) this._update();
    return this;
  }

  // level 0..1 of each pair's own side output
  setRearSurroundOutput(level) { return this._set('rear', level, 0, 1); }   // ch 6/7
  setSideSurroundOutput(level) { return this._set('side', level, 0, 1); }   // ch 4/5
  setFrontStereoOutput(level)  { return this._set('front', level, 0, 1); }  // ch 0/1

  // -1 0.5 mono | 0 normal | 1 separate (side input)
  setSeparation(v)  { return this._set('separation', v, -1, 1); }
  setMultiplier(v)  { return this._set('multiplier', v, 0.5, 4); }

  // Delay (echo), fed with the raw input
  enableDelay(on) {
    this._set('delayOn', on ? 1 : 0, 0, 1);
    this._timers.forEach(clearTimeout);
    this._timers = [];
    if (on) {
      // connecting twice to the same node is a no-op
      this.pre.connect(this.delay);
      this.delay.connect(this.dSplit);
    } else {
      // fade the echo out, then cut the input, then let the buffer flush before the output is cut,
      // so nothing stale comes back when the delay is switched on again
      this._timers.push(setTimeout(() => {
        try { this.pre.disconnect(this.delay); } catch (e) {}
        this._timers.push(setTimeout(() => {
          try { this.delay.disconnect(this.dSplit); } catch (e) {}
        }, 110));
      }, 120));
    }
    return this;
  }

  setDelayTime(t) {
    // 0.015 .. 0.08 seconds; values from 1.5 up are hundredths of a second (1.5 -> 0.015, 3 -> 0.03)
    const n = Number(t);
    const sec = Number.isFinite(n) && n >= 1.5 ? n / 100 : n;
    return this._set('delayTime', sec, 0.015, 0.08, 'setDelayTime', t);
  }
  setDelayGain(g)        { return this._set('delayGain', g, 0, 1); }
  setDelaySeparation(v)  { return this._set('delaySep', v, -1, 0, 'setDelaySeparation'); }  // -1 = mono, 0 = normal

  // 'decoded': L-R / R-L added on top of the original
  // 'encoded': L-R / R-L replacing the original (first / second channel of each pair)
  setOutputMode(mode) {
    return this._set('mode', (mode === 'encoded' || mode === 1 || mode === true) ? 1 : 0, 0, 1);
  }

  destroy() {
    this._destroyed = true;
    this._timers.forEach(clearTimeout);
    this._timers = [];
    try { this.input.disconnect(this.output); } catch (e) {}
    try { this.input.disconnect(this.pre); } catch (e) {}
    for (const n of [this.pre, this.split, this.merge, this.delay, this.dSplit]) {
      try { n.disconnect(); } catch (e) {}
    }
    for (const m of this.main.concat(this.echo)) {
      for (const g of m.x.concat(m.y)) { try { g.disconnect(); } catch (e) {} }
    }
  }
}

// Usage:
// const ts = new VirtualizerLite(audioCtx, sourceNode, audioCtx.destination);
// ts.setSeparation(0.6);
// ts.setMultiplier(2);
// ts.setRearSurroundOutput(1);
// ts.setOutputMode('encoded');
// ts.setDelayTime(0.03);
// ts.setDelayGain(0.5);
// ts.enableDelay(true);