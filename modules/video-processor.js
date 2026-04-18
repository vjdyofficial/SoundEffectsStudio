// VideoProcessor.js
class VideoProcessor {
  /**
   * @param {HTMLVideoElement} videoEl - The video element to process
   * @param {HTMLCanvasElement} canvasEl - Canvas to draw frames
   * @param {number} [scale=1] - Scale factor (0.5 = half-size)
   */
  constructor(videoEl, canvasEl, scale = 1) {
    this.video = videoEl;
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.scale = scale;

    this.width = 0;
    this.height = 0;
    this.frameCallbackId = null;

    // Bind methods
    this._onFrame = this._onFrame.bind(this);
  }

  // Internal per-frame callback
  _onFrame(now, metadata) {
    if (this.video.paused || this.video.ended) {
      this.frameCallbackId = null;
      return;
    }

    this.computeFrame();

    // Schedule next frame
    this.frameCallbackId = this.video.requestVideoFrameCallback(this._onFrame);
  }

  // Draw current frame to canvas
  computeFrame() {
    if (!this.ctx || !this.video) return;

    this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
  }

  // Start processing
  start() {
    if (!this.video || !this.canvas) throw new Error('Video or Canvas not defined');

    this.width = this.video.videoWidth * this.scale;
    this.height = this.video.videoHeight * this.scale;

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    if (!this.frameCallbackId) {
      this.frameCallbackId = this.video.requestVideoFrameCallback(this._onFrame);
    }
  }

  // Stop processing
  stop() {
    if (this.frameCallbackId) {
      this.video.cancelVideoFrameCallback(this.frameCallbackId);
      this.frameCallbackId = null;
    }
  }
}

// Export as require module
module.exports = VideoProcessor;