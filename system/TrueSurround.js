function createStereoWidth(ctx, left, right) {
    const splitter = ctx.createChannelSplitter(8);
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
    splitter.connect(gainL, left);
    splitter.connect(gainR, right);
    splitter.connect(invertL, left);
    splitter.connect(invertR, right);
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

function TrueSurround(ctx, input, output) {
    const splitter = ctx.createChannelSplitter(8);
    const merger = ctx.createChannelMerger(8);
    const inputGain = ctx.createGain();
    const inputGain2 = ctx.createGain();
    const inputGain3 = ctx.createGain();
    const inputRawGain = ctx.createGain();
    inputRawGain.gain.value = 1;
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
        inputGain2.gain.setTargetAtTime(
            state ? 1 : 0,
            ctx.currentTime,
            0.2
        );
        inputGain3.gain.setTargetAtTime(
            state ? 1 : 0,
            ctx.currentTime,
            0.2
        );
    }

    /* =========================
       INPUT → TRUE STEREO SPLIT
    ========================== */

    input.connect(inputGain);
    input.connect(inputGain2);
    input.connect(inputGain3);
    input.connect(inputRawGain);
    inputGain.connect(splitter);
    inputGain2.connect(splitter);
    inputGain3.connect(splitter);

    /* =========================
       4–5: WIDE + ROOM (STEREO SAFE)
    ========================== */

    const wideOut = ctx.createChannelSplitter(2);
    const wideOut2 = ctx.createChannelSplitter(2);
    const wideOut3 = ctx.createChannelSplitter(2);

    const front_width = createStereoWidth(ctx, 0, 1);
    front_width.control(1); // default width

    const back_width = createStereoWidth(ctx, 4, 5);
    back_width.control(1); // default width

    const side_width = createStereoWidth(ctx, 6, 7);
    side_width.control(0.75); // default width

    inputGain3.connect(back_width.input);
    inputGain2.connect(front_width.input);
    inputGain.connect(side_width.input);
    side_width.output.normal.connect(wideOut);
    side_width.output.cancel.connect(wideOut);
    front_width.output.normal.connect(wideOut3);
    front_width.output.cancel.connect(wideOut3);
    back_width.output.normal.connect(wideOut2);
    back_width.output.cancel.connect(wideOut2);

    // keep stereo spread instead of mono collapse
    wideOut.connect(merger, 0, 6);
    wideOut.connect(merger, 1, 7);
    wideOut2.connect(merger, 0, 4);
    wideOut2.connect(merger, 1, 5);
    wideOut3.connect(merger, 0, 0);
    wideOut3.connect(merger, 1, 1);

    /* =========================
       6–7: FAR REVERB (STEREO SAFE)
    ========================== */

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
        setWidth(v1 = 1, v2 = 1, v3 = 1) {
            front_width.control(v1);
            back_width.control(v2);
            side_width.control(v3);
        },
    };
}