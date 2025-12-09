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
    console.log('All audio buttons cleared!');
}

function listAudioFiles() {
    if (!container) return;
    container.innerHTML = '';

    audioList.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.className = `getButton fallback ${item.class || 'category_und'} ${item.isOffensive ? 'explicit' : 'minimal'}`;
        btn.id = `audio-btn-${idx}`;
        const label = document.createElement('p');
        label.className = 'audio-label-wrapper';
        label.innerHTML = `<span class="audio-label">${item.name || item.file.replace(/\.[^/.]+$/, '')}</span>`;
        btn.appendChild(label);
        const bTag = label.querySelector('.audio-label b');
        const variableText = bTag ? label.querySelector('.audio-label').textContent.replace(bTag.textContent, '') : label.querySelector('.audio-label').textContent;
        btn.title = `${variableText}\n\n${item.isOffensive ? 'Offensive Sound Effect\n\n' : ''}Press J or go to More options\nto open How to Use Screen Dialog.`;
        attachAudioEvents(btn, item);
        container.appendChild(btn);
    });
}


async function loadSFX() {
    const result = await ipcRenderer.invoke("get-sfx-list");

    if (result.error) {
        console.error("Error loading SFX:", result.error);
        return;
    }

    console.log("Loaded SFX:", result);

    audioList = result;
    listAudioFiles();
}

loadSFX();

async function getAppDataPath() {
    // 1️⃣ Get appData path from main
    const appDataPath = await ipcRenderer.invoke("get-appdata-path");

    // 2️⃣ Construct full JSON path
    const jsonPath = path.join(
        appDataPath,
        "vjdyfm-sfxstudio",
        "assets",
        "sfx"
    );

    console.log("Full SFX JSON path:", jsonPath);
    audioDir = String(jsonPath);
}

getAppDataPath();

// (Removed duplicate playAudioById function that referenced undefined audioFiles)

// Function to play audio by file name
function playAudio(fileName) {
    // Stop and remove any existing audio with the same id
    const existing = document.getElementById(fileName.replace(/\.[^/.]+$/, '')); // Use file name without extension as id
    if (existing) {
        if (existing.paused) {
            existing.play();
            return;
        } else {
            existing.remove();
            const idx = audioList.findIndex(item => item.file === fileName);
            rdotonIndex(idx);
        }
    } else {
        const audio = new Audio(`${audioDir}/${fileName}`);
        audio.id = fileName.replace(/\.[^/.]+$/, ''); // Use file name without extension as id

        const audioItem = audioList.find(item => item.file === fileName);
        audio.loop = audioItem && audioItem.loop === true;
        audio.volume = parseFloat(volumeControl.value) || 0;
        document.getElementById('storedata').appendChild(audio);
        audio.play();

        const idx = audioList.findIndex(item => item.file === fileName);
        addotonIndex(idx);
    }
}

function playAudioSampleMode(fileName) {
    // Count how many <audio> elements are currently in the DOM
    const existing = document.getElementById(fileName.replace(/\.[^/.]+$/, '')); // Use file name without extension as id
    const idx = audioList.findIndex(item => item.file === fileName);
    addotonIndex(idx);
    if (existing) {
        if (existing.paused) {
            existing.play();
            return;
        } else {
            existing.remove();
        }
    }

    const audio = new Audio(`${audioDir}/${fileName}`);
    // Set loop property based on audioList entry
    const audioItem = audioList.find(item => item.file === fileName);
    audio.loop = audioItem && audioItem.loop === true;
    audio.volume = parseFloat(volumeControl.value) || 0;
    audio.id = fileName.replace(/\.[^/.]+$/, ''); // Use file name without extension as id
    document.getElementById('storedata').appendChild(audio);
    audio.play();
}

function stopAudioSampleMode(fileName) {
    const audio = document.getElementById(fileName.replace(/\.[^/.]+$/, '')); // Use file name without extension as id
    if (audio) {
        audio.remove();
        const idx = audioList.findIndex(item => item.file === fileName);
        rdotonIndex(idx);
    }
}

function addotonIndex(idx) {
    if (idx !== -1) {
        const btn = document.getElementById(`audio-btn-${idx}`);
        if (btn && !btn.querySelector('.dot')) {
            const dot = document.createElement('span');
            dot.className = 'dot';
            btn.appendChild(dot);
            btn.classList.add('blinkingoutline'); // Add a class to indicate it's playing
            const progressBar = document.createElement('progress');
            progressBar.id = 'audio-progress-bar';
            progressBar.min = 0;
            progressBar.max = 100;
            progressBar.className = 'progressbar';
            dot.appendChild(progressBar);
        }
    }
}

function updateAudioProgressBars() {
    const audios = document.querySelectorAll('#storedata audio')
    audios.forEach(audio => {
        const fileName = audio.id;
        const idx = audioList.findIndex(item => item.file.replace(/\.[^/.]+$/, '') === fileName);
        if (idx !== -1) {
            const btn = document.getElementById(`audio-btn-${idx}`);
            if (btn) {
                const dot = btn.querySelector('.dot');
                if (dot) {
                    const progressBar = dot.querySelector('#audio-progress-bar');
                    if (progressBar && audio.duration > 0) {
                        progressBar.value = ((audio.currentTime / audio.duration) * 100);
                    }
                }
            }
        }
    });
}

// Update progress bars on timeupdate for all audio elements
document.getElementById('storedata').addEventListener('timeupdate', function (e) {
    if (e.target.tagName === 'AUDIO') {
        updateAudioProgressBars();
    }
}, true);

function rdotonIndex(idx) {
    if (idx !== -1) {
        const btn = document.getElementById(`audio-btn-${idx}`);
        if (btn) {
            btn.classList.remove('blinkingoutline'); // Remove the blinking outline class
            const dot = btn.querySelector('.dot');
            if (dot) {
                dot.remove();
            }
        }
    }
}

const stopAllButton = document.getElementById('StopAllAudio');
stopAllButton.addEventListener('click', StopAllAudio);

function StopAllAudio() {
    document.querySelectorAll('.getButton').forEach(btn => btn.classList.remove('blinkingoutline'));
    const audios = document.querySelectorAll('#storedata audio')
    audios.forEach(audio => {
        audio.remove(); // Remove audio elements from the DOM
        // Remove all dots from all buttons
        document.querySelectorAll('.dot').forEach(dot => dot.remove());
    });
}

document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});

const storeData = document.getElementById('storedata');

storeData.addEventListener('play', function (e) {
    if (e.target.tagName === 'AUDIO') {
        e.target.addEventListener('ended', function handler() {
            const src = e.target.currentSrc.split('/').pop();
            const idx = audioList.findIndex(item => item.file.endsWith(src));
            rdotonIndex(idx);

            e.target.remove();
            e.target.removeEventListener('ended', handler);
        });
    }
}, true); // useCapture = true so bubbling works

function setVolume(volume) {
    document.querySelectorAll('#storedata audio').forEach(audio => {
        audio.volume = parseFloat(volumeControl.value) || 0;
    });
    const percent = Math.round((volumeControl.value) * 100);
    document.documentElement.style.setProperty('--range-percent', percent + '%');
    const volumeText = document.getElementById('volumeText');
    const volumeTextMain = document.getElementById('volumeTextMain');
    if (volumeText) {
        volumeText.textContent = percent + '%';
    }
    if (volumeTextMain) {
        volumeTextMain.textContent = percent + '%';
    }
}

if (volumeControl) {
    volumeControl.addEventListener('input', function (volume) {
        setVolume(volume.target.value);
    });
}

const volumeControlDefault = document.getElementById('volumeControl')
const volumeControlTarget = document.getElementById('volumeControlTarget')

function setTargetVolumeText(volume) {
    const percent = Math.round((volume) * 100);
    const volumeText2 = document.getElementById('volumeText2');
    if (volumeText2) {
        volumeText2.textContent = percent + '%';
    }
}

volumeControlTarget.addEventListener('input', function () {
    setTargetVolumeText(volumeControlTarget.value);
})

function setMediaVolume(volume) {
    const percent = Math.round((volume) * 100);
    document.getElementById('MediaExtDeck1').volume = parseFloat(volume) || 0;
    const volumeText = document.getElementById('mediavolumeTextMain');
    if (volumeText) {
        volumeText.textContent = percent + '%';
    }
}
const mediavolumeControl = document.getElementById('mediavolumeControl')
mediavolumeControl.addEventListener('input', function (volume) {
    setMediaVolume(mediavolumeControl.value)
})

function setMediaVolumeExt2(volume) {
    const percent = Math.round((volume) * 100);
    document.getElementById('MediaExtDeck2').volume = parseFloat(volume) || 0;
    const volumeText = document.getElementById('mediavolumeTextMain2');
    if (volumeText) {
        volumeText.textContent = percent + '%';
    }
}
const mediavolumeControlExt2 = document.getElementById('mediavolumeControlExt2')
mediavolumeControlExt2.addEventListener('input', function (volume) {
    setMediaVolumeExt2(mediavolumeControlExt2.value)
})

function setMediaVolumeA(volume) {
    const percent = Math.round((volume) * 100);
    document.getElementById('mediaA').volume = parseFloat(volume) || 0;
    const volumeText = document.getElementById('mediavolumeATextMain');
    if (volumeText) {
        volumeText.textContent = percent + '%';
    }
}
const mediavolumeControlA = document.getElementById('mediavolumeControlA')
mediavolumeControlA.addEventListener('input', function (volume) {
    setMediaVolumeA(mediavolumeControlA.value)
})

function setMediaVolumeB(volume) {
    const percent = Math.round((volume) * 100);
    document.getElementById('mediaB').volume = parseFloat(volume) || 0;
    const volumeText = document.getElementById('mediavolumeBTextMain');
    if (volumeText) {
        volumeText.textContent = percent + '%';
    }
}
const mediavolumeControlB = document.getElementById('mediavolumeControlB')
mediavolumeControlB.addEventListener('input', function (volume) {
    setMediaVolumeB(mediavolumeControlB.value)
})

function setMediaVolumeC(volume) {
    const percent = Math.round((volume) * 100);
    document.getElementById('mediaC').volume = parseFloat(volume) || 0;
    const volumeText = document.getElementById('mediavolumeCTextMain');
    if (volumeText) {
        volumeText.textContent = percent + '%';
    }
}
const mediavolumeControlC = document.getElementById('mediavolumeControlC')
mediavolumeControlC.addEventListener('input', function (volume) {
    setMediaVolumeC(mediavolumeControlC.value)
})

function setMediaVolumeD(volume) {
    const percent = Math.round((volume) * 100);
    document.getElementById('mediaD').volume = parseFloat(volume) || 0;
    const volumeText = document.getElementById('mediavolumeDTextMain');
    if (volumeText) {
        volumeText.textContent = percent + '%';
    }
}
const mediavolumeControlD = document.getElementById('mediavolumeControlD')
mediavolumeControlD.addEventListener('input', function (volume) {
    setMediaVolumeD(mediavolumeControlD.value)
})

const snapToggle = document.getElementById('snapToggle');
if (snapToggle && volumeControl) {
    function updateVolumeStep() {
        volumeControl.step = snapToggle.checked ? 0.05 : 0.01;
        volumeControlTarget.step = snapToggle.checked ? 0.05 : 0.01;
        mediavolumeControl.step = snapToggle.checked ? 0.05 : 0.01;
    }
    snapToggle.addEventListener('change', updateVolumeStep);
    updateVolumeStep();
}

const animateBtn = document.getElementById("animateVolumeButton");
const animateSelector = document.getElementById("animateVolume");
const durationSelect = document.getElementById("durationSelect");
const AnimateInstanceSelector = document.getElementById("AnimateInstance");
const animateButton = document.getElementById("animateVolumeButton");
const customDropdownContainer = document.getElementById("customDropdownContainer");

const interpolations = {
    linear: t => t,

    easeInCubic: t => t ** 3,
    easeOutCubic: t => 1 - Math.pow(1 - t, 3),
    easeInOutCubic: t => t < 0.5
        ? 4 * t ** 3
        : 1 - Math.pow(-2 * t + 2, 3) / 2,

    easeInQuart: t => t ** 4,
    easeOutQuart: t => 1 - Math.pow(1 - t, 4),
    easeInOutQuart: t => t < 0.5
        ? 8 * t ** 4
        : 1 - Math.pow(-2 * t + 2, 4) / 2,

    easeInQuint: t => t ** 5,
    easeOutQuint: t => 1 - Math.pow(1 - t, 5),
    easeInOutQuint: t => t < 0.5
        ? 16 * t ** 5
        : 1 - Math.pow(-2 * t + 2, 5) / 2
};

function easingToPath(interpolation, samples = 20, width = 100, height = 100) {
    let d = "";
    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const x = t * width;
        const y = height - interpolation(t) * height; // flip so higher = up
        if (i === 0) {
            d += `M ${x},${y}`;
        } else {
            d += ` L ${x},${y}`;
        }
    }
    return d;
}

function updateEasingPreview() {
    const interpolationType = document.getElementById("interpolationSelect").value;
    const easingFn = interpolations[interpolationType] || (t => t); // fallback linear
    const newPath = easingToPath(easingFn || interpolations.linear);
    // or easingToCubicBezier(easingFn);

    // Update SVG path
    document.getElementById("easingPath").setAttribute("d", newPath);
}

document.getElementById("interpolationSelect").addEventListener("change", () => {
    if (!animateButton.disabled) {
        updateEasingPreview();
    }
});


animateSelector.addEventListener("change", () => {
    const isCustom = animateSelector.value === "custom";
    customDropdownContainer.style.display = isCustom ? "block" : "none";
});

animateBtn.addEventListener("click", () => {
    const fadeType = animateSelector.value;
    const AnimateInstance = AnimateInstanceSelector.value;
    const FADE_DURATION = parseInt(durationSelect.value);

    console.log(`Animating volume with fade type: ${fadeType}`);
    const currentVolume = parseFloat(volumeControlDefault.value); // From 0 to 100
    const currentVolumeMedia = parseFloat(mediavolumeControl.value); // From 0 to 100
    const currentVolumeMediaA = parseFloat(mediavolumeControlA.value);
    const currentVolumeMediaB = parseFloat(mediavolumeControlB.value);
    const currentVolumeMediaC = parseFloat(mediavolumeControlC.value);
    const currentVolumeMediaD = parseFloat(mediavolumeControlD.value);
    const setTargetVolume = parseFloat(volumeControlTarget.value);
    let endVolume;
    let finalvalueInit;
    let finalvalue;

    if (fadeType === "fadeOut") {
        endVolume = 0;
    } else if (fadeType === "fadeIn") {
        endVolume = 1;
        if (currentVolume >= 100) {
            console.log("Already at max volume 🎚️");
            return;
        }
    } else if (fadeType === "custom") {
        endVolume = setTargetVolume
        if (currentVolume >= 100) {
            console.log("Already at max volume 🎚️");
            return;
        }
    } else {
        console.warn("No valid fade type selected.");
        return;
    }

    const easingType = interpolationSelect.value;
    const ease = interpolations[easingType] || (t => t); // fallback linear
    const startTime = performance.now();

    function animate(now) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / FADE_DURATION, 1);

        const easedProgress = ease(progress);
        let currentVolume_val;
        let currentVolumeMedia_val;
        let currentVolumeMediaA_val;
        let currentVolumeMediaB_val;
        let currentVolumeMediaC_val;
        let currentVolumeMediaD_val;

        function setVolumeonFade(current, isNegative, endVolume) {
            if (!isNegative) {
                finalvalueInit = current + (endVolume - current) * easedProgress;
            } else {
                finalvalueInit = endVolume - (endVolume - current) * (1 - easedProgress);
            }
            return finalvalueInit;
        }

        if (fadeType === "fadeOut" || fadeType === "custom") {
            currentVolume_val = setVolumeonFade(currentVolume, false, endVolume);
            currentVolumeMedia_val = setVolumeonFade(currentVolumeMedia, false, endVolume);
            currentVolumeMediaA_val = setVolumeonFade(currentVolumeMediaA, false, endVolume);
            currentVolumeMediaB_val = setVolumeonFade(currentVolumeMediaB, false, endVolume);
            currentVolumeMediaC_val = setVolumeonFade(currentVolumeMediaC, false, endVolume);
            currentVolumeMediaD_val = setVolumeonFade(currentVolumeMediaD, false, endVolume);
        } else if (fadeType === "fadeIn") {
            currentVolume_val = setVolumeonFade(currentVolume, true, endVolume);
            currentVolumeMedia_val = setVolumeonFade(currentVolumeMedia, true, endVolume);
            currentVolumeMediaA_val = setVolumeonFade(currentVolumeMediaA, true, endVolume);
            currentVolumeMediaB_val = setVolumeonFade(currentVolumeMediaB, true, endVolume);
            currentVolumeMediaC_val = setVolumeonFade(currentVolumeMediaC, true, endVolume);
            currentVolumeMediaD_val = setVolumeonFade(currentVolumeMediaD, true, endVolume);
        }

        if (AnimateInstance === "1") {
            volumeControlDefault.value = currentVolume_val;
            setVolume(volumeControlDefault.value);
        } else if (AnimateInstance === "2") {
            mediavolumeControl.value = currentVolumeMedia_val;
            setMediaVolume(mediavolumeControl.value)
        } else if (AnimateInstance === "3") {
            mediavolumeControlA.value = currentVolumeMediaA_val;
            setMediaVolumeA(mediavolumeControlA.value)
        } else if (AnimateInstance === "4") {
            mediavolumeControlB.value = currentVolumeMediaB_val;
            setMediaVolumeB(mediavolumeControlB.value)
        } else if (AnimateInstance === "5") {
            mediavolumeControlC.value = currentVolumeMediaC_val;
            setMediaVolumeC(mediavolumeControlC.value)
        } else if (AnimateInstance === "6") {
            mediavolumeControlD.value = currentVolumeMediaD_val;
            setMediaVolumeD(mediavolumeControlD.value)
        } else {
            volumeControlDefault.value = currentVolume_val;
            setVolume(volumeControlDefault.value);
            mediavolumeControl.value = currentVolumeMedia_val;
            setMediaVolume(mediavolumeControl.value)
            mediavolumeControlA.value = currentVolumeMediaA_val;
            setMediaVolumeA(mediavolumeControlA.value)
            mediavolumeControlB.value = currentVolumeMediaB_val;
            setMediaVolumeB(mediavolumeControlB.value)
            mediavolumeControlC.value = currentVolumeMediaC_val;
            setMediaVolumeC(mediavolumeControlC.value)
            mediavolumeControlD.value = currentVolumeMediaD_val;
            setMediaVolumeD(mediavolumeControlD.value)
        }

        if (progress < 1) {
            setTimeout(() => animate(performance.now()), 0);
            animateButton.disabled = true; // disable the button
            animateButton.textContent = "Animating..."; // update its text
            document.getElementById('timelinehelper').style.width = `${progress * 100}%`;
        } else {
            animateButton.disabled = false; // disable the button
            animateButton.textContent = "Animate"; // update its text
            updateEasingPreview();
            document.getElementById('timelinehelper').style.width = `0%`;
        }
    }

    setTimeout(() => animate(performance.now()), 0);
});

function setSamplerVolume(bool) {
    if (bool === 1) {
        let currentVolume = Math.min(parseFloat(volumeControl.value) + (volumeControl.step ? parseFloat(volumeControl.step) : 0.01), 1);
        volumeControl.value = currentVolume;
        setVolume(volumeControl.value);
    } else {
        let currentVolume = Math.max(parseFloat(volumeControl.value) - (volumeControl.step ? parseFloat(volumeControl.step) : 0.01), 0);
        volumeControl.value = currentVolume;
        setVolume(volumeControl.value);
    }
}

document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '+' || e.key === '=') {
            // Ctrl + Plus
            setSamplerVolume(1)
            e.preventDefault();
        } else if (e.key === '-') {
            // Ctrl + Minus
            setSamplerVolume(0)
            e.preventDefault();
        }
    }
});

const togglePlayCheckbox = document.getElementById('togglePlayCheckbox');
const togglePlayButton = document.getElementById('togglePlayButton');

let letPlayonHotkey = false;

function TogglePlayonHotkey() {
    if (typeof letPlayonHotkey !== 'undefined' && letPlayonHotkey) {
        togglePlayCheckbox.checked = false; // Uncheck the checkbox
        letPlayonHotkey = false; // Set the variable to false

        const text = "Hotkeys for playing audio disabled.";
        snackbar(text); // Show snackbar notification
    } else if (typeof letPlayonHotkey !== 'undefined') {
        togglePlayCheckbox.checked = true; // Check the checkbox
        letPlayonHotkey = true; // Set the variable to true

        const text = "Hotkeys for playing audio enabled.";
        snackbar(text); // Show snackbar notification
    }
}

togglePlayButton.addEventListener('click', () => {
    TogglePlayonHotkey();
});

togglePlayCheckbox.addEventListener('click', () => {
    TogglePlayonHotkey();
});

togglePlayCheckbox.addEventListener('change', () => {
    TogglePlayonHotkey();
});

const toggleVisualiserCheckbox = document.getElementById('toggleVisualiserCheckbox');
const toggleVisualiser = document.getElementById('toggleVisualiser');

let letVisualser = false;

function ToggleVisualiser() {
    if (typeof letVisualser !== 'undefined' && letVisualser) {
        if (toggleExternal) {
            const text = "External visualiser disabled and External Casting stopped.";
            stopCast(text);
        } else {
            const text = "External visualiser disabled.";
            snackbar(text); // Show snackbar notification
        }
        toggleVisualiserCheckbox.checked = false; // Uncheck the checkbox
        letVisualser = false; // Set the variable to false
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('toggle-visualiser', letVisualser);

    } else if (typeof letVisualser !== 'undefined') {
        toggleVisualiserCheckbox.checked = true;
        letVisualser = true; // Set the variable to true
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('toggle-visualiser', letVisualser);
        const text = "External visualiser enabled.";
        snackbar(text); // Show snackbar notification
    }
}

toggleVisualiser.addEventListener('click', () => {
    ToggleVisualiser();
});

toggleVisualiserCheckbox.addEventListener('click', () => {
    ToggleVisualiser();
});

toggleVisualiserCheckbox.addEventListener('change', () => {
    ToggleVisualiser();
});