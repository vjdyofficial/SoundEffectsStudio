// Recorder v3 (Electron, nodeIntegration)
//
//   const rec = new Recorder(audioCtx, inputNode);
//   rec.setChannel(8).enableLimiter(true).setMinuteLimit(30).setMinuteSplit(5)
//      .setPCMSign(24).enableWatermark(true);
//   rec.setAppDataPath(userDataPath);          // optional, see _cacheDir()
//   rec.onState    = (state) => {};            // 'idle' | 'recording' | 'paused' | 'limit' | 'exporting'
//   rec.onUpdate   = (sec, hhmmss) => {};
//   rec.onComplete = (filePath) => {};
//   rec.onFailed   = (error) => {};
//   await rec.start();  rec.pause();  rec.resume();  rec.discard();  rec.export();
//
// While recording, audio is written straight to <appData>/recording_cache/part-0001.f32,
// part-0002.f32 ... (a new file every setMinuteSplit() minutes), so RAM stays small.
// export() streams those files through a Web Worker (WAV encoding) into the Music folder,
// then empties recording_cache.
//
// setChannel(2): the 8 surround channels are folded into stereo.
//   L = ch0 + C*ch2 + LFE*ch3 + rear*ch4 + side*ch6
//   R = ch1 + C*ch2 + LFE*ch3 + rear*ch5 + side*ch7
// setChannel(1): mono = (L + R) / 2 of the stereo fold-down.
// setChannel(3..8): the first N channels are recorded as they are.

const RECORDER_WORKLET_CODE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.ch = o.channels;
    this.size = o.chunkSize;
    this.ceiling = o.ceiling;
    this.rel = 1 - Math.exp(-1 / (0.15 * sampleRate)); // ~150 ms release
    this.g = 1;
    this.limiter = false;
    this.rec = false;
    this.dm = { center: 0.707, lfe: 0.707, rear: 0.707, side: 0.707 };
    this.pk = new Float32Array(8); // input peaks per channel, for onInputInfo
    this.blocks = 0;
    this.watch = false;
    this.reset();
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.cmd === 'rec') {
        if (m.on) {
          this.rec = true;
        } else {
          this.rec = false;
          this.flush();
          this.port.postMessage({ ack: true });
        }
      } else if (m.cmd === 'channels') {
        this.flush();
        this.ch = m.n;
        this.reset();
      } else if (m.cmd === 'limiter') {
        this.limiter = m.on;
        this.g = 1;
      } else if (m.cmd === 'downmix') {
        this.dm = m.g;
      } else if (m.cmd === 'watch') {
        this.watch = m.on;
        this.pk.fill(0);
        this.blocks = 0;
      }
    };
  }
  reset() {
    this.buf = new Float32Array(this.size * this.ch); // interleaved
    this.pos = 0;                                     // in frames
  }
  flush() {
    if (this.pos === 0) return;
    const out = this.pos === this.size ? this.buf : this.buf.slice(0, this.pos * this.ch);
    this.port.postMessage({ chunk: out }, [out.buffer]);
    this.reset();
  }
  // Brickwall limiter: instant attack, smooth release, linked across channels.
  limit(start, n) {
    const ch = this.ch, b = this.buf, ceil = this.ceiling;
    let g = this.g;
    for (let i = 0; i < n; i++) {
      const o = (start + i) * ch;
      let peak = 0;
      for (let c = 0; c < ch; c++) {
        const a = Math.abs(b[o + c]);
        if (a > peak) peak = a;
      }
      const need = peak > ceil ? ceil / peak : 1;
      g = need < g ? need : Math.min(need, g + (1 - g) * this.rel);
      for (let c = 0; c < ch; c++) b[o + c] *= g;
    }
    this.g = g;
  }
  process(inputs) {
    if (!this.rec) return true;
    const inp = inputs[0] || [];
    const n = inp[0] ? inp[0].length : 128;
    const ch = this.ch, b = this.buf, pos = this.pos;

    if (this.watch) {
      const pk = this.pk;
      for (let c = 0; c < 8; c++) {
        const s = inp[c];
        if (!s) continue;
        let m = pk[c];
        for (let i = 0; i < n; i++) {
          const a = s[i] < 0 ? -s[i] : s[i];
          if (a > m) m = a;
        }
        pk[c] = m;
      }
      if (++this.blocks >= 48) { // about 8 times per second
        this.port.postMessage({ peaks: Array.from(pk) });
        pk.fill(0);
        this.blocks = 0;
      }
    }

    if (ch <= 2) {
      // fold the 8 surround channels into stereo (or mono)
      const i0 = inp[0], i1 = inp[1], i2 = inp[2], i3 = inp[3];
      const i4 = inp[4], i5 = inp[5], i6 = inp[6], i7 = inp[7];
      const d = this.dm;
      for (let i = 0; i < n; i++) {
        const mid = d.center * (i2 ? i2[i] : 0) + d.lfe * (i3 ? i3[i] : 0);
        const L = (i0 ? i0[i] : 0) + mid + d.rear * (i4 ? i4[i] : 0) + d.side * (i6 ? i6[i] : 0);
        const R = (i1 ? i1[i] : 0) + mid + d.rear * (i5 ? i5[i] : 0) + d.side * (i7 ? i7[i] : 0);
        const o = (pos + i) * ch;
        if (ch === 2) { b[o] = L; b[o + 1] = R; }
        else b[o] = (L + R) * 0.5;
      }
    } else {
      for (let c = 0; c < ch; c++) {
        const s = inp[c];
        if (!s) continue;
        for (let i = 0; i < n; i++) b[(pos + i) * ch + c] = s[i];
      }
    }

    if (this.limiter) this.limit(pos, n);
    this.pos += n;
    if (this.pos >= this.size) this.flush();
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`;

const RECORDER_WORKER_CODE = `
var ch, bits, rate, total;
var MASK = { 1: 0x4, 2: 0x3, 3: 0x7, 4: 0xF, 5: 0x1F, 6: 0x3F, 7: 0x23F, 8: 0x63F };

function header() {
  var bytes = bits / 8;
  var ext = ch > 2 || bits > 16;
  var fmtSize = ext ? 40 : 16;
  var hs = 12 + 8 + fmtSize + 8;
  var dataSize = total * ch * bytes;
  var buf = new ArrayBuffer(hs);
  var v = new DataView(buf);
  var p = 0;
  function s(t) { for (var i = 0; i < t.length; i++) v.setUint8(p++, t.charCodeAt(i)); }
  function u32(n) { v.setUint32(p, n, true); p += 4; }
  function u16(n) { v.setUint16(p, n, true); p += 2; }
  var code = bits === 32 ? 3 : 1;
  s('RIFF'); u32(hs - 8 + dataSize); s('WAVE');
  s('fmt '); u32(fmtSize);
  u16(ext ? 0xFFFE : code); u16(ch); u32(rate); u32(rate * ch * bytes); u16(ch * bytes); u16(bits);
  if (ext) {
    u16(22); u16(bits); u32(MASK[ch] || 0);
    var g = [code & 255, code >> 8, 0, 0, 0, 0, 0x10, 0, 0x80, 0, 0, 0xAA, 0, 0x38, 0x9B, 0x71];
    for (var i = 0; i < 16; i++) v.setUint8(p++, g[i]);
  }
  s('data'); u32(dataSize);
  return buf;
}

// input: interleaved Float32Array
function encode(f) {
  var n = f.length, i, x;
  if (bits === 16) {
    var o = new Int16Array(n);
    for (i = 0; i < n; i++) {
      x = f[i]; x = x < -1 ? -1 : x > 1 ? 1 : x;
      o[i] = x < 0 ? x * 32768 : x * 32767;
    }
    return o.buffer;
  }
  if (bits === 24) {
    var u = new Uint8Array(n * 3), k = 0;
    for (i = 0; i < n; i++) {
      x = f[i]; x = x < -1 ? -1 : x > 1 ? 1 : x;
      var v = Math.round(x < 0 ? x * 8388608 : x * 8388607);
      u[k++] = v & 255; u[k++] = (v >> 8) & 255; u[k++] = (v >> 16) & 255;
    }
    return u.buffer;
  }
  return f.buffer; // 32-bit float: already in the right format
}

onmessage = function (e) {
  var m = e.data;
  try {
    if (m.type === 'init') {
      ch = m.channels; bits = m.bits; rate = m.rate; total = m.total;
      var h = header();
      postMessage({ type: 'part', buf: h }, [h]);
    } else if (m.type === 'encode') {
      var out = encode(new Float32Array(m.buf));
      postMessage({ type: 'part', buf: out }, [out]);
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err && err.message || err) });
  }
};
`;

class Recorder {
  constructor(audioCtx, input) {
    this.ctx = audioCtx;
    this.input = input;

    this._fs = require('fs');
    this._os = require('os');
    this._path = require('path');

    // settings
    this.channels = 8;
    this.limiter = false;
    this.ceiling = 0.98;            // limiter ceiling (about -0.18 dBFS)
    this.minuteLimit = 30;
    this.minuteSplit = 5;           // new cache file every N minutes
    this.bitDepth = 16;
    this.watermark = false;
    this.watermarkDir = this._path.join(__dirname, 'audio'); // init.wav + closerecord.wav
    this.outputDir = this._path.join(this._os.homedir(), 'Music', 'VJDY FM Sound Effects Studio');
    this.cacheRoot = null;          // appData (userData) path, see setAppDataPath()
    this.chunkSize = 4096;          // frames per message, multiple of 128
    // surround -> stereo fold-down gains (used when channels is 1 or 2)
    this.downmix = { center: 0.707, lfe: 0.707, rear: 0.707, side: 0.707 };

    // callbacks (assign your own)
    this.onState = () => {};
    this.onUpdate = () => {};
    this.onComplete = () => {};
    this.onFailed = () => {};
    this.onInputInfo = null;        // (peaksDb[8]) => {}  input level per channel, about 8x per second

    // runtime
    this.state = 'idle';
    this.node = null;
    this.frames = 0;
    this._recCh = this.channels;    // channel count of the current recording
    this._lastSec = 0;
    this._acks = [];
    this._lastHalt = Promise.resolve();
    this._parts = [];               // [{ file, frames }]
    this._stream = null;            // current cache file stream
    this._partFrames = 0;           // frames in the current cache file
    this._closing = [];
    this._ioFailed = false;
  }

  // ---------- settings ----------

  setChannel(n) {
    n = Math.round(n);
    if (n < 1 || n > 8) { console.warn('Recorder: channels must be 1..8'); return this; }
    if (this.state !== 'idle') { console.warn('Recorder: setChannel only works while idle'); return this; }
    this.channels = n;
    if (this.node) this.node.port.postMessage({ cmd: 'channels', n });
    return this;
  }

  enableLimiter(on) {
    this.limiter = !!on;
    if (this.node) this.node.port.postMessage({ cmd: 'limiter', on: this.limiter });
    return this;
  }

  setMinuteLimit(min) {
    if (min > 0) this.minuteLimit = min;
    return this;
  }

  setMinuteSplit(min) {
    if (min > 0) this.minuteSplit = min;
    return this;
  }

  setPCMSign(bits) {
    if (bits === 16 || bits === 24 || bits === 32) this.bitDepth = bits; // 32 = float
    else console.warn('Recorder: bit depth must be 16, 24 or 32');
    return this;
  }

  enableWatermark(on) {
    this.watermark = !!on;
    return this;
  }

  // Pass app.getPath('userData') here if the automatic lookup below can't find it.
  setAppDataPath(p) {
    this.cacheRoot = p;
    return this;
  }

  static formatTime(sec) {
    sec = Math.floor(sec);
    const p = (n) => String(n).padStart(2, '0');
    return p(Math.floor(sec / 3600)) + ':' + p(Math.floor(sec / 60) % 60) + ':' + p(sec % 60);
  }

  get duration() {
    return this.frames / this.ctx.sampleRate;
  }

  get limitFrames() {
    return Math.floor(this.minuteLimit * 60 * this.ctx.sampleRate);
  }

  get splitFrames() {
    return Math.max(1, Math.floor(this.minuteSplit * 60 * this.ctx.sampleRate));
  }

  // ---------- controls ----------

  async start() {
    if (this.state !== 'idle') return;
    try {
      await this._init();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      await this._wipeCache(); // leftovers from an old session
    } catch (err) {
      return this._fail(err);
    }
    this._clear();
    this._recCh = this.channels;
    this.node.port.postMessage({ cmd: 'downmix', g: this.downmix });
    this.node.port.postMessage({ cmd: 'watch', on: typeof this.onInputInfo === 'function' });
    console.info('Recorder: recording ' + this._recCh + ' channel(s)' +
                 (this._recCh <= 2 ? ' (surround folded down)' : ''));
    this.node.port.postMessage({ cmd: 'rec', on: true });
    this._setState('recording');
    this.onUpdate(0, Recorder.formatTime(0));
  }

  pause() {
    if (this.state !== 'recording') return;
    this._lastHalt = this._halt();
    this._setState('paused');
  }

  resume() {
    if ((this.state !== 'paused' && this.state !== 'limit') || this.frames >= this.limitFrames) return;
    this.node.port.postMessage({ cmd: 'rec', on: true });
    this._setState('recording');
  }

  // Throw away everything recorded so far (including the cache files).
  async discard() {
    if (this.state === 'exporting' || this.state === 'idle') return;
    if (this.state === 'recording') this._lastHalt = this._halt();
    await this._lastHalt;
    await this._flushParts();
    await this._wipeCache();
    this._clear();
    this._setState('idle');
    this.onUpdate(0, Recorder.formatTime(0));
  }

  async export() {
    if (this.state === 'exporting') return;
    if (this.state === 'idle' || this.frames === 0) {
      return this._fail(new Error('Nothing recorded to export.'));
    }
    if (this._ioFailed) {
      return this._fail(new Error('Writing to the recording cache failed, so this recording is incomplete. Discard it and record again.'));
    }

    const prevState = this.state === 'recording' ? 'paused' : this.state;
    if (this.state === 'recording') this._lastHalt = this._halt();
    await this._lastHalt;
    this._setState('exporting');

    let stream = null, worker = null, workerUrl = null, filePath = null, pending = null;

    try {
      await this._flushParts(); // every cache file is complete and closed

      const intro = this.watermark ? await this._loadWatermark('init.wav') : null;
      const outro = this.watermark ? await this._loadWatermark('closerecord.wav') : null;
      const ch = this._recCh;

      const total = (intro ? intro.length / ch : 0) + this.frames + (outro ? outro.length / ch : 0);
      if (total * ch * (this.bitDepth / 8) > 4294967000) {
        throw new Error('Recording is too large for one WAV file (4 GB limit). Lower the minute limit, channels or bit depth.');
      }

      this._fs.mkdirSync(this.outputDir, { recursive: true });
      filePath = this._path.join(this.outputDir, 'Recording ' + this._stamp() + '.wav');
      stream = this._fs.createWriteStream(filePath);
      await new Promise((res, rej) => { stream.once('open', res); stream.once('error', rej); });

      workerUrl = URL.createObjectURL(new Blob([RECORDER_WORKER_CODE], { type: 'application/javascript' }));
      worker = new Worker(workerUrl);

      // One message to the worker = one encoded part written to the file.
      const call = (msg, transfer) => new Promise((resolve, reject) => {
        pending = { resolve, reject };
        worker.postMessage(msg, transfer || []);
      });
      worker.onmessage = (ev) => {
        const m = ev.data, p = pending;
        pending = null;
        if (!p) return;
        if (m.type === 'part') {
          stream.write(Buffer.from(m.buf), (err) => (err ? p.reject(err) : p.resolve()));
        } else if (m.type === 'error') {
          p.reject(new Error(m.message));
        }
      };
      worker.onerror = (ev) => { if (pending) pending.reject(new Error(ev.message || 'Worker error')); };
      stream.on('error', (err) => { if (pending) pending.reject(err); });

      await call({ type: 'init', channels: ch, bits: this.bitDepth, rate: this.ctx.sampleRate, total });
      if (intro) await call({ type: 'encode', buf: intro.buffer }, [intro.buffer]);
      for (const part of this._parts) await this._encodePart(part, call);
      if (outro) await call({ type: 'encode', buf: outro.buffer }, [outro.buffer]);

      await new Promise((resolve, reject) => {
        stream.once('error', reject);
        stream.once('close', resolve);
        stream.end();
      });

      this._cleanupWorker(worker, workerUrl);
      await this._wipeCache();
      this._clear();
      this._setState('idle');
      this.onUpdate(0, Recorder.formatTime(0));
      this.onComplete(filePath);
    } catch (err) {
      this._cleanupWorker(worker, workerUrl);
      if (stream) stream.destroy();
      if (filePath) { try { this._fs.unlinkSync(filePath); } catch (e) {} }
      // the cache files are untouched, so the recording is still there and export can be retried
      this._setState(prevState);
      this._fail(err);
    }
  }

  destroy() {
    this._closePart();
    if (this.node) {
      try { this.input.disconnect(this.node); } catch (e) {}
      this.node.disconnect();
      this.node = null;
    }
  }

  // ---------- internals ----------

  async _init() {
    if (this.node) return;
    if (!Recorder._loaded.has(this.ctx)) {
      const url = URL.createObjectURL(new Blob([RECORDER_WORKLET_CODE], { type: 'application/javascript' }));
      try { await this.ctx.audioWorklet.addModule(url); }
      finally { URL.revokeObjectURL(url); }
      Recorder._loaded.add(this.ctx);
    }
    // The node always takes 8 discrete input channels; the worklet decides what gets recorded.
    this.node = new AudioWorkletNode(this.ctx, 'recorder-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 8,
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete',
      processorOptions: { channels: this.channels, chunkSize: this.chunkSize, ceiling: this.ceiling }
    });
    this.node.port.onmessage = (e) => this._onMessage(e.data);
    this.node.port.postMessage({ cmd: 'limiter', on: this.limiter });
    this.input.connect(this.node);
  }

  _halt() {
    return new Promise((resolve) => {
      this._acks.push(resolve);
      this.node.port.postMessage({ cmd: 'rec', on: false });
    });
  }

  _onMessage(m) {
    if (m.ack) {
      const r = this._acks.shift();
      if (r) r();
    } else if (m.chunk) {
      this._addChunk(m.chunk);
    } else if (m.peaks) {
      if (this.onInputInfo) {
        this.onInputInfo(m.peaks.map((p) => (p > 1e-5 ? 20 * Math.log10(p) : -100)));
      }
    }
  }

  // f32 = interleaved Float32Array from the worklet
  _addChunk(f32) {
    if (this.state === 'idle' || this.state === 'exporting' || this._ioFailed) return;

    const ch = this._recCh;
    let frames = f32.length / ch;
    const room = this.limitFrames - this.frames;
    if (room <= 0) return;
    if (frames > room) {
      f32 = f32.subarray(0, room * ch);
      frames = room;
    }

    this._writeFrames(f32, frames);
    this.frames += frames;

    const sec = Math.floor(this.frames / this.ctx.sampleRate);
    if (sec !== this._lastSec) {
      this._lastSec = sec;
      this.onUpdate(sec, Recorder.formatTime(sec));
    }

    if (this.frames >= this.limitFrames && this.state === 'recording') {
      this._lastHalt = this._halt();
      this._setState('limit');
    }
  }

  // Appends frames to the cache, starting a new part file every splitFrames.
  _writeFrames(f32, frames) {
    const ch = this._recCh;
    let off = 0;
    while (off < frames) {
      if (!this._stream) this._openPart();
      const take = Math.min(frames - off, this.splitFrames - this._partFrames);
      const slice = f32.subarray(off * ch, (off + take) * ch);
      this._stream.write(Buffer.from(slice.buffer, slice.byteOffset, slice.byteLength));
      this._partFrames += take;
      this._parts[this._parts.length - 1].frames += take;
      off += take;
      if (this._partFrames >= this.splitFrames) this._closePart();
    }
  }

  _openPart() {
    const dir = this._cacheDir();
    this._fs.mkdirSync(dir, { recursive: true });
    const name = 'part-' + String(this._parts.length + 1).padStart(4, '0') + '.f32';
    const file = this._path.join(dir, name);
    const s = this._fs.createWriteStream(file);
    s.on('error', (err) => this._ioError(err));
    this._stream = s;
    this._partFrames = 0;
    this._parts.push({ file, frames: 0 });
  }

  _closePart() {
    const s = this._stream;
    if (!s) return Promise.resolve();
    this._stream = null;
    const p = new Promise((res) => { s.once('close', res); s.end(); });
    this._closing.push(p);
    return p;
  }

  async _flushParts() {
    await this._closePart();
    await Promise.all(this._closing);
    this._closing = [];
  }

  _ioError(err) {
    if (this._ioFailed) return;
    this._ioFailed = true;
    if (this.state === 'recording') this.pause();
    this._fail(err);
  }

  // Reads one cache file in ~2 MB blocks and sends them to the worker.
  async _encodePart(part, call) {
    const frameBytes = this._recCh * 4;
    const blockFrames = Math.max(1, Math.floor(2097152 / frameBytes));
    const fh = await this._fs.promises.open(part.file, 'r');
    try {
      let done = 0;
      while (done < part.frames) {
        const frames = Math.min(blockFrames, part.frames - done);
        const bytes = frames * frameBytes;
        const ab = new ArrayBuffer(bytes);
        const { bytesRead } = await fh.read(Buffer.from(ab), 0, bytes, done * frameBytes);
        if (bytesRead !== bytes) throw new Error('Recording cache file is incomplete: ' + part.file);
        await call({ type: 'encode', buf: ab }, [ab]);
        done += frames;
      }
    } finally {
      await fh.close();
    }
  }

  // appData\recording_cache
  _cacheDir() {
    let root = this.cacheRoot;
    if (!root) {
      try {
        const e = require('electron');
        const app = (e.remote && e.remote.app) || e.app;
        if (app) root = app.getPath('userData');
      } catch (err) {}
    }
    if (!root) {
      try { root = require('@electron/remote').app.getPath('userData'); } catch (err) {}
    }
    if (!root) {
      // last resort guess (Windows %APPDATA%); better to call setAppDataPath()
      root = this._path.join(process.env.APPDATA || this._path.join(this._os.homedir(), '.config'),
                             'VJDY FM Sound Effects Studio');
    }
    return this._path.join(root, 'recording_cache');
  }

  async _wipeCache() {
    const dir = this._cacheDir();
    try {
      await this._fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch (err) {
      console.warn('Recorder: could not empty recording_cache:', err.message);
    }
    try { this._fs.mkdirSync(dir, { recursive: true }); } catch (err) {}
  }

  // Returns an interleaved Float32Array in the recording's channel layout.
  async _loadWatermark(name) {
    const file = this._path.join(this.watermarkDir, name);
    try {
      const data = await this._fs.promises.readFile(file);
      const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      const audio = await this.ctx.decodeAudioData(ab); // resampled to the context rate
      const ch = this._recCh, nb = audio.numberOfChannels, len = audio.length;
      const out = new Float32Array(len * ch);
      const src = [];
      for (let c = 0; c < nb; c++) src.push(audio.getChannelData(c));
      for (let c = 0; c < ch; c++) {
        for (let i = 0; i < len; i++) {
          let s = 0;
          if (ch === 1 && nb > 1) s = (src[0][i] + src[1][i]) * 0.5;   // mono: average L/R
          else if (c < nb) s = src[c][i];
          else if (nb === 1) s = src[0][i];                            // mono file -> every channel
          out[i * ch + c] = s;
        }
      }
      return out;
    } catch (err) {
      throw new Error('Cannot load watermark file ' + file + ': ' + err.message);
    }
  }

  _cleanupWorker(worker, url) {
    if (worker) worker.terminate();
    if (url) URL.revokeObjectURL(url);
  }

  _clear() {
    this.frames = 0;
    this._lastSec = 0;
    this._parts = [];
    this._partFrames = 0;
    this._ioFailed = false;
  }

  _setState(s) {
    this.state = s;
    this.onState(s);
  }

  _fail(err) {
    this.onFailed(err instanceof Error ? err : new Error(String(err)));
  }

  _stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
           p(d.getHours()) + '-' + p(d.getMinutes()) + '-' + p(d.getSeconds());
  }
}

Recorder._loaded = new WeakSet(); // audio contexts that already have the worklet module