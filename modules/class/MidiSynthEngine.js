class MidiSynthEngine {
  constructor() {
    this.midiAccess = null;
    this.output = null;
    this.channelindicator = new Array(16).fill(null);
    this.channel = 0;
    this.program = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    // Store MIDI inputs
    this.inputs = new Map();

    this.instrument = "piano";

    // id → Set(notes)
    this.active = new Map();
    this.activeDrum = new Map();
    this.isOnInput = false;

    this.instruments = {
      piano: 0,
      bright_piano: 1,
      electric_piano: 4,
      organ: 16,
      guitar: 24,
      bass: 32,
      strings: 48
    };
  }

  // 🎹 INIT MIDI
  async init(usesSysEx = false) {
    this.midiAccess = await navigator.requestMIDIAccess({
      sysex: usesSysEx,
      software: true
    });

    // Output
    const outputs = [...this.midiAccess.outputs.values()];
    this.output = outputs[0];

    if (this.output) {
      this._sendProgramChange(this.instruments[this.instrument]);
    } else {
      console.warn("No MIDI output device found");
    }

    // Attach existing inputs
    this.midiAccess.inputs.forEach(input => {
      this._attachInput(input);
    });

    // Listen for connect/disconnect
    this.midiAccess.onstatechange = (e) => {
      const port = e.port;

      if (port.type !== "input") return;

      if (port.state === "connected") {
        console.log(`MIDI Input Connected: ${port.name}`);

        this.alert?.(
          `MIDI Input "${port.name}" connected.`,
          "MIDI Device Connected"
        );

        this._attachInput(port);
      } else if (port.state === "disconnected") {
        console.log(`MIDI Input Disconnected: ${port.name}`);

        this.alert?.(
          `MIDI Input "${port.name}" disconnected.`,
          "MIDI Device Disconnected"
        );

        this.inputs.delete(port.id);
      }
    };
  }

  _attachInput(input) {
    if (this.inputs.has(input.id)) return;

    this.inputs.set(input.id, input);

    input.onmidimessage = (event) => {
      this._onMidiMessage(event, input);
    };
  }

  _onMidiMessage(event, input) {
    const [status, data1, data2] = event.data;
    const inputdevice = input;

    if (!this.output || !event) return;

    if (this.isOnInput) {
      this.output.send(event.data);
    }

    const messageType = status & 0xF0;
    const channel = status & 0x0F;

    this.onmidimessage?.({
      status,
      data1,
      data2,
      inputdevice
    });

    if (messageType === 0xC0 && this.isOnInput) {
      this.channelindicator[channel] = data1; // Program number
      this.program[channel] = data1;

      this.onChannelChange?.({
        program: this.program[this.channel]
      })

      this.channelIndicator?.({
        channel: channel + 1,
        value: data1,
        program: this.channelindicator[channel],
      })
    }

    // Note Off
    if (messageType === 0x80 && this.isOnInput) {
      this.noteIndicator?.({
        channel: channel + 1,
        velocity: data2,
        on: false
      });
    }

    // Note On
    if (messageType === 0x90 && this.isOnInput) {
      this.noteIndicator?.({
        channel: channel + 1,
        velocity: data2,
        on: data2 > 0
      });
    }

    if (
      messageType === 0xB0 &&
      data1 === 120 &&
      this.isOnInput
    ) {
      this.noteIndicator?.({
        channel: channel + 1,
        velocity: 0,
        on: false
      });
    }

    if (
      messageType === 0xB0 &&
      data1 === 123 &&
      this.isOnInput
    ) {
      this.noteIndicator?.({
        channel: channel + 1,
        velocity: 0,
        on: false
      });
    }
  }

  setMIDIInput() {
    this.isOnInput = !this.isOnInput;
  }

  getMIDIInput() {
    return this.isOnInput;
  }

  async refresh() {
    if (this.output) {
      try {
        await this.output.close();
      } catch { }
    }

    this.output = null;

    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.init();
  }

  // 🎹 PLAY (supports single note OR chord array)
  play(id, note, vel = 1) {
    if (!this.output) return;

    const velocity = Math.floor(vel * 127);

    // 🎼 CHORD SUPPORT
    const notes = Array.isArray(note) ? note : [note];

    if (!this.active.has(id)) {
      this.active.set(id, new Set());
    }

    const activeNotes = this.active.get(id);

    for (const n of notes) {
      const midiNote = this._normalize(n);

      if (activeNotes.has(midiNote)) continue;

      this.output.send([0x90 | this.channel, midiNote, velocity]);
      activeNotes.add(midiNote);
    }
  }

  MIDIAccess() {
    return this.midiAccess;
  }

  // 🛑 STOP (supports chord too)
  stop(id, note) {
    if (!this.output) return;

    const notes = Array.isArray(note) ? note : [note];

    const activeNotes = this.active.get(id);
    if (!activeNotes) return;

    for (const n of notes) {
      const midiNote = this._normalize(n);

      if (!activeNotes.has(midiNote)) continue;

      this.output.send([0x80 | this.channel, midiNote, 0]);
      activeNotes.delete(midiNote);
    }

    if (activeNotes.size === 0) {
      this.active.delete(id);
    }
  }

  sendPitchBend(output, channel, value) {
    // Clamp value to valid range
    value = Math.max(0, Math.min(16383, value));

    // Split into LSB and MSB
    const lsb = value & 0x7F;
    const msb = (value >> 7) & 0x7F;

    // Send MIDI message: [status, LSB, MSB]
    output.send([0xE0 + channel, lsb, msb]);
  }

  stopEvent() {
    try {
      this.output.send([0xFF]);
    } catch (e) {
      console.warn("System Reset not supported:", e);
    }

    for (let ch = 0; ch < 16; ch++) {
      this.output.send([0xB0 | ch, 121, 0]);
      this.output.send([0xB0 | ch, 123, 0]);
      this.output.send([0xB0 | ch, 10, 64]);

      this.output.send([0xB0 | ch, 70, 64]);
      this.output.send([0xB0 | ch, 71, 64]);
      this.output.send([0xB0 | ch, 72, 64]);
      this.output.send([0xB0 | ch, 73, 64]);
      this.output.send([0xB0 | ch, 74, 64]);
      this.output.send([0xB0 | ch, 75, 64]);
      this.output.send([0xB0 | ch, 76, 64]);
      this.output.send([0xB0 | ch, 77, 64]);
      this.output.send([0xB0 | ch, 78, 64]);
      this.output.send([0xB0 | ch, 79, 64]);

      this.output.send([0xB0 | ch, 1, 0]);
      this.output.send([0xB0 | ch, 2, 0]);
      this.output.send([0xB0 | ch, 91, 0]);
      this.output.send([0xB0 | ch, 91, 0]);
      this.output.send([0xB0 | ch, 64, 0]);
      this.output.send([0xB0 | ch, 11, 127]);
      this.output.send([0xB0 | ch, 93, 0]);

      // Center Pitch Bend
      this.output.send([0xE0 | ch, 0x00, 0x40]);

      // Reset Pitch Bend Sensitivity (optional, if you changed it)
      this.output.send([0xB0 | ch, 101, 0]);
      this.output.send([0xB0 | ch, 100, 0]);
      this.output.send([0xB0 | ch, 6, 2]); // ±2 semitones
      this.output.send([0xB0 | ch, 38, 0]);

      // Null the RPN
      this.output.send([0xB0 | ch, 101, 127]);
      this.output.send([0xB0 | ch, 100, 127]);
    }
  }

  pauseEvent() {
    for (let ch = 0; ch < 16; ch++) {
      this.output.send([0xB0 | ch, 123, 0]);
      this.sendPitchBend(this.output, ch, 8192); // channel 0, center
    }
    if (this.active) this.active.clear();
  }

  emitEvent(event) {
    if (this.isOnInput) return;

    if (!this.output || !event) return;

    if (event.some(v => v < 0 || v > 255 || Number.isNaN(v))) {
      console.error("Bad MIDI bytes:", event);
      this.alert?.(
        `Bad MIDI bytes: "${event}"`,
        "MIDI Player"
      );
      return;
    }

    if (event.length >= 2 && event[1] > 127) {
      console.error("Invalid data byte:", event);
      this.alert?.(
        `Invalid MIDI bytes: "${event}"`,
        "MIDI Player"
      );
      return;
    }

    const messageType = event[0] & 0xF0;
    const channel = event[0] & 0x0F;

    if (messageType === 0xC0 && !this.isOnInput) {
      this.program[channel] = event[1];

      this.onChannelChange?.({
        program: this.program[this.channel]
      })
    }

    this.output.send(event);
  }

  // 🎛 INSTRUMENT CHANGE
  changeInstrument(param) {
    const program = Math.max(0, Math.min(127, param));
    this.program[this.channel] = program;
    this._sendProgramChange(program);
  }

  changeChannel(param) {
    const channel = Math.max(0, Math.min(15, param - 1));
    this.channel = channel;

    this.onChannelChange?.({
      program: this.program[this.channel]
    })
  }

  // 🎼 MIDI PROGRAM CHANGE
  _sendProgramChange(program = this.program[this.channel]) {
    if (!this.output) return;
    this.output.send([0xC0 | this.channel, program]);
  }

  // 🎹 FULL RANGE SUPPORT C0–C9
  _normalize(note) {
    if (typeof note === "number") return note;

    const noteBase = {
      C: 0, "C#": 1, Db: 1,
      D: 2, "D#": 3, Eb: 3,
      E: 4,
      F: 5, "F#": 6, Gb: 6,
      G: 7, "G#": 8, Ab: 8,
      A: 9, "A#": 10, Bb: 10,
      B: 11
    };

    const match = note.match(/^([A-G]#?)(-?\d)$/);

    if (!match) return 60;

    const [, pitch, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);

    const midi = (octave + 1) * 12 + (noteBase[pitch] ?? 0);

    // clamp safe MIDI range
    return Math.max(0, Math.min(127, midi));
  }
}