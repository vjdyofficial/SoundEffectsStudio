const { ipcRenderer } = require("electron");

/* =========================
   CONFIG
========================= */
const MAX_LOG_ROWS = 150;

/* =========================
   STATE
========================= */
let warnCount = 0;
let errorCount = 0;
let infoCount = 0;

/* =========================
   HELPERS
========================= */
function toHHMMSS(date) {
    const d = new Date(date);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function updateCounters(type) {
    if (type === "warn") {
        warnCount++;
        const el = document.getElementById("log-warn-count");
        if (el) el.textContent = warnCount;
    }

    if (type === "error") {
        errorCount++;
        const el = document.getElementById("log-error-count");
        if (el) el.textContent = errorCount;
    }

    if (type === "info") {
        infoCount++;
        const el = document.getElementById("log-info-count");
        if (el) el.textContent = infoCount;
    }
}

function trimLogRows(consoleEl) {
    while (consoleEl.children.length > MAX_LOG_ROWS) {
        consoleEl.removeChild(consoleEl.firstChild);
    }
}

/* =========================
   UI RENDER
========================= */
function addLogRow(type, msg, time, core) {
    const consoleEl = document.getElementById("console");
    if (!consoleEl) return;

    updateCounters(type);

    const row = document.createElement("div");
    row.className = `log-row log-${type} bg-${type}`;

    const typeEl = document.createElement("img");
    typeEl.className = "log-type logicon";
    typeEl.src = `images/console/${type}.svg`;
    typeEl.width = 16;
    typeEl.height = 16;
    typeEl.alt = type.toUpperCase();

    const timeEl = document.createElement("span");
    timeEl.className = "log-time";
    timeEl.textContent = toHHMMSS(time);

    const msgEl = document.createElement("div");
    msgEl.className = `log-msg log-${type}`;

    let parsedJson = null;
    let jsonStart = -1;
    let jsonEnd = -1;
    if (Array.isArray(msg) || (msg && typeof msg === "object")) {
        parsedJson = msg;
    } else if (typeof msg === "string") {
        // Find a JSON array or object even when embedded in a larger log message.
        for (let start = 0; start < msg.length; start++) {
            if (msg[start] !== "[" && msg[start] !== "{") continue;

            const closers = [];
            let inString = false;
            let escaped = false;
            for (let end = start; end < msg.length; end++) {
                const char = msg[end];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (char === "\\") escaped = true;
                    else if (char === '"') inString = false;
                    continue;
                }
                if (char === '"') inString = true;
                else if (char === "[") closers.push("]");
                else if (char === "{") closers.push("}");
                else if (char === "]" || char === "}") {
                    if (closers.pop() !== char) break;
                    if (closers.length !== 0) continue;
                    try {
                        const parsed = JSON.parse(msg.slice(start, end + 1));
                        if (parsed && typeof parsed === "object") {
                            parsedJson = parsed;
                            jsonStart = start;
                            jsonEnd = end + 1;
                        }
                    } catch {
                        // Keep searching for valid JSON.
                    }
                    break;
                }
            }
            if (parsedJson) break;
        }
    }

    if (parsedJson) {
        const after = jsonStart !== -1 ? msg.slice(jsonEnd) : "";
        if (jsonStart !== -1) {
            const before = msg.slice(0, jsonStart);
            if (before) msgEl.appendChild(document.createTextNode(before));
        }
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = Array.isArray(parsedJson)
            ? `Array JSON (${parsedJson.length} items)`
            : "Object JSON";

        const jsonEl = document.createElement("pre");
        jsonEl.textContent = JSON.stringify(parsedJson, null, 2);
        details.append(summary, jsonEl);
        msgEl.appendChild(details);
        if (jsonStart !== -1 && after) msgEl.appendChild(document.createTextNode(after));
    } else {
        msgEl.appendChild(document.createTextNode(String(msg)));
    }

    msgEl.appendChild(document.createTextNode(" - "));
    const coreEl = document.createElement("em");
    coreEl.className = `monospace_font_sub log-${type}`;
    coreEl.textContent = core;
    msgEl.appendChild(coreEl);

    row.append(typeEl, timeEl, msgEl);
    consoleEl.appendChild(row);

    trimLogRows(consoleEl);

    // auto-scroll
    consoleEl.scrollTop = consoleEl.scrollHeight;
}

/* =========================
   IPC
========================= */
ipcRenderer.on("main-log", (_event, payload) => {
    const { event: type, msg, time } = payload;
    addLogRow(type, msg, time, "Main Core");
});

ipcRenderer.on("renderer-log", (_event, payload) => {
    const { event: type, msg, time, window } = payload;
    addLogRow(type, msg, time, window || "Main Window");
});

let pinwindow = false;

document.getElementById('pinbtn').addEventListener('click', (e) => {
    pinwindow = !pinwindow;
    ipcRenderer.send('set-pinwindow', pinwindow);
})

ipcRenderer.on('icon-pinwindow', (event, bool) => {
    document.getElementById('pinIcon').src = bool ? 'icons/codicons/pinned.svg' : 'icons/codicons/pin.svg';
})

ipcRenderer.send('devconsole-ready');

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

ipcRenderer.on('window_state', (event, state) => {
    const titlebar = document.querySelector('.titlebar')
    if (titlebar) { titlebar.dataset.state = state }

    const titlebar_text = document.querySelector('.titlebar_fortext')
    if (titlebar_text) { titlebar_text.dataset.state = state }
});