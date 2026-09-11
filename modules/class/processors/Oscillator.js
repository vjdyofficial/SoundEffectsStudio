class Oscillator {
    constructor() {
        this.audioCtx = null;

        // Final output node
        this.output = null;

        // Channel merger for surround output
        this.merger = null;

        // Active OscillatorNodes
        this.oscillators = [];

        // Validated oscillator definitions
        this.data = [];

        // Number of output channels
        this.channels = 2;

        // Running state
        this.started = false;
    }


    /**
     * Initialize oscillator
     *
     * @param {AudioContext} audioCtx
     * @param {Array} data
     * @param {Object} options
     *
     * Example:
     *
     * oscillator.param(audioCtx, [
     *     {
     *         type: "sine",
     *         frequency: 853
     *     },
     *     {
     *         type: "triangle",
     *         frequency: 960
     *     }
     * ], {
     *     channels: 8
     * });
     */
    param(audioCtx, data = [], options = {}) {

        if (!audioCtx) {
            throw new Error(
                "Oscillator: audioCtx is required."
            );
        }

        this.audioCtx = audioCtx;


        /*
         * Determine channel count
         *
         * Default = stereo
         */
        let channels = options.channels;

        if (
            !Number.isInteger(channels) ||
            channels < 1
        ) {
            channels = 2;
        }

        this.channels = channels;


        /*
         * Default oscillator
         *
         * Empty / invalid array:
         * sine @ 1000 Hz
         */
        if (
            !Array.isArray(data) ||
            data.length === 0
        ) {
            data = [
                {
                    type: "sine",
                    frequency: 1000
                }
            ];
        }


        /*
         * Supported oscillator types
         */
        const validTypes = [
            "sine",
            "square",
            "sawtooth",
            "triangle"
        ];


        /*
         * Validate oscillator definitions
         */
        this.data = data.map(item => {

            /*
             * Completely invalid entry
             */
            if (
                !item ||
                typeof item !== "object"
            ) {
                return {
                    type: "sine",
                    frequency: 1000,
                    channels: null
                };
            }


            /*
             * Oscillator type
             */
            const type =
                validTypes.includes(item.type)
                    ? item.type
                    : "sine";


            /*
             * Frequency
             */
            const frequency =
                typeof item.frequency === "number" &&
                Number.isFinite(item.frequency) &&
                item.frequency > 0
                    ? item.frequency
                    : 1000;


            /*
             * Optional channel routing
             *
             * null = all channels
             *
             * Example:
             * channels: [0, 1]
             *
             * means L + R
             */
            let oscillatorChannels = null;

            if (Array.isArray(item.channels)) {

                oscillatorChannels = item.channels
                    .filter(channel =>
                        Number.isInteger(channel) &&
                        channel >= 0 &&
                        channel < this.channels
                    );

                /*
                 * Remove duplicates
                 */
                oscillatorChannels = [
                    ...new Set(oscillatorChannels)
                ];

                /*
                 * Empty channel list = all channels
                 */
                if (oscillatorChannels.length === 0) {
                    oscillatorChannels = null;
                }
            }


            return {
                type,
                frequency,
                channels: oscillatorChannels
            };
        });


        /*
         * Remove previous output nodes
         */
        this._destroyOutput();


        /*
         * MONO
         *
         * No ChannelMerger required.
         */
        if (this.channels === 1) {

            this.output =
                this.audioCtx.createGain();

            this.output.channelCountMode =
                "explicit";

            this.output.channelInterpretation =
                "speakers";

            this.output.channelCount = 1;

            this.output.gain.value = 0.1;

            return this;
        }


        /*
         * MULTICHANNEL
         *
         * ChannelMerger creates the desired
         * number of output channels.
         *
         * IMPORTANT:
         *
         * Do NOT modify merger.channelCount.
         * ChannelMergerNode.channelCount is fixed at 1.
         */
        this.merger =
            this.audioCtx.createChannelMerger(
                this.channels
            );


        /*
         * ChannelMerger already provides the
         * required number of output channels.
         */
        this.output = this.merger;


        return this;
    }


    /**
     * Start all oscillators
     */
    start() {

        if (!this.audioCtx) {
            throw new Error(
                "Oscillator: call param(audioCtx) first."
            );
        }

        if (!this.output) {
            throw new Error(
                "Oscillator: output has not been initialized."
            );
        }


        /*
         * AudioContext may be suspended
         */
        if (this.audioCtx.state === "suspended") {
            this.audioCtx.resume();
        }


        /*
         * Don't create duplicate oscillators
         */
        if (this.started) {
            return;
        }


        this.oscillators = [];


        /*
         * Create every oscillator
         */
        for (const data of this.data) {

            const osc =
                this.audioCtx.createOscillator();


            /*
             * Set waveform
             */
            osc.type = data.type;


            /*
             * Set frequency
             */
            osc.frequency.value =
                data.frequency;


            /*
             * MONO
             */
            if (this.channels === 1) {

                osc.connect(this.output);
            }


            /*
             * MULTICHANNEL
             */
            else {

                /*
                 * No channel list:
                 *
                 * Send oscillator to ALL channels.
                 */
                if (!data.channels) {

                    for (
                        let channel = 0;
                        channel < this.channels;
                        channel++
                    ) {

                        osc.connect(
                            this.merger,
                            0,
                            channel
                        );
                    }
                }


                /*
                 * Specific channel list
                 */
                else {

                    for (
                        const channel
                        of data.channels
                    ) {

                        osc.connect(
                            this.merger,
                            0,
                            channel
                        );
                    }
                }
            }


            /*
             * Start oscillator
             */
            osc.start();


            /*
             * Store active node
             */
            this.oscillators.push(osc);
        }


        this.started = true;
    }


    /**
     * Stop all oscillators
     */
    stop() {

        /*
         * Nothing running
         */
        if (!this.started) {
            return;
        }


        for (const osc of this.oscillators) {

            try {
                osc.stop();
            } catch {
                // Already stopped
            }


            try {
                osc.disconnect();
            } catch {
                // Already disconnected
            }
        }


        this.oscillators = [];

        this.started = false;
    }


    /**
     * Completely destroy the output routing
     */
    _destroyOutput() {

        /*
         * Stop active oscillators first
         */
        this.stop();


        /*
         * Disconnect output
         */
        if (this.output) {

            try {
                this.output.disconnect();
            } catch {}
        }


        /*
         * Clear nodes
         */
        this.output = null;
        this.merger = null;
    }
}