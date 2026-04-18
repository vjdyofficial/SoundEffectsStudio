// audioVisualizer.js

const { BroadcastChannel } = require('broadcast-channel');

class AudioVisualizer {
    constructor(audioCtx, options = {}) {
        this.audioCtx = audioCtx;

        this.width = options.width || 512;
        this.height = options.height || 256;
        this.maxSamples = options.maxSamples || 50;
        this.onRecord = options.onRecord || false;
        this.isMono = options.isMono || false;

        // Optional external channels
        this.VUMeter = options.VUMeter || new BroadcastChannel('vumeter');
        this.ChannelWidget_External = options.ChannelWidget_External || new BroadcastChannel('widget_external');

        // Canvas: only needed if using node-canvas or Electron renderer
        if (options.useCanvas) {
            const { createCanvas } = require('canvas');
            this.audioCanvas = createCanvas(this.width, this.height);
            this.audioCanvasCtx = this.audioCanvas.getContext('2d');
            this.audioCanvasPreview = createCanvas(this.width, this.height);
            this.audioCanvasPreviewCtx = this.audioCanvasPreview.getContext('2d');
            this.audioCanvasPreview2 = createCanvas(this.width, this.height);
            this.audioCanvasPreviewCtx2 = this.audioCanvasPreview2.getContext('2d');
        }

        // Audio analyzers
        this.analyserMeter = this.audioCtx.createAnalyser();
        this.analyserMeter.fftSize = 256;
        this.dataArrayMeter = new Uint8Array(this.analyserMeter.frequencyBinCount);
        this.freqData = new Uint8Array(this.analyserMeter.frequencyBinCount);

        this.analyserMeter2 = this.audioCtx.createAnalyser();
        this.analyserMeter2.fftSize = 256;
        this.dataArrayMeter2 = new Uint8Array(this.analyserMeter2.frequencyBinCount);
        this.freqData2 = new Uint8Array(this.analyserMeter2.frequencyBinCount);

        this.vuLevels = { '#micdev': 0, '#sampler': 0 };

        this.smoothL = 0;
        this.smoothR = 0;
        this.release = 0.04;

        this.levelL = 0;
        this.levelR = 0;
        this.levelLVU = 0;
        this.levelRVU = 0;

        this.frameCounter = 0;
        this.RATESKIP = 1;

        // **Fixed: define the analyzers**
        this.initAnalyzers();

        // Listen for external messages (optional)
        this.ChannelWidget_External.onmessage = (msg) => {
            if (msg && msg.type === 'SET_VISUALIZER_TYPE') {
                this.VISUALIZER_TYPE = msg.value;
            }
        };
    }

    // -------------------
    // METHODS
    // -------------------

    initAnalyzers() {
        this.analyserL = this.audioCtx.createAnalyser();
        this.analyserR = this.audioCtx.createAnalyser();

        this.dataL = new Uint8Array(this.analyserL.frequencyBinCount);
        this.dataR = new Uint8Array(this.analyserR.frequencyBinCount);
    }

    valueToAngle(value) {
        const minValue = 0;
        const maxValue = 120;
        const clamped = Math.min(Math.max(value, minValue), maxValue);
        const percent = (clamped - minValue) / (maxValue - minValue);
        return -45 + percent * 90;
    }

    updateNeedleSmooth(query, rms) {
        const targetDB = rms;
        let current = this.vuLevels[query] || 0;

        const attack = 0.5;
        const release = 0.2;

        if (targetDB > current) current += (targetDB - current) * attack;
        else current += (targetDB - current) * release;

        this.vuLevels[query] = current;
        return this.valueToAngle(current);
    }

    getPeak(dataArray) {
        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
            const value = Math.abs(dataArray[i] - 128) / 128;
            if (value > peak) peak = value;
        }
        return peak;
    }

    getPeakScaled(dataArray) {
        const peak = this.getPeak(dataArray);
        return Math.round(peak * 120);
    }

    prepareDataArray(rawData) {
        if (!rawData || rawData.length === 0) return [128];
        if (rawData.length > this.maxSamples) {
            const step = rawData.length / this.maxSamples;
            const newData = [];
            for (let i = 0; i < this.maxSamples; i++) {
                newData.push(rawData[Math.floor(i * step)]);
            }
            return newData;
        }
        return rawData;
    }

    drawSpectrum(data) {
        if (!this.audioCanvasCtx) return; // no canvas
        const ctx = this.audioCanvasCtx;
        ctx.clearRect(0, 0, this.width, this.height);
        const barWidth = this.width / data.length;

        for (let i = 0; i < data.length; i++) {
            const value = data[i];
            const barHeight = (value / 255) * this.height;
            const x = i * barWidth;
            const y = this.height - barHeight;
            ctx.fillStyle = `rgb(${value},${value / 2},${255 - value})`;
            ctx.fillRect(x, y, barWidth + 2, barHeight);
        }

        // Copy to preview canvases
        const waveformCopy = ctx.getImageData(0, 0, this.width, this.height);
        if (this.audioCanvasPreviewCtx) this.audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
        if (this.audioCanvasPreviewCtx2) this.audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
    }

    updateMeters(levelL, levelR) {
        const dt = 1 / 60;
        if (levelL > this.smoothL) this.smoothL = levelL;
        else this.smoothL += (levelL - this.smoothL) * (1 - Math.exp(-dt / this.release));

        if (levelR > this.smoothR) this.smoothR = levelR;
        else this.smoothR += (levelR - this.smoothR) * (1 - Math.exp(-dt / this.release));

        this.levelLVU = this.getPeakScaled(this.dataL);
        this.levelRVU = this.getPeakScaled(this.isMono ? this.dataL : this.dataR);

        // Post VU data to external channel
        this.VUMeter.postMessage({
            type: 'VU_METER',
            data: { levelLVU: this.levelLVU, levelRVU: this.levelRVU }
        });

        this.updateNeedleSmooth('#micdev', this.levelLVU);
        this.updateNeedleSmooth('#sampler', this.levelRVU);
    }

    updateVisualizer() {
        this.analyserMeter.getByteFrequencyData(this.freqData);
        this.drawSpectrum(this.freqData);
    }
}

module.exports = AudioVisualizer;