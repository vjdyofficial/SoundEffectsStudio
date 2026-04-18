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

    const msgEl = document.createElement("pre");
    msgEl.className = `log-msg log-${type}`;
    msgEl.innerHTML = msg + ` - <em class="monospace_font_sub log-${type}">${core}</em>`;

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
    const { event: type, msg, time } = payload;
    addLogRow(type, msg, time, "Main Window");
});

let pinwindow = false;

document.getElementById('pinbtn').addEventListener('click', (e) => {
    pinwindow = !pinwindow;
    ipcRenderer.send('set-pinwindow', pinwindow);
})

ipcRenderer.on('icon-pinwindow', (event, bool) => {
    document.getElementById('pinIcon').src = bool ? 'icons/codicons/pinned.svg' : 'icons/codicons/pin.svg';
})

ipcRenderer.on('memory-update', (event, { windowName, memory }) => {
    const tableBody = document.querySelector('#tablew tbody');
    if (!tableBody) return;

    let row = tableBody.querySelector(`tr[data-window="${windowName}"]`);
    if (!row) {
        row = document.createElement('tr');
        row.dataset.window = windowName;
        tableBody.appendChild(row);
    }

    row.innerHTML = `
                <td>${windowName}</td>
                <td>${memory.fpsRate}</td>
            `;
});

ipcRenderer.on('video-info-update', (event, videoInfo) => {
    const tableBody = document.querySelector('#videoinfo_table tbody');
    if (!tableBody) return;

    let row = tableBody.querySelector(`tr[data-video-id="${videoInfo.id}"]`);
    if (!row) {
        row = document.createElement('tr');
        row.dataset.videoId = videoInfo.id;
        tableBody.appendChild(row);
    }

    row.innerHTML = `
                <td>${videoInfo.id}</td>
                <td>${videoInfo.currentTime.toFixed(2)}s</td>
                <td>${videoInfo.videoWidth}x${videoInfo.videoHeight}</td>
                <td>${videoInfo.videoFrameRate.toFixed(2)}</td>
            `;
});

ipcRenderer.on('audio-info-update', (event, audioInfo) => {
    const tableBody = document.querySelector('#audioinfo_table tbody');
    if (!tableBody) return;

    let row = tableBody.querySelector(`tr[data-audio-id="${audioInfo.id}"]`);
    if (!row) {
        row = document.createElement('tr');
        row.dataset.audioId = audioInfo.id;
        tableBody.appendChild(row);
    }

    row.innerHTML = `
                <td>${audioInfo.id}</td>
                <td>${audioInfo.currentTime.toFixed(2)}s / ${audioInfo.duration.toFixed(2)}s</td>
                <td>${audioInfo.playbackRate}x</td>
            `;
});

function updateMemoryTable({ tableSelector, rowKey, columns }) {
    const tableBody = document.querySelector(`${tableSelector} tbody`);
    if (!tableBody) return;

    let row = tableBody.querySelector(`tr[data-key="${rowKey}"]`);
    if (!row) {
        row = document.createElement('tr');
        row.dataset.key = rowKey;
        tableBody.appendChild(row);
    }

    row.innerHTML = columns.map(v => `<td>${v}</td>`).join('');
}

// Handle incoming memory update
ipcRenderer.on('memory-update-component', (_, { memory, modules }) => {
    // Main Node memory
    updateMemoryTable({
        tableSelector: '#tableNode',
        rowKey: memory.pid,
        columns: [
            'Node.js',
            '',
            (memory.residentSet / 1024 / 1024).toFixed(1) + ' MB',
            (memory.private / 1024 / 1024).toFixed(1) + ' MB',
            (memory.shared / 1024 / 1024).toFixed(1) + ' MB'
        ]
    });

    const tableBody = document.querySelector('#tableNodeModules tbody');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    modules.forEach(mod => {
        const row = document.createElement('tr');

        const id = typeof mod.id === 'string' ? mod.id : '(unknown)';

        const cleanId = id.startsWith(__dirname)
            ? id.replace(__dirname, '').replace(/^[/\\]/, '')
            : id;

        row.innerHTML = `<td>${cleanId}</td>`;

        tableBody.appendChild(row);
    });


});

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

const DATA_ARRAY_LIST = {}

const ChannelWidget_External = new BroadcastChannel('widget_external');
ChannelWidget_External.onmessage = (event) => {
    if (event.data.type === 'DATA_ARRAY') {
        const dataArray = event.data.array;
        const { levelL, levelR } = event.data.peaks;

        const total = dataArray.reduce((sum, value) => sum + value, 0);
        DATA_ARRAY_LIST[0] = total;
        document.getElementById("broadcast_channelwidget_02_data").value = levelL;
        document.getElementById("broadcast_channelwidget_03_data").value = levelR;
    }
}

setInterval(() => {
    document.getElementById("broadcast_channelwidget_01_data").textContent = DATA_ARRAY_LIST[0];
}, 300);

// ui.js

const audioInfoChannel = new BroadcastChannel("sfx-audio-info");

audioInfoChannel.onmessage = (event) => {
    const data = event.data;

    if (data.type === "audio-info") {
        document.getElementById("audioctxinfo_latency").textContent =
            data.baseLatency.toFixed(4) + " s";

        document.getElementById("audioctxinfo_outputlatency").textContent =
            data.outputLatency.toFixed(4) + " s";  

        document.getElementById("audioctxinfo_currentTime").textContent =
            data.currentTime.toFixed(2) + " s";

        document.getElementById("audioctxinfo_sampleRate").textContent =
            data.sampleRate + " Hz";

        document.getElementById("audioctxinfo_state").textContent =
            data.state;

        document.getElementById("audioctxinfo_timestamp").textContent =
            data.timestamp.toFixed(2);
    }
};

const VideoBroadcast = new BroadcastChannel('videobroadcast');

VideoBroadcast.onmessage = (event) => {
    if (event.data.type === 'VIDEO_STATE') {
        const data = event.data;

        document.getElementById('broadcast_videobroadcast_01_data').textContent = data.src || 'N/A';
        document.getElementById('broadcast_videobroadcast_02_data').textContent = data.time || 'N/A';
        document.getElementById('broadcast_videobroadcast_03_data').textContent = data.deck || 'N/A';
        document.getElementById('broadcast_videobroadcast_04_data').textContent = data.speed || 'N/A';
        document.getElementById('broadcast_videobroadcast_05_data').textContent = data.playing || 'N/A';
    }
};