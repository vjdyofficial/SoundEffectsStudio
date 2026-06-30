const { spawn } = require("child_process");
const ffmpegStatic = require("ffmpeg-static");
const which = require("which");
const EventEmitter = require("events");

class AudioVisualizer extends EventEmitter {
  constructor(ffmpegPath = null) {
    super();

    this.IS_EXPORTING = false;
    this.ff = null;
    this._startCallback = null;
    this._progressCallback = null;
    this._endCallback = null;

    this.setFFmpeg(ffmpegPath);
  }

  // -------------------------
  // FFmpeg RESOLVER
  // -------------------------
  setFFmpeg(customPath = null) {
    let finalPath = null;

    if (customPath) {
      finalPath = customPath;
    } else if (ffmpegStatic) {
      finalPath = ffmpegStatic;
    } else {
      try {
        finalPath = which.sync("ffmpeg");
      } catch {
        throw new Error("FFmpeg not found (install ffmpeg or ffmpeg-static)");
      }
    }

    this.ffmpegPath = finalPath;
  }

  getFFmpegPath() {
    return this.ffmpegPath;
  }

  // -------------------------
  // CALLBACK API
  // -------------------------
  onStart(cb) {
    this._startCallback = cb;
  }

  onProgress(cb) {
    this._progressCallback = cb;
  }

  onEnd(cb) {
    this._endCallback = cb;
  }

  isExporting() {
    return this.IS_EXPORTING;
  }

  // -------------------------
  // LOCK SYSTEM
  // -------------------------
  _lock() {
    this.IS_EXPORTING = true;
  }

  _unlock() {
    this.IS_EXPORTING = false;
  }

  _checkLock(context) {
    if (this.IS_EXPORTING) {
      throw new Error(`Export already running (${context})`);
    }
  }

  // -------------------------
  // EVENT EMITTER HELP
  // -------------------------
  _emitError(err, context = "unknown") {
    const error = {
      message: err.message || err,
      context,
      stack: err.stack,
      time: new Date().toISOString(),
    };

    this.emit("error", error);
    return error;
  }

  // -------------------------
  // CORE RUNNER (spawn ffmpeg)
  // -------------------------
  _run(args, context) {
    return new Promise((resolve, reject) => {
      this.ff = spawn(this.ffmpegPath, args, {
        windowsHide: true,
      });

      const startPayload = {
        context,
        args,
        time: new Date().toISOString(),
      };

      this.emit("start", startPayload);
      this._startCallback?.(startPayload);

      this.ff.stderr.on("data", (data) => {
        const str = data.toString();

        // progress parsing (best-effort)
        const timeMatch = str.match(/time=\s*([\d:.]+)/);

        if (timeMatch) {
          const progress = {
            context,
            timemark: timeMatch[1],
            raw: str,
          };

          this.emit("progress", progress);
          this._progressCallback?.(progress);
        }
      });

      this.ff.on("close", (code) => {
        this._unlock();

        const endPayload = {
          context,
          status: code === 0 ? "done" : "failed",
          code,
          time: new Date().toISOString(),
        };

        this.emit("end", endPayload);
        this._endCallback?.(endPayload);

        if (code === 0) {
          resolve(endPayload);
        } else {
          reject(
            this._emitError(
              new Error(`FFmpeg exited with code ${code}`),
              context
            )
          );
        }
      });

      this.ff.on("error", (err) => {
        this._unlock();
        reject(this._emitError(err, context));
      });
    });
  }

  cancelExport() {
    if (this.ff) {
      this.ff.kill("SIGINT"); // polite stop (FFmpeg understands this)
      this.ff = null;
    }
  }

  // -------------------------
  // ARG BUILDER (force overwrite)
  // -------------------------
  _buildArgs(args) {
    return ["-y", ...args];
  }

  // -------------------------
  // WAVFORM
  // -------------------------
  waveform(input, output, options = {}) {
    this._checkLock("waveform");
    this._lock();

    return this._run(
      this._buildArgs([
        "-i",
        input,
        "-filter_complex",
        `showwavespic=s=${options.size || "1920x400"}:colors=${options.color || "white"
        }:scale=${options.scale || "lin"}`,
        "-frames:v",
        "1",
        output,
      ]),
      "waveform"
    );
  }

  // -------------------------
  // SCOPE
  // -------------------------
  scope(input, output, options = {}) {
    this._checkLock("scope");
    this._lock();

    return this._run(
      this._buildArgs([
        "-i",
        input,
        "-filter_complex",
        `showwaves=s=${options.size || "1280x720"}:mode=${options.mode || "line"
        }:rate=${options.rate || 60}:scale=${options.scale || "lin"}:colors=${options.color || "lime"
        }`,
        "-pix_fmt",
        "yuv420p",
        output,
      ]),
      "scope"
    );
  }

  // -------------------------
  // SPECTROGRAM IMAGE
  // -------------------------
  spectrogram(input, output, options = {}) {
    this._checkLock("spectrogram");
    this._lock();

    return this._run(
      this._buildArgs([
        "-i",
        input,
        "-filter_complex",
        `showspectrumpic=s=${options.size || "1920x1080"}:color=${options.color || "viridis"
        }:scale=${options.scale || "log"}:legend=${options.legend ?? 1}`,
        "-frames:v",
        "1",
        output,
      ]),
      "spectrogram"
    );
  }

  // -------------------------
  // SPECTRUM VIDEO
  // -------------------------
  spectrogramVideo(input, output, options = {}) {
    this._checkLock("spectrogramVideo");
    this._lock();

    return this._run(
      this._buildArgs([
        "-i",
        input,
        "-filter_complex",
        `showspectrum=s=${options.size || "1280x720"}:mode=${options.mode || "combined"
        }:color=${options.color || "intensity"}`,
        "-pix_fmt",
        "yuv420p",
        "-r",
        options.rate || 30,
        output,
      ]),
      "spectrogramVideo"
    );
  }
}

module.exports = AudioVisualizer;