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
            side: merger2
        },
        control: (value, multiplier) => {
            const norm = value * multiplier;

            gainL.gain.value = (value);
            gainR.gain.value = (value);
            const cancel = -(norm);
            invertL.gain.value = cancel;
            invertR.gain.value = cancel;
        }
    };
}