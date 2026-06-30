function createStereoWidth(ctx) {
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const merger2 = ctx.createChannelMerger(2);
    // Gains
    const gainL = ctx.createGain();
    const gainR = ctx.createGain();
    const invertL = ctx.createGain();
    const invertR = ctx.createGain();
    gainL.gain.value = 0;
    gainR.gain.value = 0;
    invertL.gain.value = 0;
    invertR.gain.value = 0;
    // Split stereo
    splitter.connect(gainL, 0);
    splitter.connect(gainR, 1);
    splitter.connect(invertL, 0);
    splitter.connect(invertR, 1);
    // Normal mix
    gainL.connect(merger, 0, 0);
    gainR.connect(merger, 0, 1);
    // Inverted mix
    invertR.connect(merger2, 0, 0);
    invertL.connect(merger2, 0, 1);

    return {
        input: splitter,
        output: {
            normal: merger,
            cancel: merger2
        },
        control: (value, multiplier) => {
            const norm = value;

            gainL.gain.value = (norm);
            gainR.gain.value = (norm);
            const cancel = -(norm);
            invertL.gain.value = cancel;
            invertR.gain.value = cancel;
        }
    };
}

function HighMid(ctx, input, output) {
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2500;
    band.Q.value = 0.7;
    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.value = 6000;
    shelf.gain.value = 2;
    input.connect(band);
    band.connect(shelf);
    shelf.connect(output);
}


function LFENode(ctx, input, output) {
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 80;
    const boost = ctx.createBiquadFilter();
    boost.type = "lowshelf";
    boost.frequency.value = 40;
    boost.gain.value = 6;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    input.connect(lp);
    lp.connect(boost);
    boost.connect(comp);
    comp.connect(output);
}


function createDummyImpulse(ctx, duration = 2.0) {
    const rate = ctx.sampleRate;
    const length = rate * duration;
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
        const data = buffer.getChannelData(ch);
        for (let i = 0; i < length; i++) {
            // noise decay (fake room)
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
        }
    }
    return buffer;
}

async function ReverbRoom(ctx, input, output, impulseBuffer = null) {
    const convolver = ctx.createConvolver();
    const response = await fetch("system/convolver/rearsurround.wav");
    const arrayBuffer = await response.arrayBuffer();
    const irBuffer = await ctx.decodeAudioData(arrayBuffer);
    convolver.buffer = irBuffer || createDummyImpulse(ctx, 2.0);
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    wet.gain.value = 0.4;
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(output);
}

async function ReverbFar(ctx, input, output) {
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.04;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 4000;
    const convolver = ctx.createConvolver();

    const response = await fetch("system/convolver/sidesurround.wav");
    const arrayBuffer = await response.arrayBuffer();
    const irBuffer = await ctx.decodeAudioData(arrayBuffer);
    convolver.buffer = irBuffer || createDummyImpulse(ctx, 2.0);
    const wet = ctx.createGain();
    const dry = ctx.createGain();
    wet.gain.value = 0.4;
    input.connect(delay);
    delay.connect(lp);
    lp.connect(convolver);
    convolver.connect(wet);
    wet.connect(output);
}


function TrueSurround(ctx, input, output) {
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(8);
    const inputGain = ctx.createGain();
    const inputRawGain = ctx.createGain();
    inputRawGain.gain.value = 0;
    let enabled = true;

    /* =========================
       ENABLE SWITCH
    ========================== */

    function enableEmulation(state = true) {
        enabled = state;
        inputGain.gain.setTargetAtTime(
            state ? 1 : 0,
            ctx.currentTime,
            0.2
        );

        inputRawGain.gain.setTargetAtTime(
            state ? 0 : 1,
            ctx.currentTime,
            0.2
        );
    }

    /* =========================
       INPUT → TRUE STEREO SPLIT
    ========================== */

    input.connect(inputGain);
    input.connect(inputRawGain);
    inputGain.connect(splitter);
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 1);

    /* =========================
       2: HIGH MID (mono-safe)
    ========================== */

    const hmOut = ctx.createGain();
    hmOut.gain.value = 0.5;
    HighMid(ctx, inputGain, hmOut);
    hmOut.connect(merger, 0, 2);

    /* =========================
       3: LFE
    ========================== */

    const lfeOut = ctx.createGain();
    lfeOut.gain.value = 0.38;
    LFENode(ctx, inputGain, lfeOut);
    lfeOut.connect(merger, 0, 3);

    /* =========================
       4–5: WIDE + ROOM (STEREO SAFE)
    ========================== */

    const wideOut = ctx.createChannelSplitter(2);

    const side_width = createStereoWidth(ctx);
    side_width.control(0.75); // default width
    inputGain.connect(side_width.input);
    side_width.output.normal.connect(wideOut);
    side_width.output.cancel.connect(wideOut);

    const roomOut = ctx.createGain();
    roomOut.gain.value = 0.05;
    ReverbRoom(ctx, inputGain, roomOut);

    // keep stereo spread instead of mono collapse
    wideOut.connect(merger, 0, 4);
    wideOut.connect(merger, 1, 5);

    roomOut.connect(merger, 0, 4);
    roomOut.connect(merger, 0, 5);

    /* =========================
       6–7: FAR REVERB (STEREO SAFE)
    ========================== */

    const farOut = ctx.createGain();
    farOut.gain.value = 0.15;
    ReverbFar(ctx, inputGain, farOut);

    farOut.connect(merger, 0, 6);
    farOut.connect(merger, 0, 7);

    /* =========================
       OUTPUT
    ========================== */

    merger.connect(output);
    inputRawGain.connect(output);

    /* =========================
       PUBLIC API
    ========================== */

    return {
        enableEmulation,
        isEnabled() {
            return enabled;
        },
        setWidth(value) {
            side_width.control(value);
        },
        setRoomLevel(value) {
            roomOut.gain.setTargetAtTime(
                value * 0.10,
                ctx.currentTime,
                0.2
            );
        },
        setFarLevel(value) {
            farOut.gain.setTargetAtTime(
                value * 0.30,
                ctx.currentTime,
                0.2
            );
        },
        setLFELevel(value) {
            lfeOut.gain.setTargetAtTime(
                value * 0.50,
                ctx.currentTime,
                0.2
            );
        },
        setHighMidLevel(value) {
            hmOut.gain.setTargetAtTime(
                value * 0.50,
                ctx.currentTime,
                0.2
            );
        }
    };
}