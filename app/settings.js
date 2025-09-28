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

  const lightMix = mixHexColors(hex, '#000000', 0.5);
  const darkMix = mixHexColors(hex, '#f7f7f7', 0.5);
  const lightMixH = mixHexColors(hex, '#000000', 0.75);
  const darkMixH = mixHexColors(hex, '#f7f7f7', 0.75);
  const imgDarkColor2 = hexToNormalFilter(darkMix);

  removeStyle(); // Remove previous style before applying new one

  const style = document.createElement('style');
  style.id = "accent-style"; // Unique ID for removal
  style.innerHTML = `
    @media (prefers-color-scheme: light) {
      :root {
        --button-bg: ${lightMix};
        --button-text: ${lightMix};
        --backgroundrange-start: ${lightMix};
        --button-bg-hover: ${lightMixH};
        --colorize: ${imgDarkColor2};
        --colorizeswitch: ${imgDarkColor2};
        --switchtrue: url('./images/checkicons/switchbg_true-l.svg');
        --checkicon: url('./images/checkicons/checked-l.svg');
      }
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --button-bg: ${darkMix};
        --button-text: ${darkMix};
        --backgroundrange-start: ${darkMix};
        --button-bg-hover: ${darkMixH};
        --colorize: ${imgDarkColor2};
        --colorizeswitch: ${imgDarkColor2};
        --switchtrue: url('./images/checkicons/switchbg_true-d.svg');
        --checkicon: url('./images/checkicons/checked-d.svg');
      }
    }
  `;
  document.head.appendChild(style);
}

console.log(hexToNormalFilter("#dfff93"))
console.log(hexToNormalFilter("#454d32ff"))

function removeStyle() {
  const existingStyle = document.getElementById("accent-style");
  if (existingStyle) {
    existingStyle.remove();
  }
}

function applyFallbackFont(useFallbackFont) {
  if (!useFallbackFont) return;
  const systemFontStack = `'Source Sans Pro', 'Material Symbols Outlined', 'Noto Color Emoji', Arial, sans-serif`;
  document.documentElement.style.setProperty('--font', systemFontStack);
  document.documentElement.style.setProperty('--bodyfont', `20px`);
}

function removeFonts() {
  document.documentElement.style.removeProperty('--font');
  document.documentElement.style.removeProperty('--bodyfont');
}

function loadSettings() {
  const useAccentColor = localStorage.getItem("useAccentColor") === "true";
  const useFallbackFont = localStorage.getItem("useFallbackFont") === "true";
  const usePerformanceMode = localStorage.getItem("usePerformanceMode") === "true";
  const hideExplicit = localStorage.getItem("hideExplicit") === "true";
  const accentColor = localStorage.getItem("accentColor") || "#ff0000";

  document.getElementById("useAccentColor").checked = useAccentColor;
  document.getElementById("useFallbackFont").checked = useFallbackFont;
  document.getElementById("usePerformanceMode").checked = usePerformanceMode;
  document.getElementById("hideExplicit").checked = hideExplicit;
  document.getElementById("accentColor").value = accentColor;

  if (useAccentColor) applyAccentColor(accentColor);
  if (useFallbackFont) applyFallbackFont(true);
  if (usePerformanceMode) {
    document.getElementById('topbar_backdrop').classList.add('topbar_onPerformance');
  } else {
    document.getElementById('topbar_backdrop').classList.remove('topbar_onPerformance');
  }
}

function saveSettings() {
  const useAccentColor = document.getElementById("useAccentColor").checked;
  const useFallbackFont = document.getElementById("useFallbackFont").checked;
  const usePerformanceMode = document.getElementById("usePerformanceMode").checked
  const hideExplicit = document.getElementById("hideExplicit").checked;
  const accentColor = document.getElementById("accentColor").value;

  localStorage.setItem("useAccentColor", useAccentColor);
  localStorage.setItem("useFallbackFont", useFallbackFont);
  localStorage.setItem("usePerformanceMode", usePerformanceMode);
  localStorage.setItem("hideExplicit", hideExplicit);
  localStorage.setItem("accentColor", accentColor);

  if (useAccentColor) {
    applyAccentColor(accentColor);
  } else {
    removeStyle();
  }

  if (useFallbackFont) {
    applyFallbackFont(true); 
  } else {
    removeFonts();
  }; 

  if (usePerformanceMode) {
    document.getElementById('topbar_backdrop').classList.add('topbar_onPerformance');
  } else {
    document.getElementById('topbar_backdrop').classList.remove('topbar_onPerformance');
  }
}

function saveExtVisualiserSettings() {
  const first = document.getElementById('ExtVisualiserFirstColor').value;
  const end = document.getElementById('ExtVisualiserEndColor').value;
  localStorage.setItem('ExtVisualiserFirstColor', first);
  localStorage.setItem('ExtVisualiserEndColor', end);
  sendColor(first, end);
}

function sendColor(firstColor, endColor) {
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('sendcolor', firstColor, endColor);
}

function sendBGColor(bgColor) {
  const { ipcRenderer } = require('electron');
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

let micLightColor     = getColor('micLight', '#3b422c');
let micDarkColor      = getColor('micDark', '#dfff93');
let samplerLightColor = getColor('samplerLight', '#294241');
let samplerDarkColor  = getColor('samplerDark', '#94fcf8');

document.addEventListener("DOMContentLoaded", loadSettings);
document.getElementById("useAccentColor").addEventListener("change", saveSettings);
document.getElementById("useFallbackFont").addEventListener("change", saveSettings);
document.getElementById("usePerformanceMode").addEventListener("change", saveSettings);
document.getElementById("hideExplicit").addEventListener("change", saveSettings);
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

// Get current mic/sampler colors
function getMicColor() {
  return isDark() ? getColor('micDark', '#dfff93') : getColor('micLight', '#3b422c');
}

function getSamplerColor() {
  return isDark() ? getColor('samplerDark', '#65a3a2') : getColor('samplerLight', '#294241');
}

// Hook up color pickers
function setupPickers() {
  const micLight = document.getElementById('micLight');
  const micDark = document.getElementById('micDark');
  const samplerLight = document.getElementById('samplerLight');
  const samplerDark = document.getElementById('samplerDark');

  micLight.value = getColor('micLight', '#3b422c');
  micDark.value = getColor('micDark', '#dfff93');
  samplerLight.value = getColor('samplerLight', '#294241');
  samplerDark.value = getColor('samplerDark', '#65a3a2');

  micLight.oninput = () => saveColor('micLight', micLight.value);
  micDark.oninput = () => saveColor('micDark', micDark.value);
  samplerLight.oninput = () => saveColor('samplerLight', samplerLight.value);
  samplerDark.oninput = () => saveColor('samplerDark', samplerDark.value);
}

setupPickers()

const dropdownAlignment = document.getElementById('setWaveformAlignment');

function sendWaveformAlignment(setAlignment) {
  const { ipcRenderer } = require('electron');
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
  console.log("true saved on alignment.")
}

dropdownAlignment.addEventListener('change', saveWaveformAlignment);

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

  const { ipcRenderer } = require('electron');
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
  micLight.value = '#3b422c';
  micDark.value = '#dfff93';
  samplerLight.value = '#294241';
  samplerDark.value = '#65a3a2';
  saveColor('micLight', micLight.value);
  saveColor('micDark', micDark.value);
  saveColor('samplerLight', samplerLight.value);
  saveColor('samplerDark', samplerDark.value);
  document.getElementById('ExtVisualiserFirstColor').value = '#fbff00';
  document.getElementById('ExtVisualiserEndColor').value = '#00ffff';
  first = '#fbff00';
  end = '#00ffff';
  localStorage.setItem('ExtVisualiserFirstColor', first);
  localStorage.setItem('ExtVisualiserEndColor', end);
  sendColor(first, end);
}

const resetColors = document.getElementById('resetColors');
resetColors.addEventListener('click', () => resetColor());

function resetAccentColor() {
  document.getElementById("accentColor").value = '#ff0000';
  document.getElementById("useAccentColor").checked = false;
  saveSettings();
}

const resetAccentColorBtn = document.getElementById('resetAccentColor');
resetAccentColorBtn.addEventListener('click', () => resetAccentColor());

function updateColor() {
  micLightColor = getColor('micLight', '#3b422c');
  micDarkColor = getColor('micDark', '#dfff93');
  samplerLightColor = getColor('samplerLight', '#294241');
  samplerDarkColor = getColor('samplerDark', '#65a3a2');
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

updateColor()