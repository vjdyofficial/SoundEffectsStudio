function createStereoEnhancer(ctx) {

  /* =========================
     INPUT (UP TO 7.1)
  ========================== */

  const amp = ctx.createGain();

  amp.gain.value = 1;
  amp.channelCount = 8;
  amp.channelCountMode = "explicit";
  amp.channelInterpretation = "speakers";

  const splitter =
    ctx.createChannelSplitter(8);

  amp.connect(splitter);


  /* =========================
     SURROUND → STEREO FOLD
  ========================= */

  const downmixMerger =
    ctx.createChannelMerger(2);


  function g(v) {

    const n =
      ctx.createGain();

    n.gain.value =
      v;

    return n;
  }


  /* =========================
     DOWNMIX CHANNEL GAINS

     0 = L
     1 = R
     2 = C
     3 = LFE
     4 = LS
     5 = RS
     6 = LB
     7 = RB
  ========================= */

  const downmixNodes = {

    L:   g(1.0),
    R:   g(1.0),

    C:   g(0),
    LFE: g(0),

    LS:  g(0),
    RS:  g(0),

    LB:  g(0),
    RB:  g(0)

  };


  /* =========================
     SPLIT INPUT CHANNELS
  ========================= */

  splitter.connect(
    downmixNodes.L,
    0
  );

  splitter.connect(
    downmixNodes.R,
    1
  );

  splitter.connect(
    downmixNodes.C,
    2
  );

  splitter.connect(
    downmixNodes.LFE,
    3
  );

  splitter.connect(
    downmixNodes.LS,
    4
  );

  splitter.connect(
    downmixNodes.RS,
    5
  );

  splitter.connect(
    downmixNodes.LB,
    6
  );

  splitter.connect(
    downmixNodes.RB,
    7
  );


  /* =========================
     LEFT FOLD

     L
     C
     LFE
     LS
     LB
  ========================= */

  downmixNodes.L.connect(
    downmixMerger,
    0,
    0
  );

  downmixNodes.C.connect(
    downmixMerger,
    0,
    0
  );

  downmixNodes.LFE.connect(
    downmixMerger,
    0,
    0
  );

  downmixNodes.LS.connect(
    downmixMerger,
    0,
    0
  );

  downmixNodes.LB.connect(
    downmixMerger,
    0,
    0
  );


  /* =========================
     RIGHT FOLD

     R
     C
     LFE
     RS
     RB
  ========================= */

  downmixNodes.R.connect(
    downmixMerger,
    0,
    1
  );

  downmixNodes.C.connect(
    downmixMerger,
    0,
    1
  );

  downmixNodes.LFE.connect(
    downmixMerger,
    0,
    1
  );

  downmixNodes.RS.connect(
    downmixMerger,
    0,
    1
  );

  downmixNodes.RB.connect(
    downmixMerger,
    0,
    1
  );


  /* =========================
     ORIGINAL / ADJUST PATH
  ========================= */

  const gainOrig =
    ctx.createGain();

  const gainAdjust =
    ctx.createGain();

  const gainAdjustThr =
    ctx.createGain();


  gainOrig.gain.value =
    1;

  gainAdjust.gain.value =
    0;

  gainAdjustThr.gain.value =
    1;


  /* =========================
     ORIGINAL DOWNMIX
  ========================= */

  downmixMerger.connect(
    gainOrig
  );


  /* =========================
     ADJUST DOWNMIX
  ========================= */

  downmixMerger.connect(
    gainAdjustThr
  );

  gainAdjustThr.connect(
    gainAdjust
  );


  /* =========================
     RETURN OBJECT
  ========================= */

  return {

    /* =======================
       INPUT
    ======================= */

    input:
      amp,


    /* =======================
       OUTPUT
    ======================= */

    output: {

      /*
       * Main stereo downmix
       */
      normal:
        downmixMerger,

      /*
       * Original downmix
       */
      orig:
        gainOrig,

      /*
       * Adjusted downmix
       */
      adjust:
        gainAdjust

    },


    /* =======================
       DOWNMIX CONTROLS
    ======================= */

    downmix: {

      get L() {
        return downmixNodes.L.gain.value;
      },

      set L(v) {
        downmixNodes.L.gain.value =
          Number(v);
      },


      get R() {
        return downmixNodes.R.gain.value;
      },

      set R(v) {
        downmixNodes.R.gain.value =
          Number(v);
      },


      get C() {
        return downmixNodes.C.gain.value;
      },

      set C(v) {
        downmixNodes.C.gain.value =
          Number(v);
      },


      get LFE() {
        return downmixNodes.LFE.gain.value;
      },

      set LFE(v) {
        downmixNodes.LFE.gain.value =
          Number(v);
      },


      get LS() {
        return downmixNodes.LS.gain.value;
      },

      set LS(v) {
        downmixNodes.LS.gain.value =
          Number(v);
      },


      get RS() {
        return downmixNodes.RS.gain.value;
      },

      set RS(v) {
        downmixNodes.RS.gain.value =
          Number(v);
      },


      get LB() {
        return downmixNodes.LB.gain.value;
      },

      set LB(v) {
        downmixNodes.LB.gain.value =
          Number(v);
      },


      get RB() {
        return downmixNodes.RB.gain.value;
      },

      set RB(v) {
        downmixNodes.RB.gain.value =
          Number(v);
      }

    },


    /* =======================
       CONTROL
    ======================= */

    control: (value, multiplier) => {

      /*
       * Original downmix level
       */

      gainOrig.gain.value =
        Number(reduceSlider.max) -
        Number(value);


      /*
       * Adjusted downmix level
       */

      gainAdjust.gain.value =
        Number(value);


      /*
       * Adjustment multiplier
       */

      gainAdjustThr.gain.value =
        Number(multiplier);


      /* =====================
         INDICATOR
      ===================== */

      const indicator =
        document.getElementById(
          "srsIndicator"
        );

      if (indicator) {

        indicator.style.opacity =
          Number(reduceSlider.value) >= 0.01
            ? 1
            : 0.25;

      }

    }

  };

}

function ExpandSurround(ctx, input, output) {

  /* =========================
     INPUT / OUTPUT
     
     0 = L
     1 = R
     2 = C
     3 = LFE
     4 = LS
     5 = RS
     6 = LB
     7 = RB
  ========================== */

  const splitter =
    ctx.createChannelSplitter(8);

  const merger =
    ctx.createChannelMerger(8);

  input.connect(splitter);


  /* =========================
     CHANNEL GAINS
  ========================== */

  function g(v) {

    const node =
      ctx.createGain();

    node.gain.value = v;

    return node;
  }


  const expandNodes = {

    L:   g(1.0),
    R:   g(1.0),

    C:   g(1.0),
    LFE: g(1.0),

    LS:  g(1.0),
    RS:  g(1.0),

    LB:  g(1.0),
    RB:  g(1.0)

  };


  /* =========================
     CHANNEL 0 → 0
  ========================== */


  /* =========================
     CHANNEL 2 → 2
  ========================== */

  splitter.connect(
    expandNodes.C,
    2
  );

  expandNodes.C.connect(
    merger,
    0,
    2
  );


  /* =========================
     CHANNEL 3 → 3
  ========================== */

  splitter.connect(
    expandNodes.LFE,
    3
  );

  expandNodes.LFE.connect(
    merger,
    0,
    3
  );


  /* =========================
     CHANNEL 4 → 4
  ========================== */

  splitter.connect(
    expandNodes.LS,
    4
  );

  expandNodes.LS.connect(
    merger,
    0,
    4
  );


  /* =========================
     CHANNEL 5 → 5
  ========================== */

  splitter.connect(
    expandNodes.RS,
    5
  );

  expandNodes.RS.connect(
    merger,
    0,
    5
  );


  /* =========================
     CHANNEL 6 → 6
  ========================== */

  splitter.connect(
    expandNodes.LB,
    6
  );

  expandNodes.LB.connect(
    merger,
    0,
    6
  );


  /* =========================
     CHANNEL 7 → 7
  ========================== */

  splitter.connect(
    expandNodes.RB,
    7
  );

  expandNodes.RB.connect(
    merger,
    0,
    7
  );


  /* =========================
     OUTPUT
  ========================== */

  merger.connect(output);


  /* =========================
     RETURN
  ========================== */

  return {

    input: input,

    output: merger,


    /* =======================
       ADJUSTABLE GAINS
    ======================= */

    expand: {

      get L() {
        return expandNodes.L.gain.value;
      },

      set L(v) {
        expandNodes.L.gain.value =
          Number(v);
      },


      get R() {
        return expandNodes.R.gain.value;
      },

      set R(v) {
        expandNodes.R.gain.value =
          Number(v);
      },


      get C() {
        return expandNodes.C.gain.value;
      },

      set C(v) {
        expandNodes.C.gain.value =
          Number(v);
      },


      get LFE() {
        return expandNodes.LFE.gain.value;
      },

      set LFE(v) {
        expandNodes.LFE.gain.value =
          Number(v);
      },


      get LS() {
        return expandNodes.LS.gain.value;
      },

      set LS(v) {
        expandNodes.LS.gain.value =
          Number(v);
      },


      get RS() {
        return expandNodes.RS.gain.value;
      },

      set RS(v) {
        expandNodes.RS.gain.value =
          Number(v);
      },


      get LB() {
        return expandNodes.LB.gain.value;
      },

      set LB(v) {
        expandNodes.LB.gain.value =
          Number(v);
      },


      get RB() {
        return expandNodes.RB.gain.value;
      },

      set RB(v) {
        expandNodes.RB.gain.value =
          Number(v);
      }

    }

  };
}