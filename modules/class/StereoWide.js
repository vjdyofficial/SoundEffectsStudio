// ======================================================
// StereoWideTool
// ======================================================
// PURE PHASE / GAIN STEREO WIDENER
//
// No delay.
// Only:
// - crossfeed
// - inverted polarity
// - gain widening
//
// ======================================================

class StereoWideTool {

    constructor(audioCtx, node) {

        this.audioCtx = audioCtx
        this.node = node
        this.source = null
        this.outputBuffer = null

        // ==================================================
        // SETTINGS
        // ==================================================

        // Widen amount
        // 0   = mono-ish
        // 1   = normal
        // 2+  = ultra wide
        this.width = 1.5

        // Invert opposite channel
        this.reversePolarity = true

        // Dry signal amount
        this.dry = 1.0
    }

    // ======================================================
    // CREATE WIDENED BUFFER
    // ======================================================

    async createWideBuffer(inputBuffer) {

        const sampleRate = inputBuffer.sampleRate
        const length = inputBuffer.length

        const offline = new OfflineAudioContext(
            2,
            length,
            sampleRate
        )

        const source = offline.createBufferSource()
        source.buffer = inputBuffer

        const splitter = offline.createChannelSplitter(2)
        const merger = offline.createChannelMerger(2)

        // ==================================================
        // DRY SIGNAL
        // ==================================================

        const dryL = offline.createGain()
        const dryR = offline.createGain()

        dryL.gain.value = this.dry
        dryR.gain.value = this.dry

        // ==================================================
        // WIDEN SIGNAL
        // ==================================================

        const widenL = offline.createGain()
        const widenR = offline.createGain()

        widenL.gain.value = this.width
        widenR.gain.value = this.width

        // ==================================================
        // INVERTED CROSSFEED
        // ==================================================

        const invertL = offline.createGain()
        const invertR = offline.createGain()

        invertL.gain.value = this.reversePolarity ? -1 : 1
        invertR.gain.value = this.reversePolarity ? -1 : 1

        // ==================================================
        // ROUTING
        // ==================================================

        source.connect(splitter)

        // DRY
        splitter.connect(dryL, 0)
        splitter.connect(dryR, 1)

        dryL.connect(merger, 0, 0)
        dryR.connect(merger, 0, 1)

        // RIGHT -> LEFT (inverted)
        splitter.connect(invertL, 1)
        invertL.connect(widenL)
        widenL.connect(merger, 0, 0)

        // LEFT -> RIGHT (inverted)
        splitter.connect(invertR, 0)
        invertR.connect(widenR)
        widenR.connect(merger, 0, 1)

        merger.connect(offline.destination)

        source.start()

        this.outputBuffer = await offline.startRendering()

        return this.outputBuffer
    }

    // ======================================================
    // PLAY
    // ======================================================

    play(offset = 0, duration) {

        if (!this.outputBuffer) {
            throw new Error("No processed buffer available.")
        }

        this.stop()

        const source = this.audioCtx.createBufferSource()

        source.buffer = this.outputBuffer
        source.connect(this.node)

        if (duration !== undefined) {
            source.start(0, offset, duration)
        } else {
            source.start(0, offset)
        }

        this.source = source

        source.onended = () => {

            if (this.source === source) {
                this.source = null
            }
        }
    }

    // ======================================================
    // STOP
    // ======================================================

    stop() {

        if (this.source) {

            try {
                this.source.stop()
            } catch (e) {}

            this.source.disconnect()

            this.source = null
        }
    }

    // ======================================================
    // EXPORT WAV
    // ======================================================

    exportWav() {

        if (!this.outputBuffer) {
            throw new Error("No processed buffer available.")
        }

        return this.audioBufferToWav(this.outputBuffer)
    }

    // ======================================================
    // GET BLOB
    // ======================================================

    getBlob() {

        return new Blob(
            [this.exportWav()],
            { type: "audio/wav" }
        )
    }

    // ======================================================
    // GET ARRAYBUFFER
    // ======================================================

    getArrayBuffer() {
        return this.exportWav()
    }

    // ======================================================
    // WAV ENCODER
    // ======================================================

    audioBufferToWav(buffer) {

        const numChannels = buffer.numberOfChannels
        const sampleRate = buffer.sampleRate
        const bitDepth = 16

        const bytesPerSample = bitDepth / 8
        const blockAlign = numChannels * bytesPerSample

        const length = buffer.length

        const wavBuffer = new ArrayBuffer(
            44 + length * blockAlign
        )

        const view = new DataView(wavBuffer)

        let offset = 0

        const writeString = (str) => {

            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset++, str.charCodeAt(i))
            }
        }

        writeString("RIFF")

        view.setUint32(
            offset,
            36 + length * blockAlign,
            true
        )

        offset += 4

        writeString("WAVE")

        writeString("fmt ")

        view.setUint32(offset, 16, true)
        offset += 4

        view.setUint16(offset, 1, true)
        offset += 2

        view.setUint16(offset, numChannels, true)
        offset += 2

        view.setUint32(offset, sampleRate, true)
        offset += 4

        view.setUint32(
            offset,
            sampleRate * blockAlign,
            true
        )

        offset += 4

        view.setUint16(offset, blockAlign, true)
        offset += 2

        view.setUint16(offset, bitDepth, true)
        offset += 2

        writeString("data")

        view.setUint32(
            offset,
            length * blockAlign,
            true
        )

        offset += 4

        const channels = []

        for (let ch = 0; ch < numChannels; ch++) {
            channels.push(buffer.getChannelData(ch))
        }

        for (let i = 0; i < length; i++) {

            for (let ch = 0; ch < numChannels; ch++) {

                let sample = channels[ch][i]

                sample = Math.max(-1, Math.min(1, sample))

                view.setInt16(
                    offset,
                    sample < 0
                        ? sample * 0x8000
                        : sample * 0x7FFF,
                    true
                )

                offset += 2
            }
        }

        return wavBuffer
    }
}

//
// ======================================================
// USAGE
// ======================================================
//
// const tool = new StereoWideTool(audioCtx)
//
// tool.width = 1.8
// tool.reversePolarity = true
//
// await tool.createWideBuffer(audioBuffer)
//
// tool.play()
//
// const blob = tool.getBlob()
//
// ======================================================