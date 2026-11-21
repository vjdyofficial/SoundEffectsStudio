class LooperModule {
    constructor() {
        this.audioCtx = null;
        this.canvas = null;
        this.outputNode = null;

        // ---------------------------------------------------------
        // TIMING
        // ---------------------------------------------------------

        this.bpm = 124;
        this.beatsPerBar = 2;
        this.beatsPerBar2 = 1;
        this.quantize = "bar";

        // Global timer
        this.running = false;
        this.timerStartTime = null;
        this.currentBar = -1;
        this.currentBar2 = -1;
        this.currentCue = 0

        // ---------------------------------------------------------
        // BANK INFORMATION
        // ---------------------------------------------------------

        this.bankPath = null;
        this.bankDirectory = null;
        this.bankName = null;
        this.bankVersion = 1;

        // ---------------------------------------------------------
        // GLOBAL TIMER
        // ---------------------------------------------------------

        this.schedulerTimer = null;
        this.schedulerInterval = 25;

        // ---------------------------------------------------------
        // 16 PADS
        // ---------------------------------------------------------

        this.pads = Array.from(
            { length: 24 },
            (_, index) => this.createPad(index)
        );

        // ---------------------------------------------------------
        // CALLBACKS
        // ---------------------------------------------------------

        this.onBarGlobal = (state) => {
            // Override externally
        };

        this.onBarChangeToLooperButton = (index, state) => {
            // Override externally
        };

        // Receives the current normalized playback position of every pad.
        this.onUpdate = (pads) => {
            // Override externally
        };

        this.onChange = (event) => {
            // Override externally
        };
    }

    // =========================================================
    // PAD CREATION
    // =========================================================

    createPad(index) {
        return {
            index,

            id: `looperPad${index + 1}`,
            canvasId: `looperWaveform${index + 1}`,

            button: null,
            canvas: null,

            // Audio
            buffer: null,
            source: null,
            gainNode: null,

            // Bank information
            name: `Pad ${index + 1}`,
            file: null,

            // Actual configured volume
            volume: 1.0,

            // Live ON/OFF state
            active: false,

            // Playback
            loop: true,
            playing: false,
            startedAt: null
        };
    }

    // =========================================================
    // INITIALIZATION
    // =========================================================

    param(audioCtx, canvas, outputNode) {
        this.audioCtx = audioCtx;
        this.canvas = canvas;
        this.outputNode = outputNode;

        if (!this.audioCtx) {
            console.error(
                "[Looper] AudioContext is missing."
            );
            return;
        }

        if (!this.outputNode) {
            console.error(
                "[Looper] Output node is missing."
            );
            return;
        }

        this.initButtons();

        // Timer does not start until a pad is activated.
        this.running = false;
        this.timerStartTime = null;
        this.currentBar = -1;
    }

    // =========================================================
    // BUTTONS + WAVEFORMS
    // =========================================================

    initButtons() {
        this.pads.forEach((pad) => {

            // -------------------------------------------------
            // BUTTON
            // -------------------------------------------------

            const button =
                document.getElementById(pad.id);

            if (!button) {
                console.warn(
                    `[Looper] Button not found: ${pad.id}`
                );
            } else {
                pad.button = button;

                button.onclick = () => {
                    this.togglePad(pad.index);
                };
            }

            // -------------------------------------------------
            // WAVEFORM
            // -------------------------------------------------

            const canvas =
                document.getElementById(pad.canvasId);

            if (!canvas) {
                console.warn(
                    `[Looper] Waveform canvas not found: ${pad.canvasId}`
                );
            } else {
                pad.canvas = canvas;
            }

            this.updateButtonState(pad);
        });
    }

    // =========================================================
    // PAD TOGGLE
    // =========================================================

    togglePad(index) {
        const pad = this.pads[index];

        if (!pad) {
            console.warn(
                `[Looper] Invalid pad: ${index}`
            );
            return;
        }

        // Cannot activate an empty pad
        if (!pad.buffer) {
            console.warn(
                `[Looper] No audio loaded for ${pad.id}`
            );
            return;
        }

        // -----------------------------------------------------
        // FIRST PRESS
        // -----------------------------------------------------

        // Start source immediately.
        this.startPad();

        // Start global timer.
        if (!this.running) {
            this.startGlobalTimer();
        }

        // -----------------------------------------------------
        // TOGGLE 0 <-> 1
        // -----------------------------------------------------

        pad.active = !pad.active;

        const targetVolume =
            pad.active
                ? pad.volume
                : 0;

        // -----------------------------------------------------
        // INSTANT GAIN CHANGE
        // -----------------------------------------------------

        if (pad.gainNode) {
            const now =
                this.audioCtx.currentTime;

            pad.gainNode.gain.cancelScheduledValues(now);

            pad.gainNode.gain.setValueAtTime(
                targetVolume,
                now
            );
        }

        this.updateButtonState(pad);

        // -----------------------------------------------------
        // CALLBACK
        // -----------------------------------------------------

        this.onBarChangeToLooperButton(
            index,
            pad.active
        );

        // -----------------------------------------------------
        // IF EVERYTHING IS 0
        // -----------------------------------------------------

        if (!this.hasAudiblePads()) {
            this.stopAll();
        }
    }

    // =========================================================
    // CHECK ACTIVE / AUDIBLE PADS
    // =========================================================

    hasAudiblePads() {
        return this.pads.some(
            (pad) =>
                pad.active &&
                pad.volume > 0
        );
    }

    // =========================================================
    // BUTTON STATE
    // =========================================================

    updateButtonState(pad) {
        if (!pad.button) {
            return;
        }

        // ON/OFF state
        pad.button.classList.toggle(
            "pressed",
            pad.active
        );

        // Audio source is running
        pad.button.classList.toggle(
            "playing",
            pad.playing
        );

        pad.button.setAttribute(
            "aria-pressed",
            pad.active
                ? "true"
                : "false"
        );
    }

    // =========================================================
    // GLOBAL TIMER START
    // =========================================================

    startGlobalTimer() {
        if (this.running) {
            return;
        }

        if (!this.audioCtx) {
            return;
        }

        this.running = true;

        this.timerStartTime =
            this.audioCtx.currentTime;

        this.currentBar = -1;
        this.startScheduler();
    }

    // =========================================================
    // GLOBAL TIMER STOP
    // =========================================================

    stopGlobalTimer() {
        if (!this.running) {
            return;
        }

        this.running = false;

        this.timerStartTime = null;
        this.currentBar = -1;

        this.stopScheduler();
    }

    // =========================================================
    // PAD POSITION UPDATE
    // =========================================================

    processPadUpdates() {
        if (!this.audioCtx) {
            return;
        }

        const now = this.audioCtx.currentTime;

        this.onUpdate(this.pads.map((pad) => {
            let currentTime = 0;

            if (pad.buffer && pad.startedAt !== null) {
                const elapsed = now - pad.startedAt;
                const duration = pad.buffer.duration;

                if (duration > 0) {
                    currentTime = pad.loop
                        ? (elapsed % duration) / duration
                        : Math.min(1, Math.max(0, elapsed / duration));
                }
            }

            return {
                index: pad.index,
                id: pad.id,
                currentTime,
                active: pad.active,
                playing: pad.playing
            };
        }));
    }

    // =========================================================
    // GLOBAL BAR CALLBACK
    // =========================================================

    processGlobalBar() {
        if (!this.running) {
            return;
        }

        if (this.timerStartTime === null) {
            return;
        }

        const now =
            this.audioCtx.currentTime;

        const barDuration =
            this.getBarDuration();

        const barDuration2 =
            this.getBarDuration2();

        const barNumber =
            Math.floor(
                (now - this.timerStartTime) /
                barDuration
            );

        const barNumber2 =
            Math.floor(
                (now - this.timerStartTime) /
                barDuration2
            );

        if (barNumber !== this.currentBar) {

            this.currentBar =
                barNumber;

            this.currentCue = this.currentCue >= 4
                ? 1
                : this.currentCue + 1;


            this.onBarGlobal(this.currentCue);
        }

        if (barNumber2 !== this.currentBar2) {
            this.currentBar2 = barNumber2;
            this.processPadUpdates();
        }
    }

    // =========================================================
    // BPM
    // =========================================================

    setBPM(bpm) {
        bpm = Number(bpm);

        if (
            !Number.isFinite(bpm) ||
            bpm <= 0
        ) {
            console.warn(
                "[Looper] Invalid BPM:",
                bpm
            );
            return;
        }

        this.bpm = bpm;
    }

    getBeatDuration() {
        return 60 / this.bpm;
    }

    getBarDuration() {
        return (
            this.getBeatDuration() *
            this.beatsPerBar
        );
    }

    getBarDuration2() {
        return (
            this.getBeatDuration() *
            this.beatsPerBar2
        );
    }

    // =========================================================
    // QUANTIZE SETTINGS
    // =========================================================

    setQuantize(type) {
        if (
            type !== "beat" &&
            type !== "bar"
        ) {
            console.warn(
                "[Looper] Quantize must be 'beat' or 'bar'."
            );
            return;
        }

        this.quantize = type;
    }

    // =========================================================
    // NEXT BEAT
    // =========================================================

    getNextBeatTime() {
        const now =
            this.audioCtx.currentTime;

        const beatDuration =
            this.getBeatDuration();

        if (this.timerStartTime === null) {
            return now;
        }

        const elapsed =
            now - this.timerStartTime;

        const beatNumber =
            Math.ceil(
                elapsed / beatDuration
            );

        return (
            this.timerStartTime +
            beatNumber * beatDuration
        );
    }

    // =========================================================
    // NEXT BAR
    // =========================================================

    getNextBarTime() {
        const now =
            this.audioCtx.currentTime;

        const barDuration =
            this.getBarDuration();

        if (this.timerStartTime === null) {
            return now;
        }

        const elapsed =
            now - this.timerStartTime;

        const barNumber =
            Math.ceil(
                elapsed / barDuration
            );

        return (
            this.timerStartTime +
            barNumber * barDuration
        );
    }

    // =========================================================
    // NEXT QUANTIZED TIME
    // =========================================================

    getNextQuantizedTime() {
        if (this.quantize === "beat") {
            return this.getNextBeatTime();
        }

        return this.getNextBarTime();
    }

    // =========================================================
    // START PAD
    // =========================================================

    startPad() {
        this.pads.forEach(pad => {
            if (!pad || !pad.buffer) {
                return;
            }

            // Already running
            if (pad.playing) {
                return;
            }

            const source =
                this.audioCtx.createBufferSource();

            const gainNode =
                this.audioCtx.createGain();

            // -----------------------------------------------------
            // SOURCE
            // -----------------------------------------------------

            source.buffer =
                pad.buffer;

            source.loop =
                pad.loop;

            // -----------------------------------------------------
            // START MUTED
            // -----------------------------------------------------

            gainNode.gain.value = 0;

            // -----------------------------------------------------
            // ROUTING
            // -----------------------------------------------------

            source.connect(
                gainNode
            );

            gainNode.connect(
                this.outputNode
            );

            // -----------------------------------------------------
            // STORE
            // -----------------------------------------------------

            pad.source =
                source;

            pad.gainNode =
                gainNode;

            pad.playing =
                true;

            pad.startedAt =
                this.audioCtx.currentTime;

            // -----------------------------------------------------
            // SOURCE END
            // -----------------------------------------------------

            source.onended = () => {

                if (
                    pad.source === source
                ) {
                    pad.source = null;
                    pad.gainNode = null;
                    pad.playing = false;
                    pad.startedAt = null;

                    this.updateButtonState(
                        pad
                    );
                }
            };

            // -----------------------------------------------------
            // START IMMEDIATELY
            // -----------------------------------------------------

            source.start();

            this.updateButtonState(
                pad
            );
        })
    }

    // =========================================================
    // STOP PAD
    // =========================================================

    stopPad(index) {
        const pad =
            this.pads[index];

        if (!pad) {
            return;
        }

        if (pad.source) {
            try {
                pad.source.stop();
            } catch (error) {
                // Already stopped
            }
        }

        pad.source = null;
        pad.gainNode = null;
        pad.playing = false;
        pad.startedAt = null;
        pad.active = false;

        this.updateButtonState(
            pad
        );
    }

    // =========================================================
    // SCHEDULER
    // =========================================================

    startScheduler() {
        if (this.schedulerTimer) {
            return;
        }

        this.schedulerTimer =
            setInterval(
                () => {
                    this.processScheduler();
                },
                this.schedulerInterval
            );
    }

    // =========================================================
    // STOP SCHEDULER
    // =========================================================

    stopScheduler() {
        if (!this.schedulerTimer) {
            return;
        }

        clearInterval(
            this.schedulerTimer
        );

        this.schedulerTimer = null;
    }

    // =========================================================
    // PROCESS SCHEDULER
    // =========================================================

    processScheduler() {
        if (!this.running) {
            return;
        }

        if (!this.audioCtx) {
            return;
        }

        // Only used for global bar callback.
        this.processGlobalBar();
    }

    // =========================================================
    // PAD VOLUME
    // =========================================================

    setPadVolume(index, volume) {
        const pad =
            this.pads[index];

        if (!pad) {
            return;
        }

        volume = Number(volume);

        if (!Number.isFinite(volume)) {
            return;
        }

        volume =
            Math.max(
                0,
                Math.min(
                    1,
                    volume
                )
            );

        pad.volume =
            volume;

        // If pad is currently active,
        // immediately apply its new volume.
        if (
            pad.gainNode &&
            pad.active
        ) {
            const now =
                this.audioCtx.currentTime;

            pad.gainNode.gain.cancelScheduledValues(
                now
            );

            pad.gainNode.gain.setValueAtTime(
                volume,
                now
            );
        }

        // -----------------------------------------------------
        // VOLUME BECAME ZERO
        // -----------------------------------------------------

        if (
            volume === 0 &&
            pad.active
        ) {
            pad.active = false;

            this.updateButtonState(
                pad
            );

            this.onBarChangeToLooperButton(
                index,
                false
            );
        }

        // -----------------------------------------------------
        // EVERYTHING ZERO
        // -----------------------------------------------------

        if (!this.hasAudiblePads()) {
            this.stopAll();
        }
    }

    // =========================================================
    // LOAD SINGLE PAD
    // =========================================================

    async loadPad(index, filePath) {
        const pad =
            this.pads[index];

        if (!pad) {
            throw new Error(
                `Invalid pad index: ${index}`
            );
        }

        if (!this.audioCtx) {
            throw new Error(
                "AudioContext has not been initialized."
            );
        }

        const fs =
            require("fs");

        const nodeBuffer =
            fs.readFileSync(
                filePath
            );

        const arrayBuffer =
            nodeBuffer.buffer.slice(
                nodeBuffer.byteOffset,
                nodeBuffer.byteOffset +
                nodeBuffer.byteLength
            );

        const audioBuffer =
            await this.audioCtx.decodeAudioData(
                arrayBuffer
            );

        pad.buffer =
            audioBuffer;

        pad.file =
            filePath;

        pad.playing =
            false;

        pad.active =
            false;

        pad.source =
            null;

        pad.gainNode =
            null;

        this.drawWaveform(
            pad
        );

        this.updateButtonState(
            pad
        );

        return audioBuffer;
    }

    // =========================================================
    // LOAD .SFXL BANK
    // =========================================================

    async loadBank(filePath) {
        try {
            const fs =
                require("fs");

            const path =
                require("path");

            if (!fs.existsSync(filePath)) {
                throw new Error(
                    `SFXL bank does not exist: ${filePath}`
                );
            }

            const json =
                fs.readFileSync(
                    filePath,
                    "utf8"
                );

            const bank =
                JSON.parse(json);

            if (!Array.isArray(bank.pads)) {
                throw new Error(
                    "Invalid SFXL bank: pads array missing."
                );
            }

            // -----------------------------------------------------
            // STOP CURRENT BANK
            // -----------------------------------------------------

            this.stopAll();

            for (let x = 0; x < 24; x++) {
                this.clearPad(x);
            }

            // -----------------------------------------------------
            // BANK INFORMATION
            // -----------------------------------------------------

            this.bankPath =
                filePath;

            this.bankDirectory =
                path.dirname(
                    filePath
                );

            this.bankName =
                bank.name ||
                path.basename(
                    filePath,
                    path.extname(
                        filePath
                    )
                );

            this.bankVersion =
                bank.version || 1;

            // -----------------------------------------------------
            // BANK BPM
            // -----------------------------------------------------

            if (
                bank.bpm !== undefined
            ) {
                this.setBPM(
                    bank.bpm
                );
            }

            // -----------------------------------------------------
            // BEATS PER BAR
            // -----------------------------------------------------

            // -----------------------------------------------------
            // RESET 16 PADS
            // -----------------------------------------------------

            this.pads.forEach(
                (pad) => {

                    if (pad.source) {
                        try {
                            pad.source.stop();
                        } catch (error) {
                            // Already stopped
                        }
                    }

                    pad.buffer =
                        null;

                    pad.source =
                        null;

                    pad.gainNode =
                        null;

                    pad.name =
                        `Pad ${pad.index + 1}`;

                    pad.file =
                        null;

                    pad.volume =
                        1.0;

                    pad.active =
                        false;

                    pad.loop =
                        true;

                    pad.playing =
                        false;

                    if (pad.canvas) {

                        const ctx =
                            pad.canvas.getContext(
                                "2d"
                            );

                        ctx.clearRect(
                            0,
                            0,
                            pad.canvas.width,
                            pad.canvas.height
                        );
                    }

                    this.updateButtonState(
                        pad
                    );
                }
            );

            // -----------------------------------------------------
            // LOAD BANK PADS
            // -----------------------------------------------------

            const loadCount =
                Math.min(
                    bank.pads.length,
                    24
                );

            for (
                let i = 0;
                i < loadCount;
                i++
            ) {
                const data =
                    bank.pads[i];

                const pad =
                    this.pads[i];

                if (!data) {
                    continue;
                }

                pad.name =
                    data.name ||
                    `Pad ${i + 1}`;

                pad.color =
                    data.color ||
                    "inherit";

                pad.volume =
                    Math.max(
                        0,
                        Math.min(
                            1,
                            pad.volume
                        )
                    );

                pad.loop =
                    data.loop !== undefined
                        ? Boolean(
                            data.loop
                        )
                        : true;

                const button = document.getElementById(pad.id)
                button.dataset.label = pad.name;
                button.style.setProperty("--cuecolor", pad.color);
                button.style.display = "block";

                if (!data.file) {

                    console.warn(
                        `[Looper] ${pad.id} has no audio file.`
                    );

                    continue;
                }

                let audioPath =
                    data.file;

                if (
                    !path.isAbsolute(
                        audioPath
                    )
                ) {
                    audioPath =
                        path.resolve(
                            this.bankDirectory,
                            audioPath
                        );
                }

                await this.loadPad(
                    i,
                    audioPath
                );
            }

            return bank;
        } catch (err) {
            const details = "An error occurred while loading the Looper Sound Bank \ndue to the issue found at the following: \n" +
                err + "\n\nPlease check the SFXStudio Looper Index File and check if the audio files exist."
            alert(details, "Load Bank Error!")

            for (let x = 0; x < 24; x++) {
                this.clearPad(x);
            }
        }
    }

    // =========================================================
    // WAVEFORM DRAWING
    // =========================================================

    drawWaveform(pad) {
        if (!pad.canvas) {
            console.warn(
                `[Looper] Canvas missing for ${pad.id}`
            );
            return;
        }

        if (!pad.buffer) {
            return;
        }

        const canvas =
            pad.canvas;

        const ctx =
            canvas.getContext(
                "2d"
            );

        const width =
            canvas.width;

        const height =
            canvas.height;

        ctx.clearRect(
            0,
            0,
            width,
            height
        );

        const channelData =
            pad.buffer.getChannelData(
                0
            );

        const samplesPerPixel =
            Math.max(
                1,
                Math.floor(
                    channelData.length /
                    width
                )
            );

        ctx.beginPath();

        for (
            let x = 0;
            x < width;
            x++
        ) {
            const start =
                x *
                samplesPerPixel;

            const end =
                Math.min(
                    start +
                    samplesPerPixel,
                    channelData.length
                );

            let min = 1;
            let max = -1;

            for (
                let i = start;
                i < end;
                i++
            ) {
                const value =
                    channelData[i];

                if (value < min) {
                    min = value;
                }

                if (value > max) {
                    max = value;
                }
            }

            const y1 =
                (
                    (1 - max) *
                    0.5
                ) *
                height;

            const y2 =
                (
                    (1 - min) *
                    0.5
                ) *
                height;

            ctx.moveTo(
                x,
                y1
            );

            ctx.lineTo(
                x,
                y2
            );
        }

        ctx.stroke();
    }

    // =========================================================
    // STOP EVERYTHING
    // =========================================================

    stopAll() {

        this.pads.forEach(
            (pad) => {

                if (pad.source) {

                    try {
                        pad.source.stop();
                    } catch (error) {
                        // Already stopped
                    }
                }

                pad.source =
                    null;

                pad.gainNode =
                    null;

                pad.startedAt =
                    null;

                pad.playing =
                    false;

                pad.active =
                    false;

                this.updateButtonState(
                    pad
                );

                this.onBarChangeToLooperButton(
                    pad.index,
                    false
                );
            }
        );

        this.stopGlobalTimer();

        this.currentCue = 0;
    }

    // =========================================================
    // CLEAR ONE PAD
    // =========================================================

    clearPad(index) {
        const pad =
            this.pads[index];

        if (!pad) {
            return;
        }

        if (pad.source) {

            try {
                pad.source.stop();
            } catch (error) {
                // Already stopped
            }
        }

        pad.buffer =
            null;

        pad.source =
            null;

        pad.gainNode =
            null;

        pad.startedAt =
            null;

        pad.file =
            null;

        pad.playing =
            false;

        pad.active =
            false;

        pad.color = "inherit";

        const button = document.getElementById(pad.id)
        button.dataset.label = "";
        button.style.setProperty("--cuecolor", pad.color);
        button.style.display = "none";

        if (pad.canvas) {

            const ctx =
                pad.canvas.getContext(
                    "2d"
                );

            ctx.clearRect(
                0,
                0,
                pad.canvas.width,
                pad.canvas.height
            );
        }

        this.updateButtonState(
            pad
        );

        this.onBarChangeToLooperButton(
            index,
            false
        );

        if (!this.hasAudiblePads()) {
            this.stopGlobalTimer();
        }
    }
}