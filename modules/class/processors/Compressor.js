class Compressor {
  constructor(ctx, inputnode, outputnode) {
    this.ctx = ctx;
    this.inputnode = inputnode;
    this.outputnode = outputnode;

    this.channelCount = 8;

    /* =========================================================
       INPUT
    ========================================================= */

    this.input = ctx.createGain();

    this.input.channelCount = 8;
    this.input.channelCountMode = "explicit";
    this.input.channelInterpretation = "speakers";


    /* =========================================================
       OUTPUT
    ========================================================= */

    this.output = ctx.createGain();

    this.output.channelCount = 8;
    this.output.channelCountMode = "explicit";
    this.output.channelInterpretation = "speakers";


    /* =========================================================
       8 CHANNEL SPLITTER / MERGER
    ========================================================= */

    this.splitter =
      ctx.createChannelSplitter(8);

    this.merger =
      ctx.createChannelMerger(8);


    /* =========================================================
       CONNECT INPUT
    ========================================================= */

    this.inputnode.connect(this.input);

    this.input.connect(this.splitter);


    /* =========================================================
       CREATE 8 COMPRESSORS
    ========================================================= */

    this.compressors = [];

    for (let channel = 0; channel < this.channelCount; channel++) {

      const compressor =
        ctx.createDynamicsCompressor();

      /*
        Default compressor settings.

        These can be changed using the methods below.
      */

      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;


      this.compressors[channel] =
        compressor;


      /* -------------------------------------------------------
         Channel → Compressor
      ------------------------------------------------------- */

      this.splitter.connect(
        compressor,
        channel
      );


      /* -------------------------------------------------------
         Compressor → Same Output Channel
      ------------------------------------------------------- */

      compressor.connect(
        this.merger,
        0,
        channel
      );

    }


    /* =========================================================
       MERGER → OUTPUT
    ========================================================= */

    this.merger.connect(
      this.output
    );


    this.output.connect(
      this.outputnode
    );
  }


  /* ===========================================================
     SET THRESHOLD
  =========================================================== */

  setThreshold(value) {

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.compressors[channel]
        .threshold.value = value;

    }

  }


  /* ===========================================================
     SET KNEE
  =========================================================== */

  setKnee(value) {

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.compressors[channel]
        .knee.value = value;

    }

  }


  /* ===========================================================
     SET RATIO
  =========================================================== */

  setRatio(value) {

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.compressors[channel]
        .ratio.value = value;

    }

  }


  /* ===========================================================
     SET ATTACK
  =========================================================== */

  setAttack(value) {

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.compressors[channel]
        .attack.value = value;

    }

  }


  /* ===========================================================
     SET RELEASE
  =========================================================== */

  setRelease(value) {

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.compressors[channel]
        .release.value = value;

    }

  }


  /* ===========================================================
     SET ALL PARAMETERS
  =========================================================== */

  setParameters({
    threshold,
    knee,
    ratio,
    attack,
    release
  } = {}) {

    for (let channel = 0; channel < this.channelCount; channel++) {

      const compressor =
        this.compressors[channel];


      if (threshold !== undefined) {
        compressor.threshold.value =
          threshold;
      }


      if (knee !== undefined) {
        compressor.knee.value =
          knee;
      }


      if (ratio !== undefined) {
        compressor.ratio.value =
          ratio;
      }


      if (attack !== undefined) {
        compressor.attack.value =
          attack;
      }


      if (release !== undefined) {
        compressor.release.value =
          release;
      }

    }

  }


  /* ===========================================================
     CHANNEL-SPECIFIC PARAMETERS
  =========================================================== */

  setChannelParameter(
    channel,
    parameter,
    value
  ) {

    if (
      channel < 0 ||
      channel >= this.channelCount
    ) {
      return;
    }


    const compressor =
      this.compressors[channel];


    if (!(parameter in compressor)) {
      return;
    }


    compressor[parameter].value =
      value;

  }


  /* ===========================================================
     GET REDUCTION
     
     Returns the current gain reduction
     for one channel.
  =========================================================== */

  getReduction(channel = 0) {

    if (
      channel < 0 ||
      channel >= this.channelCount
    ) {
      return 0;
    }


    return this.compressors[channel]
      .reduction.value;
  }


  /* ===========================================================
     GET ALL REDUCTIONS
  =========================================================== */

  getReductions() {

    return this.compressors.map(
      compressor =>
        compressor.reduction.value
    );

  }


  /* ===========================================================
     RESET TO DEFAULT
  =========================================================== */

  reset() {

    for (let channel = 0; channel < this.channelCount; channel++) {

      const compressor =
        this.compressors[channel];


      compressor.threshold.value = -24;
      compressor.knee.value = 30;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;

    }

  }
}