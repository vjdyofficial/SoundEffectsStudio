async function getAppDataPath() {
    const appDataPath = await ipcRenderer.invoke("get-appdata-path");
    audioDir = path.join(appDataPath, "VJDY FM Sound Effects Studio", "assets", "sfx");
}

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

setupToggle('toggleVisualiserCheckbox', 'toggle-visualiser', 'External TV enabled.', 'External TV disabled.');

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