// Global Cast Button and Cast Functions
const toggleExtBtn = document.getElementById(`toggleExtButton`);
let toggleExternal = false;

const toggleDeckBtn = document.getElementById(`toggleDeckButton`);
let toggleMedia = false;

let intervalId1 = null;

let video = document.getElementById(`MediaExtDeck_1`);
let subtitleIndex = 1;
let subtitleIndexdeck = 1;

toggleDeckBtn.addEventListener('click', () => {
    if (!toggleMedia) {
        toggleMedia = true;
        video = document.getElementById(`MediaExtDeck_2`);
        subtitleIndex = 2;
        ipcRenderer.send('changingDeck', 2)
        subtitleIndexdeck = 2;
        document.getElementById(`deckIcon`).src = `images/icons-system/deckswap_b.svg`
        snackbar(`Changed to <strong>Deck B</strong> as the Cast output`);
    } else if (toggleMedia) {
        toggleMedia = false;
        video = document.getElementById(`MediaExtDeck_1`);
        subtitleIndex = 1;
        subtitleIndexdeck = 1;
        ipcRenderer.send('changingDeck', 1)
        document.getElementById(`deckIcon`).src = `images/icons-system/deckswap_a.svg`
        snackbar(`Changed to <strong>Deck A</strong> as the Cast output`);
    }
});

// Start sending video state to visualizer
function startSending() {
    ipcRenderer.send('video-hidden', false)

    function sendState() {
        if (!toggleExternal) return;

        ipcRenderer.send('video-playsrc', {
            src: video.currentSrc,
            playing: !video.paused,
            time: video.currentTime,
            stopped: video.ended,
            eject: !video.src,
            subtitle: subtitleIndex,
            deck: subtitleIndexdeck,
            speed: video.playbackRate
        });
    }

    intervalId1 = setInterval(sendState, 50); // update every 1 second
}

// Stop sending
function stopSending() {
    clearInterval(intervalId1);
    intervalId1 = null;
    ipcRenderer.send('video-hidden', true)
}

function startCast(textdata) {
    toggleExternal = true;
    snackbar(textdata);
    startSending();
    toggleExtBtn.title = 'Disconnect Cast';
    document.getElementById(`castIcon`).src = `images/icons-system/cast_connected.svg`
    toggleExtBtn.setAttribute("aria-details", "onActive");
}

function stopCast(textdata) {
    toggleExternal = false;
    stopSending();
    snackbar(textdata);
    toggleExtBtn.title = 'Connect Cast to External';
    document.getElementById(`castIcon`).src = `images/icons-system/cast.svg`
    toggleExtBtn.setAttribute("aria-details", "onInactive");
}

// Toggle function (now uses global toggleExtBtn)
toggleExtBtn.addEventListener('click', () => {
    if (toggleVisualiserCheckbox.checked) {
        if (!toggleExternal) {
            const text = `External Casting started`;
            startCast(text);
        } else if (toggleExternal) {
            const text = `External Casting stopped`;
            stopCast(text);
        }
    } else {
        const text = `To use Direct Video Cast, turn on External Visualizer in<br><code>More Options > Widgets > External Visualizer</code>`;
        snackbar(text)
    }
});

function setupMediaExtDeck(assignedDeck) {
    const { ipcRenderer } = require("electron");

    let currentMediaEl = document.getElementById(`MediaExtDeck_${assignedDeck}`);
    const video = currentMediaEl;
    let currentUrl = null;

    // Format seconds to mm:ss
    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    const toggleLoopBtn = document.getElementById(`toggleLoopButton_${assignedDeck}`);

    let isAudio = true;

    toggleLoopBtn.addEventListener('click', () => {
        video.loop = !video.loop;

        if (video.loop) {
            const text = `Media Loop enabled`;
            snackbar(text);
            toggleLoopBtn.title = 'Disable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onActive");
            document.getElementById(`loopIcon_${assignedDeck}`).src = `images/icons-system/repeat_one.svg`
        } else {
            const text = `Media Loop disabled`;
            snackbar(text);
            toggleLoopBtn.title = 'Enable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onInactive");
            document.getElementById(`loopIcon_${assignedDeck}`).src = `images/icons-system/repeat.svg`
        }
    });

    const speed = document.getElementById(`speed${assignedDeck}`);
    const speedValue = document.getElementById(`speedValueText_${assignedDeck}`);

    function setSpeed() {
        currentMediaEl.playbackRate = parseFloat(speed.value)
        speedValue.textContent = `${speed.value}x`;
        currentMediaEl.playbackRate = parseFloat(speed.value);
        currentMediaEl.preservesPitch = preservesPitchGlobal;
    }

    const inputsub = document.getElementById(`subtitleFile${assignedDeck}`);
    const inputsubBTN = document.getElementById(`subtitleFile${assignedDeck}_btn`);

    speed.oninput = () => {
        setSpeed();
    }

    speed.ondblclick = () => {
        speed.value = 1
        setSpeed();
    }

    inputsubBTN.addEventListener('click', () => {
        inputsub.click();
    });

    inputsub.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Read file content
        const text = await file.text();

        // Check if it’s .srt and convert
        let vttText = text;
        if (file.name.endsWith(".srt")) {
            vttText = "WEBVTT\n\n" + text
                .replace(/\r+/g, "") // remove \r
                .replace(/^\d+\s*$/gm, "") // remove sequence numbers
                .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") // replace commas with dots
                // remove SSA/ASS-style tags like {\an1}, {\an8}, {\i1}, {\b1}
                .replace(/\{\\an\d+\}/g, (match) => {
                    // convert alignment tags to WebVTT style position
                    const pos = match.match(/\d+/)?.[0];
                    switch (pos) {
                        case "1": return " align:start line:90%";
                        case "2": return " align:center line:90%";
                        case "3": return " align:end line:90%";
                        case "4": return " align:start line:50%";
                        case "5": return " align:center line:50%";
                        case "6": return " align:end line:50%";
                        case "7": return " align:start line:10%";
                        case "8": return " align:center line:10%";
                        case "9": return " align:end line:10%";
                        default: return "";
                    }
                })
                .replace(/\{\\[^}]+\}/g, ""); // remove any remaining tags
        }


        // Create blob URL for the (converted) subtitle
        const blob = new Blob([vttText], { type: "text/vtt" });
        const blobURL = URL.createObjectURL(blob);

        // Send it to your video window
        ipcRenderer.send("set-subtitle", blobURL, assignedDeck);
        inputsub.value = "";
    });


    // Load file but do NOT autoplay
    function openAndLoadFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject("No file selected");

            // Stop previous playback
            currentMediaEl.pause();
            currentMediaEl.currentTime = 0;

            if (currentUrl) {
                URL.revokeObjectURL(currentUrl);
                currentUrl = null;
            }

            currentMediaEl.removeAttribute("src");
            currentMediaEl.load();

            if (file.type.startsWith("video/")) {
                isAudio = false;
                document.getElementById(`loadBtn_${assignedDeck}`).setAttribute("aria-details", "onActive");
            } else {
                isAudio = true;
                document.getElementById(`playbackIcon_${assignedDeck}`).src = `images/icons-system/play_arrow.svg`
                document.getElementById(`loadBtn_${assignedDeck}`).setAttribute("aria-details", "onInactive");
                snackbar("Unsupported file type");
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                return reject("Unsupported file type: " + file.type);
            }

            currentUrl = URL.createObjectURL(file);
            currentMediaEl.src = currentUrl;
            currentMediaEl.addEventListener("loadeddata", () => {
                document.getElementById(`playbackIcon_${assignedDeck}`).src = `images/icons-system/play_arrow.svg`
                setSpeed();
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                resolve(currentMediaEl);
            }, { once: true });
        });
    }

    // Hidden file input
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = "video/*";
    hiddenInput.style.display = "none";
    document.body.appendChild(hiddenInput);

    // Controls
    const loadBtn = document.getElementById(`loadBtn_${assignedDeck}`);
    const playPauseBtn = document.getElementById(`playPauseBtn_${assignedDeck}`);
    const stopBtn = document.getElementById(`stopBtn_${assignedDeck}`);
    const ejectBtn = document.getElementById(`ejectBtn_${assignedDeck}`);
    const ejectBtnCap = document.getElementById(`ejectBtnCap_${assignedDeck}`);
    const progress = document.getElementById(`progress_${assignedDeck}`);
    const timeDisplay = document.getElementById(`timeDisplay_${assignedDeck}`);
    const fileDropDiv = document.getElementById(`filedropforDeck_${assignedDeck}`);

    // Load button
    loadBtn.onclick = () => hiddenInput.click();

    hiddenInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById(`loadBtn_${assignedDeck}`).setAttribute("aria-details", "onInactive");
            openAndLoadFile(file).finally(() => hiddenInput.value = "");
        }
    };

    // Play/Pause button
    playPauseBtn.onclick = () => {
        if (!currentMediaEl.src) return;

        if (currentMediaEl.currentTime >= currentMediaEl.duration) {
            currentMediaEl.currentTime = 0;
        }

        if (currentMediaEl.paused) {
            currentMediaEl.play();
            document.getElementById(`playbackIcon_${assignedDeck}`).src = `images/icons-system/pause.svg`
        } else {
            currentMediaEl.pause();
            document.getElementById(`playbackIcon_${assignedDeck}`).src = `images/icons-system/play_arrow.svg`
        }
    };

    function StopMedia() {
        if (!currentMediaEl.src) return;
        currentMediaEl.pause();
        currentMediaEl.currentTime = 0;
        document.getElementById(`playbackIcon_${assignedDeck}`).src = `images/icons-system/play_arrow.svg`
    };

    // Stop button
    stopBtn.onclick = () => {
        StopMedia()
    };

    // Eject button
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

        hiddenInput.value = "";
        document.getElementById(`loadBtn_${assignedDeck}`).setAttribute("aria-details", "onInactive");
        isAudio = false;
        document.getElementById(`playbackIcon_${assignedDeck}`).src = `images/icons-system/play_arrow.svg`
        progress.value = 0;
        timeDisplay.textContent = "00:00 / 00:00";

        const text = `<sstrong>Media Deck ${assignedDeck}</strong> ejected.`;
        snackbar(text);
    };

    ejectBtnCap.onclick = () => {
        ipcRenderer.send("set-subtitle", "", assignedDeck);
        const text = `Caption for <sstrong>Media Deck ${assignedDeck}</strong> ejected.`;
        snackbar(text);
    }

    // Update progress + time
    currentMediaEl.addEventListener("timeupdate", () => {
        if (currentMediaEl.duration) {
            progress.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 100;
            timeDisplay.textContent = `${formatTime(currentMediaEl.currentTime)} / ${formatTime(currentMediaEl.duration)}`;
        }
    });

    currentMediaEl.addEventListener("ended", () => {
        document.getElementById(`playbackIcon_${assignedDeck}`).src = `images/icons-system/replay.svg`
        timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
    });

    // Seek using progress bar
    progress.oninput = () => {
        if (currentMediaEl.duration) {
            currentMediaEl.currentTime = (progress.value / 100) * currentMediaEl.duration;
        }
    };

    // Drag-and-drop support
    ["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
        fileDropDiv.addEventListener(evt, (e) => e.preventDefault());
    });

    fileDropDiv.addEventListener("dragover", () => {
        fileDropDiv.style.backgroundColor = "#ffffff27";
    });
    fileDropDiv.addEventListener("dragleave", () => {
        fileDropDiv.style.backgroundColor = "";
    });

    fileDropDiv.addEventListener("drop", (e) => {
        const file = e.dataTransfer.files[0];
        if (file) {
            document.getElementById(`loadBtn_${assignedDeck}`).setAttribute("aria-details", "onInactive");
            openAndLoadFile(file).finally(() => {
                hiddenInput.value = "";
                fileDropDiv.style.backgroundColor = "";
            });
        }
    });
}

setupMediaExtDeck("1");
setupMediaExtDeck("2");

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

    let currentUrl = null;

    function setSpeed() {
        currentMediaEl.playbackRate = parseFloat(speed.value)
        speedValue.textContent = `${speed.value}x`;
        currentMediaEl.playbackRate = parseFloat(speed.value);
        currentMediaEl.preservesPitch = preservesPitchGlobal;
    }

    function RemoveTagtoTitle(deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = `No Title`;
        document.getElementById(`artist_${deckAssignment}`).textContent = ``;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;
    }

    function GetFilenametoTitle(filePath, deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = `${filePath.name}`;
        document.getElementById(`artist_${deckAssignment}`).textContent = `${filePath.type}`;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;

        const text = `Loaded ${filePath.name} into Audio Deck ${deckAssignment}`
        ipcRenderer.send('show-text', text);
    }

    function getTagtoTitle(currentURI, deckAssignment) {
        getAudioMetadata(currentURI).then(meta => {
            document.getElementById(`title_${deckAssignment}`).textContent = meta.TITLE;
            document.getElementById(`artist_${deckAssignment}`).textContent = meta.ARTIST;
            document.getElementById(`album_${deckAssignment}`).textContent = meta.ALBUM;

            const text = `Loaded ${meta.TITLE} into Audio Deck ${deckAssignment}`
            ipcRenderer.send('show-text', text);
        }).catch(err => {
            GetFilenametoTitle(currentURI, deckAssignment);
        });
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
            snackbar(`Media Loop enabled`);
            toggleLoopBtn.title = 'Disable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onActive");
            loopIcon.src = `images/icons-system/repeat_one.svg`;
        } else {
            snackbar(`Media Loop disabled`);
            toggleLoopBtn.title = 'Enable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onInactive");
            loopIcon.src = `images/icons-system/repeat.svg`;
        }
    });

    function openAndLoadFile(file) {
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
                playbackIcon.src = `images/icons-system/play_arrow.svg`;
                loadBtn.setAttribute("aria-details", "onInactive");
                RemoveTagtoTitle(deckId);
                snackbar(`Unsupported file type`);
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                return reject("Unsupported file type: " + file.type);
            }

            currentUrl = URL.createObjectURL(file);
            currentMediaEl.src = currentUrl;
            currentMediaEl.addEventListener("loadeddata", () => {
                playbackIcon.src = `images/icons-system/play_arrow.svg`;
                setSpeed();
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                resolve(currentMediaEl);
            }, { once: true });
        });
    }

    // Hidden file input
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = "audio/*,video/*";
    hiddenInput.style.display = "none";
    document.body.appendChild(hiddenInput);

    speed.oninput = () => {
        setSpeed();
    }

    speed.ondblclick = () => {
        speed.value = 1
        setSpeed();
    }

    // Controls
    loadBtn.onclick = () => hiddenInput.click();

    hiddenInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            getTagtoTitle(file, deckId);
            loadBtn.setAttribute("aria-details", "onInactive");
            openAndLoadFile(file).finally(() => hiddenInput.value = "");
        }
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
        playbackIcon.src = `images/icons-system/play_arrow.svg`
        speed.value = 1
        hiddenInput.value = "";
        loadBtn.setAttribute("aria-details", "onInactive");
        isAudio = false;
        progress.value = 0;
        timeDisplay.textContent = "00:00 / 00:00";
    };

    currentMediaEl.addEventListener("pause", () => {
        playbackIcon.src = `images/icons-system/play_arrow.svg`
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} paused`
        ipcRenderer.send('show-text', text);
    });

    currentMediaEl.addEventListener("play", () => {
        playbackIcon.src = `images/icons-system/pause.svg`
        const text = `Now playing: ${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId}`
        ipcRenderer.send('show-text', text);
    });

    currentMediaEl.addEventListener("ended", () => {
        playbackIcon.src = `images/icons-system/replay.svg`;
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} ended`;
        ipcRenderer.send('show-text', text);
        timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
    });

    currentMediaEl.addEventListener("timeupdate", () => {
        if (currentMediaEl.duration) {
            progress.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 100;
            timeDisplay.textContent = `${formatTime(currentMediaEl.currentTime)} / ${formatTime(currentMediaEl.duration)}`;
        }
    });

    progress.oninput = () => {
        if (currentMediaEl.duration) {
            currentMediaEl.currentTime = (progress.value / 100) * currentMediaEl.duration;
        }
    };

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
        if (file) {
            loadBtn.setAttribute("aria-details", "onInactive");
            getTagtoTitle(file, deckId);
            openAndLoadFile(file).finally(() => {
                hiddenInput.value = "";
                fileDropDiv.classList.remove('dropfile')
            });
        }
    });
}

setupMediaDeck("A");
setupMediaDeck("B");
setupMediaDeck("C");
setupMediaDeck("D");

const deckButtons = document.querySelectorAll(".buttonDeckTab");
const decks = ["A", "B", "C", "D"];

deckButtons.forEach(button => {
    button.addEventListener("click", () => {
        const selectedDeck = button.dataset.deck; // ✅ cleaner than getAttribute

        // Highlight active button
        deckButtons.forEach(btn => btn.setAttribute("aria-details", "onInactive"));
        button.setAttribute("aria-details", "onActive");

        // Show only the selected deck controls
        decks.forEach(assign => {
            const knob = document.getElementById(`volumeKnobDeck${assign}`);
            const text = document.getElementById(`mediavolume${assign}TextMain`);

            if (assign === selectedDeck) {
                knob.style.display = "block";
                text.style.display = "block";
            } else {
                knob.style.display = "none";
                text.style.display = "none";
            }

            console.log(`Matched ${assign} with ${selectedDeck}`);
        });
    });
});

// Start with Deck A visible
document.querySelector('.buttonDeckTab[data-deck="A"]').click();
