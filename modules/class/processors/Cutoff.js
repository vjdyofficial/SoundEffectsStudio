class CutoffEffect {
    constructor(audioCtx, input, output) {
        this.audioCtx = audioCtx;
        this.input = input;
        this.output = output;

        this.splitter = audioCtx.createChannelSplitter(8);
        this.merger = audioCtx.createChannelMerger(8);

        this.filters = [];

        this.type = "lowpass";
        this.frequency = 1000;
        this.Q = 0.7071;

        for (let i = 0; i < 8; i++) {
            const filter = audioCtx.createBiquadFilter();

            filter.type = this.type;
            filter.frequency.value = this.frequency;
            filter.Q.value = this.Q;

            this.filters.push(filter);
        }

        // No connections here!
    }

    Bypass() {
        this.input.disconnect();
        this.splitter.disconnect();
        this.merger.disconnect();

        for (const filter of this.filters) {
            filter.disconnect();
        }

        this.input.connect(this.output);
    }

    Unbypass() {
        this.input.disconnect();
        this.splitter.disconnect();
        this.merger.disconnect();

        for (const filter of this.filters) {
            filter.disconnect();
        }

        // Input → Splitter
        this.input.connect(this.splitter);

        // 8 channels → 8 filters → Merger
        for (let i = 0; i < 8; i++) {
            this.splitter.connect(this.filters[i], i);
            this.filters[i].connect(this.merger, 0, i);
        }

        // Merger → Output
        this.merger.connect(this.output);
    }

    setType(type) {
        this.type = type;

        for (const filter of this.filters) {
            filter.type = type;
        }
    }

    setFrequency(frequency) {
        this.frequency = frequency;

        for (const filter of this.filters) {
            filter.frequency.setTargetAtTime(
                frequency,
                this.audioCtx.currentTime,
                0.01
            );
        }
    }

    setQ(Q) {
        this.Q = Q;

        for (const filter of this.filters) {
            filter.Q.setTargetAtTime(
                Q,
                this.audioCtx.currentTime,
                0.01
            );
        }
    }

    setAnimation(frequency, timeConstant = 0.01) {
        this.frequency = frequency;

        for (const filter of this.filters) {
            filter.frequency.setTargetAtTime(
                frequency,
                this.audioCtx.currentTime,
                timeConstant
            );
        }
    }
}