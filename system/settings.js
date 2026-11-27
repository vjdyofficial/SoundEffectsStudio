function mixHexColors(color1, color2, ratio = 0.5) {
  const hexToRgb = (hex) => {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    const bigint = parseInt(hex, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  };

  const rgbToHex = (rgb) =>
    "#" + rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const mixed = rgb1.map((c, i) => c * (1 - ratio) + rgb2[i] * ratio);

  return rgbToHex(mixed);
}

function hexToNormalFilter(hex) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");

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
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }

  // Use fixed-point precision to avoid snapping
  const brightness = +(l + 0.5).toFixed(2) * 100;
  const saturation = +s.toFixed(2) * 150;
  const hue = Math.round(h); // You can also use Math.floor(h) for smoother transitions

  return `brightness(${Math.round(brightness)}%) saturate(${Math.round(saturation)}%) hue-rotate(${hue}deg)`;
}

function applyAccentColor(hex) {
  const isValidHex = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  if (!isValidHex.test(hex)) {
    console.warn(`Invalid hex code: "${hex}". Accent color not applied.`);
    return;
  }

  const lightMix = mixHexColors(hex, "#242424", 0.5);
  const darkMix = mixHexColors(hex, "#f7f7f7", 0.5);

  removeStyle(); // Remove previous style before applying new one

  const style = document.createElement("style");
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
  const usePerformanceMode =
    localStorage.getItem("usePerformanceMode") === "true";
  const accentColor = localStorage.getItem("accentColor") || "#ff0000";
  const timestretch = localStorage.getItem("timestretch") === "true";

  document.getElementById("useAccentColor").checked = useAccentColor;
  document.getElementById("usePerformanceMode").checked = usePerformanceMode;
  document.getElementById("timestretch").checked = timestretch;
  document.getElementById("accentColor").value = accentColor;

  preservesPitch(timestretch);

  if (useAccentColor) applyAccentColor(accentColor);
  if (usePerformanceMode) {
    document
      .getElementById("topbar_backdrop")
      .classList.add("topbar_onPerformance");
    document.body.classList.remove("transparent");
  } else {
    document
      .getElementById("topbar_backdrop")
      .classList.remove("topbar_onPerformance");
    document.body.classList.add("transparent");
  }

  ipcRenderer.send("colorsavestate");
}

function saveSettings() {
  const useAccentColor = document.getElementById("useAccentColor").checked;
  const usePerformanceMode =
    document.getElementById("usePerformanceMode").checked;
  const accentColor = document.getElementById("accentColor").value;
  const timestretch = document.getElementById("timestretch").checked;

  localStorage.setItem("useAccentColor", useAccentColor);
  localStorage.setItem("usePerformanceMode", usePerformanceMode);
  localStorage.setItem("accentColor", accentColor);
  localStorage.setItem("timestretch", timestretch);

  preservesPitch(timestretch);

  if (useAccentColor) {
    applyAccentColor(accentColor);
  } else {
    removeStyle();
  }

  if (usePerformanceMode) {
    document
      .getElementById("topbar_backdrop")
      .classList.add("topbar_onPerformance");
    document.body.classList.remove("transparent");
  } else {
    document
      .getElementById("topbar_backdrop")
      .classList.remove("topbar_onPerformance");
    document.body.classList.add("transparent");
  }

  ipcRenderer.send("colorsavestate");
}

function saveExtVisualiserSettings() {
  const first = document.getElementById("ExtVisualiserFirstColor").value;
  const end = document.getElementById("ExtVisualiserEndColor").value;
  localStorage.setItem("ExtVisualiserFirstColor", first);
  localStorage.setItem("ExtVisualiserEndColor", end);
  sendColor(first, end);
}

function sendColor(firstColor, endColor) {
  ipcRenderer.send("sendcolor", firstColor, endColor);
}

function sendBGColor(bgColor) {
  ipcRenderer.send("sendbgcolor", bgColor);
}

let micLightColor = getColor("micLight", "#ff4343");
let micDarkColor = getColor("micDark", "#ef6950");
let samplerLightColor = getColor("samplerLight", "#ffb900");
let samplerDarkColor = getColor("samplerDark", "#d7b760");
let listenLightColor = getColor("listenLight", "#00b294");
let listenDarkColor = getColor("listenDark", "#94eaef");

document.addEventListener("DOMContentLoaded", loadSettings);

document
  .getElementById("useAccentColor")
  .addEventListener("change", saveSettings);
document
  .getElementById("usePerformanceMode")
  .addEventListener("change", saveSettings);
document.getElementById("timestretch").addEventListener("change", saveSettings);
document.getElementById("accentColor").addEventListener("input", saveSettings);

// Load saved color or fallback
function getColor(key, fallback) {
  return localStorage.getItem(key) || fallback;
}

// Save color
function saveColor(key, value) {
  localStorage.setItem(key, value);

  micLightColor = getColor("micLight", "#ff4343");
  micDarkColor = getColor("micDark", "#ef6950");
  samplerLightColor = getColor("samplerLight", "#ffb900");
  samplerDarkColor = getColor("samplerDark", "#d7b760");
  listenLightColor = getColor("listenLight", "#00b294");
  listenDarkColor = getColor("listenDark", "#94eaef");

  if (typeof window.UPDATECOLORS === "function") {
    window.UPDATECOLORS();
  }
}

// Check if dark mode
function isDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// Hook up color pickers
function setupPickers() {
  const micLight = document.getElementById("micLight");
  const micDark = document.getElementById("micDark");
  const samplerLight = document.getElementById("samplerLight");
  const samplerDark = document.getElementById("samplerDark");
  const listenLight = document.getElementById("listenLight");
  const listenDark = document.getElementById("listenDark");
  micLight.value = getColor("micLight", "#ff4343");
  micDark.value = getColor("micDark", "#ef6950");
  samplerLight.value = getColor("samplerLight", "#ffb900");
  samplerDark.value = getColor("samplerDark", "#d7b760");
  listenLight.value = getColor("listenLight", "#00b294");
  listenDark.value = getColor("listenDark", "#94eaef");

  micLight.oninput = () => saveColor("micLight", micLight.value);
  micDark.oninput = () => saveColor("micDark", micDark.value);
  samplerLight.oninput = () => saveColor("samplerLight", samplerLight.value);
  samplerDark.oninput = () => saveColor("samplerDark", samplerDark.value);
  listenLight.oninput = () => saveColor("listenLight", listenLight.value);
  listenDark.oninput = () => saveColor("listenDark", listenDark.value);
}

setupPickers();

function resetColor() {
  const micLight = document.getElementById("micLight");
  const micDark = document.getElementById("micDark");
  const samplerLight = document.getElementById("samplerLight");
  const samplerDark = document.getElementById("samplerDark");
  const listenLight = document.getElementById("listenLight");
  const listenDark = document.getElementById("listenDark");
  micLight.value = "#ff4343";
  micDark.value = "#ef6950";
  samplerLight.value = "#ffb900";
  samplerDark.value = "#d7b760";
  listenLight.value = "#00b294";
  listenDark.value = "#94eaef";

  saveColor("micLight", micLight.value);
  saveColor("micDark", micDark.value);
  saveColor("samplerLight", samplerLight.value);
  saveColor("samplerDark", samplerDark.value);
  saveColor("listenLight", listenLight.value);
  saveColor("listenDark", listenDark.value);

  setupPickers();
}

function resetAccentColor() {
  document.getElementById("accentColor").value = "#ff0000";
  document.getElementById("useAccentColor").checked = false;
  saveSettings();
}

const resetAccentColorBtn = document.getElementById("resetAccentColor");
resetAccentColorBtn.addEventListener("click", () => resetAccentColor());

function updateColor() {
  micLightColor = getColor("micLight", "#ff4343");
  micDarkColor = getColor("micDark", "#ef6950");
  samplerLightColor = getColor("samplerLight", "#ffb900");
  samplerDarkColor = getColor("samplerDark", "#d7b760");
  listenLightColor = getColor("listenLight", "#00b294");
  listenDarkColor = getColor("listenDark", "#94eaef");
}

function setRangeById(bool, id) {
  const range = document.getElementById(id);
  if (bool === 1) {
    let val = Math.max(
      parseFloat(range.value) + (range.step ? parseFloat(range.step) : 0.01),
      0,
    );
    range.value = val;
  } else {
    let val = Math.max(
      parseFloat(range.value) - (range.step ? parseFloat(range.step) : 0.01),
      0,
    );
    range.value = val;
  }
}

updateColor();

ipcRenderer.on("force-acrylic-updated", () => {
  alert(
    "Please restart app to take effect.",
    "Background Material Changed.",
    true,
    false,
    false,
  );
});

document
  .getElementById("forceAcrylicToggle")
  .addEventListener("change", (event) => {
    const material = event.target.value;
    localStorage.setItem("forceAcrylic", material);
    ipcRenderer.send("set-force-acrylic", material);
  });

ipcRenderer.on("acrylictoggle", (_event, material) => {
  const control = document.getElementById("forceAcrylicToggle");
  control.value = String(material);
});

window.timeSelect = document.getElementById("timeFormatSelect");

// 1️⃣ Load saved format from localStorage on startup
let selectedTimeFormat = localStorage.getItem("timeFormat") || "24h";
timeSelect.value = selectedTimeFormat;

// 2️⃣ Update variable and save to localStorage on change
timeSelect.addEventListener("change", () => {
  selectedTimeFormat = timeSelect.value;
  localStorage.setItem("timeFormat", selectedTimeFormat);
});

window.dateSelect = document.getElementById("dateFormatSelect");

// 1️⃣ Load saved format from localStorage on startup
let selectedDateFormat = localStorage.getItem("dateFormat") || "dd-mmm";
dateSelect.value = selectedDateFormat;

// 2️⃣ Update variable and save to localStorage on change
dateSelect.addEventListener("change", () => {
  selectedDateFormat = dateSelect.value;
  localStorage.setItem("dateFormat", selectedDateFormat);
});

window.dayLanguageSelect = document.getElementById("dayLanguageSelect");

// 1️⃣ Load saved format from localStorage on startup
let selecteddayLanguage = localStorage.getItem("dayLanguage") || "eng";
dayLanguageSelect.value = selecteddayLanguage;

// 2️⃣ Update variable and save to localStorage on change
dayLanguageSelect.addEventListener("change", () => {
  selecteddayLanguage = dayLanguageSelect.value;
  localStorage.setItem("dayLanguage", selecteddayLanguage);
});

const defaultVideoSettings = {
  brightness: 100, // %
  contrast: 100, // %
  saturation: 100, // %
  hue: 0, // deg
};

// Load from localStorage or use defaults
function loadVideoSettings() {
  return (
    JSON.parse(localStorage.getItem("videoAdjustmentSettings")) ||
    defaultVideoSettings
  );
}

function saveVideoSettings(adjustmentsettings) {
  localStorage.setItem(
    "videoAdjustmentSettings",
    JSON.stringify(adjustmentsettings),
  );
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
  ipcRenderer.send("video-adjustment-settings", adjustmentsettings);
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
applyVideoSettings(
  document.getElementById("MediaExtDeck1"),
  adjustmentsettings,
);
applyVideoSettings(
  document.getElementById("MediaExtDeck2"),
  adjustmentsettings,
);
applyVideoSettings(document.getElementById("imageAdjust1"), adjustmentsettings);
applyVideoSettings(document.getElementById("imageAdjust2"), adjustmentsettings);
sendVideoSettingsToMain(adjustmentsettings);

// Update on slider change
document.getElementById("video-filters").addEventListener("input", (e) => {
  const name = e.target.id;
  const value = e.target.value;
  if (adjustmentsettings[name] !== undefined) {
    adjustmentsettings[name] = value;
    applyVideoSettings(
      document.getElementById("MediaExtDeck1"),
      adjustmentsettings,
    );
    applyVideoSettings(
      document.getElementById("MediaExtDeck2"),
      adjustmentsettings,
    );
    applyVideoSettings(
      document.getElementById("imageAdjust1"),
      adjustmentsettings,
    );
    applyVideoSettings(
      document.getElementById("imageAdjust2"),
      adjustmentsettings,
    );
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

const toggle = document.getElementById("hwToggle");

toggle.addEventListener("change", () => {
  ipcRenderer.send("set-hw-acceleration", toggle.checked);
});

ipcRenderer.on("hw-acceleration-updated", (_, enabled) => {
  if (enabled) {
    alert(
      `Hardware acceleration has been enabled. Please restart the application for the changes to take effect.`,
      "GPU acceleration enabled",
      true,
      false,
    );
  } else {
    alert(
      `Hardware acceleration has been disabled. Please restart the application for the changes to take effect.`,
      "GPU acceleration disabled",
      true,
      false,
    );
  }
});

ipcRenderer.on("hwtoggle", (event, bool) => {
  toggle.checked = bool;
});

// Save settings
function decimalToHexAlpha(decimal) {
  // Clamp between 0 and 1 just in case
  const value = Math.round(Math.min(Math.max(decimal, 0), 1) * 255);
  // Convert to 2-digit hex
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function saveCaptionSettings(data) {
  localStorage.setItem("captionSettings", JSON.stringify(data));
}

function applyCaptionSettings(data) {
  // Remove old style if any
  const getCaption = document.getElementById("captionStyle");
  const captionBGOpacity = data.captionBGOpacity;
  const hexAlpha = decimalToHexAlpha(captionBGOpacity); // "80"

  const getOSD = document.getElementById("osdStyle");
  const osdBGOpacity = data.osdBGOpacity;
  const hexAlpha2 = decimalToHexAlpha(osdBGOpacity); // "80"

  const textShadow =
    data.edgeStyle === "outline"
      ? `
                2px  0   0 ${data.strokeColor},
                -2px  0   0 ${data.strokeColor},
                0   2px  0 ${data.strokeColor},
                0  -2px  0 ${data.strokeColor},
                2px  2px 0 ${data.strokeColor},
                -2px  2px 0 ${data.strokeColor},
                2px -2px 0 ${data.strokeColor},
                -2px -2px 0 ${data.strokeColor}
            `
      : data.edgeStyle === "dropshadow"
        ? "2px 2px 3px rgba(0,0,0,0.6)"
        : data.edgeStyle === "default"
          ? `
                    2px  0   0 ${data.strokeColor},
                    -2px  0   0 ${data.strokeColor},
                    0   2px  0 ${data.strokeColor},
                    0  -2px  0 ${data.strokeColor},
                    2px  2px 0 ${data.strokeColor},
                    -2px  2px 0 ${data.strokeColor},
                    2px -2px 0 ${data.strokeColor},
                    -2px -2px 0 ${data.strokeColor},
                    4px 4px 4px rgba(0,0,0,0.6)
                `
          : "none";

  getCaption.style.cssText = `
        color: ${data.textColor};
        background: ${data.backgroundColor}${hexAlpha};
        font-family: ${data.fontFamily}, sans-serif;
        text-shadow: ${textShadow};
    `;

  getOSD.style.cssText = `
        color: ${data.textColor};
        background: ${data.backgroundColor}${hexAlpha2};
        font-family: ${data.fontFamily}, sans-serif;
        text-shadow: ${textShadow};
    `;
}

// Load settings
function loadCaptionSettings() {
  return (
    JSON.parse(localStorage.getItem("captionSettings")) || {
      fontFamily: "Roboto",
      textColor: "#ffffff",
      backgroundColor: "#000000",
      edgeStyle: "default",
      captionBGOpacity: "0",
      osdBGOpacity: "0",
      strokeColor: "#000000",
    }
  );
}

const settingsdata = loadCaptionSettings();

function sendcaptionsdata() {
  applyCaptionSettings(settingsdata);
  ipcRenderer.send("caption-settings-updated", settingsdata);
}

function testOSD() {
  const text = `
        <span id="overlaytextbold">Test On-screen display</span><br><br>
        On-screen display will look like this.<br>
        Supports HTML Text Formatting on the other hand.
    `;
  ipcRenderer.send("show-text", text);
}

document.addEventListener("DOMContentLoaded", () => {
  sendcaptionsdata();
  document.getElementById("fontFamily").value = settingsdata.fontFamily || "";
  document.getElementById("textColor").value =
    settingsdata.textColor || "#ffffff";
  document.getElementById("bgColor").value =
    settingsdata.backgroundColor || "#000000";
  document.getElementById("edgeStyle").value = settingsdata.edgeStyle || "none";
  document.getElementById("captionBGOpacity").value =
    settingsdata.captionBGOpacity || "0";
  document.getElementById("osdBGOpacity").value =
    settingsdata.osdBGOpacity || "0";
  document.getElementById("strokeColor").value =
    settingsdata.strokeColor || "#000000";
});

// shared save function
function updateCaptionSettings() {
  const data = {
    fontFamily: document.getElementById("fontFamily").value,
    textColor: document.getElementById("textColor").value,
    backgroundColor: document.getElementById("bgColor").value,
    edgeStyle: document.getElementById("edgeStyle").value,
    captionBGOpacity: document.getElementById("captionBGOpacity").value,
    osdBGOpacity: document.getElementById("osdBGOpacity").value,
    strokeColor: document.getElementById("strokeColor").value,
  };

  saveCaptionSettings(data); // localStorage save
  applyCaptionSettings(data);
  ipcRenderer.send("caption-settings-updated", data); // send to other windows
}

document.getElementById("testOSD").onclick = () => testOSD();

// for text/color inputs
[
  "textColor",
  "bgColor",
  "strokeColor",
  "captionBGOpacity",
  "osdBGOpacity",
].forEach((id) => {
  document.getElementById(id).addEventListener("input", updateCaptionSettings);
});

// for dropdowns / selects
["fontFamily", "edgeStyle"].forEach((id) => {
  document.getElementById(id).addEventListener("change", updateCaptionSettings);
});

const themeSelect = document.getElementById("themeSelect");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function updateTheme(mode) {
  document.documentElement.removeAttribute("data-theme");

  if (mode === "dark" || mode === "light") {
    document.documentElement.setAttribute("data-theme", mode);
  } else {
    // "system" mode → no data-theme → let prefers-color-scheme decide
    document.documentElement.removeAttribute("data-theme");
  }

  localStorage.setItem("themeMode", mode);
  ipcRenderer.send("changeNativeTheme", mode);
}

const savedTheme = localStorage.getItem("themeMode") || "system";
themeSelect.value = savedTheme;
updateTheme(savedTheme);

// System theme listener
prefersDark.addEventListener("change", () => {
  if (localStorage.getItem("themeMode") === "system") {
    updateTheme("system");
  }
});

themeSelect.addEventListener("change", () => {
  updateTheme(themeSelect.value);
});

window.SCOPECOLOR = [];
window.SCOPECOLOR[0] = "#dfff93";
window.SCOPECOLOR[1] = "#fc007e";

window.SCOPECOLOR["def0"] = "#dfff93";
window.SCOPECOLOR["def1"] = "#fc007e";

const SFXSTUDIO_SCOPE_COLOR0 = document.getElementById(
  "SFXSTUDIO_SCOPE_COLOR0",
);
const SFXSTUDIO_SCOPE_COLOR1 = document.getElementById(
  "SFXSTUDIO_SCOPE_COLOR1",
);

SFXSTUDIO_SCOPE_COLOR0.addEventListener("change", (e) => {
  window.SCOPECOLOR[0] = e.target.value;
  if (typeof window.UPDATECOLORS === "function") {
    window.UPDATECOLORS();
  }
  localStorage.setItem("SCOPE_COLOR0", e.target.value);
});

SFXSTUDIO_SCOPE_COLOR1.addEventListener("change", (e) => {
  window.SCOPECOLOR[1] = e.target.value;
  if (typeof window.UPDATECOLORS === "function") {
    window.UPDATECOLORS();
  }
  localStorage.setItem("SCOPE_COLOR1", e.target.value);
});

function resetColorScopes() {
  SFXSTUDIO_SCOPE_COLOR0.value = window.SCOPECOLOR["def0"];
  SFXSTUDIO_SCOPE_COLOR1.value = window.SCOPECOLOR["def1"];
  SFXSTUDIO_SCOPE_COLOR0.dispatchEvent(new Event("change"));
  SFXSTUDIO_SCOPE_COLOR1.dispatchEvent(new Event("change"));
}

SFXSTUDIO_SCOPE_COLOR0.value =
  localStorage.getItem("SCOPE_COLOR0") || window.SCOPECOLOR["def0"];
SFXSTUDIO_SCOPE_COLOR1.value =
  localStorage.getItem("SCOPE_COLOR1") || window.SCOPECOLOR["def1"];
SFXSTUDIO_SCOPE_COLOR0.dispatchEvent(new Event("change"));
SFXSTUDIO_SCOPE_COLOR1.dispatchEvent(new Event("change"));

const metercolorSelect = document.getElementById("metercolorSelect");
metercolorSelect.addEventListener("change", (e) => {
  const v = String(e.target.value);
  localStorage.setItem("METER_COLOR", v);
  document.body.dataset.metertheme = v;
});

metercolorSelect.value = localStorage.getItem("METER_COLOR") || "default";
metercolorSelect.dispatchEvent(new Event("change"));

const IMAGE_RENDERING_KEY = "vjdyfm_imageRendering";
const IMAGE_RENDERING_CHANNEL = "image-rendering-change";

const IMAGE_RENDERING_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "smooth", label: "Smooth" },
  { value: "high-quality", label: "High Quality" },
  { value: "pixelated", label: "Pixelated" },
  { value: "crisp-edges", label: "Crisp Edges" },
];

function getImageRendering() {
  return localStorage.getItem(IMAGE_RENDERING_KEY) || "auto";
}

function saveToLocalStorage(value) {
  localStorage.setItem(IMAGE_RENDERING_KEY, value);
}

function selectOption(value) {
  if (!IMAGE_RENDERING_OPTIONS.some((option) => option.value === value)) {
    value = "auto";
  }

  saveToLocalStorage(value);

  // Send to Electron IPC
  ipcRenderer.send(IMAGE_RENDERING_CHANNEL, value);

  // Dispatch event for other scripts in this window
  window.dispatchEvent(
    new CustomEvent(IMAGE_RENDERING_CHANNEL, {
      detail: value,
    }),
  );

  return value;
}

window.addEventListener("image-rendering-change", (event) => {
  console.log("Image Rendering:", event.detail);
});

// Initialize when script loads
const imageRendering = getImageRendering();

selectOption(imageRendering);

// Optional: expose options for your select UI
window.IMAGE_RENDERING_OPTIONS = IMAGE_RENDERING_OPTIONS;
window.selectImageRendering = selectOption;
window.getImageRendering = getImageRendering;

const select = document.getElementById("imageRenderingSelect");

select.value = getImageRendering();

select.addEventListener("change", () => {
  selectOption(select.value);
});

const fontNameInput = document.getElementById("TELEPROMPT_FONTNAME");
const fontScaleInput = document.getElementById("TELEPROMPT_FONTSCALE");
const fontPickerButton = document.getElementById("telepromptfont");

let fontSettings = [];

const TELEPROMPT_DEFAULTS = {
  fontFamily: "",
  fontScale: 1,
};

[fontNameInput, fontScaleInput].forEach((id) => {
  id.addEventListener("input", () => {
    fontSettings = [
      fontNameInput.value, 
      fontScaleInput.value
    ];

    document.getElementById("TELEPROMPT_FONTSCALE_VALUE").textContent = Number(fontScaleInput.value).toFixed(1);

    ipcRenderer.send("font-teleprompt", fontSettings);
    localStorage.setItem("TELEPROMPT_FONTNAME", fontSettings[0]);
    localStorage.setItem("TELEPROMPT_FONTSCALE", fontSettings[1]);
  });
});

fontPickerButton.addEventListener("click", async (e) => {
  e.target.disabled = true;
  const font = await window.selectFont();
  if (!font) {
    e.target.disabled = false;
    return;
  }

  fontNameInput.value = font[0];
  fontScaleInput.value = Number(font[1] / 10);

  [fontNameInput, fontScaleInput].forEach((id) => {
    id.dispatchEvent(new Event("input"));
  });
  e.target.disabled = false;
});

fontSettings = [
  localStorage.getItem("TELEPROMPT_FONTNAME") || TELEPROMPT_DEFAULTS[0],
  localStorage.getItem("TELEPROMPT_FONTSCALE") || TELEPROMPT_DEFAULTS[1]
];

fontNameInput.value = fontSettings[0];
fontScaleInput.value = fontSettings[1];

[fontNameInput, fontScaleInput].forEach((id) => {
  id.dispatchEvent(new Event("input"));
});