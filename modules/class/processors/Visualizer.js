const VISUALIZER_WORKER_CODE = `
const SPR_H = 256;

let canvas = null, ctx = null, W = 0, H = 0;
let onRecord = false;
let sprite = null;
let scopeWin = 512;   // samples shown in the scope: ~10 ms at 48 kHz (about 4-5 cycles of a 440 Hz sine)
const colors = {
  micDark: '#888', micLight: '#888',
  samplerDark: '#888', samplerLight: '#888',
  listenDark: '#888', listenLight: '#888'
};

function buildSprite() {
  sprite = new OffscreenCanvas(1, SPR_H);
  const g = sprite.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, SPR_H);
  grad.addColorStop(0,   onRecord ? colors.micDark     : colors.micLight);
  grad.addColorStop(0.5, onRecord ? colors.samplerDark : colors.samplerLight);
  grad.addColorStop(1,   onRecord ? colors.listenDark  : colors.listenLight);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, SPR_H);
}

function drawSpectrum(data) {
  ctx.clearRect(0, 0, W, H);
  if (!sprite) buildSprite();

  const n = data.length;
  const barWidth = W / n;
  const dw = barWidth + 2;

  for (let i = 0; i < n; i++) {
    const barHeight = (data[i] / 255) * H;
    if (barHeight < 0.5) continue;   // nothing visible, skip the draw call
    ctx.drawImage(sprite, 0, 0, 1, SPR_H, i * barWidth, H - barHeight, dw, barHeight);
  }
}

function drawScope(raw, peak1, peak2) {
  ctx.clearRect(0, 0, W, H);
  const len = raw.length;
  const win = Math.min(scopeWin, len >> 1);   // samples to show

  const peakMix = Math.max(peak1, peak2);
  const gain = 0.4 + peakMix * 0.8;

  const damping = 0.05 + Math.pow(peakMix, 0.6);
  const hue = 180 * damping;
  const hueRecord = 10 + 170 * -damping;

  ctx.strokeStyle = onRecord
    ? 'hsl(' + hueRecord + ',100%,55%)'
    : 'hsl(' + hue + ',100%,55%)';
  ctx.lineWidth = 7.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // trigger: first rising zero-cross where a full window still fits (no wrap-around jump)
  let trigger = 0;
  const maxStart = len - win;
  for (let i = 1; i < maxStart; i++) {
    if (raw[i - 1] < 128 && raw[i] >= 128) { trigger = i; break; }
  }

  const amp = H * 0.46 * gain, mid = H / 2, xs = W / (win - 1);
  ctx.beginPath();
  for (let i = 0; i < win; i++) {
    const y = mid - ((raw[trigger + i] - 128) / 128) * amp;
    if (i === 0) ctx.moveTo(0, y); else ctx.lineTo(i * xs, y);
  }
  ctx.stroke();
}

onmessage = (e) => {
  const m = e.data;
  switch (m.type) {
    case 'init':
      canvas = m.canvas;
      W = canvas.width = m.w;
      H = canvas.height = m.h;
      ctx = canvas.getContext('2d');
      break;
    case 'resize':
      if (!canvas) break;
      W = canvas.width = m.w;
      H = canvas.height = m.h;
      break;
    case 'colors':
      Object.assign(colors, m.colors);
      sprite = null;
      break;
    case 'rec':
      onRecord = m.on;
      sprite = null;
      break;
    case 'scopeWindow':
      scopeWin = m.n;
      break;
    case 'spectrum':
    case 'scope':
      if (ctx) {
        const data = new Uint8Array(m.buf, 0, m.len);
        if (m.type === 'spectrum') drawSpectrum(data);
        else drawScope(data, m.p1, m.p2);
      }
      postMessage({ buf: m.buf }, [m.buf]);   // hand the buffer back
      break;
  }
};
`;

class Visualizer {
  constructor(canvas) {
    if (!canvas.transferControlToOffscreen) {
      throw new Error('OffscreenCanvas is not supported in this browser');
    }
    this.canvas = canvas;
    this._buf = null;
    this._busy = false;

    this._url = URL.createObjectURL(
      new Blob([VISUALIZER_WORKER_CODE], { type: 'application/javascript' })
    );
    this.worker = new Worker(this._url);
    this.worker.onmessage = (e) => { this._buf = e.data.buf; this._busy = false; };

    const w = canvas.width, h = canvas.height;   // read before transferring
    const off = canvas.transferControlToOffscreen();
    this.worker.postMessage({ type: 'init', canvas: off, w, h }, [off]);
  }

  // { micDark, micLight, samplerDark, samplerLight, listenDark, listenLight }
  setColors(colors) { this.worker.postMessage({ type: 'colors', colors }); }

  setRecording(on) { this.worker.postMessage({ type: 'rec', on: !!on }); }

  // use this instead of setting canvas.width / canvas.height
  resize(w, h) { this.worker.postMessage({ type: 'resize', w, h }); }

  // fewer samples = more zoomed in (fewer cycles), more samples = more cycles
  setScopeWindow(n) { this.worker.postMessage({ type: 'scopeWindow', n }); }

  // frequency data (getByteFrequencyData)
  drawSpectrum(data) { this._send('spectrum', data, {}); }

  // time-domain data (getByteTimeDomainData)
  drawScope(data, peak1, peak2) {
    this._send('scope', data, { p1: peak1 || 0, p2: peak2 || 0 });
  }

  _send(type, data, extra) {
    if (this._busy) return;   // worker is still drawing: skip this frame
    if (!this._buf || this._buf.byteLength < data.length) {
      this._buf = new ArrayBuffer(data.length);
    }
    new Uint8Array(this._buf, 0, data.length).set(data);

    const buf = this._buf;
    this._buf = null;
    this._busy = true;
    this.worker.postMessage({ type, buf, len: data.length, ...extra }, [buf]);
  }

  destroy() {
    this.worker.terminate();
    URL.revokeObjectURL(this._url);
  }
}