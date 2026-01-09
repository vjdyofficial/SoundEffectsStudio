const { ipcRenderer } = require('electron');
let lineRaw;

function createSlideTable(lines) {
    const tbody = document.querySelector('#slides-table tbody');
    tbody.innerHTML = ''; // clear existing rows

    lines.forEach((line, index) => {
        const tr = document.createElement('tr');
        tr.className = 'slide-row';

        // Column 1: slide content
        const tdContent = document.createElement('td');
        tdContent.innerHTML = `
            <div class="output_transcript bbcode onTranscript">${parseBBCodeWithGroups(line.text || line, false)}</div>
            `;

        // Column 2: index number
        const tdIndex = document.createElement('td');
        tdIndex.innerHTML = `
            <strong class="chip_styleoutline_forceinvert monospace_font" id="preloadSamples_Value">
                ${index + 1}
            </strong>
            `

        tr.appendChild(tdIndex);
        tr.appendChild(tdContent);

        tr.onclick = () => {
            ipcRenderer.send('teleprompter:goto', index);
        }

        tbody.appendChild(tr);
    });

    document.getElementById('contentCheck').style.visibility = "hidden";
}

ipcRenderer.on('teleprompter:lines:updated', (event, lines) => {
    lineRaw = lines

    if (lineRaw.length === 0) {
        return;
    } else {
        document.getElementById('contentCheck').style.visibility = "hidden";
        createSlideTable(lines);
    }
})

ipcRenderer.on('teleprompter:lines:remove', (event, lines) => {
    lineRaw = [];
    const tbody = document.querySelector('#slides-table tbody');
    tbody.innerHTML = ''; // clear existing rows
    document.getElementById('contentCheck').style.visibility = "visible";
})

let pinwindow = false;

document.getElementById('pinbtn').addEventListener('click', (e) => {
    pinwindow = !pinwindow;
    ipcRenderer.send('set-pinwindow', pinwindow);
})

ipcRenderer.on('icon-pinwindow', (event, bool) => {
    document.getElementById('pinIcon').src = bool ? 'icons/codicons/pinned.svg' : 'icons/codicons/pin.svg';
})

function createZoomModule({
    cssVar = '--fontsize-to-teleprompt',
    storageKey = 'teleprompt.fontSize',
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
        windowName: 'Transcript Viewer (sfxstudio.view.teleprompter)', // give a unique name per window
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