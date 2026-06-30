var instrumentNames = [
    "Acoustic Grand Piano",
    "Bright Acoustic Piano",
    "Electric Grand Piano",
    "Honky-tonk Piano",
    "Rhodes Electric Piano",
    "Tine FM Electric Piano",
    "Harpsichord",
    "Clavinet",
    "Celesta",
    "Glockenspiel",
    "Music Box",
    "Vibraphone",
    "Marimba",
    "Xylophone",
    "Tubular Bells",
    "Santur",
    "Drawbar Organ",
    "Percussive Organ",
    "Rock Organ",
    "Church Organ",
    "Reed Organ",
    "Accordion",
    "Harmonica",
    "Tango Accordion",
    "Nylon Guitar",
    "Steel Guitar",
    "Jazz Guitar",
    "Clean Guitar",
    "Muted Guitar",
    "Overdriven Guitar",
    "Distortion Guitar",
    "Guitar Harmonics",
    "Acoustic Bass",
    "Finger Bass",
    "Picked Bass",
    "Fretless Bass",
    "Slap Bass 1",
    "Slap Bass 2",
    "Synth Bass 1",
    "Synth Bass 2",
    "Violin",
    "Viola",
    "Cello",
    "Contrabass",
    "Tremolo Strings",
    "Pizzicato Strings",
    "Orchestral Harp",
    "Timpani",
    "Strings",
    "Slow Strings",
    "Synth Strings",
    "Slow Synth Strings",
    "Choir Aahs",
    "Voice Oohs",
    "Synth Voice",
    "Orchestra Hit",
    "Trumpet",
    "Trombone",
    "Tuba",
    "Muted Trumpet",
    "French Horn",
    "Brass Section",
    "Synth Brass 1",
    "Synth Brass 2",
    "Soprano Sax",
    "Alto Sax",
    "Tenor Sax",
    "Baritone Sax",
    "Oboe",
    "English Horn",
    "Bassoon",
    "Clarinet",
    "Piccolo",
    "Flute",
    "Recorder",
    "Pan Flute",
    "Blown Bottle",
    "Shakuhachi",
    "Whistle",
    "Ocarina",
    "Square Wave",
    "Sawtooth Wave",
    "Calliope",
    "Chiff Wave",
    "Charang",
    "Solo Vox",
    "Fifths",
    "Bass & Lead",
    "Fantasia",
    "Warm",
    "Polysynth",
    "Space Voice",
    "Bowed Glass",
    "Metallic Pad",
    "Halo",
    "Sweep Pad",
    "Rain",
    "Soundtrack",
    "Crystal",
    "Atmosphere",
    "Brightness",
    "Goblins",
    "Echo Drops",
    "Science Fiction",
    "Sitar",
    "Banjo",
    "Shamisen",
    "Koto",
    "Kalimba",
    "Bagpipe",
    "Fiddle",
    "Shanai",
    "Tinkle Bell",
    "Agogo",
    "Steel Drums",
    "Woodblock",
    "Taiko Drum",
    "Melodic Tom",
    "Synth Drum",
    "Reverse Cymbal",
    "Guitar Fret Noise",
    "Breath Noise",
    "Seashore",
    "Bird Tweet",
    "Telephone Ring",
    "Helicopter",
    "Applause",
    "Gunshot"
];

var instrumentNamesShort = [
    "AcstcGr",
    "BrgtAc",
    "ElcGr",
    "Honkyton",
    "ElcPno1",
    "ElcPno2",
    "Harpsch",
    "Clavnet",
    "Celesta",
    "Glcken",
    "MusicBx",
    "Vibraph",
    "Marimba",
    "Xyloph",
    "TubBels",
    "Dulcmer",
    "DrawOr",
    "PercOrg",
    "RockOrg",
    "ChrcOrg",
    "ReedOrg",
    "Accordn",
    "Harmnic",
    "TangoAc",
    "AcGtNyl",
    "AcGtStr",
    "ElGtJaz",
    "ElGtCln",
    "ElGtMut",
    "OvrDrvn",
    "DistGt",
    "GtHrmnc",
    "AcBass",
    "ElBsFng",
    "ElBsPck",
    "FretBas",
    "SlapBs1",
    "SlapBs2",
    "SynBs1",
    "SynBs2",
    "Violin",
    "Viola",
    "Cello",
    "Contbas",
    "TremStr",
    "PizzStr",
    "OrcHarp",
    "Timpani",
    "StrEns1",
    "StrEns2",
    "SynStr1",
    "SynStr2",
    "ChoirAh",
    "VoiceOh",
    "SynVoic",
    "OrcHit",
    "Trumpet",
    "Trombon",
    "Tuba",
    "MutTrmp",
    "FrnHorn",
    "BrassOr",
    "SynBr1",
    "SynBr2",
    "SopSax",
    "AltoSax",
    "TenorSx",
    "BaritSx",
    "Oboe",
    "EngHorn",
    "Bassoon",
    "Clarnet",
    "Piccolo",
    "Flute",
    "Recordr",
    "PanFlte",
    "BlwBott",
    "Shakuh",
    "Whistle",
    "Ocarina",
    "Lead1Sq",
    "Lead2Sw",
    "Lead3Cl",
    "Lead4Ch",
    "Lead5Ch",
    "Lead6Vc",
    "Lead7Fh",
    "Lead8Bs",
    "Pad1NA",
    "Pad2Wrm",
    "Pad3Poly",
    "Pad4Chr",
    "Pad5Bwd",
    "Pad6Met",
    "Pad7Hlo",
    "Pad8Swp",
    "FX1Rn",
    "FX2Snd",
    "FX3Crs",
    "FX4Atm",
    "FX5Br",
    "FX6Gob",
    "FX7Ech",
    "FX8Sci",
    "Sitar",
    "Banjo",
    "Shamis",
    "Koto",
    "Kalimb",
    "Bagpip",
    "Fiddle",
    "Shanai",
    "Tinkle",
    "Agogo",
    "StlDrm",
    "Wdbock",
    "TaikoDr",
    "MelTom",
    "SynDrm",
    "RevCym",
    "GtFrtNs",
    "BrthNs",
    "Seahor",
    "BirdTw",
    "TelRng",
    "Helicop",
    "Applaus",
    "Gunshot"
];

var channelCode = [
    'CH01',
    'CH02',
    'CH03',
    'CH04',
    'CH05',
    'CH06',
    'CH07',
    'CH08',
    'CH09',
    'DRUM',
    'CH11',
    'CH12',
    'CH13',
    'CH14',
    'CH15',
    'CH16',
]

var MIDIACTIONS = ['speedMIDI', 'playPauseBtnMIDI', 'stopBtnMIDI', 'timeMIDI']

const DrumkitByProgram = {
    0: "Standard",
    8: "Room",
    16: "Power",
    24: "Electronic",
    25: "TR-808",
    32: "Jazz",
    40: "Brush",
    48: "Orchestra",
    56: "SFX",

    // Roland GS Extensions
    1: "Standard 2",
    9: "Room 2",
    17: "Power 2",
    26: "TR-909",
    27: "Dance",
    33: "Jazz 2",
    41: "Brush 2",
    49: "Orchestra 2",
    57: "SFX 2"
};

const DrumkitIconByProgram = {
    0: "0",
    8: "8",
    16: "16",
    24: "24",
    25: "25",
    32: "32",
    40: "40",
    48: "48",
    56: "56",

    // Roland GS Extensions
    1: "1",
    9: "9",
    17: "17",
    26: "26",
    27: "27",
    33: "33",
    41: "41",
    49: "49",
    57: "57"
};

function getInstrumentName(bankMSB, program) {
    const bank = InstrumentBanks[bankMSB];

    if (bank) {
        // If it's an array (Bank 0)
        if (Array.isArray(bank)) {
            return bank[program] ?? "Unknown Instrument";
        }

        // If the variation exists
        if (bank[program]) {
            return bank[program];
        }
    }

    // Fall back to GM Bank 0
    return instrumentNames[program] ?? "Unknown Instrument";
}

function getDrumkitName(program) {
    return DrumkitByProgram[program] || "Standard";
}

function getDrumkitNumber(program) {
    return DrumkitIconByProgram[program] || "0";
}


var miditrack_debug = "";
var midilyric_debug = "";
var velocityOffset = 1;

const synth = new MidiSynthEngine();
synth.init(true);

var ROLLPIANO = false;
const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
var CHORDSET = "SINGLE"

function buildChord(rootNote, octave = 4, type = "SINGLE") {
    const rootIndex = NOTES.indexOf(rootNote);

    if (rootIndex === -1) {
        console.warn("Invalid note:", rootNote);
        return [(octave + 1) * 12];
    }

    const baseMidi = (octave + 1) * 12 + rootIndex;

    switch (type) {

        case "SINGLE":
            return [baseMidi];

        case "POWER":
            return [baseMidi, baseMidi + 7];

        case "MINOR":
            return [baseMidi, baseMidi + 3, baseMidi + 7];

        case "MAJOR":
            return [baseMidi, baseMidi + 4, baseMidi + 7];

        case "AUG":
            return [baseMidi, baseMidi + 4, baseMidi + 8];

        case "SEVEN":
            return [baseMidi, baseMidi + 4, baseMidi + 7, baseMidi + 10];

        case "NINE":
            return [baseMidi, baseMidi + 4, baseMidi + 7, baseMidi + 10, baseMidi + 14];

        default:
            return [baseMidi];
    }
}

var channel = 0;

document.querySelectorAll('.piano').forEach(el => {
    const note = el.dataset.note;
    const oct = parseInt(el.dataset.octave);

    const name = "piano_" + note + "_" + oct;

    const chordType = CHORDSET;

    let currentNotes = [];

    const play = () => {
        currentNotes = buildChord(note, oct, chordType);
        synth.play(name, currentNotes);

        ROLLPIANO = true;
    };

    const stop = () => {
        synth.stop(name, currentNotes);
        ROLLPIANO = false;
    };

    const stoponleave = () => {
        synth.stop(name, currentNotes);
    };

    el.addEventListener('mousedown', play);
    el.addEventListener('mouseup', stop);

    el.addEventListener('pointerleave', stoponleave);

    el.addEventListener('pointerenter', () => {
        if (!ROLLPIANO) return;
        play();
    });

    el.addEventListener('touchstart', play);
    el.addEventListener('touchend', stop);
});

const KEYBOARD_OCTAVE4 = ["z", "s", "x", "d", "c", "v", "g", "b", "h", "n", "j", "m"];
const KEYBOARD_OCTAVE5 = ["q", "2", "w", "3", "e", "r", "5", "t", "6", "y", "7", "u", "i"];

const KEYBOARD_MAP = {};
KEYBOARD_OCTAVE4.forEach((key, index) => {
    KEYBOARD_MAP[key] = {
        tone: NOTES[index],
        octave: index === 12 ? 4 : 3
    };
});
KEYBOARD_OCTAVE5.forEach((key, index) => {
    KEYBOARD_MAP[key] = {
        tone: NOTES[index],
        octave: index === 12 ? 5 : 4
    };
});

const activeKeyboardKeys = new Set();

function triggerPianoKey(key, type) {
    if (document.querySelector('.deckbarbutton[data-editor=E]').dataset.state !== 'active') return;
    const mapping = KEYBOARD_MAP[key];
    if (!mapping) return;

    const selector = `.piano[data-tone="${mapping.tone}"][data-octave="${mapping.octave}"], .piano[data-note="${mapping.tone}"][data-octave="${mapping.octave}"]`;
    const element = document.querySelector(selector);
    if (!element) return;

    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window
    });

    element.dispatchEvent(event);
}

document.addEventListener('keydown', (event) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!KEYBOARD_MAP[key] || activeKeyboardKeys.has(key)) return;

    activeKeyboardKeys.add(key);
    triggerPianoKey(key, 'mousedown');
    event.preventDefault();
});

document.addEventListener('keyup', (event) => {
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (!activeKeyboardKeys.has(key)) return;

    activeKeyboardKeys.delete(key);
    triggerPianoKey(key, 'mouseup');
    event.preventDefault();
});

document.getElementById('setInstrument').addEventListener('input', (e) => {
    synth.changeInstrument(Number(e.target.value))
    document.getElementById('instrumentname').textContent = instrumentNamesShort[Number(e.target.value)];
})

document.getElementById('instrumentname').textContent = instrumentNamesShort[0];

document.getElementById('setChannel').addEventListener('input', (e) => {
    synth.changeChannel(Number(e.target.value))
    document.getElementById('channelnamemidi').textContent = channelCode[Number(e.target.value - 1)];

    if (!midi.isPlaying()) {
        document.getElementById('setInstrument').dispatchEvent(new Event("input"))
    }
})

document.getElementById('channelnamemidi').textContent = channelCode[0];

synth.onChannelChange = (event) => {
    document.getElementById('setInstrument').value = event.program;
    document.getElementById('instrumentname').textContent = instrumentNamesShort[Number(event.program)];
};

var onEventtoLog = false
var pitchOffset = 0;

function setPitchOffset(value = 1) {
    pitchOffset = value
    synth.pauseEvent()
}

function skipMIDIby(value) {
    if (midi.isPlaying()) {
        midi.skipToPercent(value);
        synth.pauseEvent();
        midi.play();
    } else {
        midi.skipToPercent(value)
    }
}

function eventToMidiBytes(event) {
    switch (event.name) {

        case "All Sound Off":
            return [
                0xB0 | ((event.channel || 1) - 1),
                120, // CC120
                0
            ];

        case "All Notes Off":
            return [
                0xB0 | ((event.channel || 1) - 1),
                123, // CC123
                0
            ];

        case "Reset All Controllers":
            return [
                0xB0 | ((event.channel || 1) - 1),
                121, // CC121
                0
            ];

        case "Note on":
            return [
                0x90 | ((event.channel || 1) - 1),
                (event.noteNumber + (event.channel == 10 ? 0 : pitchOffset)),
                (event.velocity * velocityOffset)
            ];

        case "Note off":
            return [
                0x80 | ((event.channel || 1) - 1),
                (event.noteNumber + (event.channel == 10 ? 0 : pitchOffset)),
                (event.velocity * velocityOffset)
            ];

        case "Program Change":
            return [
                0xC0 | ((event.channel || 1) - 1),
                event.value
            ];

        case "Controller Change":
            return [
                0xB0 | ((event.channel || 1) - 1),
                event.number,
                event.value
            ];

        case "Pitch Bend":
            const value = event.value;

            return [
                0xE0 | ((event.channel || 1) - 1),
                value & 0x7F,
                (value >> 7) & 0x7F
            ];

        default:
            return null;
    }
}

function eventTrackindicator(event) {
    switch (event.name) {
        case "Note on":
            {
                const query = document.querySelector(`.channelmidi[data-channel="${event.channel}"]`);
                if (query) {
                    if (event.velocity <= 0) {
                        query.dataset.active = false;
                    } else {
                        query.dataset.active = true;
                    }
                }

                break;
            }
        case "Note off":
            {
                const query = document.querySelector(`.channelmidi[data-channel="${event.channel}"]`);
                if (query) {
                    query.dataset.active = false;
                }

                break;
            }
        case "Program Change":
            {
                const query = document.querySelector(`#midichannelicon[data-channel="${event.channel}"]`);
                if (query) {
                    query.src = "icons/monosource/" + ((event.value > 127) ? "gm-midi/BLANK.svg" : (event.channel == 10) ? ("gm-drumset/" + getDrumkitNumber(event.value) + ".svg") : ("gm-midi/" + event.value) + ".svg")
                }

                const querytext = document.querySelector(`#midichannellabel[data-channel="${event.channel}"]`);
                if (querytext) {
                    querytext.textContent = ((event.value > 127) ? "" : (event.channel == 10) ? getDrumkitName(event.value) : instrumentNames[event.value])
                }

                break;
            }
        default:
            { }
    }
}

const midiTickText = document.getElementById('MIDI_currentTick');
const midiBPMText = document.getElementById('MIDI_bpm');
const midiDurTickText = document.getElementById('MIDI_durationTick');
let lastFrameMIDITime = 0;
let lastFrameMIDITime2 = 0;
const frameIntervalMIDI = 1000 / 10; // 60fps limit

const midi = new MidiPlayer.Player();

function updateMIDITime() {
    const timestamp = 100 - (midi.getSongTimeRemaining() / midi.getSongTime() * 100)
    timeMIDI.value = Number(timestamp);

    document.getElementById('miditimeremaining').textContent = formatTimeFromNumber((midi.getSongTime() - midi.getSongTimeRemaining()));
    document.getElementById('miditimetotal').textContent = formatTimeFromNumber(midi.getSongTime());
}

function MIDIIndicatorsOff() {
    for (let i = 1; i <= 16; i++) {
        const query = document.querySelector(`.channelmidi[data-channel="${i}"]`);
        if (query) {
            query.dataset.active = false;
        }
    }
}

function MIDILabelsOff() {
    for (let i = 1; i <= 16; i++) {
        const queryicon = document.querySelector(`#midichannelicon[data-channel="${i}"]`);
        if (queryicon) {
            queryicon.src = "icons/monosource/gm-midi/" + "BLANK.svg"
        }

        const querytext = document.querySelector(`#midichannellabel[data-channel="${i}"]`);
        if (querytext) {
            querytext.textContent = ""
        }
    }
}

function sendProgram() {
    const latestPrograms = new Map();

    midi.events
        .flat()
        .filter(event =>
            event.name === "Program Change" &&
            event.tick <= midi.tick
        )
        .forEach(event => {
            latestPrograms.set(event.channel, event);
        });

    latestPrograms.forEach(event => {
        synth.emitEvent(eventToMidiBytes(event));
        eventTrackindicator(event);
    });
}

function getEventText() {
    let text = "";

    midi.events
        .flat()
        .filter(event =>
            event.name === "Text Event" ||
            event.name === "Lyric"
        )
        .forEach(event => {
            const str = event.string;

            // Skip karaoke metadata
            if (/^@[A-Za-z]/.test(str)) return;

            if (str === "\\") {
                text += "s";
            } else if (str === "/") {
                text += "\n";
            } else {
                text += str;
            }
        });

    return text.trim();
}

function getEventText() {
    let string = "";

    midi.events
        .flat()
        .filter(event =>
            event.name === "Text Event" ||
            event.name === "Lyric"
        )
        .forEach(event => {
            string += event.string;
        });

    return cleanMidiText(string);
}

midi.on('endOfFile', function () {
    synth.stopEvent();
    MIDIIndicatorsOff();
    MIDILabelsOff();
    updateMIDITime();
    window.ISMIDIPLAYING = false;
    document.getElementById('playbackIconMIDI').src = "icons/monosource/play_arrow.svg";

    miditrack_debug = "";
    midilyric_debug = "";
    document.getElementById('miditracks').textContent = "";
    document.getElementById('midilyrics').textContent = "";
});

document.getElementById('playPauseBtnMIDI').addEventListener('click', (e) => {
    if (midi.isPlaying()) {
        midi.pause();
        synth.pauseEvent();
        MIDIIndicatorsOff();
        window.ISMIDIPLAYING = false;
        document.getElementById('playbackIconMIDI').src = "icons/monosource/play_arrow.svg";
        e.target.title = "Play";
    } else {
        midi.play();
        updateMIDITime();
        window.ISMIDIPLAYING = true;
        document.getElementById('playbackIconMIDI').src = "icons/monosource/pause.svg";
        e.target.title = "Pause";
    }
})

document.getElementById('stopBtnMIDI').addEventListener('click', () => {
    midi.stop();
    updateMIDITime();

    miditrack_debug = "";
    midilyric_debug = "";
    document.getElementById('miditracks').textContent = "";
    document.getElementById('midilyrics').textContent = "";

    window.ISMIDIPLAYING = false;
    document.getElementById('playbackIconMIDI').src = "icons/monosource/play_arrow.svg";

    if (!synth.getMIDIInput()) {
        synth.stopEvent();
        MIDIIndicatorsOff();
        MIDILabelsOff();
    }
})

document.getElementById('panicMIDI').addEventListener('click', () => {
    snackbar(`All notes off sent to MIDI Output.`, 'MIDI Synthesizer', 5000)
    synth.pauseEvent();
})

document.getElementById('sentprogramMIDI').addEventListener('click', () => {
    snackbar(`All programs sent to MIDI Output.`, 'MIDI Synthesizer', 5000)
    synth.pauseEvent();
    sendProgram();
})

synth.alert = (message, title) => {
    snackbar(message, title);
};

document.getElementById('resetMIDI').addEventListener('click', async () => {
    snackbar(`Reseting MIDI Output...`, 'MIDI Synthesizer', 5000)
    synth.stopEvent();
    await synth.refresh();
    snackbar(`MIDI Output has been reset.`, 'MIDI Synthesizer', 5000)
})

function eventMetaData(event) {
    switch (event.name) {

        case "Sequence/Track Name":
            miditrack_debug = `${miditrack_debug}<br>Track ${event.track}: ${event.string}`
            document.getElementById('miditracks').innerHTML = miditrack_debug;
            break;
        case "Event Text":
            miditrack_debug = `${miditrack_debug}<br>Track ${event.track}: ${event.string}`
            document.getElementById('miditracks').innerHTML = miditrack_debug;
            break;
        case "Instrument Name":
            miditrack_debug = `${miditrack_debug}<br>Track ${event.track}: ${event.string}`
            document.getElementById('miditracks').innerHTML = miditrack_debug;
            break;
        case "Lyric":
            midilyric_debug = `${midilyric_debug}${event.string}`
            document.getElementById('midilyrics').innerHTML = midilyric_debug;
            break;
        case "Text Event":
            midilyric_debug = `${midilyric_debug}${event.string.replace("/", "<br>").replace("\\", "<br><br>").replace("@LENGL", "<br>").replace("@T", "<br>")}`
            document.getElementById('midilyrics').innerHTML = midilyric_debug;
            break;
        default:
            break;
    }

    scrollMidilyricsToBottom();
}

const timeMIDI = document.getElementById('timeMIDI');
const midilyricScroll = document.getElementById('midilyric_scroll');

function scrollMidilyricsToBottom() {
    if (!midilyricScroll) return;
    const scrollWidth = midilyricScroll.scrollHeight;
    const clientWidth = document.getElementById('midilyrics').clientHeight;
    if (scrollWidth > clientWidth) {
        midilyricScroll.scroll({ top: clientWidth, behavior: 'smooth' });
    }
}

window.MIDISLIDER_TIME_CANUPDATE = true;

midi.on('midiEvent', function (event) {
    if (performance.now() - lastFrameMIDITime >= frameIntervalMIDI) {
        lastFrameMIDITime = performance.now();
        midiTickText.textContent = midi.tick;
        midiBPMText.textContent = midi.tempo;
        midiDurTickText.textContent = midi.totalTicks;
    }

    if (midi.tick >= midi.totalTicks) {
        midi.stop();
        MIDIIndicatorsOff();
    } else {
        if (!synth.getMIDIInput()) {
            eventTrackindicator(event);
        };

        eventMetaData(event);
        synth.emitEvent(eventToMidiBytes(event));
    }
});

const MIDIIN_TEXT1 = document.getElementById('MIDIIN_STATUS')
const MIDIIN_TEXT2 = document.getElementById('MIDIIN_DATA')
const MIDIIN_TEXT3 = document.getElementById('MIDIIN_VALUE')

synth.onmidimessage = (event) => {
    if (performance.now() - lastFrameMIDITime2 >= frameIntervalMIDI) {
        MIDIIN_TEXT1.textContent = event.status;
        MIDIIN_TEXT2.textContent = event.data1;
        MIDIIN_TEXT3.textContent = event.data2;
    }
};

synth.channelIndicator = (event) => {
    const query = document.querySelector(`#midichannelicon[data-channel="${event.channel}"]`);
    if (query) {
        query.src = "icons/monosource/" + ((event.value > 127) ? "gm-midi/BLANK.svg" : (event.channel == 10) ? ("gm-drumset/" + getDrumkitNumber(event.value) + ".svg") : ("gm-midi/" + event.value) + ".svg")
    }

    const querytext = document.querySelector(`#midichannellabel[data-channel="${event.channel}"]`);
    if (querytext) {
        querytext.textContent = ((event.value > 127) ? "" : (event.channel == 10) ? getDrumkitName(event.value) : instrumentNames[event.value])
    }
}

synth.noteIndicator = (event) => {
    const query = document.querySelector(`.channelmidi[data-channel="${event.channel}"]`);
    if (query) {
        if (!event.on) {
            query.dataset.active = false;
        } else {
            query.dataset.active = true;
        }
    }
}

document.getElementById('ToggleMIDI_Input').addEventListener('click', (e) => {
    synth.stopEvent();
    MIDILabelsOff();
    MIDIIndicatorsOff();

    if (!synth.getMIDIInput()) {
        const text = `MIDI In Message enabled`;
        snackbar(text);
        e.target.title = 'Disable MIDI In Message';
        e.target.setAttribute("aria-details", "onActive");
        synth.setMIDIInput();
    } else {
        const text = `MIDI In Message disabled`;
        snackbar(text);
        e.target.title = 'Enable MIDI In Message';
        e.target.setAttribute("aria-details", "onInactive");
        synth.setMIDIInput();
        sendProgram();
    }
});

midi.on('playing', function (event) {
    if (window.MIDISLIDER_TIME_CANUPDATE) {
        updateMIDITime();
    }
});

midi.on('fileLoaded', function () {
    updateMIDITime();

    if (!synth.getMIDIInput()) {
        MIDILabelsOff();
    }

    midiTickText.textContent = midi.tick;
    midiBPMText.textContent = midi.tempo;
    midiDurTickText.textContent = midi.totalTicks;

    miditrack_debug = "";
    midilyric_debug = "";
    document.getElementById('miditracks').textContent = "";
    document.getElementById('midilyrics').textContent = "";
    MIDIACTIONS.forEach(id => {
        document.getElementById(id).disabled = false;
    })

    if (!synth.getMIDIInput()) {
        sendProgram();
    }

    document.querySelector('.deckbarbutton[data-editor="E"]').click();
    snackbar(`The MIDI File has been imported to the synthesizer memory at ${Formats.bytesToSize(midi.midiChunksByteLength)}`, 'MIDI Synthesizer', 5000)
});

MIDILabelsOff();

MIDIACTIONS.forEach(id => {
    document.getElementById(id).disabled = true;
})

function importMIDI(path) {
    MIDIACTIONS.forEach(id => {
        document.getElementById(id).disabled = true;
    })

    if (midi.isPlaying()) {
        midi.stop();
        synth.stopEvent();
        MIDIIndicatorsOff();
        window.ISMIDIPLAYING = false;
        document.getElementById('playbackIconMIDI').src = "icons/monosource/play_arrow.svg";
    }

    setTimeout(() => {
        try {
            midi.loadFile(path);
        } catch (error) {
            alert(`An error occured while trying to load the MIDI Sequence:\n${error}`, 'MIDI Import Error!');
            MIDIIndicatorsOff();
            updateMIDITime();
            MIDILabelsOff();
            miditrack_debug = "";
            midilyric_debug = "";
            document.getElementById('miditracks').textContent = "";
            document.getElementById('midilyrics').textContent = "";
        }
    }, 100)
}

document.getElementById('speedMIDI').addEventListener('input', (e) => {
    document.getElementById('speedValueText_MIDI').textContent = Number(e.target.value) + "st";
})

document.getElementById('speedMIDI').addEventListener('change', (e) => {
    setPitchOffset(Number(e.target.value));
})

document.getElementById('velocityMIDI').addEventListener('input', (e) => {
    velocityOffset = Number(e.target.value);
    document.getElementById('velocityValueText_MIDI').textContent = gainTodB(Number(e.target.value));
})

timeMIDI.addEventListener('change', (e) => {
    skipMIDIby(e.target.value);
})

timeMIDI.addEventListener('mousedown', (e) => {
    window.MIDISLIDER_TIME_CANUPDATE = false;
})

timeMIDI.addEventListener('mouseup', (e) => {
    window.MIDISLIDER_TIME_CANUPDATE = true;
})

timeMIDI.addEventListener('input', (e) => {
    const timestamp = (midi.getSongTime() * (Number(e.target.value) * 1 / 100))
    document.getElementById('miditimeremaining').textContent = formatTimeFromNumber(timestamp);
    document.getElementById('miditimetotal').textContent = formatTimeFromNumber(midi.getSongTime());
})