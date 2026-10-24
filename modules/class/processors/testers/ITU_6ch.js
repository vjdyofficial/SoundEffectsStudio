class ITUSurroundTest {
  constructor(audioCtx, outputNode) {
    this.audioCtx = audioCtx;
    this.outputNode = outputNode;

    this.output = null;
    this.gain = null;

    this.oscillators = [];
    this.timers = [];

    this.running = false;

    this.onend = () => {};
  }

  // ============================================================
  // START
  // ============================================================

  start() {
    if (this.running) return;

    this.running = true;

    // Resume AudioContext if needed
    if (this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }

    // --------------------------------------------------------
    // 5.1 OUTPUT
    //
    // 0 = L
    // 1 = R
    // 2 = C
    // 3 = LFE
    // 4 = LS
    // 5 = RS
    // --------------------------------------------------------

    this.output = this.audioCtx.createChannelMerger(8);

    // Master level
    this.gain = this.audioCtx.createGain();

    // -18 dBFS
    this.gain.gain.value = this.dbToGain(-18);

    // 5.1 merger -> gain -> FaderNode
    this.output.connect(this.gain);
    this.gain.connect(this.outputNode);

    // Start BLITS
    this.playChannelIdent();
  }

  // ============================================================
  // SECTION 1
  // BLITS 5.1 CHANNEL IDENTIFICATION
  //
  // L   = 880 Hz
  // R   = 880 Hz
  // C   = 1320 Hz
  // LFE = 82.5 Hz
  // LS  = 660 Hz
  // RS  = 660 Hz
  //
  // 600 ms tone
  // 200 ms silence
  // ============================================================

  playChannelIdent() {
    if (!this.running) return;

    const channels = [
      {
        name: "Left",
        channel: 0,
        frequency: 880,
      },
      {
        name: "Right",
        channel: 1,
        frequency: 880,
      },
      {
        name: "Center",
        channel: 2,
        frequency: 1320,
      },
      {
        name: "LFE",
        channel: 3,
        frequency: 82.5,
      },
      {
        name: "Left Surround",
        channel: 4,
        frequency: 660,
      },
      {
        name: "Right Surround",
        channel: 5,
        frequency: 660,
      },
      {
        name: "Side Left Surround",
        channel: 6,
        frequency: 460,
      },
      {
        name: "Side Right Surround",
        channel: 7,
        frequency: 460,
      }
    ];

    let index = 0;

    const next = () => {
      if (!this.running) return;

      if (index >= channels.length) {
        // 6 × 800 ms = 4.8 seconds

        this.timers.push(
          setTimeout(() => {
            this.playStereoIdent();
          }, 0),
        );

        return;
      }

      const data = channels[index];

      console.log(`[BLITS] ${data.name}: ${data.frequency} Hz`);

      this.playTone(data.channel, data.frequency, 600);

      index++;

      // 600 ms tone + 200 ms gap
      this.timers.push(setTimeout(next, 800));
    };

    next();
  }

  // ============================================================
  // SECTION 2
  // STEREO IDENTIFICATION
  //
  // Right  = continuous 1 kHz
  // Left   = 1 kHz with interruptions
  //
  // 5.4 seconds
  // ============================================================

  playStereoIdent() {
    if (!this.running) return;

    console.log("[BLITS] Stereo identification");

    const now = this.audioCtx.currentTime;

    // --------------------------------------------------------
    // RIGHT - CONTINUOUS 1 kHz
    // --------------------------------------------------------

    const rightOsc = this.audioCtx.createOscillator();

    rightOsc.type = "sine";
    rightOsc.frequency.value = 1000;

    rightOsc.connect(this.output, 0, 1);

    rightOsc.start(now);
    rightOsc.stop(now + 5.4);

    this.oscillators.push(rightOsc);

    // --------------------------------------------------------
    // LEFT - INTERRUPTED 1 kHz
    // --------------------------------------------------------

    const leftGain = this.audioCtx.createGain();

    leftGain.gain.setValueAtTime(1, now);

    // First interruption
    leftGain.gain.setValueAtTime(0, now + 1.0);
    leftGain.gain.setValueAtTime(1, now + 1.3);

    // Second interruption
    leftGain.gain.setValueAtTime(0, now + 1.6);
    leftGain.gain.setValueAtTime(1, now + 1.9);

    // Third interruption
    leftGain.gain.setValueAtTime(0, now + 2.2);
    leftGain.gain.setValueAtTime(1, now + 2.5);

    // Fourth interruption
    leftGain.gain.setValueAtTime(0, now + 2.8);
    leftGain.gain.setValueAtTime(1, now + 3.1);

    const leftOsc = this.audioCtx.createOscillator();

    leftOsc.type = "sine";
    leftOsc.frequency.value = 1000;

    leftOsc.connect(leftGain);
    leftGain.connect(this.output, 0, 0);

    leftOsc.start(now);
    leftOsc.stop(now + 5.4);

    this.oscillators.push(leftOsc);

    // Clean up after section
    this.timers.push(
      setTimeout(() => {
        if (!this.running) return;

        this.stopCurrentOscillators();

        this.playPhaseCheck();
      }, 5400),
    );
  }

  // ============================================================
  // SECTION 3
  // PHASE CHECK
  //
  // ALL CHANNELS
  // 2 kHz
  // -24 dBFS
  // 3 seconds
  // ============================================================

  playPhaseCheck() {
    if (!this.running) return;

    console.log("[BLITS] Phase check");

    // Change master level from -18 dBFS to -24 dBFS
    this.gain.gain.setValueAtTime(
      this.dbToGain(-24),
      this.audioCtx.currentTime,
    );

    const now = this.audioCtx.currentTime;

    // Create one oscillator for each channel
    for (let channel = 0; channel < 6; channel++) {
      if (channel !== 3) {
        const osc = this.audioCtx.createOscillator();

        osc.type = "sine";
        osc.frequency.value = 2000;

        // IMPORTANT:
        // ChannelMerger has 6 INPUTS.
        osc.connect(this.output, 0, channel);

        osc.start(now);
        osc.stop(now + 3);

        this.oscillators.push(osc);
      }
    }

    this.timers.push(
      setTimeout(() => {
        if (!this.running) return;

        this.stopCurrentOscillators();

        // Restore -18 dBFS
        this.gain.gain.setValueAtTime(
          this.dbToGain(-18),
          this.audioCtx.currentTime,
        );

        // Repeat BLITS
        this.playPhaseCheckLast();
      }, 3000),
    );
  }

  playPhaseCheckLast() {
    if (!this.running) return;

    console.log("[BLITS] Phase check");

    const now = this.audioCtx.currentTime;

    // ------------------------------------------------------------
    // BLITS SECTION 3
    //
    // All channels:
    // 2 kHz
    // -24 dBFS
    // 3 seconds
    //
    // Followed by:
    // 200 ms silence
    //
    // Total section = 3.2 seconds
    // ------------------------------------------------------------

    this.gain.gain.setValueAtTime(this.dbToGain(-24), now);

    // Create 2 kHz oscillator on every 5.1 channel
    for (let channel = 0; channel < 6; channel++) {
      const osc = this.audioCtx.createOscillator();

      osc.type = "sine";
      osc.frequency.setValueAtTime(channel == 3 ? 100 : 1000, now);

      // 0 = L
      // 1 = R
      // 2 = C
      // 3 = LFE
      // 4 = LS
      // 5 = RS
      osc.connect(this.output, 0, channel);

      osc.start(now);

      // Exactly 3 seconds of tone
      osc.stop(now + 3.0);

      this.oscillators.push(osc);
    }

    // ------------------------------------------------------------
    // Wait for:
    //
    // 3.000 seconds = tone
    // 0.200 seconds = silence
    //
    // Total = 3.200 seconds
    // ------------------------------------------------------------

    this.timers.push(
      setTimeout(() => {
        if (!this.running) return;

        this.stopCurrentOscillators();

        console.log("[BLITS] Phase check complete");

        // Restore normal BLITS level
        this.gain.gain.setValueAtTime(
          this.dbToGain(-18),
          this.audioCtx.currentTime,
        );

        // End the test
        this.destroy();
      }, 5000),
    );
  }

  // ============================================================
  // PLAY ONE CHANNEL TONE
  // ============================================================

  playTone(channel, frequency, duration) {
    if (!this.running) return;

    const osc = this.audioCtx.createOscillator();

    osc.type = "sine";
    osc.frequency.value = frequency;

    // --------------------------------------------------------
    // ChannelMerger:
    //
    // input 0 = L
    // input 1 = R
    // input 2 = C
    // input 3 = LFE
    // input 4 = LS
    // input 5 = RS
    //
    // The oscillator itself is mono.
    // We route it to ONE input of the merger.
    // --------------------------------------------------------

    osc.connect(this.output, 0, channel);

    osc.start();

    this.oscillators.push(osc);

    // Stop this tone
    this.timers.push(
      setTimeout(() => {
        try {
          osc.stop();
        } catch (e) {}

        try {
          osc.disconnect();
        } catch (e) {}

        // Remove from oscillator list
        const index = this.oscillators.indexOf(osc);

        if (index !== -1) {
          this.oscillators.splice(index, 1);
        }
      }, duration),
    );
  }

  // ============================================================
  // STOP CURRENT OSCILLATORS
  // ============================================================

  stopCurrentOscillators() {
    for (const osc of this.oscillators) {
      try {
        osc.stop();
      } catch (e) {}

      try {
        osc.disconnect();
      } catch (e) {}
    }

    this.oscillators = [];
  }

  // ============================================================
  // dB -> LINEAR GAIN
  // ============================================================

  dbToGain(db) {
    return Math.pow(10, db / 20);
  }

  // ============================================================
  // DESTROY
  // ============================================================

  destroy() {
    console.log("[BLITS] Destroy");

    this.running = false;

    // Cancel timers
    for (const timer of this.timers) {
      clearTimeout(timer);
    }

    this.timers = [];

    // Stop oscillators
    this.stopCurrentOscillators();

    // Disconnect gain
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch (e) {}

      this.gain = null;
    }

    // Disconnect merger
    if (this.output) {
      try {
        this.output.disconnect();
      } catch (e) {}

      this.output = null;
    }

    this.onend?.();
  }
}
