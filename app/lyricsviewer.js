const { ipcRenderer } = require('electron');

let pinwindow = false;

function createSlideTable(lines, id) {
    const tbody = document.querySelector(`#slides-table tbody[data-deck="${id}"]`);
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!Array.isArray(lines) || lines.length === 0) {
        return;
    }

    // 🔹 Flatten lines by splitting on newline
    const splitLines = lines
        .flatMap(line => {
            const text = typeof line === 'object'
                ? (line.text ?? '')
                : line;

            return text
                .split(/\r?\n/)   // supports Windows + Unix
                .map(l => l.trim())
                .filter(Boolean);
        });

    if (splitLines.length === 0) {
        return;
    }

    splitLines.forEach((text, index) => {
        const tr = document.createElement('tr');
        tr.className = 'slide-row';

        // Index column
        const tdIndex = document.createElement('td');
        tdIndex.innerHTML = `
            <strong class="chip_styleoutline_forceinvert monospace_font">
                ${index + 1}
            </strong>
        `;

        // Content column
        const tdContent = document.createElement('td');
        tdContent.textContent = text; // safer than innerHTML

        tr.appendChild(tdIndex);
        tr.appendChild(tdContent);
        tbody.appendChild(tr);
    });
}

document.getElementById('pinbtn').addEventListener('click', (e) => {
    pinwindow = !pinwindow;
    ipcRenderer.send('set-pinwindow', pinwindow);
})

const lyricsByDeck = {
    A: [],
    B: [],
    C: [],
    D: []
}

function showDeck(id) {
    document
        .querySelectorAll('#slides-table tbody[data-deck]')
        .forEach(tbody => {
            tbody.style.display = (tbody.dataset.deck !== id) ? "none" : "inherit";
        });
}

ipcRenderer.on('showlyrics-bydeck', (event, deckId) => {
    showDeck(deckId);

    if (lyricsByDeck[deckId].length == 0) {
        document.getElementById('contentCheck')?.style.setProperty('visibility', 'visible');
    } else {
        document.getElementById('contentCheck')?.style.setProperty('visibility', 'hidden');
    }
})

showDeck("A"); // shows deckA, hides B C D

ipcRenderer.on('sendlyrics-bydeck', (event, deckId, text) => {
    if (!lyricsByDeck[deckId]) return
    lyricsByDeck[deckId] = [];
    if (text) {
        lyricsByDeck[deckId].push(text);
    } else {
        const tbody = document.querySelector(`#slides-table tbody[data-deck="${deckId}"]`);
        if (!tbody) return;
        tbody.innerHTML = '';
    }
    createSlideTable(lyricsByDeck[deckId], deckId);

    if (lyricsByDeck[deckId].length <= 0) {
        document.getElementById('contentCheck')?.style.setProperty('visibility', 'visible');
    } else {
        document.getElementById('contentCheck')?.style.setProperty('visibility', 'hidden');
    }
})

ipcRenderer.on('removelyrics-bydeck', (event, deckId) => {
    if (!lyricsByDeck[deckId]) return
    lyricsByDeck[deckId] = [];

    const tbody = document.querySelector(`#slides-table tbody[data-deck="${deckId}"]`);
    if (!tbody) return;
    tbody.innerHTML = '';

    if (lyricsByDeck[deckId].length <= 0) {
        document.getElementById('contentCheck')?.style.setProperty('visibility', 'visible');
    } else {
        document.getElementById('contentCheck')?.style.setProperty('visibility', 'hidden');
    }
})

ipcRenderer.on('icon-pinwindow', (event, bool) => {
    document.getElementById('pinIcon').src = bool ? 'icons/codicons/pinned.svg' : 'icons/codicons/pin.svg';
})

function createZoomModule({
    cssVar = '--fontsize-to-teleprompt',
    storageKey = 'lyricsViewer.fontSize',
    min = 9,
    max = 20,
    step = 1,
    defaultValue = 14
} = {}) {
    const root = document.documentElement;

    function get() {
        return parseFloat(
            getComputedStyle(root).getPropertyValue(cssVar)
        );
    }

    function clamp(v) {
        return Math.min(max, Math.max(min, v));
    }

    function apply(v) {
        const value = clamp(v);
        root.style.setProperty(cssVar, `${value}px`);
        localStorage.setItem(storageKey, value);
        return value;
    }

    function zoomIn() {
        return apply(get() + step);
    }

    function zoomOut() {
        return apply(get() - step);
    }

    function reset() {
        return apply(defaultValue);
    }

    function restore() {
        const saved = Number(localStorage.getItem(storageKey));
        if (!Number.isNaN(saved)) {
            apply(saved);
        } else {
            apply(defaultValue);
        }
    }

    return {
        zoomIn,
        zoomOut,
        reset,
        restore,
        get
    };
}

const zoomModule = createZoomModule();
zoomModule.restore();

document.getElementById('zoomin').onclick = () => zoomModule.zoomIn();
document.getElementById('zoomout').onclick = () => zoomModule.zoomOut();
document.getElementById('zoomreset').onclick = () => zoomModule.reset();

window.addEventListener('keydown', e => {
    if (!e.ctrlKey) return;

    switch (e.key) {
        case '+':
        case '=':
            e.preventDefault();
            zoomModule.zoomIn();
            break;

        case '-':
            e.preventDefault();
            zoomModule.zoomOut();
            break;

        case '0':
            e.preventDefault();
            zoomModule.reset();
            break;
    }
});

let lastFrame = performance.now();
let fps = 0;

// --- Functions ---
function getFPS() {
    const now = performance.now();
    fps = Math.min(144, Math.max(0, 1000 / (now - lastFrame)));
    lastFrame = now;
    return fps;
}

setInterval(async () => {
    const mem = await process.getProcessMemoryInfo(); // nodeIntegration required

    ipcRenderer.send('memory-update', {
        windowName: 'Lyrics Viewer (sfxstudio.view.lyrics)', // give a unique name per window
        memory: {
            fpsRate: fps.toFixed(1),
            workingSetMB: Math.round(mem.residentSet / 1024),
            privateMB: Math.round(mem.private / 1024),
            sharedMB: Math.round(mem.shared / 1024),
        }
    });
}, 1000);

// --- Main loop ---
function updateFPS() {
    getFPS();
    requestAnimationFrame(updateFPS);
}

updateFPS();