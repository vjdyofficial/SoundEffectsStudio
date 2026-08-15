/**
 * Sampler Class - Audio Sampler with Mixxx-like features
 * Provides control over audio playback with looping, hotcues, speed, and more
 */
class Sampler {
    constructor(audioContext, outputnode) {
        this.audioContext = audioContext;
        this.sourceNode = null;
        this.gain = this.audioContext.createGain();
        this.outputNode = outputnode;

        this.onLoaded = null;
        this.onCurrent = null;
        this.onState = null;

        this.audioElement = new Audio();
        this.audioElement.crossOrigin = "anonymous";
        this.audioElement.loop = false;
        this.audioContext.createMediaElementSource(this.audioElement).connect(this.gain);
        this.gain.connect(this.outputNode);

        this.audioElement.addEventListener('ended', () => {
            this.audioElement.currentTime = 0;
            this.onState?.({
                status: "STOPPED"
            });
        });

        this.audioElement.addEventListener('pause', () => {
            this.audioElement.currentTime = 0;
            this.onState?.({
                status: "STOPPED"
            });
        });

        this.audioElement.addEventListener('play', () => {
            this.audioElement.currentTime = 0;
            this.onState?.({
                status: "PLAYING"
            });
        });

        this.audioElement.addEventListener("timeupdate", () => {
            this.onCurrent?.({
                currentTime: this.audioElement.currentTime,
                duration: this.audioElement.duration,
                progress: this.audioElement.currentTime / this.audioElement.duration
            });
        });
    }

    async loadAudio(url, canvas) {
        const fs = require('fs')

        this.audioElement.src = url;
        this.audioElement.load();

        if (!fs.existsSync(url)) { return };

        if (this.audioElement.src > 60 * 3) {
            this.unloadAudio(canvas);
            snackbar("Audio file is too long. Please select a file under 3 minutes.");
            return;
        }

        this.onLoaded?.(url);
    }

    setGain(value) {
        const now = this.audioContext.currentTime;
        this.gain.gain.setTargetAtTime(value, now, 0.5);
    }

    getSourceFile() {
        return this.audioElement.src;
    }

    async loadWaveform(canvas) {
        if (!this.audioElement.src)
            return;

        const ctx = canvas.getContext("2d");
        const response = await fetch(this.audioElement.src);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        const data = audioBuffer.getChannelData(0);
        const width = canvas.width;
        const height = canvas.height;
        const step = Math.ceil(data.length / width);
        const amp = height / 2;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "#ffffff";

        for (let x = 0; x < width; x++) {

            let min = 1;
            let max = -1;

            const start = x * step;
            const end = Math.min(start + step, data.length);

            for (let i = start; i < end; i++) {
                const sample = data[i];
                if (sample < min)
                    min = sample;
                if (sample > max)
                    max = sample;
            }

            ctx.fillRect(
                x,
                (1 + min) * amp,
                1,
                Math.max(1, (max - min) * amp)
            );
        }
    }

    unloadAudio(canvas) {
        this.audioElement.pause();
        this.audioElement.src = '';
        this.audioElement.load();

        const ctx = canvas.getContext("2d");
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
    }

    play() {
        if (!this.audioElement.src) return;

        if (this.audioElement.paused) {
            this.audioElement.play();
        } else {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
    }

    oneshot() {
        if (!this.audioElement.src) return;
        if (!this.audioElement.paused) { this.audioElement.pause() };

        this.audioElement.currentTime = 0;
        this.audioElement.play();
    }

    stop() {
        if (!this.audioElement.src) return;
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
    }

    toggleLoop() {
        this.audioElement.loop = !this.audioElement.loop;

        this.onState?.({
            status: (this.audioElement.loop) ? "LOOP_ENABLED" : "LOOP_DISABLED"
        });
    }
}