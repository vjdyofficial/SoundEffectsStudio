let preservesPitchGlobal = false;

function setupMediaDeck(deckId) {
    const currentMediaEl = document.getElementById(`media${deckId}`);
    const toggleLoopBtn = document.getElementById(`toggleLoopButton${deckId}`);
    const loadBtn = document.getElementById(`loadBtn${deckId}`);
    const playPauseBtn = document.getElementById(`playPauseBtn${deckId}`);
    const stopBtn = document.getElementById(`stopBtn${deckId}`);
    const ejectBtn = document.getElementById(`ejectBtn${deckId}`);
    const progress = document.getElementById(`progress${deckId}`);
    const timeDisplay = document.getElementById(`timeDisplay${deckId}`);
    const fileDropDiv = document.getElementById(`filedropforDeck${deckId}`);
    const loopIcon = document.getElementById(`loopIcon${deckId}`);
    const playbackIcon = document.getElementById(`playbackIcon${deckId}`);
    const speed = document.getElementById(`speed${deckId}`);
    const speedValue = document.getElementById(`speedValueText_${deckId}`);
    const spans = document.querySelectorAll(`#timestamps_${deckId} span`);

    const divisions = 5;

    function updateTimestamps() {
        const duration = currentMediaEl.duration;
        if (!duration || isNaN(duration)) return;

        const step = duration / divisions;

        spans.forEach((span, index) => {
            const time = step * index;
            span.textContent = formatTime(time).replace('Infinity:NaN', "--");
            span.dataset.time = time;
        });
    }

    function removeTimestamps() {
        spans.forEach((span, index) => {
            span.textContent = "";
            span.dataset.time = "";
        });
    }

    let currentUrl = null;
    let scanner = null;

    let animationInterval;

    function animateGain(lastvalue, newvalue) {
        clearInterval(animationInterval)

        const step = 0.01
        const intervalTime = 10
        const target = newvalue

        animationInterval = setInterval(() => {
            if (lastvalue <= newvalue) {
                currentMediaEl.playbackRate += step
                if (currentMediaEl.playbackRate >= target) {
                    currentMediaEl.playbackRate = target
                    clearInterval(animationInterval)
                }
            } else {
                currentMediaEl.playbackRate -= step
                if (currentMediaEl.playbackRate <= target) {
                    currentMediaEl.playbackRate = target
                    clearInterval(animationInterval)
                }
            }
            currentMediaEl.preservesPitch = preservesPitchGlobal
        }, intervalTime)
    }

    function setSpeed() {
        speedValue.textContent = `${Number(speed.value).toFixed(2)}x`;
        const lastvalue = currentMediaEl.playbackRate;
        currentMediaEl.preservesPitch = preservesPitchGlobal;
        animateGain(lastvalue, parseFloat(speed.value))
    }

    function RemoveTagtoTitle(deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = `No Title`;
        document.getElementById(`artist_${deckAssignment}`).textContent = ``;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;
    }

    // Run on load + resize

    function GetFilenametoTitle(filePath, deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = `${filePath.name}`;
        document.getElementById(`artist_${deckAssignment}`).textContent = `${filePath.type}`;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;

        const text = `Loaded ${filePath.name} into Audio Deck ${deckAssignment}`
    }

    function getTagtoTitle(currentURI, deckAssignment) {
        GetFilenametoTitle(currentURI, deckAssignment);
    }

    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    // Loop button
    toggleLoopBtn.addEventListener('click', () => {
        currentMediaEl.loop = !currentMediaEl.loop;

        if (currentMediaEl.loop) {
            toggleLoopBtn.title = 'Disable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onActive");
            loopIcon.src = `../icons/monosource/repeat_one.svg`;
        } else {
            toggleLoopBtn.title = 'Enable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onInactive");
            loopIcon.src = `../icons/monosource/repeat.svg`;
        }
    });

    async function openAndLoadFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject("No file selected");

            currentMediaEl.pause();
            currentMediaEl.currentTime = 0;

            if (currentUrl) {
                URL.revokeObjectURL(currentUrl);
                currentUrl = null;
            }

            currentMediaEl.removeAttribute("src");
            currentMediaEl.load();

            if (file.type.startsWith("audio/")) {
                isAudio = true;
                loadBtn.setAttribute("aria-details", "onActive");
            } else if (file.type.startsWith("video/")) {
                isAudio = false;
                loadBtn.setAttribute("aria-details", "onActive");
            } else {
                isAudio = true;
                playbackIcon.src = `../icons/monosource/play_arrow.svg`;
                loadBtn.setAttribute("aria-details", "onInactive");
                RemoveTagtoTitle(deckId);
                alert(`Unsupported file type`);
                timeDisplay.textContent = `00:00 / 00:00`;
                return reject("Unsupported file type: " + file.type);
            }

            currentUrl = URL.createObjectURL(file);
            currentMediaEl.src = currentUrl;
            setSpeed();
            currentMediaEl.addEventListener("loadeddata", () => {
                timeDisplay.textContent = `00:00${currentMediaEl.duration === Infinity ? "" : ` / ${formatTime(currentMediaEl.duration)}`}`;
                updateTimestamps();

                resolve(currentMediaEl);
            }, { once: true });
        });
    }

    // Hidden file input
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = "audio/*,video/*";
    hiddenInput.style.display = "none";

    let lrcEntries;
    document.body.appendChild(hiddenInput);

    speed.oninput = () => {
        setSpeed();
    }

    speed.ondblclick = () => {
        speed.value = 1
        setSpeed();
    }

    function updateCurrentTime() {
        const hasDuration = Number.isFinite(currentMediaEl.duration);

        if (hasDuration) {
            progress.disabled = false;
        } else {
            progress.disabled = true;
        }

        const current = formatTime(currentMediaEl.currentTime);

        const total = hasDuration
            ? ` / ${formatTime(currentMediaEl.duration)}`
            : "";

        return `${current}${total}`;
    }


    async function importAudioFile(file) {
        RemoveTagtoTitle(deckId);
        if (file) {
            const types = ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/aac', 'audio/flac', 'video/mp4', 'video/3gpp', 'video/webm', 'video/mpeg'];
            if (types.some(type => file.type.startsWith(type.split('/')[0]))) {
                setTimeout(() => {
                    getTagtoTitle(file, deckId);
                }, 100);
                loadBtn.setAttribute("aria-details", "onInactive");
                openAndLoadFile(file).finally(() => {
                    hiddenInput.value = ""
                });
            } else {
                alert(`Unsupported audio file type. Please import supported audio file.`, "Import Error")
            }
        }
    }

    // Controls
    loadBtn.onclick = () => hiddenInput.click();

    hiddenInput.onchange = (e) => {
        const file = e.target.files[0];
        importAudioFile(file, deckId)
    };

    playPauseBtn.onclick = () => {
        if (!currentMediaEl.src) return;

        if (currentMediaEl.currentTime >= currentMediaEl.duration) {
            currentMediaEl.currentTime = 0;
        }

        if (currentMediaEl.paused) {
            currentMediaEl.play();;
        } else {
            currentMediaEl.pause();
        }
    };

    function stopMedia() {
        if (!currentMediaEl.src) return;
        currentMediaEl.pause();
        currentMediaEl.currentTime = 0;
    }

    stopBtn.onclick = stopMedia;

    let previousLine;

    ejectBtn.onclick = () => {
        if (!currentMediaEl.src) return;

        currentMediaEl.pause();
        currentMediaEl.currentTime = 0;

        if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
            currentUrl = null;
        }

        currentMediaEl.removeAttribute("src");
        currentMediaEl.load();
        RemoveTagtoTitle(deckId);
        playbackIcon.src = `../icons/monosource/play_arrow.svg`
        speed.value = 1
        hiddenInput.value = "";
        loadBtn.setAttribute("aria-details", "onInactive");
        isAudio = false;
        progress.value = 0;
        timeDisplay.textContent = "00:00 / 00:00";
        cancelAnimationFrame(rafId);
    };

    currentMediaEl.addEventListener("pause", () => {
        playbackIcon.src = `../icons/monosource/play_arrow.svg`
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} paused`
        cancelAnimationFrame(rafId);
    });

    currentMediaEl.addEventListener("error", (e) => {
        ejectBtn.click();
        alert("An error occured while importing and decoding the audio due to" +
            " unsupported codec, file has been moved or deleted, corrupted binary data or" +
            " buffering issues. Please try a different media or try to import again.", "Audio Error!")
        setTimeout(() => {
            RemoveTagtoTitle(deckId);
        }, 500);
    });

    currentMediaEl.addEventListener("play", () => {
        playbackIcon.src = `../icons/monosource/pause.svg`
        const text = `Now playing: ${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId}`
        rafId = requestAnimationFrame(syncSlider);
    });

    let progressDisable = false;
    let rafId;

    function syncSlider() {
        if (currentMediaEl.duration) {
            if (!progressDisable) {
                progress.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
            }
        }
        rafId = requestAnimationFrame(syncSlider);
    }

    // Update progress + time
    currentMediaEl.addEventListener("timeupdate", () => {
        if (currentMediaEl.duration) {
            if (!progressDisable) {
                timeDisplay.textContent = updateCurrentTime();
            }
        }
    });

    // Dragging updates UI only
    progress.oninput = () => {
        if (currentMediaEl.duration) {
            progressDisable = true;
            timeDisplay.textContent = updateCurrentTime();
        }
    };

    // Update media when drag ends
    progress.onchange = () => {
        if (currentMediaEl.duration) {
            progressDisable = false;
            currentMediaEl.currentTime = (progress.value / 512) * currentMediaEl.duration;
        }
    };

    progress.disabled = true;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {

            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                playbackIcon.src = `../icons/monosource/play_arrow.svg`

                if (!currentMediaEl.src) {
                    progress.disabled = true;
                } else {
                    progress.disabled = false;
                }
            }
        });
    });

    observer.observe(currentMediaEl, { attributes: true });

    currentMediaEl.addEventListener("ended", () => {
        playbackIcon.src = `../icons/monosource/replay.svg`;
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} ended`;
        timeDisplay.textContent = `00:00${currentMediaEl.duration === Infinity ? "" : ` / ${formatTime(currentMediaEl.duration)}`}`;
        cancelAnimationFrame(rafId);
    });

    // Drag-and-drop
    ["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
        fileDropDiv.addEventListener(evt, (e) => e.preventDefault());
    });

    fileDropDiv.addEventListener("dragover", () => {
        fileDropDiv.classList.add('dropfile');
    });
    fileDropDiv.addEventListener("dragleave", () => {
        fileDropDiv.classList.remove('dropfile')
    });

    fileDropDiv.addEventListener("drop", (e) => {
        const file = e.dataTransfer.files[0];
        importAudioFile(file, deckId)
        fileDropDiv.classList.remove('dropfile')
    });
}

setupMediaDeck("A");
setupMediaDeck("B");
setupMediaDeck("C");
setupMediaDeck("D");

const textElements = document.querySelectorAll(".scroll-text p");

textElements.forEach(el => {
    const parent = el.parentElement;
    if (!parent) return;

    const updateAnimation = () => {
        const parentWidth = parent.clientWidth;
        const childWidth = el.scrollWidth;

        const overflowing = childWidth > parentWidth;

        if (overflowing) {
            el.setAttribute("data-direction", "loop-ease");

            // compute dynamic duration
            const defaultParent = 200;    // baseline width
            const defaultDuration = 10;   // 10s at 200px

            const ratio = childWidth / defaultParent;
            const newDuration = ratio * defaultDuration;

            el.style.animationDuration = `${newDuration}s`;
        } else {
            el.removeAttribute("data-direction");
            el.style.animationDuration = ""; // reset
        }
    };

    // Initial check
    updateAnimation();

    // Observe parent and child size changes
    const observer = new ResizeObserver(updateAnimation);
    observer.observe(parent);
    observer.observe(el);
});

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

window.addEventListener('contextmenu', e => {
    e.preventDefault(); // block right-click menu
});

window.addEventListener('wheel', e => {
    if (e.ctrlKey) e.preventDefault(); // prevent zoom via Ctrl+MouseWheel
}, { passive: false });

window.addEventListener('gesturestart', e => e.preventDefault()); // pinch zoom on touch
window.addEventListener('gesturechange', e => e.preventDefault());

window.addEventListener('keydown', e => {
    // Ctrl+Plus, Ctrl+Minus, Ctrl+NumPadPlus, Ctrl+NumPadMinus, Ctrl+0
    if (e.ctrlKey && ['+', '-', '=', '0'].includes(e.key)) {
        e.preventDefault();
    }
});

function enableSliderWheel(acceleration = 1, exclude = []) {
    document.querySelectorAll('input[type="range"]').forEach(slider => {
        // Skip sliders in the exclude array
        if (exclude.includes(slider)) return;

        slider.addEventListener('wheel', (e) => {
            // Skip disabled sliders
            if (slider.disabled) {
                e.preventDefault(); // prevent page scroll
                return
            };

            e.preventDefault(); // prevent page scroll

            const min = parseFloat(slider.min) || 0;
            const max = parseFloat(slider.max) || 100;
            const step = parseFloat(slider.step) || 1;

            // Calculate change with acceleration based on wheel delta
            let change = (e.deltaY < 0 ? 1 : -1) * step * acceleration;

            slider.value = Math.min(max, Math.max(min, parseFloat(slider.value) + change));

            // Dispatch input event so any live listeners update
            slider.dispatchEvent(new Event('input'));
        }, { passive: false });
    });
}

const progressA = document.getElementById('progressA');
const progressB = document.getElementById('progressB');
const progressC = document.getElementById('progressC');
const progressD = document.getElementById('progressD');

// These sliders will be ignored by the wheel
enableSliderWheel(2, [progressA, progressB, progressC, progressD]);

function setupCheckboxListeners(statename) {
    const checkbox = document.getElementById(`chkb_${statename}`);
    const saved = localStorage.getItem(`${statename}_savestate`);
    checkbox.addEventListener("change", () => {
        const enabled = checkbox.checked;
        localStorage.setItem(`${statename}_savestate`, enabled);
    });

    checkbox.checked = saved ? JSON.parse(saved) : true;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
};

setupCheckboxListeners("vjdyofficial_andromeda_clock");
setupCheckboxListeners("vjdyofficial_andromeda_weather");
setupCheckboxListeners("vjdyofficial_andromeda_logo");
setupCheckboxListeners("vjdyofficial_andromeda_ticker");
const textsaved = localStorage.getItem(`vjdyofficial_andromeda_tickertext_savestate`);
const textarea = document.getElementById(`inputTextDock`);

const visual_channel = new BroadcastChannel('visual_channel');

textarea.value = textsaved || "";

textarea.addEventListener("input", () => {
    const text = textarea.value.trim();
    localStorage.setItem(`vjdyofficial_andromeda_tickertext_savestate`, text);
});

const latInput = document.getElementById("latInput");
const lonInput = document.getElementById("lonInput");

// Load settings from localStorage
function loadWeatherSettings() {
    const savedRaw = localStorage.getItem("weatherSettings");
    if (!savedRaw) return;

    try {
        const saved = JSON.parse(savedRaw);
        latInput.value = saved.latitude ?? "";
        lonInput.value = saved.longitude ?? "";
    } catch (err) {
        console.warn("Failed to parse saved weather settings:", err);
    }
}

// Save settings
function saveWeatherSettings() {
    const settings = {
        latitude: parseFloat(latInput.value) || 0,
        longitude: parseFloat(lonInput.value) || 0
    };
    localStorage.setItem("weatherSettings", JSON.stringify(settings));
}

latInput.addEventListener("input", saveWeatherSettings);
lonInput.addEventListener("input", saveWeatherSettings);

// Initialize immediately if script is at end of body
loadWeatherSettings();

setInterval(() => {
    const clockEnabled = document.getElementById('chkb_vjdyofficial_andromeda_clock').checked;
    const weatherEnabled = document.getElementById('chkb_vjdyofficial_andromeda_weather').checked;
    const logoEnabled = document.getElementById('chkb_vjdyofficial_andromeda_logo').checked;

    visual_channel.postMessage({
        clock: clockEnabled,
        weather: weatherEnabled,
        logo: logoEnabled,
        ticker: document.getElementById('chkb_vjdyofficial_andromeda_ticker').checked,
        text: textarea.value.trim() || textarea.dataset.default,
        latitude: latInput.value,
        longitude: lonInput.value
    });
}, 500);

const control = new BroadcastChannel('control');

document.getElementById('control_graphic_01').addEventListener('click', () => {
    control.postMessage({ action: 1009 });
})

document.getElementById('control_graphic_02').addEventListener('click', () => {
    control.postMessage({ action: 1012 });
})