class Equalizer {
  constructor(ctx, inputnode, outputnode) {
    this.ctx = ctx;
    this.inputnode = inputnode;
    this.outputnode = outputnode;

    this.channelCount = 8;
    this.bandCount = 12;

    this.bypassed = false;

    /*
      12 EQ bands.

      Change these frequencies to match your existing EQ
      if you already have a specific frequency layout.
    */
    this.frequencies = [
      31.5,
      63,
      125,
      200,
      250,
      500,
      750,
      1000,
      2000,
      4000,
      8000,
      16000
    ];

    /*
      Input/output channel configuration
    */
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.input.channelCount = 8;
    this.input.channelCountMode = "explicit";
    this.input.channelInterpretation = "speakers";

    this.output.channelCount = 8;
    this.output.channelCountMode = "explicit";
    this.output.channelInterpretation = "speakers";


    /*
      Main 8-channel splitter
    */
    this.splitter = ctx.createChannelSplitter(8);

    /*
      Main 8-channel merger
    */
    this.merger = ctx.createChannelMerger(8);


    /*
      Connect external input
    */
    this.inputnode.connect(this.input);


    /*
      Split all 8 channels
    */
    this.input.connect(this.splitter);


    /*
      Store filters as:

      this.filters[channel][band]
    */
    this.filters = [];


    /*
      Create 12-band EQ for every channel
    */
    for (let channel = 0; channel < this.channelCount; channel++) {

      this.filters[channel] = [];

      let previousNode = null;

      for (let band = 0; band < this.bandCount; band++) {

        const filter = ctx.createBiquadFilter();

        /*
          First band = lowshelf
          Last band = highshelf
          Middle bands = peaking
        */

        if (band === 0) {
          filter.type = "lowshelf";
        } else if (band === this.bandCount - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
        }

        filter.frequency.value =
          this.frequencies[band];

        filter.Q.value = 1;

        filter.gain.value = 0;


        this.filters[channel][band] = filter;


        /*
          Connect filter chain
        */
        if (previousNode) {
          previousNode.connect(filter);
        }

        previousNode = filter;
      }


      /*
        Connect channel input into
        first EQ band
      */
      this.splitter.connect(
        this.filters[channel][0],
        channel
      );


      /*
        Connect final EQ band into
        corresponding output channel
      */
      previousNode.connect(
        this.merger,
        0,
        channel
      );
    }


    /*
      Merger → output
    */
    this.merger.connect(this.output);


    /*
      Initially active
    */
    this.output.connect(this.outputnode);


    /*
      Bypass path

      This is kept disconnected until
      Bypass() is called.
    */
    this.bypassInput = ctx.createGain();
    this.bypassOutput = ctx.createGain();

    this.bypassInput.channelCount = 8;
    this.bypassInput.channelCountMode = "explicit";
    this.bypassInput.channelInterpretation = "speakers";

    this.bypassOutput.channelCount = 8;
    this.bypassOutput.channelCountMode = "explicit";
    this.bypassOutput.channelInterpretation = "speakers";


    /*
      Direct bypass path
    */
    this.input.connect(this.bypassInput);
    this.bypassInput.connect(this.bypassOutput);


    /*
      Disconnect bypass path initially
    */
    this.bypassInput.disconnect();
    this.bypassOutput.disconnect();
  }


  /*
    ============================================================
    BYPASS
    ============================================================
  */

  Bypass() {

    if (this.bypassed) {
      return;
    }

    /*
      Remove EQ output from destination
    */
    this.output.disconnect(this.outputnode);


    /*
      Connect direct input → output
    */
    this.bypassInput.connect(this.bypassOutput);
    this.bypassOutput.connect(this.outputnode);


    this.bypassed = true;
  }


  /*
    ============================================================
    UNBYPASS
    ============================================================
  */

  Unbypass() {

    if (!this.bypassed) {
      return;
    }

    /*
      Remove direct bypass path
    */
    this.bypassInput.disconnect(this.bypassOutput);
    this.bypassOutput.disconnect(this.outputnode);


    /*
      Restore EQ
    */
    this.output.connect(this.outputnode);


    this.bypassed = false;
  }


  /*
    ============================================================
    SET BAND GAIN
    ============================================================
  */

  setGain(band, value) {

    if (
      band < 0 ||
      band >= this.bandCount
    ) {
      return;
    }

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.filters[channel][band].gain.value = value;
    }
  }


  /*
    ============================================================
    SET BAND FREQUENCY
    ============================================================
  */

  setFrequency(band, frequency) {

    if (
      band < 0 ||
      band >= this.bandCount
    ) {
      return;
    }

    this.frequencies[band] = frequency;

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.filters[channel][band]
        .frequency.value = frequency;
    }
  }


  /*
    ============================================================
    SET BAND Q
    ============================================================
  */

  setQ(band, q) {

    if (
      band < 0 ||
      band >= this.bandCount
    ) {
      return;
    }

    for (let channel = 0; channel < this.channelCount; channel++) {

      this.filters[channel][band]
        .Q.value = q;
    }
  }


  /*
    ============================================================
    SET CHANNEL-SPECIFIC GAIN
    ============================================================
  */

  setChannelGain(channel, band, value) {

    if (
      channel < 0 ||
      channel >= this.channelCount
    ) {
      return;
    }

    if (
      band < 0 ||
      band >= this.bandCount
    ) {
      return;
    }

    this.filters[channel][band]
      .gain.value = value;
  }


  /*
    ============================================================
    GET BAND GAIN
    ============================================================
  */

  getGain(band) {

    if (
      band < 0 ||
      band >= this.bandCount
    ) {
      return 0;
    }

    return this.filters[0][band]
      .gain.value;
  }


  /*
    ============================================================
    RESET EQ
    ============================================================
  */

  reset() {

    for (let channel = 0; channel < this.channelCount; channel++) {

      for (let band = 0; band < this.bandCount; band++) {

        this.filters[channel][band]
          .gain.value = 0;
      }
    }
  }
}