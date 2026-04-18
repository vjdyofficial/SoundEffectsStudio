// Here's the renderer process code for the SFXStudio application.
// This file is responsible for handling the UI and interactions\
// in the renderer process. It imports various modules and libraries
// that are used throughout the application.

const { ipcRenderer } = require('electron');
const fs = require('./modules/safe-fs');
const fsp = require('./modules/safe-fspromises.js');
const path = require('./modules/mainworld-path.js');
const os = require('os');
const crypto = require('crypto');
const LyricsManager = require("./modules/lyrics-manager.js");
const { getEmbeddedLyrics } = require("./modules/get-embedded-lyrics.js");
let PitchShift = require('./modules/pitchshift/high.js');
let PitchShiftMap = require('./modules/audio-pitchshift-map.js');
const { Color, Solver, hexToRgbColor } = require("./modules/color-cssfilter.js");
const { generatePalette } = require("./modules/color-material3.js");
const { logPalette } = require("./modules/color-getcontrast.js");
const { generateHexWheel } = require("./modules/color-wheel");
const L = require('leaflet');
const { pathToFileURL } = require('url');

async function choice({ title, message, onConfirm }) {
  const confirmed = await ipcRenderer.invoke('choice-dialog', {
    title,
    message
  });

  if (confirmed && typeof onConfirm === 'function') {
    onConfirm();
  }
}