const { ipcRenderer } = require('electron');
const fs = require('./modules/safe-fs');
const fsp = require('./modules/safe-fspromises.js');
const path = require('./modules/mainworld-path.js');
const os = require('./modules/mainworld-os.js');

const LyricsManager = require("./modules/lyrics-manager.js");
const { getEmbeddedLyrics } = require("./modules/get-embedded-lyrics.js");

let PitchShift = require('./modules/audio-pitchshift.js');
let PitchShiftMap = require('./modules/audio-pitchshift-map.js');
const { Color, Solver, hexToRgbColor } = require("./modules/color-cssfilter.js");
const { generatePalette } = require("./modules/color-material3.js");
const { logPalette } = require("./modules/color-getcontrast.js");
const { generateHexWheel } = require("./modules/color-wheel");
const L = require('leaflet');
const { sendMsg } = require("./modules/kustom-apimsg.js");

