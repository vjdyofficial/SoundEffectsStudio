class ReverbEffect {
    constructor(audioCtx, input, output) {
        this.audioCtx = audioCtx;
        this.input = input;
        this.output = output;

        this.convolver = new ConvolverNode(audioCtx, {
            channelCount: 2,
            channelCountMode: "explicit",
            channelInterpretation: "discrete",
        });
        this.channelSplitter = audioCtx.createChannelSplitter(8);
        this.channelMerger = audioCtx.createChannelMerger(2);
        this.wetGain = audioCtx.createGain();
        this.dryGain = audioCtx.createGain();

        this.dry = 1;
        this.wet = 0.5;

        this.diffusion = 0.5;
        this.density = 0.5;
        this.reflection = 0.5;
        this.delay = 0;
        this.decay = 2;
        this.ratio = 0.5;

        this.wetGain.gain.value = this.wet;
        this.dryGain.gain.value = this.dry;
    }

    Bypass() {
        this.input.disconnect();
        this.channelSplitter.disconnect();
        this.channelMerger.disconnect();
        this.convolver.disconnect();
        this.wetGain.disconnect();
        this.dryGain.disconnect();

        // Direct connection
        this.input.connect(this.output);
    }

    Unbypass() {
        this.input.disconnect();
        this.channelSplitter.disconnect();
        this.channelMerger.disconnect();
        this.convolver.disconnect();
        this.wetGain.disconnect();
        this.dryGain.disconnect();

        // Dry and convolved wet paths
        this.input.connect(this.dryGain);
        this.dryGain.connect(this.output);
        this.input.connect(this.channelSplitter);
        this.channelSplitter.connect(this.channelMerger, 0, 0);
        this.channelSplitter.connect(this.channelMerger, 1, 1);
        this.channelSplitter.connect(this.channelMerger, 2, 0);
        this.channelSplitter.connect(this.channelMerger, 2, 1);
        this.channelSplitter.connect(this.channelMerger, 3, 0);
        this.channelSplitter.connect(this.channelMerger, 3, 1);
        this.channelSplitter.connect(this.channelMerger, 4, 0);
        this.channelSplitter.connect(this.channelMerger, 5, 1);
        this.channelSplitter.connect(this.channelMerger, 6, 0);
        this.channelSplitter.connect(this.channelMerger, 7, 1);
        this.channelMerger.connect(this.convolver);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.output);
    }

    setDry(value) {
        this.dry = Number(value);

        this.dryGain.gain.setTargetAtTime(
            this.dry,
            this.audioCtx.currentTime,
            0.01
        );
    }

    setWet(value) {
        this.wet = Number(value);

        this.wetGain.gain.setTargetAtTime(
            this.wet,
            this.audioCtx.currentTime,
            0.01
        );
    }

    drawWaveform(canvas) {
        if (!this.irBuffer)
            return;

        const ctx = canvas.getContext("2d");

        const data = this.irBuffer.getChannelData(0);

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
            const end = Math.min(
                start + step,
                data.length
            );

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
                Math.max(
                    1,
                    (max - min) * amp
                )
            );
        }
    }

    async setIR(v1, v2, v3, v4, v5, v6, canvas) {
        this.diffusion = Number(v1);
        this.density = Number(v2);
        this.reflection = Number(v3);
        this.delay = Number(v4);
        this.decay = Number(v5);
        this.ratio = Number(v6);

        const noiseIR = 0.7895657005286758

        const irSampleRate = 32000;
        const outputSampleRate = this.audioCtx.sampleRate;

        // ---------------------------------------------------------
        // Parameters
        // ---------------------------------------------------------

        const diffusion = Math.max(
            0,
            Number(this.diffusion)
        );

        const density = Math.max(
            0,
            Math.min(1, Number(this.density))
        );

        const reflection = Math.max(
            0,
            Math.min(1, Number(this.reflection))
        );

        const delayTime = Math.max(
            0,
            Number(this.delay)
        );

        const decayTime = Math.max(
            0,
            Number(this.decay)
        );

        const ratio = Math.max(
            0,
            Math.min(1, Number(this.ratio))
        );

        // ---------------------------------------------------------
        // Total IR length
        // ---------------------------------------------------------

        const totalTime =
            Math.max(
                0.001,
                delayTime + decayTime
            );

        const length =
            Math.max(
                1,
                Math.ceil(
                    totalTime * irSampleRate
                )
            );

        const irContext =
            new OfflineAudioContext(
                1,
                length,
                irSampleRate
            );

        const channelCount = 2;

        const ir =
            irContext.createBuffer(
                channelCount,
                length,
                irSampleRate
            );

        const channelData = Array.from(
            { length: channelCount },
            (_, channel) => ir.getChannelData(channel)
        );

        // ---------------------------------------------------------
        // Diffusion = ATTACK
        // ---------------------------------------------------------

        const attackTime =
            diffusion;

        // ---------------------------------------------------------
        // Generate IR
        // ---------------------------------------------------------

        const previous = new Array(channelCount).fill(0);

        for (let i = 0; i < length; i++) {

            const time =
                i / irSampleRate;

            // -----------------------------------------------------
            // PRE-DELAY
            // -----------------------------------------------------

            if (time < delayTime) {
                for (const data of channelData) {
                    data[i] = 0;
                }
                continue;
            }

            const reverbTime =
                time - delayTime;

            // -----------------------------------------------------
            // ATTACK / DIFFUSION
            // -----------------------------------------------------

            let attackEnvelope;

            if (attackTime <= 0) {

                attackEnvelope = 1;

            } else if (reverbTime >= attackTime) {

                attackEnvelope = 1;

            } else {

                const x =
                    reverbTime / attackTime;

                attackEnvelope =
                    x * x * (3 - 2 * x);
            }

            // -----------------------------------------------------
            // RELEASE / DECAY
            // -----------------------------------------------------

            let releaseEnvelope;

            if (decayTime <= 0) {

                releaseEnvelope =
                    reverbTime === 0 ? 1 : 0;

            } else {

                const releaseProgress =
                    reverbTime / decayTime;

                if (releaseProgress >= 1) {

                    releaseEnvelope = 0;

                } else {

                    releaseEnvelope =
                        Math.pow(
                            1 - releaseProgress,
                            2
                        );
                }
            }

            // -----------------------------------------------------
            // DENSITY
            // -----------------------------------------------------

            const densityProbability =
                0.01 +
                density * 0.99;

            // -----------------------------------------------------
            // RATIO
            //
            // Controls how "wobbly" the IR waveform is.
            //
            // Ratio = 0 → smoother waveform
            // Ratio = 1 → maximum random wobble
            // -----------------------------------------------------

            const smoothing =
                (1 - ratio) * 0.95;

            for (let channel = 0; channel < channelCount; channel++) {
                if (Math.random() > densityProbability) {
                    channelData[channel][i] = 0;
                    continue;
                }

                const noise = Math.random() * 2 - 1;
                const reflectionSample =
                    previous[channel] * smoothing +
                    noise * (1 - smoothing);

                previous[channel] = reflectionSample;
                channelData[channel][i] =
                    reflectionSample *
                    attackEnvelope *
                    releaseEnvelope *
                    reflection;
            }
        }

        // ---------------------------------------------------------
        // RESAMPLE
        // ---------------------------------------------------------

        const resampleLength =
            Math.max(
                channelCount,
                Math.ceil(
                    length *
                    outputSampleRate /
                    irSampleRate
                )
            );

        const resampleContext =
            new OfflineAudioContext(
                channelCount,
                resampleLength,
                outputSampleRate
            );

        const source =
            resampleContext.createBufferSource();

        source.buffer = ir;

        source.connect(
            resampleContext.destination
        );

        source.start(0);

        const resampledIR =
            await resampleContext.startRendering();

        // ---------------------------------------------------------
        // APPLY TO ALL CONVOLVERS
        // ---------------------------------------------------------

        this.convolver.buffer = resampledIR;

        // ---------------------------------------------------------
        // STORE IR
        // ---------------------------------------------------------

        this.irBuffer =
            resampledIR;

        // ---------------------------------------------------------
        // DRAW WAVEFORM
        // ---------------------------------------------------------

        if (canvas) {
            this.drawWaveform(canvas);
        }
    }
}