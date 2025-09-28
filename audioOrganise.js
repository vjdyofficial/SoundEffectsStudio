// Play audio by button id
function playAudioById(btnId) {
    const idx = parseInt(btnId.replace('audio-btn-', ''), 10);
    if (!isNaN(idx) && audioList[idx]) {
        playAudio(audioList[idx].file);
    }
}

// Function to create buttons for each audio file
function listAudioFiles() {
    const container = document.getElementById('audio-list');
    if (!container) return;
    container.innerHTML = '';
    audioList.forEach((item, idx) => {
        const btn = document.createElement('button');
        btn.textContent = '';
        btn.className = `getButton fallback ${item.class || 'category_und'} ${item.isOffensive ? 'explicit' : 'minimal'}`;
        const label = document.createElement('p');
        label.innerHTML = `<span class="audio-label">${item.name || item.file.replace(/\.[^/.]+$/, '')}</span>`;
        btn.appendChild(label);

        btn.id = `audio-btn-${idx}`;
        btn.addEventListener('click', function() {
            playAudioById(btn.id);
        });
        container.appendChild(btn);

        btn.addEventListener('contextmenu', function(e) {
        e.preventDefault(); // disable default right-click menu
        });

        btn.addEventListener('mousedown', function(e) {
            if (e.button === 2) { // right-click
            playAudioSampleMode(item.file);
            }
        });

        // Long press on touch devices
        let longPressTimer;
        btn.addEventListener('touchstart', function(e) {
            longPressTimer = setTimeout(() => {
            playAudioSampleMode(item.file);
            }, 500); // 500ms for long press
        });
        btn.addEventListener('touchend', function(e) {
            clearTimeout(longPressTimer);
        });
        btn.addEventListener('touchmove', function(e) {
            clearTimeout(longPressTimer);
        });
    });
}

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

        diasbleMediaControlsinNotification();
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
    diasbleMediaControlsinNotification();
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
                const progressBar = document.createElement('div');
                progressBar.id = 'audio-progress-bar';
                progressBar.style.width = '100%'; // Set width to 100% for the progress bar
                progressBar.className = 'audio-progress-bar';
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
                        progressBar.style.width = ((audio.currentTime / audio.duration) * 100) + '%';
                    }
                }
            }
        }
    });
}

// Update progress bars on timeupdate for all audio elements
document.getElementById('storedata').addEventListener('timeupdate', function(e) {
    if (e.target.tagName === 'AUDIO') {
        updateAudioProgressBars();
    }
}, true);

// Also update periodically in case of missed events
setInterval(updateAudioProgressBars, 1);

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

function diasbleMediaControlsinNotification() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        // Clear any handlers to prevent media controls from appearing
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('seekbackward', null);
        navigator.mediaSession.setActionHandler('seekforward', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('stop', null);
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

document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
});

// Call this after DOM is loaded
document.addEventListener('DOMContentLoaded', listAudioFiles);

document.addEventListener('play', function(e) {
    if (e.target.tagName === 'AUDIO') {
        e.target.addEventListener('ended', function handler() {

            const src = e.target.currentSrc.split('/').pop();
            const idx = audioList.findIndex(item => item.file.endsWith(src));
            rdotonIndex(idx);
            
            e.target.remove();
            e.target.removeEventListener('ended', handler);
        });
    }
}, true);

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

const volumeControlTarget = document.getElementById('volumeControlTarget')

volumeControlTarget.addEventListener('input', function (volume) {
    const percent = Math.round((volumeControlTarget.value) * 100);
    document.documentElement.style.setProperty('--range-percenttarget', percent + '%');
    const volumeText2 = document.getElementById('volumeText2');
    if (volumeText2) {
        volumeText2.textContent = percent + '%';
    }
})

const snapToggle = document.getElementById('snapToggle');
if (snapToggle && volumeControl) {
    function updateVolumeStep() {
        volumeControl.step = snapToggle.checked ? 0.05 : 0.01;
        volumeControlTarget.step = snapToggle.checked ? 0.05 : 0.01;
    }
    snapToggle.addEventListener('change', updateVolumeStep);
    updateVolumeStep();
}

document.addEventListener('play', function(e) {
    if (e.target.tagName === 'AUDIO') {
        // Prevent seeking and pausing via media controls
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('seekbackward', function() {});
            navigator.mediaSession.setActionHandler('seekforward', function() {});
            navigator.mediaSession.setActionHandler('seekto', function() {});
            navigator.mediaSession.setActionHandler('pause', function() {});
        }
        // Prevent programmatic pause/seek
        const audio = e.target;
        const origPause = audio.pause;
        const origCurrentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
        audio.pause = function() {};
        Object.defineProperty(audio, 'currentTime', {
            set: function() {},
            get: function() {
                return origCurrentTime.get.call(audio);
            }
        });
        // Allow pause when StopAllAudio is called (restore original pause)
        audio._restorePause = function() {
            audio.pause = origPause;
            Object.defineProperty(audio, 'currentTime', origCurrentTime);
        };
    }
}, true);

const batteryLevelWarn = document.getElementById("batterylevelWarn");

const animateBtn = document.getElementById("animateVolumeButton");
const animateSelector = document.getElementById("animateVolume");
const durationSelect = document.getElementById("durationSelect");
const animateButton = document.getElementById("animateVolumeButton");
const customDropdownContainer = document.getElementById("customDropdownContainer");

animateSelector.addEventListener("change", () => {
  const isCustom = animateSelector.value === "custom";
  customDropdownContainer.style.display = isCustom ? "block" : "none";
});

animateBtn.addEventListener("click", () => {
    const fadeType = animateSelector.value;
    const FADE_DURATION = parseInt(durationSelect.value);

    console.log(`Animating volume with fade type: ${fadeType}`);
    const currentVolume = parseFloat(volumeControl.value); // From 0 to 100
    const setTargetVolume = parseFloat(volumeControlTarget.value);
    let startVolume = currentVolume;
    let endVolume;

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

    const easingType = interpolationSelect.value;
    const ease = interpolations[easingType] || (t => t); // fallback linear
    const startTime = performance.now();

    const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / FADE_DURATION, 1);
        

        const easedProgress = ease(progress);
        let currentVolume;

        if (fadeType === "fadeOut") {
            currentVolume = startVolume + (endVolume - startVolume) * easedProgress;
        } else if (fadeType === "fadeIn") {
            currentVolume = endVolume - (endVolume - startVolume) * (1 - easedProgress);
        } else if (fadeType === "custom") {
            currentVolume = startVolume + (endVolume - startVolume) * easedProgress;
        }

        // Update both the visual input and audio volume
        volumeControl.value = currentVolume;
        setVolume(volumeControl.value);

        if (progress < 1) {
            requestAnimationFrame(animate);
            animateButton.disabled = true; // disable the button
            animateButton.textContent = "Animating..."; // update its text
        } else {
            animateButton.disabled = false; // disable the button
            animateButton.textContent = "Animate"; // update its text
        }
    };

    requestAnimationFrame(animate);
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

document.addEventListener('keydown', function(e) {
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
        toggleVisualiserCheckbox.checked = false; // Uncheck the checkbox
        letVisualser = false; // Set the variable to false
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('toggle-visualiser', letVisualser);
        const text = "External visualiser disabled.";
        snackbar(text); // Show snackbar notification
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

const toggleVUMeterCheckbox = document.getElementById('toggleVUMeterCheckbox');
const toggleVUMeter = document.getElementById('toggleVUMeter');

let letVUMeter = false;

function ToggleVU() {
    if (typeof letVUMeter !== 'undefined' && letVUMeter) {
        toggleVUMeterCheckbox.checked = false; // Uncheck the checkbox
        letVUMeter = false; // Set the variable to false
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('toggle-vumeter', letVUMeter);
        const text = "VU Meter disabled.";
        snackbar(text); // Show snackbar notification
    } else if (typeof letVUMeter !== 'undefined') {
        toggleVUMeterCheckbox.checked = true;
        letVUMeter = true; // Set the variable to true
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('toggle-vumeter', letVUMeter);
        const text = "VU Meter enabled.";
        snackbar(text); // Show snackbar notification
    }
}

toggleVUMeter.addEventListener('click', () => {
    ToggleVU();
});

toggleVUMeterCheckbox.addEventListener('click', () => {
    ToggleVU();
});

toggleVUMeterCheckbox.addEventListener('change', () => {
    ToggleVU();
});

const toggleClockCheckbox = document.getElementById('toggleClockCheckbox');
const toggleClock = document.getElementById('toggleClock');

let letClock = false;

function ToggleClock() {
    if (typeof letClock !== 'undefined' && letClock) {
        toggleClockCheckbox.checked = false; // Uncheck the checkbox
        letClock = false; // Set the variable to false
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('toggle-clock', letClock);
        const text = "Clock widget disabled.";
        snackbar(text); // Show snackbar notification
    } else if (typeof letVUMeter !== 'undefined') {
        toggleClockCheckbox.checked = true;
        letClock = true; // Set the variable to true
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('toggle-clock', letClock);
        const text = "Clock widget enabled.";
        snackbar(text); // Show snackbar notification
    }
}

toggleClock.addEventListener('click', () => {
    ToggleClock();
});

toggleClockCheckbox.addEventListener('click', () => {
    ToggleClock();
});

toggleClockCheckbox.addEventListener('change', () => {
    ToggleClock();
});