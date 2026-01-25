const lyricsMgr = new LyricsManager();

// load decks

async function startLyricsData(file, id) {
    const result = await getEmbeddedLyrics(file);
    const text = lyricsMgr.loadDeckLyrics(id, result.lyricsText);
    ipcRenderer.send('sendlyrics', id, result.lyricsText)
    return text;
}

async function StartWaveform(fileOrBlob, canvasId) {
    try {
        const canvas = document.getElementById(canvasId)
        if (!canvas) throw new Error('Canvas not found')

        document.getElementById(`${canvasId}_progress`).dataset.mode = 'intermediate';
        // Convert File/Blob to ArrayBuffer
        let arrayBuffer
        let fileName = 'audio.wav'
        if (fileOrBlob instanceof File || fileOrBlob instanceof Blob) {
            arrayBuffer = await fileOrBlob.arrayBuffer()
            fileName = fileOrBlob.name || 'audio.wav'
        } else {
            throw new Error('Invalid file or blob')
        }

        // Canvas size
        const width = canvas.width
        const height = canvas.height

        // Call main process via IPC
        document.getElementById(`${canvasId}_progress`).value = 0;

        const pngPath = await ipcRenderer.invoke('generate-waveform', arrayBuffer, fileName, width, height)

        document.getElementById(`${canvasId}_progress`).dataset.mode = 'hidden';

        // Draw PNG to canvas
        const img = new Image()
        img.onload = () => {
            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, width, height)
            ctx.drawImage(img, 0, 0, width, height)
            img.remove();
        }
        img.src = `file://${pngPath}`
    } catch (err) {
        console.error('Failed to load:', err)
        document.getElementById(`${canvasId}_progress`).dataset.mode = 'hidden';
    }
}

async function StartSpectrogram(fileOrBlob, canvasId) {
    try {
        const canvas = document.getElementById(canvasId)
        if (!canvas) throw new Error('Canvas not found')

        document.getElementById(`${canvasId}_progress`).dataset.mode = 'intermediate';
        // Convert File/Blob to ArrayBuffer
        let arrayBuffer
        let fileName = 'audio.wav'
        if (fileOrBlob instanceof File || fileOrBlob instanceof Blob) {
            arrayBuffer = await fileOrBlob.arrayBuffer()
            fileName = fileOrBlob.name || 'audio.wav'
        } else {
            throw new Error('Invalid file or blob')
        }

        // Canvas size
        const width = canvas.width
        const height = canvas.height

        // Call main process via IPC
        document.getElementById(`${canvasId}_progress`).value = 0;

        const pngPath = await ipcRenderer.invoke('generate-spectrogram', arrayBuffer, fileName, width, height)

        document.getElementById(`${canvasId}_progress`).dataset.mode = 'hidden';

        // Draw PNG to canvas
        const img = new Image()
        img.onload = () => {
            const ctx = canvas.getContext('2d')
            ctx.clearRect(0, 0, width, height)
            ctx.drawImage(img, 0, 0, width, height)
            img.remove();
        }
        img.src = `file://${pngPath}`
    } catch (err) {
        console.error('Failed to load:', err)
        snackbar('Waveform and spectrogram cannot be created becuase the media does not include any audio tracks.', 'Error!', 5000)
        document.getElementById(`${canvasId}_progress`).dataset.mode = 'hidden';
    }
}

async function RemoveWaveform(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) throw new Error('Canvas not found');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    document.getElementById(`${canvasId}_progress`).dataset.mode = 'hidden';
}

const toggleLyricCheckbox = document.getElementById('toggleLyricCheckbox');

let letLyric = false;

function ToggleLyric() {
    letLyric = toggleLyricCheckbox.checked; // Uncheck the checkbox
    ipcRenderer.send('toggle-lyrics', letLyric);
    const text = letLyric ? "Embedded Lyrics Enabled." : "Embedded Lyrics disabled.";
    snackbar(text); // Show snackbar notification
}

toggleLyricCheckbox.addEventListener('change', () => {
    ToggleLyric();
});

// Global Cast Button and Cast Functions
const toggleExtBtn = document.getElementById(`toggleExtButton`);
let toggleExternal = false;

const toggleDeckBtn = document.getElementById(`toggleDeckButton`);
let toggleMedia = false;

let intervalId1 = null;

let video = document.getElementById(`MediaExtDeck1`);
let subtitleIndex = 1;
let subtitleIndexdeck = 1;

toggleDeckBtn.addEventListener('click', () => {
    if (!toggleMedia) {
        toggleMedia = true;
        video = document.getElementById(`MediaExtDeck2`);
        subtitleIndex = 2;
        ipcRenderer.send('changingDeck', 2)
        subtitleIndexdeck = 2;
        document.getElementById(`deckIcon`).src = `icons/monosource/deckswap_b.svg`
        snackbar(`Changed to <strong>Deck B</strong> as the Cast output`);
    } else if (toggleMedia) {
        toggleMedia = false;
        video = document.getElementById(`MediaExtDeck1`);
        subtitleIndex = 1;
        subtitleIndexdeck = 1;
        ipcRenderer.send('changingDeck', 1)
        document.getElementById(`deckIcon`).src = `icons/monosource/deckswap_a.svg`
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

    intervalId1 = setInterval(sendState, 500); // update every 1 second
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
    document.getElementById(`castIcon`).src = `icons/monosource/cast_connected.svg`
    toggleExtBtn.setAttribute("aria-details", "onActive");
}

function stopCast(textdata) {
    toggleExternal = false;
    stopSending();
    snackbar(textdata);
    toggleExtBtn.title = 'Connect Cast to External';
    document.getElementById(`castIcon`).src = `icons/monosource/cast.svg`
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
        const text = `To use Direct Video Cast, turn on External Visualizer in<br><code>Options > Widgets > External Visualizer</code>`;
        snackbar(text)
    }
});

const captionText1 = document.getElementById("captionText1");
const captionText2 = document.getElementById("captionText2");
const captionText1_next = document.getElementById("captionText1_next");
const captionText2_next = document.getElementById("captionText2_next");
const track1 = document.getElementById("subtitleTrack1").track;
const track2 = document.getElementById("subtitleTrack2").track;
let lastSubtitle1 = "";
let lastSubtitle2 = "";

function disableAllTrackSub() {
    captionText1.textContent = "No active cue";
    captionText2.textContent = "No active cue";
    captionText1_next.textContent = "No next cue";
    captionText2_next.textContent = "No next cue";
    for (const t of document.getElementById('MediaExtDeck1').textTracks) t.mode = "disabled";
    for (const t of document.getElementById('MediaExtDeck2').textTracks) t.mode = "disabled";
    document.getElementById(`previewCaption_A`).textContent = '';
    document.getElementById(`previewCaption_B`).textContent = '';
}

function turnSubtitle() {
    document.getElementById('MediaExtDeck1').textTracks[0].mode = 'showing';
    document.getElementById('MediaExtDeck2').textTracks[0].mode = 'showing';
}

function setupSubtitle(src, value) {
    const track = document.getElementById(`subtitleTrack${value}`);

    // Clear subtitles if empty/null
    if (value === 0) {
        track.src = "";

        if (!src) {
            track.src = "";
            lastSubtitle1 = "";
            disableAllTrackSub();
            return;
        }

        // Prevent unnecessary reloads
        if (lastSubtitle1 === src) return;
        lastSubtitle1 = src;
        disableAllTrackSub();

        track.src = src;

        turnSubtitle();
    } else {
        track.src = "";

        if (!src) {
            track.src = "";
            lastSubtitle2 = "";
            disableAllTrackSub();
            return;
        }

        // Prevent unnecessary reloads
        if (lastSubtitle2 === src) return;
        lastSubtitle2 = src;
        disableAllTrackSub();

        track.src = src;

        turnSubtitle();
    }
}

function updateCaption(track, captionElement, captionElement_next, deckID) {
    track.addEventListener("cuechange", () => {
        const activeCue = track.activeCues[0];
        if (activeCue && track.mode !== "disabled") {
            const activeText = activeCue.text
                .replace(/\n/g, "<br>")
                .replace(/<b>/g, "<strong>")
                .replace(/<\/b>/g, "</strong>")
                .replace(/<i>/g, "<em>")
                .replace(/<\/i>/g, "</em>");

            captionElement.innerHTML = activeText
            document.getElementById(`previewCaption_${deckID}`).textContent = activeText

            const cues = track.cues;
            const currentIndex = Array.prototype.indexOf.call(cues, activeCue);
            const nextCue = cues[currentIndex + 1];

            if (nextCue && track.mode !== "disabled") {
                captionElement_next.innerHTML = nextCue.text
                    .replace(/\n/g, "<br>")
                    .replace(/<b>/g, "<strong>")
                    .replace(/<\/b>/g, "</strong>")
                    .replace(/<i>/g, "<em>")
                    .replace(/<\/i>/g, "</em>");
            } else {
                captionElement_next.textContent = "No next cue";
            }
        } else {
            document.getElementById(`previewCaption_${deckID}`).textContent = ''
        }
    });
}

// Apply to both
updateCaption(track1, captionText1, captionText1_next, 'A');
updateCaption(track2, captionText2, captionText2_next, 'B');

function setupMediaExtDeck(assignedDeck) {
    const { ipcRenderer } = require("electron");

    let currentMediaEl = document.getElementById(`MediaExtDeck${assignedDeck}`);
    const video = currentMediaEl;
    let currentUrl = null;
    let scanner = null;

    // Format seconds to mm:ss
    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    const toggleLoopBtn = document.getElementById(`toggleLoopButton${assignedDeck}`);

    let isAudio = true;

    toggleLoopBtn.addEventListener('click', () => {
        video.loop = !video.loop;

        if (video.loop) {
            const text = `Media Loop enabled`;
            snackbar(text);
            toggleLoopBtn.title = 'Disable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onActive");
            document.getElementById(`loopIcon${assignedDeck}`).src = `icons/monosource/repeat_one.svg`
        } else {
            const text = `Media Loop disabled`;
            snackbar(text);
            toggleLoopBtn.title = 'Enable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onInactive");
            document.getElementById(`loopIcon${assignedDeck}`).src = `icons/monosource/repeat.svg`
        }
    });

    const speed = document.getElementById(`speed${assignedDeck}`);
    const speedValue = document.getElementById(`speedValueText${assignedDeck}`);

    const spans = document.querySelectorAll(`#timestamps_${assignedDeck} span`);
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

    function setSpeed() {
        currentMediaEl.playbackRate = parseFloat(speed.value)
        speedValue.textContent = `${Number(speed.value).toFixed(2)}x`;
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

    let blob;

    inputsubBTN.addEventListener('click', () => {
        inputsub.click();
    });

    async function importSubtitle(file) {
        if (!file) return;

        // ✅ Allowed file extensions
        const allowedExtensions = [".srt", ".vtt"];
        const fileName = file.name.toLowerCase();

        // ✅ Check if file type is supported
        const isSupported = allowedExtensions.some(ext => fileName.endsWith(ext));

        if (!isSupported) {
            console.warn("Unsupported subtitle file:", file.name);
            alert("Please select an .srt or .vtt subtitle file.", "Invalid subtitle file type!");
            return;
        }

        // ✅ Read file content
        const text = await file.text();

        let vttText = text;

        // ✅ Convert .srt → .vtt
        if (fileName.endsWith(".srt")) {
            vttText = "WEBVTT\n\n" + text
                .replace(/\r+/g, "") // remove \r
                .replace(/^\d+\s*$/gm, "") // remove sequence numbers
                .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2") // replace commas with dots
                // Convert SSA/ASS tags like {\an1}
                .replace(/\{\\an\d+\}/g, (match) => {
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
                .replace(/\{\\[^}]+\}/g, ""); // remove other tags
        }

        // ✅ Create Blob URL for the (converted) subtitle
        const blob = new Blob([vttText], { type: "text/vtt" });
        const blobURL = URL.createObjectURL(blob);

        // ✅ Send it to your video window or renderer
        setupSubtitle(blobURL, assignedDeck);
        ipcRenderer.send("set-subtitle", blobURL, assignedDeck);

        // ✅ Reset input value so the same file can be selected again
        inputsub.value = "";
    }


    inputsub.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        importSubtitle(file, assignedDeck);
    });

    const importSubtitlediv = document.getElementById(`subtitleImport${assignedDeck}`);

    ["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
        importSubtitlediv.addEventListener(evt, (e) => e.preventDefault());
    });

    importSubtitlediv.addEventListener("dragover", () => {
        importSubtitlediv.style.backgroundColor = "#ffffff27";
    });
    importSubtitlediv.addEventListener("dragleave", () => {
        importSubtitlediv.style.backgroundColor = "";
    });

    importSubtitlediv.addEventListener("drop", (e) => {
        const file = e.dataTransfer.files[0];
        importSubtitle(file, assignedDeck);
        importSubtitlediv.style.backgroundColor = "";
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
                document.getElementById(`loadBtn${assignedDeck}`).setAttribute("aria-details", "onActive");
            } else {
                isAudio = true;
                document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/play_arrow.svg`
                document.getElementById(`loadBtn${assignedDeck}`).setAttribute("aria-details", "onInactive");
                snackbar("Unsupported file type");
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                return reject("Unsupported file type: " + file.type);
            }

            currentUrl = URL.createObjectURL(file);
            currentMediaEl.src = currentUrl;
            setSpeed();
            currentMediaEl.addEventListener("loadeddata", () => {
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                updateTimestamps();
                resolve(currentMediaEl);
            }, { once: true });
        });
    }

    function importMedia(file, assignedDeck) {
        if (file) {
            const types = ['video/mp4', 'video/3gpp', 'video/webm', 'video/mpeg'];
            if (types.some(type => file.type.startsWith(type.split('/')[0]))) {
                document.getElementById(`loadBtn${assignedDeck}`).setAttribute("aria-details", "onInactive");
                openAndLoadFile(file).finally(() => {
                    hiddenInput.value = "";
                    if (currentMediaEl.duration <= 7200) {
                        StartWaveform(file, `audioWaveTime_MediaExtDeck${assignedDeck}`).then(() => {
                            StartSpectrogram(file, `spec_MediaExtDeck${assignedDeck}`);
                        }).catch(err => { console.error(err); RemoveWaveform(`audioWaveTime_MediaExtDeck${assignedDeck}`); });
                    } else {
                        snackbar("Audio duration exceeds 2 hours, skipping waveform generation.");
                    }
                });
            } else {
                alert(`Unsupported file type. Please import supported media file.`, "Import Error")
            }
        }
    }

    document.getElementById(`clickImportMedia${assignedDeck}`).onclick = () => {
        importMedia(file, assignedDeck);
        targetID = `filedropforDeck${assignedDeck}`
        closeImportDialog(true);
    };

    document.getElementById(`clickImportSubtitle${assignedDeck}`).onclick = () => {
        importSubtitle(file, assignedDeck);
        closeImportDialog(true);
    };

    // Hidden file input
    const hiddenInput = document.createElement("input");
    hiddenInput.type = "file";
    hiddenInput.accept = "video/*";
    hiddenInput.style.display = "none";
    document.body.appendChild(hiddenInput);

    // Controls
    const loadBtn = document.getElementById(`loadBtn${assignedDeck}`);
    const playPauseBtn = document.getElementById(`playPauseBtn${assignedDeck}`);
    const stopBtn = document.getElementById(`stopBtn${assignedDeck}`);
    const ejectBtn = document.getElementById(`ejectBtn${assignedDeck}`);
    const ejectBtnCap = document.getElementById(`ejectBtnCap${assignedDeck}`);
    const progress = document.getElementById(`progress${assignedDeck}`);
    const progress2 = document.getElementById(`progress${assignedDeck}_spec`);
    const timeDisplay = document.getElementById(`timeDisplay${assignedDeck}`);
    const fileDropDiv = document.getElementById(`filedropforDeck${assignedDeck}`);

    // Load button
    loadBtn.onclick = () => hiddenInput.click();

    hiddenInput.onchange = (e) => {
        const file = e.target.files[0];
        importMedia(file, assignedDeck);
    };

    // Play/Pause button
    playPauseBtn.onclick = () => {
        if (!currentMediaEl.src) return;

        if (currentMediaEl.currentTime >= currentMediaEl.duration) {
            currentMediaEl.currentTime = 0;
        }

        if (currentMediaEl.paused) {
            currentMediaEl.play();
        } else {
            currentMediaEl.pause();
        }
    };

    function StopMedia() {
        if (!currentMediaEl.src) return;
        currentMediaEl.pause();
        currentMediaEl.currentTime = 0;
    };

    // Stop button
    stopBtn.onclick = () => {
        StopMedia()
    };

    document.getElementById(`audioWaveTime_MediaExtDeck${assignedDeck}`).style.visibility = "hidden";
    document.getElementById(`spec_MediaExtDeck${assignedDeck}`).style.visibility = "hidden";

    progress.disabled = true;
    progress2.disabled = true;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/play_arrow.svg`
                RemoveWaveform(`audioWaveTime_MediaExtDeck${assignedDeck}`)
                RemoveWaveform(`spec_MediaExtDeck${assignedDeck}`)

                if (!currentMediaEl.src) {
                    document.getElementById(`audioWaveTime_MediaExtDeck${assignedDeck}`).style.visibility = "hidden";
                    document.getElementById(`spec_MediaExtDeck${assignedDeck}`).style.visibility = "hidden";
                    removeTimestamps();
                    progress.disabled = true;
                    progress2.disabled = true;
                } else {
                    document.getElementById(`audioWaveTime_MediaExtDeck${assignedDeck}`).style.visibility = "visible";
                    document.getElementById(`spec_MediaExtDeck${assignedDeck}`).style.visibility = "visible";
                    progress.disabled = false;
                    progress2.disabled = false;
                }
            }
        });
    });

    observer.observe(currentMediaEl, { attributes: true });

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
        document.getElementById(`loadBtn${assignedDeck}`).setAttribute("aria-details", "onInactive");
        isAudio = false;
        disableAllTrackSub();
        document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/play_arrow.svg`
        progress.value = 0;
        progress2.value = 0;
        timeDisplay.textContent = "00:00 / 00:00";
        cancelAnimationFrame(rafId);
        const text = `<sstrong>Media Deck ${assignedDeck}</strong> ejected.`;
        snackbar(text);
    };

    ejectBtnCap.onclick = () => {
        blob = URL.revokeObjectURL(blob);
        setupSubtitle("", assignedDeck)
        ipcRenderer.send("set-subtitle", "", assignedDeck);
        disableAllTrackSub();
        const text = `Caption for <sstrong>Media Deck ${assignedDeck}</strong> ejected.`;
        snackbar(text);
    }

    currentMediaEl.addEventListener("pause", () => {
        disableAllTrackSub();
        document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/play_arrow.svg`
        cancelAnimationFrame(rafId);
    });

    currentMediaEl.addEventListener("play", () => {
        turnSubtitle();
        document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/pause.svg`
        rafId = requestAnimationFrame(syncSlider);
    });

    currentMediaEl.addEventListener("error", () => {
        ejectBtn.click();
        alert("There's no supported codec for this file. Please try a different media.", "Video Source Error!")
    });

    let progressDisable = false;
    let rafId;

    function syncSlider() {
        if (currentMediaEl.duration) {
            if (!progressDisable) {
                progress.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
                progress2.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
            }
        }
        rafId = requestAnimationFrame(syncSlider);
    }

    // Update progress + time
    currentMediaEl.addEventListener("timeupdate", () => {
        if (currentMediaEl.duration) {
            if (!progressDisable) {
                timeDisplay.textContent = `${formatTime(currentMediaEl.currentTime)} / ${formatTime(currentMediaEl.duration)}`;
            }
        }

        turnSubtitle();
    });

    // Dragging updates UI only
    progress.oninput = () => {
        progressDisable = true;
        timeDisplay.textContent = `${formatTime((progress.value / 512) * currentMediaEl.duration)} / ${formatTime(currentMediaEl.duration)}`;
    };

    // Update media when drag ends
    progress.onchange = () => {
        if (currentMediaEl.duration) {
            progressDisable = false;
            currentMediaEl.currentTime = (progress.value / 512) * currentMediaEl.duration;
        }
    };

    // Dragging updates UI only
    progress2.oninput = () => {
        if (currentMediaEl.duration) {
            progressDisable = true;
            timeDisplay.textContent = `${formatTime((progress2.value / 512) * currentMediaEl.duration)} / ${formatTime(currentMediaEl.duration)}`;
        }
    };

    // Update media when drag ends
    progress2.onchange = () => {
        if (currentMediaEl.duration) {
            progressDisable = false;
            currentMediaEl.currentTime = (progress2.value / 512) * currentMediaEl.duration;
        }
    };

    currentMediaEl.addEventListener("ended", () => {
        document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/replay.svg`
        timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
        cancelAnimationFrame(rafId);
    });

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
        importMedia(file, assignedDeck);
        fileDropDiv.style.backgroundColor = "";
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
    const lyricsBtn = document.getElementById(`lyricsBtn${deckId}`);
    const progress = document.getElementById(`progress${deckId}`);
    const progress2 = document.getElementById(`progress${deckId}_spec`);
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
    function setSpeed() {
        currentMediaEl.playbackRate = parseFloat(speed.value)
        speedValue.textContent = `${Number(speed.value).toFixed(2)}x`;
        currentMediaEl.playbackRate = parseFloat(speed.value);
        currentMediaEl.preservesPitch = preservesPitchGlobal;
    }

    function RemoveTagtoTitle(deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = `No Title`;
        document.getElementById(`artist_${deckAssignment}`).textContent = ``;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;
        document.getElementById(`mediaArtAlbum_${deckAssignment}`).src = `images/albumart-default.svg`;
    }

    // Run on load + resize

    function GetFilenametoTitle(filePath, deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = `${filePath.name}`;
        document.getElementById(`artist_${deckAssignment}`).textContent = `${filePath.type}`;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;
        document.getElementById(`mediaArtAlbum_${deckAssignment}`).src = `images/albumart-default.svg`;

        const text = `Loaded ${filePath.name} into Audio Deck ${deckAssignment}`
        ipcRenderer.send('show-text', text);
    }

    function getTagtoTitle(currentURI, deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = String(currentURI.name);
        document.getElementById(`artist_${deckAssignment}`).textContent = `Getting metadata...`;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;

        getAudioMetadata(currentURI).then(meta => {
            document.getElementById(`title_${deckAssignment}`).textContent = meta.TITLE;
            document.getElementById(`artist_${deckAssignment}`).textContent = meta.ARTIST;
            document.getElementById(`album_${deckAssignment}`).textContent = ` - ${meta.ALBUM}`;
            document.getElementById(`mediaArtAlbum_${deckAssignment}`).src = meta.COVER;

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
            loopIcon.src = `icons/monosource/repeat_one.svg`;
        } else {
            snackbar(`Media Loop disabled`);
            toggleLoopBtn.title = 'Enable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onInactive");
            loopIcon.src = `icons/monosource/repeat.svg`;
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
                playbackIcon.src = `icons/monosource/play_arrow.svg`;
                loadBtn.setAttribute("aria-details", "onInactive");
                RemoveTagtoTitle(deckId);
                snackbar(`Unsupported file type`);
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
            progress2.disabled = false;
            updateTimestamps();
            document.getElementById(`audioWaveTime_media${deckId}`).style.visibility = "visible";
            document.getElementById(`spec_media${deckId}`).style.visibility = "visible";
        } else {
            progress.disabled = true;
            progress2.disabled = true;
            document.getElementById(`audioWaveTime_media${deckId}`).style.visibility = "hidden";
            document.getElementById(`spec_media${deckId}`).style.visibility = "hidden";
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
                    if (currentMediaEl.duration <= 7200) {
                        StartWaveform(file, `audioWaveTime_media${deckId}`).then(() => {
                            StartSpectrogram(file, `spec_media${deckId}`)
                        }).catch(err => { console.error(err); RemoveWaveform(`audioWaveTime_media${deckId}`) })
                    } else if (file.type.startsWith('audio/flac')) {
                        snackbar("FLAC has infinite duration. but waveform generation will be started and will show after playback.", "Generating waveform", 5000);
                        progress.disabled = true;
                        progress2.disabled = true;
                        document.getElementById(`audioWaveTime_media${deckId}`).style.visibility = "hidden";
                        document.getElementById(`spec_media${deckId}`).style.visibility = "hidden";
                        StartWaveform(file, `audioWaveTime_media${deckId}`).then(() => {
                            StartSpectrogram(file, `spec_media${deckId}`)
                        }).catch(err => { console.error(err); RemoveWaveform(`audioWaveTime_media${deckId}`) })
                    } else {
                        snackbar("Audio duration exceeds 2 hours, skipping waveform generation.");
                    }
                    lrcEntries = startLyricsData(file, deckId);
                });
            } else {
                alert(`Unsupported file type. Please import supported media file.`, "Import Error")
            }
        }
    }

    // Controls
    loadBtn.onclick = () => hiddenInput.click();

    hiddenInput.onchange = (e) => {
        const file = e.target.files[0];
        importAudioFile(file, deckId)
    };

    document.getElementById(`clickImportAudio${deckId}`).onclick = () => {
        importAudioFile(file, deckId);
        targetID = `filedropforDeck${deckId}`
        closeImportDialog(true);
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
            ipcRenderer.send('removelyrics', deckId);
        }

        currentMediaEl.removeAttribute("src");
        currentMediaEl.load();
        RemoveTagtoTitle(deckId);
        playbackIcon.src = `icons/monosource/play_arrow.svg`
        speed.value = 1
        hiddenInput.value = "";
        loadBtn.setAttribute("aria-details", "onInactive");
        isAudio = false;
        progress.value = 0;
        progress2.value = 0;
        timeDisplay.textContent = "00:00 / 00:00";
        cancelAnimationFrame(rafId);
    };

    lyricsBtn.onclick = () => {
        ipcRenderer.send('open_lyrics', deckId)
    };

    currentMediaEl.addEventListener("pause", () => {
        playbackIcon.src = `icons/monosource/play_arrow.svg`
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} paused`
        ipcRenderer.send('show-text', text);
        ipcRenderer.send(`show-lyrics-media${deckId}`, "");
        document.getElementById(`previewLyrics_${deckId}`).textContent = ``;
        previousLine = "";
        cancelAnimationFrame(rafId);
    });

    currentMediaEl.addEventListener("error", (e) => {
        ejectBtn.click();
        alert("An error occured while importing and decoding the audio due to" +
            " unsupported codec, file has been moved or deleted or " +
            " buffering issues. Please try a different media or try to import again.", "Audio Error!")
        setTimeout(() => {
            RemoveTagtoTitle(deckId);
        }, 500);
    });

    currentMediaEl.addEventListener("play", () => {
        playbackIcon.src = `icons/monosource/pause.svg`
        const text = `Now playing: ${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId}`
        ipcRenderer.send('show-text', text);
        rafId = requestAnimationFrame(syncSlider);
    });

    let progressDisable = false;
    let rafId;

    function syncSlider() {
        if (currentMediaEl.duration) {
            if (!progressDisable) {
                progress.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
                progress2.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
            }
        }
        rafId = requestAnimationFrame(syncSlider);
    }

    // Update progress + time
    currentMediaEl.addEventListener("timeupdate", () => {
        if (currentMediaEl.duration) {
            if (!progressDisable) {
                timeDisplay.textContent = updateCurrentTime();

                // during playback
                const recentline = lyricsMgr.getCurrentLine(deckId, currentMediaEl.currentTime);

                if (recentline) {
                    if (previousLine !== recentline) {
                        previousLine = recentline;
                        ipcRenderer.send(`show-lyrics-media${deckId}`,
                            `<strong>Audio ${deckId}</strong>: ${recentline.text}`
                        );
                        document.getElementById(`previewLyrics_${deckId}`).textContent = recentline.text;
                    }
                } else {
                    if (previousLine !== null) {
                        previousLine = null;
                        document.getElementById(`previewLyrics_${deckId}`).textContent = ``;
                        ipcRenderer.send(`show-lyrics-media${deckId}`, ``);
                    }
                }
            }
        }

        turnSubtitle();
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

    // Dragging updates UI only
    progress2.oninput = () => {
        if (currentMediaEl.duration) {
            progressDisable = true;
            timeDisplay.textContent = updateCurrentTime();
        }
    };

    // Update media when drag ends
    progress2.onchange = () => {
        if (currentMediaEl.duration) {
            progressDisable = false;
            currentMediaEl.currentTime = (progress2.value / 512) * currentMediaEl.duration;
        }
    };

    document.getElementById(`audioWaveTime_media${deckId}`).style.visibility = "hidden";
    document.getElementById(`spec_media${deckId}`).style.visibility = "hidden";

    progress.disabled = true;
    progress2.disabled = true;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            ipcRenderer.send(`show-lyrics-media${deckId}`, "");
            document.getElementById(`previewLyrics_${deckId}`).textContent = ""
            previousLine = "";

            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                playbackIcon.src = `icons/monosource/play_arrow.svg`
                RemoveWaveform(`audioWaveTime_media${deckId}`)
                RemoveWaveform(`spec_media${deckId}`)

                if (!currentMediaEl.src) {
                    document.getElementById(`audioWaveTime_media${deckId}`).style.visibility = "hidden";
                    document.getElementById(`spec_media${deckId}`).style.visibility = "hidden";
                    removeTimestamps();
                    progress.disabled = true;
                    progress2.disabled = true;
                } else {
                    document.getElementById(`audioWaveTime_media${deckId}`).style.visibility = "visible";
                    document.getElementById(`spec_media${deckId}`).style.visibility = "visible";
                    progress.disabled = false;
                    progress2.disabled = false;
                }
            }
        });
    });

    observer.observe(currentMediaEl, { attributes: true });

    currentMediaEl.addEventListener("ended", () => {
        playbackIcon.src = `icons/monosource/replay.svg`;
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} ended`;
        ipcRenderer.send('show-text', text);
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

["mediaArtAlbum_A", "mediaArtAlbum_B", "mediaArtAlbum_C", "mediaArtAlbum_D"]
    .forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        el.addEventListener("click", (e) => {
            let src = "";

            // If it's an <img>
            if (e.target.tagName.toLowerCase() === "img") {
                src = e.target.src;
            } else {
                // If it's a div with background-image
                const bg = window.getComputedStyle(e.currentTarget).backgroundImage;
                // bg is like url("path"), remove url("") wrapper
                src = bg.slice(5, -2);
            }

            createDialogImage(src);
        });
    });