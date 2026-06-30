class ReverseAudioPlayer {
    constructor(audioContext, node = audioContext.destination) {
        this.ctx = audioContext;
        this.node = node;

        this.source = null;

        this.buffer = null;
        this.reversedBuffer = null;

        this.startedAt = 0;
        this.pausedAt = 0;
    }

    async load(arrayBuffer) {
        this.buffer = await this.ctx.decodeAudioData(arrayBuffer);

        // create reversed copy
        this.reversedBuffer = this._reverseBuffer(this.buffer);

        return this.reversedBuffer;
    }

    _reverseBuffer(buffer) {
        const numChannels = buffer.numberOfChannels;
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;

        const newBuffer = this.ctx.createBuffer(
            numChannels,
            length,
            sampleRate
        );

        for (let ch = 0; ch < numChannels; ch++) {
            const input = buffer.getChannelData(ch);
            const output = newBuffer.getChannelData(ch);

            for (let i = 0; i < length; i++) {
                output[i] = input[length - i - 1];
            }
        }

        return newBuffer;
    }

    // create NEW source every playback
    _createSource() {
        const source = this.ctx.createBufferSource();

        source.buffer = this.reversedBuffer;
        source.connect(this.node);

        source.onended = () => {
            if (this.source === source) {
                this.source.disconnect();
                this.source = null;
            }
        };

        return source;
    }

    start(offset = 0, duration) {
        if (!this.reversedBuffer) return;

        this.stop();

        this.source = this._createSource();

        this.startedAt = this.ctx.currentTime - offset;
        this.pausedAt = offset;

        if (duration != null) {
            this.source.start(0, offset, duration);
        } else {
            this.source.start(0, offset);
        }
    }

    pause() {
        if (!this.source) return;

        this.pausedAt =
            this.ctx.currentTime - this.startedAt;

        this.stop(false);
    }

    resume() {
        this.start(this.pausedAt);
    }

    stop(reset = true) {
        if (this.source) {
            try {
                this.source.stop();
            } catch {}

            this.source.disconnect();
            this.source = null;
        }

        if (reset) {
            this.pausedAt = 0;
        }
    }

    seek(time) {
        this.start(time);
    }

    getCurrentTime() {
        if (!this.source) {
            return this.pausedAt;
        }

        return this.ctx.currentTime - this.startedAt;
    }

    getDuration() {
        return this.reversedBuffer
            ? this.reversedBuffer.duration
            : 0;
    }

    exportWav() {
        if (!this.reversedBuffer) return null;

        return this._encodeWav(this.reversedBuffer);
    }

    _encodeWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const length = buffer.length;

        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;

        const bufferSize = 44 + length * blockAlign;

        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        function writeString(offset, str) {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        }

        let offset = 0;

        writeString(offset, "RIFF"); offset += 4;
        view.setUint32(offset, bufferSize - 8, true); offset += 4;

        writeString(offset, "WAVE"); offset += 4;

        writeString(offset, "fmt "); offset += 4;
        view.setUint32(offset, 16, true); offset += 4;

        view.setUint16(offset, 1, true); offset += 2;
        view.setUint16(offset, numChannels, true); offset += 2;

        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;

        view.setUint16(offset, blockAlign, true); offset += 2;
        view.setUint16(offset, 16, true); offset += 2;

        writeString(offset, "data"); offset += 4;
        view.setUint32(offset, length * blockAlign, true); offset += 4;

        const channels = [];

        for (let ch = 0; ch < numChannels; ch++) {
            channels.push(buffer.getChannelData(ch));
        }

        let sampleOffset = offset;

        for (let i = 0; i < length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                let sample = Math.max(
                    -1,
                    Math.min(1, channels[ch][i])
                );

                sample =
                    sample < 0
                        ? sample * 0x8000
                        : sample * 0x7FFF;

                view.setInt16(sampleOffset, sample, true);

                sampleOffset += 2;
            }
        }

        return arrayBuffer;
    }
}