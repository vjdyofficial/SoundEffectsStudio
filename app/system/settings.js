function mixHexColors(color1, color2, ratio = 0.5) {
  const hexToRgb = hex => {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const bigint = parseInt(hex, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  };

  const rgbToHex = rgb =>
    '#' + rgb.map(c => Math.round(c).toString(16).padStart(2, '0')).join('');

  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const mixed = rgb1.map((c, i) => c * (1 - ratio) + rgb2[i] * ratio);

  return rgbToHex(mixed);
}

function hexToNormalFilter(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');

  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
  }

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = ((b - r) / delta) + 2;
    } else {
      h = ((r - g) / delta) + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  // Use fixed-point precision to avoid snapping
  const brightness = +(l + 0.5).toFixed(2) * 100;
  const saturation = +(s).toFixed(2) * 150;
  const hue = Math.round(h); // You can also use Math.floor(h) for smoother transitions

  return `brightness(${Math.round(brightness)}%) saturate(${Math.round(saturation)}%) hue-rotate(${hue}deg)`;
}

function applyAccentColor(hex) {
  const isValidHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  if (!isValidHex.test(hex)) {
    console.warn(`Invalid hex code: "${hex}". Accent color not applied.`);
    return;
  }

  const lightMix = mixHexColors(hex, '#242424', 0.5);
  const darkMix = mixHexColors(hex, '#f7f7f7', 0.5);

  removeStyle(); // Remove previous style before applying new one

  const style = document.createElement('style');
  style.id = "accent-style"; // Unique ID for removal

  const rgb1 = hexToRgbColor(lightMix);
  const color1 = new Color(...rgb1);
  const solver1 = new Solver(color1);
  const result1 = solver1.solve();

  const rgb2 = hexToRgbColor(darkMix);
  const color2 = new Color(...rgb2);
  const solver2 = new Solver(color2);
  const result2 = solver2.solve();

  style.innerHTML = `
  :root {
    --defaultcolorlight: ${lightMix};
    --defaultcolordark: ${darkMix};
    --defaultcolorlight-secondary: ${generatePalette(lightMix).secondary};
    --defaultcolordark-secondary: ${generatePalette(darkMix).secondary};
    --defaultcolorlight-tertiary: ${generatePalette(lightMix).tertiary};
    --defaultcolordark-tertiary: ${generatePalette(darkMix).tertiary};
  }


  @media (prefers-color-scheme: light) {
    :root {
      --filter-imgcolor: ${result1.css}
    }
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --filter-imgcolor: ${result2.css}
    }
  }
`;

  document.head.appendChild(style);
}

function removeStyle() {
  const existingStyle = document.getElementById("accent-style");
  if (existingStyle) {
    existingStyle.remove();
  }
}

let preservesPitchGlobal;
let isAudioWatermark = false;

function preservesPitch(boolean) {
  preservesPitchGlobal = boolean;
  document.getElementById("mediaA").preservesPitch = boolean;
  document.getElementById("mediaB").preservesPitch = boolean;
  document.getElementById("mediaC").preservesPitch = boolean;
  document.getElementById("mediaD").preservesPitch = boolean;
  document.getElementById("MediaExtDeck1").preservesPitch = boolean;
  document.getElementById("MediaExtDeck2").preservesPitch = boolean;
}

function loadSettings() {
  const useAccentColor = localStorage.getItem("useAccentColor") === "true";
  const usePerformanceMode = localStorage.getItem("usePerformanceMode") === "true";
  const hideExplicit = localStorage.getItem("hideExplicit") === "true";
  const accentColor = localStorage.getItem("accentColor") || "#ff0000";
  const timestretch = localStorage.getItem("timestretch") === "true";

  document.getElementById("useAccentColor").checked = useAccentColor;
  document.getElementById("usePerformanceMode").checked = usePerformanceMode;
  document.getElementById("timestretch").checked = timestretch;
  document.getElementById("hideExplicit").checked = hideExplicit;
  document.getElementById("accentColor").value = accentColor;

  preservesPitch(timestretch);

  if (useAccentColor) applyAccentColor(accentColor);
  if (usePerformanceMode) {
    document.getElementById('topbar_backdrop').classList.add('topbar_onPerformance');
    document.body.classList.remove('transparent');
  } else {
    document.getElementById('topbar_backdrop').classList.remove('topbar_onPerformance');
    document.body.classList.add('transparent');
  }

  ipcRenderer.send('colorsavestate');
}

function saveSettings() {
  const useAccentColor = document.getElementById("useAccentColor").checked;
  const usePerformanceMode = document.getElementById("usePerformanceMode").checked
  const hideExplicit = document.getElementById("hideExplicit").checked;
  const accentColor = document.getElementById("accentColor").value;
  const timestretch = document.getElementById("timestretch").checked;

  localStorage.setItem("useAccentColor", useAccentColor);
  localStorage.setItem("usePerformanceMode", usePerformanceMode);
  localStorage.setItem("hideExplicit", hideExplicit);
  localStorage.setItem("accentColor", accentColor);
  localStorage.setItem("timestretch", timestretch);

  preservesPitch(timestretch);

  if (useAccentColor) {
    applyAccentColor(accentColor);
  } else {
    removeStyle();
  }

  if (usePerformanceMode) {
    document.getElementById('topbar_backdrop').classList.add('topbar_onPerformance');
    document.body.classList.remove('transparent');
  } else {
    document.getElementById('topbar_backdrop').classList.remove('topbar_onPerformance');
    document.body.classList.add('transparent');
  }

  ipcRenderer.send('colorsavestate');
}

function saveExtVisualiserSettings() {
  const first = document.getElementById('ExtVisualiserFirstColor').value;
  const end = document.getElementById('ExtVisualiserEndColor').value;
  localStorage.setItem('ExtVisualiserFirstColor', first);
  localStorage.setItem('ExtVisualiserEndColor', end);
  sendColor(first, end);
}

function sendColor(firstColor, endColor) {
  ipcRenderer.send('sendcolor', firstColor, endColor);
}

function sendBGColor(bgColor) {
  ipcRenderer.send('sendbgcolor', bgColor);
}

function loadExtVisualiserSettings() {
  const first = localStorage.getItem('ExtVisualiserFirstColor') || '#fbff00';
  const end = localStorage.getItem('ExtVisualiserEndColor') || '#00ffff';
  document.getElementById('ExtVisualiserFirstColor').value = first;
  document.getElementById('ExtVisualiserEndColor').value = end;
  sendColor(first, end);
}

function onChangeExtVisualiserColor() {
  saveExtVisualiserSettings();
}

document.getElementById('ExtVisualiserFirstColor').addEventListener('input', onChangeExtVisualiserColor);
document.getElementById('ExtVisualiserEndColor').addEventListener('input', onChangeExtVisualiserColor);

document.addEventListener('DOMContentLoaded', loadExtVisualiserSettings);

let micLightColor = getColor('micLight', '#ff4343');
let micDarkColor = getColor('micDark', '#ef6950');
let samplerLightColor = getColor('samplerLight', '#ffb900');
let samplerDarkColor = getColor('samplerDark', '#d7b760');
let listenLightColor = getColor('listenLight', '#00b294');
let listenDarkColor = getColor('listenDark', '#94eaef');

document.addEventListener("DOMContentLoaded", loadSettings);

document.getElementById("useAccentColor").addEventListener("change", saveSettings);
document.getElementById("usePerformanceMode").addEventListener("change", saveSettings);
document.getElementById("hideExplicit").addEventListener("change", saveSettings);
document.getElementById("timestretch").addEventListener("change", saveSettings);
document.getElementById("accentColor").addEventListener("input", saveSettings);

// Load saved color or fallback
function getColor(key, fallback) {
  return localStorage.getItem(key) || fallback;
}

// Save color
function saveColor(key, value) {
  localStorage.setItem(key, value);
}

// Check if dark mode
function isDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Hook up color pickers
function setupPickers() {
  const micLight = document.getElementById('micLight');
  const micDark = document.getElementById('micDark');
  const samplerLight = document.getElementById('samplerLight');
  const samplerDark = document.getElementById('samplerDark');
  const listenLight = document.getElementById('listenLight');
  const listenDark = document.getElementById('listenDark');
  micLight.value = getColor('micLight', '#ff4343');
  micDark.value = getColor('micDark', '#ef6950');
  samplerLight.value = getColor('samplerLight', '#ffb900');
  samplerDark.value = getColor('samplerDark', '#d7b760');
  listenLight.value = getColor('listenLight', '#00b294');
  listenDark.value = getColor('listenDark', '#94eaef');
  micLight.oninput = () => saveColor('micLight', micLight.value);
  micDark.oninput = () => saveColor('micDark', micDark.value);
  samplerLight.oninput = () => saveColor('samplerLight', samplerLight.value);
  samplerDark.oninput = () => saveColor('samplerDark', samplerDark.value);
  listenLight.oninput = () => saveColor('listenLight', listenLight.value);
  listenDark.oninput = () => saveColor('listenDark', listenDark.value);
}

setupPickers();

const dropdownAlignment = document.getElementById('setWaveformAlignment');

function sendWaveformAlignment(setAlignment) {
  ipcRenderer.send('sendWaveformAlignment', setAlignment);
}

function loadWaveformAlignment() {
  document.getElementById('setWaveformAlignment').value = localStorage.getItem('waveformAlignment') || 'flex-end';
  const setvalue = document.getElementById('setWaveformAlignment').value;
  sendWaveformAlignment(setvalue);
}

function saveWaveformAlignment() {
  localStorage.setItem('waveformAlignment', document.getElementById('setWaveformAlignment').value);
  const setvalue = document.getElementById('setWaveformAlignment').value;
  sendWaveformAlignment(setvalue);
}

const dropdownType = document.getElementById('setWaveformType');

function sendWaveformType(index) {
  ipcRenderer.send('sendWaveformType', index);
  if (index >= 9) {
    document.getElementById("settings_alignment_visualizer").hidden = true
    document.getElementById("settings_option_visualizer").hidden = true
    document.getElementById("settings_quality_visualizer").hidden = true
    document.getElementById("settings_color_visualizer").hidden = true
  } else if (index >= 2) {
    document.getElementById("settings_alignment_visualizer").hidden = true
    document.getElementById("settings_option_visualizer").hidden = false
    document.getElementById("settings_quality_visualizer").hidden = true
    document.getElementById("settings_color_visualizer").hidden = false
  } else if (index >= 1) {
    document.getElementById("settings_alignment_visualizer").hidden = true
    document.getElementById("settings_option_visualizer").hidden = false
    document.getElementById("settings_quality_visualizer").hidden = false
    document.getElementById("settings_color_visualizer").hidden = false
  } else {
    document.getElementById("settings_alignment_visualizer").hidden = false
    document.getElementById("settings_option_visualizer").hidden = false
    document.getElementById("settings_quality_visualizer").hidden = false
    document.getElementById("settings_color_visualizer").hidden = false
  }
}

function loadWaveformType() {
  document.getElementById('setWaveformType').value = localStorage.getItem('waveformType') || '0';
  const setvalue = document.getElementById('setWaveformType').value;
  sendWaveformType(setvalue);
}

function saveWaveformType() {
  localStorage.setItem('waveformType', document.getElementById('setWaveformType').value);
  const setvalue = document.getElementById('setWaveformType').value;
  sendWaveformType(setvalue);
}

dropdownType.addEventListener('change', saveWaveformType);
dropdownAlignment.addEventListener('change', saveWaveformAlignment);

document.addEventListener('DOMContentLoaded', loadWaveformType);
document.addEventListener('DOMContentLoaded', loadWaveformAlignment);

function sendFilterfromMain(brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue) {
  document.getElementById('backdropblurText').textContent = backdropblurValue;
  document.getElementById('blurMultiplyText').textContent = blurMultiplier;
  if (brightnessValue == -0.1) {
    document.getElementById('brightnessText').textContent = "Disable";
  } else {
    document.getElementById('brightnessText').textContent = brightnessValue;
  }
  document.getElementById('grayscaleText').textContent = grayscaleValue;
  document.getElementById('angleValueText').textContent = angleValue;
  document.getElementById('sepiaText').textContent = sepiaValue;

  ipcRenderer.send('sendFilter', brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue);
}

function loadFilter() {
  document.getElementById('brightnessValue').value = localStorage.getItem('brightnessValue') || 1;
  document.getElementById('grayscaleValue').value = localStorage.getItem('grayscaleValue') || 0;
  document.getElementById('sepiaValue').value = localStorage.getItem('sepiaValue') || 0;
  document.getElementById('backdropblurValue').value = localStorage.getItem('backdropblurValue') || 0;
  document.getElementById('angleValue').value = localStorage.getItem('angleValue') || 0;
  document.getElementById('blurMultiplier').value = localStorage.getItem('blurMultiplier') || 0;
  const brightnessValue = document.getElementById('brightnessValue').value;
  const grayscaleValue = document.getElementById('grayscaleValue').value;
  const angleValue = document.getElementById('angleValue').value;
  const sepiaValue = document.getElementById('sepiaValue').value;
  const backdropblurValue = document.getElementById('backdropblurValue').value;
  const blurMultiplier = document.getElementById('blurMultiplier').value;
  sendFilterfromMain(brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue);
}

function saveFilter() {
  localStorage.setItem('brightnessValue', document.getElementById('brightnessValue').value);
  localStorage.setItem('grayscaleValue', document.getElementById('grayscaleValue').value);
  localStorage.setItem('sepiaValue', document.getElementById('sepiaValue').value);
  localStorage.setItem('backdropblurValue', document.getElementById('backdropblurValue').value);
  localStorage.setItem('angleValue', document.getElementById('angleValue').value);
  localStorage.setItem('blurMultiplier', document.getElementById('blurMultiplier').value);
  const brightnessValue = document.getElementById('brightnessValue').value;
  const grayscaleValue = document.getElementById('grayscaleValue').value;
  const sepiaValue = document.getElementById('sepiaValue').value;
  const angleValue = document.getElementById('angleValue').value;
  const backdropblurValue = document.getElementById('backdropblurValue').value;
  const blurMultiplier = document.getElementById('blurMultiplier').value;
  sendFilterfromMain(brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue);
}

function onChangeFilterValue() {
  saveFilter();
}

document.getElementById('brightnessValue').addEventListener('input', onChangeFilterValue);
document.getElementById('grayscaleValue').addEventListener('input', onChangeFilterValue);
document.getElementById('sepiaValue').addEventListener('input', onChangeFilterValue);
document.getElementById('backdropblurValue').addEventListener('input', onChangeFilterValue);
document.getElementById('blurMultiplier').addEventListener('input', onChangeFilterValue);
document.getElementById('angleValue').addEventListener('input', onChangeFilterValue);
document.addEventListener('DOMContentLoaded', loadFilter);

function resetColor() {
  const micLight = document.getElementById('micLight');
  const micDark = document.getElementById('micDark');
  const samplerLight = document.getElementById('samplerLight');
  const samplerDark = document.getElementById('samplerDark');
  const listenLight = document.getElementById('listenLight');
  const listenDark = document.getElementById('listenDark');
  micLight.value = '#ff4343';
  micDark.value = '#ef6950';
  samplerLight.value = '#ffb900';
  samplerDark.value = '#d7b760';
  listenLight.value = '#00b294';
  listenDark.value = '#94eaef';

  saveColor('micLight', micLight.value);
  saveColor('micDark', micDark.value);
  saveColor('samplerLight', samplerLight.value);
  saveColor('samplerDark', samplerDark.value);
  saveColor('listenLight', listenLight.value);
  saveColor('listenDark', listenDark.value);

  setupPickers();
};

function resetAccentColor() {
  document.getElementById("accentColor").value = '#ff0000';
  document.getElementById("useAccentColor").checked = false;
  saveSettings();
}

const resetAccentColorBtn = document.getElementById('resetAccentColor');
resetAccentColorBtn.addEventListener('click', () => resetAccentColor());

function updateColor() {
  micLightColor = getColor('micLight', '#ff4343');
  micDarkColor = getColor('micDark', '#ef6950');
  samplerLightColor = getColor('samplerLight', '#ffb900');
  samplerDarkColor = getColor('samplerDark', '#d7b760');
  listenLightColor = getColor('listenLight', '#00b294');
  listenDarkColor = getColor('listenDark', '#94eaef');
  requestAnimationFrame(updateColor)
}

function setRangeById(bool, id) {
  const range = document.getElementById(id);
  if (bool === 1) {
    let val = Math.max(parseFloat(range.value) + (range.step ? parseFloat(range.step) : 0.01), 0);
    range.value = val;
  } else {
    let val = Math.max(parseFloat(range.value) - (range.step ? parseFloat(range.step) : 0.01), 0);
    range.value = val;
  }
}

updateColor();

ipcRenderer.on('force-acrylic-updated', (event, forceAcrylic) => {
  createDialogMessage("Force Acrylic Material toggled. Please restart app to take effect.", "Confirmation", true, false, false);
});

document.getElementById('forceAcrylicToggle').addEventListener('change', (event) => {
  const isChecked = event.target.checked;
  localStorage.setItem('forceAcrylic', isChecked);
  ipcRenderer.send('set-force-acrylic', isChecked);
});

ipcRenderer.on('acrylictoggle', (event, isEnabled) => {
  document.getElementById('forceAcrylicToggle').checked = isEnabled;
});

const timeSelect = document.getElementById('timeFormatSelect');

// 1️⃣ Load saved format from localStorage on startup
let selectedTimeFormat = localStorage.getItem('timeFormat') || '24h';
timeSelect.value = selectedTimeFormat;

// 2️⃣ Update variable and save to localStorage on change
timeSelect.addEventListener('change', () => {
  selectedTimeFormat = timeSelect.value;
  localStorage.setItem('timeFormat', selectedTimeFormat);
});

const dateSelect = document.getElementById('dateFormatSelect');

// 1️⃣ Load saved format from localStorage on startup
let selectedDateFormat = localStorage.getItem('dateFormat') || 'dd-mmm';
dateSelect.value = selectedDateFormat;

// 2️⃣ Update variable and save to localStorage on change
dateSelect.addEventListener('change', () => {
  selectedDateFormat = dateSelect.value;
  localStorage.setItem('dateFormat', selectedDateFormat);
});

const dayLanguageSelect = document.getElementById('dayLanguageSelect');

// 1️⃣ Load saved format from localStorage on startup
let selecteddayLanguage = localStorage.getItem('dayLanguage') || 'eng';
dayLanguageSelect.value = selecteddayLanguage;

// 2️⃣ Update variable and save to localStorage on change
dayLanguageSelect.addEventListener('change', () => {
  selecteddayLanguage = dayLanguageSelect.value;
  localStorage.setItem('dayLanguage', selecteddayLanguage);
});




const defaultVideoSettings = {
  brightness: 100, // %
  contrast: 100,   // %
  saturation: 100, // %
  hue: 0          // deg
};

// Load from localStorage or use defaults
function loadVideoSettings() {
  return JSON.parse(localStorage.getItem('videoAdjustmentSettings')) || defaultVideoSettings;
}

function saveVideoSettings(adjustmentsettings) {
  localStorage.setItem('videoAdjustmentSettings', JSON.stringify(adjustmentsettings));
}

function applyVideoSettings(video, adjustmentsettings) {
  const { brightness, contrast, saturation, hue, blur } = adjustmentsettings;
  video.style.filter = `
        brightness(${brightness}%)
        contrast(${contrast}%)
        saturate(${saturation}%)
        hue-rotate(${hue}deg)
    `;
}

function sendVideoSettingsToMain(adjustmentsettings) {
  ipcRenderer.send('video-adjustment-settings', adjustmentsettings);
}

let adjustmentsettings = loadVideoSettings();

// Initialize sliders
for (let key in adjustmentsettings) {
  const slider = document.getElementById(key);
  const sliderText = document.getElementById(`${key}_videotext`);
  if (slider) {
    slider.value = adjustmentsettings[key];
    sliderText.textContent = adjustmentsettings[key];
  }
}

// Apply initially
applyVideoSettings(document.getElementById('MediaExtDeck1'), adjustmentsettings);
applyVideoSettings(document.getElementById('MediaExtDeck2'), adjustmentsettings);
applyVideoSettings(document.getElementById('imageAdjust1'), adjustmentsettings);
applyVideoSettings(document.getElementById('imageAdjust2'), adjustmentsettings);
sendVideoSettingsToMain(adjustmentsettings);

// Update on slider change
document.getElementById('video-filters').addEventListener('input', (e) => {
  const name = e.target.id;
  const value = e.target.value;
  if (adjustmentsettings[name] !== undefined) {
    adjustmentsettings[name] = value;
    applyVideoSettings(document.getElementById('MediaExtDeck1'), adjustmentsettings);
    applyVideoSettings(document.getElementById('MediaExtDeck2'), adjustmentsettings);
    applyVideoSettings(document.getElementById('imageAdjust1'), adjustmentsettings);
    applyVideoSettings(document.getElementById('imageAdjust2'), adjustmentsettings);
    saveVideoSettings(adjustmentsettings);
    sendVideoSettingsToMain(adjustmentsettings);
  }

  const sliderText = document.getElementById(`${name}_videotext`);
  if (sliderText) {
    sliderText.textContent = value;
  }
});

const checkboxReduce = document.getElementById("reduce-motion-toggle");
const savedReduceMotion = localStorage.getItem("reduceMotion");
checkboxReduce.checked = savedReduceMotion === "true";

// 2. Notify main on load (important!)
document.body.dataset.reduce = savedReduceMotion;

// 3. Listen for user toggle
checkboxReduce.addEventListener("change", () => {
  const enabled = checkboxReduce.checked;
  document.body.dataset.reduce = enabled;
  // save locally
  localStorage.setItem("reduceMotion", enabled);
});

const checkboxHighContrast = document.getElementById("contrast-toggle");
const savedHighContrast = localStorage.getItem("HighContrast");
checkboxHighContrast.checked = savedHighContrast === "true";

// 2. Notify main on load (important!)
document.body.dataset.contrast = savedHighContrast;

// 3. Listen for user toggle
checkboxHighContrast.addEventListener("change", () => {
  const enabled = checkboxHighContrast.checked;
  document.body.dataset.contrast = enabled;
  // save locally
  localStorage.setItem("HighContrast", enabled);
});