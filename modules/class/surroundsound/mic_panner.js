class MicSurroundPan {

    constructor(audioCtx, input, output) {

        this.input = input;
        this.output = output;

        this.splitter = audioCtx.createChannelSplitter(2);
        this.merger = audioCtx.createChannelMerger(8);

        this.leftGains = Array.from(
            { length: 8 },
            () => audioCtx.createGain()
        );

        this.rightGains = Array.from(
            { length: 8 },
            () => audioCtx.createGain()
        );

        input.connect(this.splitter);

        for(let i = 0; i < 8; i++){

            // Left microphone
            this.splitter.connect(this.leftGains[i], 0);

            // Right microphone
            this.splitter.connect(this.rightGains[i], 1);

            // Merge both into the same surround channel
            this.leftGains[i].connect(this.merger, 0, i);
            this.rightGains[i].connect(this.merger, 0, i);

        }

        this.merger.connect(output);

        this.setAngle(0);

    }

    setAngle(angle){

        angle = ((angle % 360) + 360) % 360;

        const rad = angle * Math.PI / 180;

        const front = Math.max(0, Math.cos(rad));
        const rear  = Math.max(0, -Math.cos(rad));

        const right = Math.max(0, Math.sin(rad));
        const left  = Math.max(0, -Math.sin(rad));

        const frontLeft  = front * (1 - right);
        const frontRight = front * (1 - left);
        const rearLeft   = rear * (1 - right);
        const rearRight  = rear * (1 - left);

        const leftMap = [
            frontLeft,      // CH0 Front Left
            0,              // CH1 Front Right
            0,              // CH2 Center
            0,              // CH3 LFE
            rearLeft,       // CH4 Rear Left
            0,              // CH5 Rear Right
            left,           // CH6 Side Left
            0               // CH7 Side Right
        ];

        const rightMap = [
            0,              // CH0 Front Left
            frontRight,     // CH1 Front Right
            0,              // CH2 Center
            0,              // CH3 LFE
            0,              // CH4 Rear Left
            rearRight,      // CH5 Rear Right
            0,              // CH6 Side Left
            right           // CH7 Side Right
        ];

        for(let i = 0; i < 8; i++){

            this.leftGains[i].gain.value = leftMap[i];
            this.rightGains[i].gain.value = rightMap[i];

        }

    }

}