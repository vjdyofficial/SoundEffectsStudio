class EchoEffect {

    constructor(audioCtx, input, output) {

        this.audioCtx = audioCtx;
        this.input = input;
        this.output = output;

        this.channelCount = 8;

        this.delayTime = 0.25;
        this.repeat = 0.5;

        this.bypassed = false;

        this.splitter = audioCtx.createChannelSplitter(this.channelCount);
        this.merger = audioCtx.createChannelMerger(this.channelCount);

        this.delays = [];
        this.feedbacks = [];
        this.wetGains = [];
        this.dryGains = [];

        for (let i = 0; i < this.channelCount; i++) {

            const delay = audioCtx.createDelay(10);
            const feedback = audioCtx.createGain();
            const wet = audioCtx.createGain();
            const dry = audioCtx.createGain();

            delay.delayTime.value = this.delayTime;
            feedback.gain.value = this.repeat;

            wet.gain.value = 1;
            dry.gain.value = 1;

            // Feedback loop
            delay.connect(feedback);
            feedback.connect(delay);

            this.delays.push(delay);
            this.feedbacks.push(feedback);
            this.wetGains.push(wet);
            this.dryGains.push(dry);
        }

        this.Unbypass();
    }


    // =========================================
    // SET DELAY
    // =========================================

    setDelay(value) {

        value = Number(value);

        if (!Number.isFinite(value))
            return;

        value = Math.max(0, Math.min(value, 10));

        this.delayTime = value;

        for (const delay of this.delays) {

            delay.delayTime.setTargetAtTime(
                value,
                this.audioCtx.currentTime,
                0.01
            );
        }
    }


    // =========================================
    // SET REPEAT
    // =========================================

    setRepeat(value) {

        value = Number(value);

        if (!Number.isFinite(value))
            return;

        value = Math.max(0, Math.min(value, 0.99));

        this.repeat = value;

        for (const feedback of this.feedbacks) {

            feedback.gain.setTargetAtTime(
                value,
                this.audioCtx.currentTime,
                0.01
            );
        }
    }


    // =========================================
    // BYPASS
    // =========================================

    Bypass() {

        if (this.bypassed)
            return;

        this.bypassed = true;

        // Remove processing
        try {
            this.input.disconnect();
        } catch (e) {}

        try {
            this.splitter.disconnect();
        } catch (e) {}

        try {
            this.merger.disconnect();
        } catch (e) {}

        for (let i = 0; i < this.channelCount; i++) {

            try {
                this.delays[i].disconnect();
            } catch (e) {}

            try {
                this.feedbacks[i].disconnect();
            } catch (e) {}

            try {
                this.wetGains[i].disconnect();
            } catch (e) {}

            try {
                this.dryGains[i].disconnect();
            } catch (e) {}
        }

        // Direct connection
        this.input.connect(this.output);
    }


    // =========================================
    // UNBYPASS
    // =========================================

    Unbypass() {

        if (!this.bypassed && this.connected)
            return;

        this.bypassed = false;
        this.connected = true;

        // Remove bypass connection
        try {
            this.input.disconnect();
        } catch (e) {}

        // Input → Splitter
        this.input.connect(this.splitter);

        for (let i = 0; i < this.channelCount; i++) {

            const delay = this.delays[i];
            const wet = this.wetGains[i];
            const dry = this.dryGains[i];

            // Dry
            this.splitter.connect(
                dry,
                i
            );

            dry.connect(
                this.merger,
                0,
                i
            );

            // Wet
            this.splitter.connect(
                delay,
                i
            );

            delay.connect(wet);

            wet.connect(
                this.merger,
                0,
                i
            );
        }

        // Merger → output
        this.merger.connect(this.output);
    }
}