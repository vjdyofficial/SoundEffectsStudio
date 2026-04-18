const { ipcRenderer } = require("electron");

/* ===== Utility functions ===== */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pad2(n) { return n.toString(16).padStart(2, '0'); }
function rgbToHex(r, g, b) {
    return '#' + pad2(Math.round(r)) + pad2(Math.round(g)) + pad2(Math.round(b));
}
function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6) return null;
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
    };
}

function pickWindowsColor() {
    try {
        const cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; `
            + `$cd = New-Object System.Windows.Forms.ColorDialog; `
            + `$cd.FullOpen = $true; `
            + `$result = $cd.ShowDialog(); `
            + `if ($result -ne [System.Windows.Forms.DialogResult]::OK) { Write-Output ''; exit }; `
            + `Write-Output ($cd.Color.ToArgb())"`;

        const raw = execSync(cmd).toString().trim();

        if (!raw) return null; // canceled

        const argb = parseInt(raw, 10);
        const hex = (argb >>> 0).toString(16).padStart(8, "0");
        const rgbHex = "#" + hex.substring(2);

        return rgbHex;
    } catch (e) {
        console.error("Color picker error:", e);
        return null;
    }
}

/* ===== More precise conversions ===== */
function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;

    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }

    r = (r + m) * 255;
    g = (g + m) * 255;
    b = (b + m) * 255;

    return {
        r: Math.min(255, Math.max(0, r)),
        g: Math.min(255, Math.max(0, g)),
        b: Math.min(255, Math.max(0, b))
    };
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;

    if (d !== 0) {
        switch (max) {
            case r: h = ((g - b) / d) % 6; break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
        if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s: s * 100, v: v * 100 };
}

/* ===== Picker setup ===== */
const sv = document.getElementById('sv'),
    hCanvas = document.getElementById('h'),
    svCtx = sv.getContext('2d'),
    hCtx = hCanvas.getContext('2d');

const hexInput = document.getElementById('hexInput');
const rInput = document.getElementById('r'),
    gInput = document.getElementById('g'),
    bInput = document.getElementById('b');
const hNumber = document.getElementById('hNumber'),
    sNumber = document.getElementById('sNumber'),
    vNumber = document.getElementById('vNumber');
const preview = document.getElementById('preview');

let hue = 343, sat = 75, val = 71;
let userEditingHex = false;

/* ===== Drawing ===== */
function drawHue() {
    const w = hCanvas.width, h = hCanvas.height;
    const grad = hCtx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i <= 360; i++) {
        grad.addColorStop(i / 360, `hsl(${i}, 100%, 50%)`);
    }
    hCtx.fillStyle = grad;
    hCtx.fillRect(0, 0, w, h);
    const y = (hue / 360) * h;
    hCtx.strokeStyle = '#0008';
    hCtx.lineWidth = 2;
    hCtx.strokeRect(0, y - 2, w, 4);
}

function drawSV() {
    const w = sv.width, h = sv.height;
    svCtx.fillStyle = `hsl(${hue},100%,50%)`;
    svCtx.fillRect(0, 0, w, h);

    const white = svCtx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, '#fff');
    white.addColorStop(1, 'transparent');
    svCtx.fillStyle = white;
    svCtx.fillRect(0, 0, w, h);

    const black = svCtx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'transparent');
    black.addColorStop(1, '#000');
    svCtx.fillStyle = black;
    svCtx.fillRect(0, 0, w, h);

    const x = (sat / 100) * w, y = (1 - (val / 100)) * h;
    svCtx.beginPath();
    svCtx.arc(x, y, 7, 0, Math.PI * 2);
    svCtx.fillStyle = '#fff';
    svCtx.fill();
    svCtx.lineWidth = 2;
    svCtx.strokeStyle = '#000';
    svCtx.stroke();
}

/* ===== UI Update ===== */
function updateUI() {
    const rgb = hsvToRgb(hue, sat, val);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

    if (!userEditingHex) hexInput.value = hex;

    preview.style.background = hex;
    rInput.value = Math.round(rgb.r);
    gInput.value = Math.round(rgb.g);
    bInput.value = Math.round(rgb.b);
    hNumber.value = Math.round(hue);
    sNumber.value = Math.round(sat);
    vNumber.value = Math.round(val);

    drawSV();
    drawHue();
}

/* ===== Canvas interactions ===== */
let dragSV = false, dragH = false;

sv.addEventListener('mousedown', e => { dragSV = true; moveSV(e); });
window.addEventListener('mousemove', e => { if (dragSV) moveSV(e); });
window.addEventListener('mouseup', () => dragSV = false);

function moveSV(e) {
    const r = sv.getBoundingClientRect();
    const x = clamp(e.clientX - r.left, 0, sv.width);
    const y = clamp(e.clientY - r.top, 0, sv.height);
    sat = (x / sv.width) * 100;
    val = (1 - y / sv.height) * 100;
    updateUI();
}

hCanvas.addEventListener('mousedown', e => { dragH = true; moveH(e); });
window.addEventListener('mousemove', e => { if (dragH) moveH(e); });
window.addEventListener('mouseup', () => dragH = false);

function moveH(e) {
    const r = hCanvas.getBoundingClientRect();
    const y = clamp(e.clientY - r.top, 0, hCanvas.height);
    hue = (y / hCanvas.height) * 360;
    updateUI();
}

/* ===== Input bindings ===== */
[hNumber, sNumber, vNumber].forEach(inp => inp.addEventListener('change', () => {
    inp.value = clamp(+inp.value, +inp.min, +inp.max);
    hue = +hNumber.value;
    sat = +sNumber.value;
    val = +vNumber.value;
    updateUI();
    inp.setCustomValidity('');
    inp.reportValidity();
}));

[rInput, gInput, bInput].forEach(inp => inp.addEventListener('change', () => {
    inp.value = clamp(+inp.value, +inp.min, +inp.max);
    const hsv = rgbToHsv(+rInput.value, +gInput.value, +bInput.value);
    hue = hsv.h;
    sat = hsv.s;
    val = hsv.v;
    updateUI();
    inp.setCustomValidity('');
    inp.reportValidity();
}));

hexInput.addEventListener('input', () => { userEditingHex = true; });
hexInput.addEventListener('change', () => {
    userEditingHex = false;
    const rgb = hexToRgb(hexInput.value);
    if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        hue = hsv.h;
        sat = hsv.s;
        val = hsv.v;
        updateUI();
    }
    hexInput.setCustomValidity('');
    hexInput.reportValidity();
});

/* ===== Basic colors ===== */
const basicColors = [
    '#000000', '#800000', '#008000', '#808000', '#000080', '#800080', '#008080', '#c0c0c0',
    '#808080', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
    '#ffb900', '#ff8c00', '#f7630c', '#ca5010', '#da3b01', '#ef6950', '#d13438', '#ff4343',
    '#e74856', '#e81123', '#ea005e', '#c30052', '#e3008c', '#bf0077', '#9a0089', '#0078d7',
    '#0063b1', '#8e8cd8', '#6b69d6', '#8764b8', '#b146c2', '#0099bc', '#2d7d9a', '#00b7c3',
    '#038387', '#00b294', '#018574', '#00cc6a', '#10893e', '#7a7574', '#5d5a58', '#68768a',
    '#515c6b', '#567c73', '#486860', '#498205', '#107c10', '#767676', '#4c4a48', '#69797e',
    '#847545', '#7e735f', '#7f735f', '#837250', '#7f735f', '#62594e', '#525252', '#4a4a4a'
];
const basicEl = document.getElementById('basicColors');
basicColors.forEach(c => {
    const d = document.createElement('div');
    d.className = 'swatch';
    d.style.background = c;
    d.onclick = () => {
        const rgb = hexToRgb(c);
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        hue = hsv.h; sat = hsv.s; val = hsv.v;
        updateUI();
    };
    basicEl.appendChild(d);
});

ipcRenderer.on('current-color', (event, currentColor) => {
    const rgb = hexToRgb(currentColor);
    if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        hue = hsv.h; sat = hsv.s; val = hsv.v;
        updateUI();
    }
});

document.getElementById('okBtn').onclick = () => {
    ipcRenderer.send('color-selected', hexInput.value);
};

document.getElementById('cancelBtn').onclick = () => {
    ipcRenderer.send('colorpicker-close');
};

/* ===== Init ===== */
updateUI();

ipcRenderer.on('high-contrast-state', (event, isHighContrast) => {
    if (isHighContrast) {
        document.body.dataset.highcontrast = 'true';
    } else {
        document.body.dataset.highcontrast = 'false';
    }
});

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
    const lightMixH = mixHexColors(hex, '#242424', 0.75);
    const darkMixH = mixHexColors(hex, '#f7f7f7', 0.75);
    const imgDarkColor2 = hexToNormalFilter(darkMix);

    removeStyle(); // Remove previous style before applying new one

    const style = document.createElement('style');
    style.id = "accent-style"; // Unique ID for removal
    style.innerHTML = `
            /* System theme */
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

function removeStyle() {
    const existingStyle = document.getElementById("accent-style");
    if (existingStyle) {
        existingStyle.remove();
    }
}

ipcRenderer.on('colorsavestate', (event) => {
    const useAccentColor = localStorage.getItem("useAccentColor") === "true";
    const accentColor = localStorage.getItem("accentColor") || "#ff0000";
    if (useAccentColor) applyAccentColor(accentColor);
    if (useAccentColor) {
        applyAccentColor(accentColor);
    } else {
        removeStyle();
    }
});