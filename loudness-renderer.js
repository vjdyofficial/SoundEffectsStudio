const loudness = require('loudness');
const systemvolumeControl = document.getElementById('systemvolumeControl');

let disableupdate = false;
let mute = false;

async function toggleMute() {
    const isMuted = await loudness.getMuted();
    mute = await loudness.getMuted();
    await loudness.setMuted(!isMuted); // flip it
}

async function getSystemVoulme() {
    const volume = await loudness.getVolume();
    if (!disableupdate) {
        setVolumetoSlider(volume);
        systemvolumeControl.value = volume;
    }
    requestAnimationFrame(getSystemVoulme);
}

async function setSystemVolume(level) {
    if (level <= 0) {
        toggleMute()
    } else {
        await loudness.setVolume(level);
    }
}

getSystemVoulme();

async function setVolumetoSlider(volume) {
    const percent = volume;
    document.documentElement.style.setProperty('--range-percent-system', percent + '%');
    const systemvolumeText = document.getElementById('systemvolumeText');
    const systemvolumeTextMain = document.getElementById('systemvolumeTextMain');
    const textMute = mute ? `Mute Volume` : `Unmute Volume`

    if (systemvolumeText) {
        systemvolumeText.textContent = `${percent}%`;
    }
    if (systemvolumeTextMain) {
        systemvolumeTextMain.textContent = percent <= 0 ? textMute : `${percent}%`;
    }
}

function ipcsetVolume(volume) {
    const level = Number(volume); // 🔥 convert string -> number
    setSystemVolume(level);
    setVolumetoSlider(level);
}

if (systemvolumeControl) {
    systemvolumeControl.addEventListener('input', function (e) {
        ipcsetVolume(Number(e.target.value)); // 🔥 convert here too
    });
    systemvolumeControl.addEventListener('mousedown', function () {
        disableupdate = true;
    });
    systemvolumeControl.addEventListener('mouseup', function () {
        disableupdate = false;
    });
}
