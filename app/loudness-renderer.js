const loudness = require('loudness');
const systemvolumeControl = document.getElementById('systemvolumeControl');

let disableupdate = false;
let mute = false;

// Toggle mute
async function toggleMute() {
    const isMuted = await loudness.getMuted();
    mute = isMuted;
    await loudness.setMuted(!isMuted);
}

// Update slider and text
async function setVolumetoSlider(volume) {
    const percent = volume;
    document.documentElement.style.setProperty('--range-percent-system', percent + '%');

    const systemvolumeText = document.getElementById('systemvolumeText');
    const systemvolumeTextMain = document.getElementById('systemvolumeTextMain');
    const textMute = disableupdate ? `Toggle Mute` : `${percent}%`;

    if (systemvolumeText) systemvolumeText.textContent = `${percent}%`;
    if (systemvolumeTextMain) systemvolumeTextMain.textContent = percent <= 0 ? textMute : `${percent}%`;
}

// Set system volume
async function setSystemVolume(level) {
    if (level <= 0) {
        toggleMute();
    } else {
        await loudness.setVolume(level);
    }
    // Update slider immediately
    if (!disableupdate) setVolumetoSlider(level);
}

// Handle slider input
if (systemvolumeControl) {
    systemvolumeControl.addEventListener('input', e => {
        const level = Number(e.target.value);
        setSystemVolume(level);
    });
    systemvolumeControl.addEventListener('mousedown', () => {
        disableupdate = true;
    });
    systemvolumeControl.addEventListener('mouseup', () => {
        disableupdate = false;
        // sync slider after user releases
        loudness.getVolume().then(v => setVolumetoSlider(v));
    });
}

// Optional: slower polling for external changes (volume keys, etc)
setInterval(async () => {
    if (!disableupdate) {
        const volume = await loudness.getVolume();
        systemvolumeControl.value = Number(volume)
        setVolumetoSlider(volume);
    }
}, 500); // check every 300ms instead of every frame