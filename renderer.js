// Here's the renderer process code for the SFXStudio application.
// This file is responsible for handling the UI and interactions\
// in the renderer process. It imports various modules and libraries
// that are used throughout the application.

const { ipcRenderer } = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const LyricsManager = require("./modules/lyrics/manager.js");
const { getEmbeddedLyrics } = require("./modules/lyrics/get.js");
const { Color, Solver, hexToRgbColor } = require("./modules/color/cssfilter.js");
const { generatePalette } = require("./modules/color/material3.js");
const { logPalette } = require("./modules/color/getcontrast.js");
const { generateHexWheel } = require("./modules/color/wheel.js");
const { pathToFileURL } = require('url');
const jsmediatags = require("jsmediatags");
const { exec } = require('child_process');
const Formats = require('./modules/common/formats');

async function choice({ title, message, onConfirm }) {
  const confirmed = await ipcRenderer.invoke('choice-dialog', {
    title,
    message
  });

  if (confirmed && typeof onConfirm === 'function') {
    onConfirm();
  }
}

/*
Sample function:

async function chooseOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return;

  const selected = await ipcRenderer.invoke('options-dialog', options);
  return Array.isArray(selected) ? selected : undefined;
}

// Example:
// const options = ['Option 1', 'Option 2', 'Option 3'];
// const result = await chooseOptions(options);
// console.log(result);
*/

async function chooseOptions(options, title) {
  if (!Array.isArray(options) || options.length === 0) return;

  const selected = await ipcRenderer.invoke('options-dialog', options, title);
  return Array.isArray(selected) ? selected : undefined;
}

