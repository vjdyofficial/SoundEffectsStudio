class BassEffect {
    constructor(audioCtx, input, output) {
        this.audioCtx = audioCtx;
        this.input = input;
        this.output = output;

        this.splitter = audioCtx.createChannelSplitter(8);
        this.merger = audioCtx.createChannelMerger(8);

        this.filters = [];

        for (let i = 0; i < 8; i++) {
            const filter = audioCtx.createBiquadFilter();

            filter.type = "lowshelf";
            filter.frequency.value = 100;
            filter.gain.value = 0;

            this.filters.push(filter);
        }
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

        this.input.connect(this.splitter);

        for (let i = 0; i < 8; i++) {
            this.splitter.connect(this.filters[i], i);
            this.filters[i].connect(this.merger, 0, i);
        }

        this.merger.connect(this.output);
    }

    setFrequency(frequency) {
        for (const filter of this.filters) {
            filter.frequency.value = frequency;
        }
    }

    setGain(gain) {
        for (const filter of this.filters) {
            filter.gain.value = gain;
        }
    }
}


class MidEffect {
    constructor(audioCtx, input, output) {
        this.audioCtx = audioCtx;
        this.input = input;
        this.output = output;

        this.splitter = audioCtx.createChannelSplitter(8);
        this.merger = audioCtx.createChannelMerger(8);

        this.filters = [];

        for (let i = 0; i < 8; i++) {
            const filter = audioCtx.createBiquadFilter();

            filter.type = "peaking";
            filter.frequency.value = 500;
            filter.Q.value = 0.7071;
            filter.gain.value = 0;

            this.filters.push(filter);
        }
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

        this.input.connect(this.splitter);

        for (let i = 0; i < 8; i++) {
            this.splitter.connect(this.filters[i], i);
            this.filters[i].connect(this.merger, 0, i);
        }

        this.merger.connect(this.output);
    }

    setFrequency(frequency) {
        for (const filter of this.filters) {
            filter.frequency.value = frequency;
        }
    }

    setGain(gain) {
        for (const filter of this.filters) {
            filter.gain.value = gain;
        }
    }
}


class TrebleEffect {
    constructor(audioCtx, input, output) {
        this.audioCtx = audioCtx;
        this.input = input;
        this.output = output;

        this.splitter = audioCtx.createChannelSplitter(8);
        this.merger = audioCtx.createChannelMerger(8);

        this.filters = [];

        for (let i = 0; i < 8; i++) {
            const filter = audioCtx.createBiquadFilter();

            filter.type = "highshelf";
            filter.frequency.value = 1000;
            filter.gain.value = 0;

            this.filters.push(filter);
        }
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

        this.input.connect(this.splitter);

        for (let i = 0; i < 8; i++) {
            this.splitter.connect(this.filters[i], i);
            this.filters[i].connect(this.merger, 0, i);
        }

        this.merger.connect(this.output);
    }

    setFrequency(frequency) {
        for (const filter of this.filters) {
            filter.frequency.value = frequency;
        }
    }

    setQ(gain) {
        for (const filter of this.filters) {
            filter.gain.value = gain;
        }
    }
}