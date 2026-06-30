let audioList = [];
let audioDir = 'sfx';

// Play audio by button id
function playAudioById(btnId) {
    const idx = parseInt(btnId.replace('audio-btn-', ''), 10);
    if (!isNaN(idx) && audioList[idx]) {
        playAudio(audioList[idx].file);
    }
}

const container = document.getElementById('audio-list');

function attachAudioEvents(btn, item) {
    // Click → play normally
    btn.addEventListener('click', () => playAudioById(btn.id));

    // Right-click → sample mode
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('mousedown', e => {
        if (e.button === 2) playAudioSampleMode(item.file);
    });

    // Touch long press → sample mode
    let longPressTimer;
    btn.addEventListener('touchstart', () => {
        longPressTimer = setTimeout(() => playAudioSampleMode(item.file), 500);
    });
    ['touchend', 'touchmove'].forEach(evt => btn.addEventListener(evt, () => clearTimeout(longPressTimer)));
}

// Function to remove all audio buttons
function clearAudioButtons() {
    if (!container) return;   // safety check
    container.innerHTML = ''; // removes all buttons and their event listeners
}

//

// ----------------------------
// Load SFX List
// ----------------------------
async function loadSFXList() {
    const result = await ipcRenderer.invoke("get-sfx-list");
    if (result.error) {
        console.error("Error loading sound effects pack:", result.error);
        return;
    }
    audioList = result;
    listAudioFiles();
}

// ----------------------------
// Get AppData Path
// ----------------------------
async function getAppDataPath() {
    const appDataPath = await ipcRenderer.invoke("get-appdata-path");
    audioDir = path.join(appDataPath, "VJDY FM Sound Effects Studio", "assets", "sfx");
}

let touchtype = 0;
touchtype = localStorage.getItem('touchinteract') || 0;

document.getElementById('samplerInteractType').addEventListener('change', (e) => {
    touchtype = Number(e.target.value)
    localStorage.setItem('touchinteract', Number(e.target.value))
})

document.getElementById('samplerInteractType').dispatchEvent(new Event('change'));

function setTouchType(type) {
    touchtype = type;
    snackbar(`Touch input mode set to: ${type === 0 ? 'Default' : type === 1 ? 'Sample Mode' : 'Hold to Sample Mode'}`);
}

function playonMode(idx) {
    if (touchtype === 0) { toggleAudio(idx) }
    else if (touchtype === 1) { playAudio(idx, true) }
}

let letPlayonHotkey = true;

const hotkeyAudioMap =
    JSON.parse(localStorage.getItem('indexButton')) || {
        "1": [],
        "2": [],
        "3": [],
        "4": [],
        "5": [],
        "6": [],
        "7": [],
        "8": [],
        "9": [],
        "0": []
    };

const qwertyKey = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']

let saveIndexDialogOpen = false;

function OpenButtonIndexSlotSave(idx) {
    const index = idx;
    document.getElementById('saveButtonIndexDialog').showModal();

    function onKeyPress(event) {
        const key = event.key;
        if (key >= '0' && key <= '9' || (qwertyKey.indexOf(key) !== -1)) {
            saveButtonState(index, key);
            snackbar(`Button index <strong>${index}</strong> is saved to Number Key: <strong>${key}</strong>.`, "Button Index Slot");
            CloseAnimationInit(document.getElementById('saveButtonIndexDialog'));
            saveIndexDialogOpen = false;
            document.removeEventListener('keydown', onKeyPress);
        }
    }

    document.addEventListener('keydown', onKeyPress);
    saveIndexDialogOpen = true;

    return () => {
        snackbar("Index saving slot cancelled", "Button Index Slot");
        CloseAnimationInit(document.getElementById('saveButtonIndexDialog'));
        saveIndexDialogOpen = false;
        document.removeEventListener('keydown', onKeyPress);
    };
}

function saveButtonState(idx, assigned) {
    hotkeyAudioMap[assigned] = [idx];
    localStorage.setItem('indexButton', JSON.stringify(hotkeyAudioMap));
}

let saveIndexDialog = null;

function listAudioFiles() {
    if (!container) return;
    container.innerHTML = '';

    audioList.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.className = `getButton fallback ${item.class || 'category_und'} ${item.isOffensive ? 'explicit' : 'minimal'}`;
        btn.dataset.audioBtnIndex = idx;

        const label = document.createElement('p');
        label.className = 'audio-label-wrapper';
        label.innerHTML = `<span class="audio-label">${item.name || item.file.replace(/\.[^/.]+$/, '')}</span>`;
        btn.appendChild(label);

        const bTag = label.querySelector('.audio-label b');
        const variableText = bTag
            ? label.querySelector('.audio-label').textContent.replace(bTag.textContent, '')
            : label.querySelector('.audio-label').textContent;

        btn.title = `${variableText}${item.isOffensive ? ' - Offensive Sound Effect\n\n' : ''}`;

        ['touchstart', 'click'].forEach(evt => btn.addEventListener(evt, () => { playonMode(idx) }));

        // RIGHT CLICK → force play from start
        btn.addEventListener('contextmenu', e => {
            e.preventDefault();
            if (e.ctrlKey) {
                saveIndexDialog = OpenButtonIndexSlotSave(idx);
            } else {
                if (touchtype === 1) { stopAudio(idx) }
            }
        });


        btn.addEventListener('mousedown', e => {
            if (touchtype === 2) { playAudio(idx, false) }
        });

        btn.addEventListener('mouseup', e => {
            if (touchtype === 2) { setTimeout(() => stopAudio(idx), 200) }
        });

        container.appendChild(btn);
    });
}

// Toggle play/pause
function toggleAudio(btnIndex) {
    const audio = document.querySelector(`audio[data-btn-index="${btnIndex}"]`);
    if (audio) {
        stopAudio(btnIndex);
    } else {
        playAudio(btnIndex);
    }
}

// Play audio (with optional restart)
function playAudio(btnIndex, restart = false) {
    const audioItem = audioList[btnIndex];
    if (!audioItem) return;

    let audio = document.querySelector(`audio[data-btn-index="${btnIndex}"]`);
    if (audio) {
        if (restart) {
            audio.currentTime = 0;
            audio.play();
            addDotOnButton(btnIndex);
        } else if (!audio.paused) {
            audio.remove();
            removeDotFromButton(btnIndex);
        } else {
            audio.play();
            addDotOnButton(btnIndex);
        }
        return;
    }

    // Create new audio element
    audio = new Audio(`${audioDir}/${audioItem.file}`);
    audio.dataset.btnIndex = btnIndex;
    audio.loop = audioItem.loop === true;

    document.getElementById('storedata').appendChild(audio);
    audio.play();
    addDotOnButton(btnIndex);

    audio.addEventListener('timeupdate', () => updateProgress(audio));
    audio.addEventListener('ended', () => {
        removeDotFromButton(btnIndex);
        audio.remove();
    });
}

// ----------------------------
// Stop audio by button index
// ----------------------------
function stopAudio(btnIndex) {
    const audio = document.querySelector(`audio[data-btn-index="${btnIndex}"]`);
    if (audio) {
        audio.remove();
        removeDotFromButton(btnIndex);
    }
}

// ----------------------------
// Add dot and progress bar to button
// ----------------------------
function addDotOnButton(btnIndex) {
    const btn = container.querySelector(`button[data-audio-btn-index="${btnIndex}"]`);
    if (!btn || btn.querySelector('.dot')) return;

    const dot = document.createElement('span');
    dot.className = 'dot';
    const progressBar = document.createElement('progress');
    progressBar.className = 'progressbar';
    progressBar.min = 0;
    progressBar.max = 100;
    dot.appendChild(progressBar);

    btn.appendChild(dot);
    btn.classList.add('blinkingoutline');
}

// ----------------------------
// Remove dot and progress from button
// ----------------------------
function removeDotFromButton(btnIndex) {
    const btn = container.querySelector(`button[data-audio-btn-index="${btnIndex}"]`);
    if (!btn) return;
    btn.classList.remove('blinkingoutline');
    const dot = btn.querySelector('.dot');
    if (dot) dot.remove();
}

// ----------------------------
// Update progress bar
// ----------------------------
function updateProgress(audio) {
    const btnIndex = audio.dataset.btnIndex;
    const btn = container.querySelector(`button[data-audio-btn-index="${btnIndex}"]`);
    if (!btn) return;

    const progressBar = btn.querySelector('.dot progress');
    if (progressBar && audio.duration > 0) {
        progressBar.value = (audio.currentTime / audio.duration) * 100;
    }
}

// ----------------------------
// Stop all audios (global function)
// ----------------------------
function StopAllAudio() {
    container.querySelectorAll('.getButton').forEach(btn => btn.classList.remove('blinkingoutline'));
    document.querySelectorAll('#storedata audio').forEach(audio => audio.remove());
    container.querySelectorAll('.dot').forEach(dot => dot.remove());
}

// Attach to StopAll button
const stopAllButton = document.getElementById('StopAllAudio');
if (stopAllButton) stopAllButton.addEventListener('click', StopAllAudio);

// ----------------------------
// Initialize
// ----------------------------
loadSFXList();
getAppDataPath();

//

document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});

const storeData = document.getElementById('storedata');

storeData.addEventListener('play', function (e) {
    if (e.target.tagName === 'AUDIO') {
        e.target.addEventListener('ended', function handler() {
            const src = e.target.currentSrc.split('/').pop();
            const idx = audioList.findIndex(item => item.file.endsWith(src));
            removeDotFromButton(idx);

            e.target.remove();
            e.target.removeEventListener('ended', handler);
        });
    }
}, true); // useCapture = true so bubbling works

// ------------------------------
// ELEMENT CONFIGURATION
// ------------------------------
const volumeControls = [
    { slider: 'volumeControlTarget', text: 'volumeText2' },
    { slider: 'mediavolumeControl', text: 'mediavolumeTextMain', media: 'MediaExtDeck1' },
    { slider: 'mediavolumeControlExt2', text: 'mediavolumeTextMain2', media: 'MediaExtDeck2' },
    { slider: 'mediavolumeControlA', text: 'mediavolumeATextMain', media: 'mediaA' },
    { slider: 'mediavolumeControlB', text: 'mediavolumeBTextMain', media: 'mediaB' },
    { slider: 'mediavolumeControlC', text: 'mediavolumeCTextMain', media: 'mediaC' },
    { slider: 'mediavolumeControlD', text: 'mediavolumeDTextMain', media: 'mediaD' }
];

// ------------------------------
// GENERIC VOLUME HANDLER
// ------------------------------
function setupVolume(vc) {
    const slider = document.getElementById(vc.slider);
    const text = document.getElementById(vc.text);
    const media = vc.media ? document.getElementById(vc.media) : null;
    const savestate = localStorage.getItem(`andromeda_volume_${vc.media}`) || 1;
    if (!slider) return;

    function update(val) {
        const percent = Math.round(val * 100);
        if (text) text.textContent = percent + '%';
        if (media) media.volume = val;
        localStorage.setItem(`andromeda_volume_${vc.media}`, val);
    }

    slider.value = savestate;
    update(parseFloat(slider.value));

    slider.addEventListener('input', function () {
        update(parseFloat(slider.value));
    });
}

volumeControls.forEach(setupVolume);

// ------------------------------
// GENERIC TOGGLE HANDLER
// ------------------------------
function setupToggle(id, ipc, textOn, textOff) {
    const checkbox = document.getElementById(id);
    if (!checkbox) return;
    let state = false;
    function toggle() {
        state = !state;
        checkbox.checked = state;
        if (ipc) require('electron').ipcRenderer.send(ipc, state);
        snackbar(state ? textOn : textOff);
    }
    checkbox.addEventListener('click', toggle);
    checkbox.addEventListener('change', toggle);
}

setupToggle('toggleVisualiserCheckbox', 'toggle-visualiser', 'External visualizer enabled.', 'External visualizer disabled.');

// ------------------------------
// KEYBOARD SHORTCUTS
// ------------------------------
document.addEventListener('keydown', function (e) {
    const slider = document.getElementById('volumeControl');
    if (!slider) return;
    const step = slider.step ? parseFloat(slider.step) : 0.01;

    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '+' || e.key === '=') {
            slider.value = Math.min(parseFloat(slider.value) + step, 1);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            e.preventDefault();
        } else if (e.key === '-') {
            slider.value = Math.max(parseFloat(slider.value) - step, 0);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            e.preventDefault();
        }
    }
});