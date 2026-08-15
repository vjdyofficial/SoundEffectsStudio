const { get } = require("http");

const lyricsMgr = new LyricsManager();
const VideoBroadcast = new BroadcastChannel('videobroadcast');

function resizeImageFromBytes(data, format, size = 128) {
    return new Promise((resolve) => {
        try {
            const blob = new Blob([new Uint8Array(data)], { type: format });
            const url = URL.createObjectURL(blob);

            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;

                const ctx = canvas.getContext("2d");
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";

                ctx.drawImage(img, 0, 0, size, size);

                const resized = canvas.toDataURL("image/jpeg", 0.7);

                URL.revokeObjectURL(url);
                resolve(resized);
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
            };

            img.src = url;
        } catch (e) {
            resolve(null);
        }
    });
}

let rpm = 33;
const rpmSelector = document.getElementById('RPMSelector');

rpmSelector.addEventListener('change', (e) => {
    rpm = parseFloat(e.target.value);
    localStorage.setItem('rpm', rpm);
});

rpmSelector.value = localStorage.getItem('rpm') || rpm;
rpmSelector.dispatchEvent(new Event('change'));

function getAudioMetadata(fileUrl) {
    return new Promise((resolve, reject) => {
        if (!fileUrl) {
            reject(new Error("No file URL provided"));
            return;
        }

        jsmediatags.read(fileUrl, {
            onSuccess: async (tag) => {
                try {
                    let cover = null;
                    let coverFull = null;

                    if (tag.tags.picture) {
                        const { data, format } = tag.tags.picture;

                        // 🔥 create resized (fast UI)
                        cover = await resizeImageFromBytes(data, format, 128);

                        // 🧠 keep original (no resize, just encode once)
                        const byteArray = new Uint8Array(data);
                        const blob = new Blob([byteArray], { type: format });
                        coverFull = URL.createObjectURL(blob); // ⚡ faster than base64
                    }

                    const meta = {
                        TITLE: tag.tags.title || fileUrl.split(/[\\/]/).pop() || "Unknown Title",
                        ARTIST: tag.tags.artist || "Unknown Artist",
                        ALBUMARTIST: tag.tags.albumartist || "Unknown Artist",
                        ALBUM: tag.tags.album || "Unknown Album",
                        COVER: cover || "images/albumart-default.svg",
                        COVER_FULL: coverFull || "images/albumart-default.svg",
                        TRACK: tag.tags.track || "Unknown",
                        YEAR: tag.tags.year || "Unknown",
                        DATE: tag.tags.date || "Unknown",
                        DISC: tag.tags.disc || "Unknown",
                        GENRE: tag.tags.genre || "Unknown",
                    };

                    resolve(meta);
                } catch (err) {
                    reject(err);
                }
            },

            onError: (error) => {
                reject(error);
            }
        });
    });
}

const receiveFromConsole = new BroadcastChannel("sfx-analyze-info");

function getAudioSource(deckId) {
    const id = deckId;

    receiveFromConsole.addEventListener("message", (event) => {
        if (event.data.deck !== id) return; // only process if deck matches

        const { type, data, deck } = event.data;
        if (type === "audio-info") {
            const result = event.data
            document.getElementById(`bpm${id}`).textContent = result.bpm ? `${result.bpm}` : "";
            document.getElementById(`key${id}`).textContent = result.key ? `- ${result.key}` : "";
            document.getElementById(`channellayout${id}`).textContent = result.channels ? `- ${getChannelCode(result.channels)}` : "";
        }
    });
}

const sendtoConsole = new BroadcastChannel("main-to-renderer");

async function startLyricsData(file, id) {
    const result = await getEmbeddedLyrics(file);
    const text = lyricsMgr.loadDeckLyrics(id, result.lyricsText);
    ipcRenderer.send('sendlyrics', id, result.lyricsText)
    return text;
}

function showMediaInfo(deckAssignment) {
    const el = document.getElementById(`media${deckAssignment}`);

    if (!el) {
        alert(`Deck ${deckAssignment} not found.`);
        return;
    }

    const data = el.dataset;

    alert(
        `Title: ${data.title || "N/A"}\n` +
        `Artist: ${data.artist || "N/A"}\n` +
        `Album: ${data.album || "N/A"}\n` +
        `Track: ${data.track || "N/A"}\n` +
        `Year: ${data.year || "N/A"}\n` +
        `Genre: ${data.genre || "N/A"}`
        , `Audio Metadata Info for Deck ${deckAssignment}`);
}

const deckhash = {
    1: '',
    2: '',
    A: '',
    B: '',
    C: '',
    D: ''
}

const waveformChannel = new BroadcastChannel("waveform");

function getChannelLayoutName(channelCount) {
    switch (channelCount) {
        case 1:
            return "Mono";

        case 2:
            return "TrueStereo";

        case 3:
            return "TrueStereo Joint";

        case 4:
            return "TrueStereo Quad";

        case 5:
            return "TrueSurround 5.0";

        case 6:
            return "TrueSurround 5.1";

        case 7:
            return "TrueSurround 6.1";

        case 8:
            return "TrueSurround 7.1";

        default:
            if (channelCount > 8 && channelCount <= 32) {
                return "TrueSurround+";
            }

            return "Unknown";
    }
}

async function StartWaveform(fileOrBlob, canvasId, canvasId2, id) {
    try {
        const canvas = document.getElementById(canvasId)
        if (!canvas) throw new Error('Canvas1 not found')

        const canvas2 = document.getElementById(canvasId2)
        if (!canvas2) throw new Error('Canvas2 not found')

        document.getElementById(`${canvasId}_progress`).dataset.mode = 'intermediate';
        document.getElementById(`${canvasId2}_progress`).dataset.mode = 'intermediate';

        waveformChannel.postMessage({
            type: "generate",
            src: fileOrBlob,
            width: canvas.width,
            height: canvas.height,
            width2: canvas2.width,
            height2: canvas2.height,
        });

        waveformChannel.onmessage = (event) => {
            if (event.data.type === "errorload") {
                console.error(
                    "Waveform loading failed:",
                    event.data.error
                );

                alert(event.data.error, "Waveform loading failed!")

                document.getElementById(
                    `${canvasId}_progress`
                ).dataset.mode = "hidden";

                document.getElementById(
                    `${canvasId2}_progress`
                ).dataset.mode = "hidden";

                // Trigger your eject button
                document.getElementById("ejectBtn" + id).click();

                return;
            }

            if (event.data.type !== "waveform")
                return;

            const {
                waveform,
                waveform2,
                width,
                height,
                width2,
                height2,
                channelCount,
                sampleRate
            } = event.data;

            // =========================
            // Canvas 1 - Normal waveform
            // =========================

            const ctx = canvas.getContext("2d");

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = "#dfff93";

            const amp = height / 2;

            for (let channel = 0;
                channel < channelCount;
                channel++) {
                for (let x = 0; x < width; x++) {

                    const waveformGET =
                        waveform2[channel];

                    const point = waveformGET[x];

                    if (!point)
                        continue;

                    const { min, max } = point;

                    ctx.fillRect(
                        x,
                        (1 + min) * amp,
                        1,
                        Math.max(1, (max - min) * amp)
                    );
                }
            }


            // =========================
            // Canvas 2 - Multichannel
            // =========================

            const ctx2 = canvas2.getContext("2d");

            ctx2.clearRect(0, 0, width2, height2);
            ctx2.fillStyle = "#dfff93";

            const channelHeight =
                height2 / channelCount;

            for (let channel = 0;
                channel < channelCount;
                channel++) {

                const waveformGET =
                    waveform2[channel];

                if (!waveformGET)
                    continue;

                const center =
                    channel * channelHeight +
                    channelHeight / 2;

                const amp =
                    channelHeight / 2;

                for (let x = 0;
                    x < waveformGET.length;
                    x++) {

                    const point =
                        waveformGET[x];

                    if (!point)
                        continue;

                    const { min, max } = point;

                    ctx2.fillRect(
                        x,
                        center + min * amp,
                        1,
                        Math.max(
                            1,
                            (max - min) * amp
                        )
                    );
                }
            }

            document.getElementById('channels_' + id).textContent = getChannelLayoutName(channelCount) + " - " + (sampleRate / 1000).toFixed(1) + "kHz";

            document.getElementById(
                `${canvasId}_progress`
            ).dataset.mode = "hidden";

            document.getElementById(
                `${canvasId2}_progress`
            ).dataset.mode = "hidden";
        };
    } catch (err) {
        console.error('Failed to load:', err)
        snackbar(`Waveform and spectrogram cannot be created becuase: ${err}`, 'Error!', 5000)
        document.getElementById(`${canvasId}_progress`).dataset.mode = 'hidden';
        document.getElementById(`${canvasId2}_progress`).dataset.mode = 'hidden';
    }
}

async function RemoveWaveform(canvasId, id) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) throw new Error('Canvas not found');
    const ctx = canvas.getContext('2d');
    deckhash[id] = '';
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    document.getElementById(`${canvasId}_progress`).dataset.mode = 'hidden';
    document.getElementById('channels_' + id).textContent = "";
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

        VideoBroadcast.postMessage({
            type: 'VIDEO_STATE',
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

    intervalId1 = setInterval(sendState, 16); // update every 1 second
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
            startCast(text, 'Direct Video Broadcast System');
        } else if (toggleExternal) {
            const text = `External Casting stopped`;
            stopCast(text, 'Direct Video Broadcast System');
        }
    } else {
        const text = `To use Direct Video Cast, turn on External Visualizer in<br><code>Plugins > Widgets > External Visualizer</code>`;
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

function setupZoomSlider(sliderId, targetDivId) {
    const slider = document.getElementById(sliderId);
    const targetDiv = document.getElementById(targetDivId);
    slider.addEventListener('input', () => {
        const scaleValue = slider.value;
        targetDiv.style.cssText = `--zoom: ${scaleValue * 100}%;`
    });

    // Initial setup
    const initialScaleValue = slider.value;
    targetDiv.style.cssText = `--zoom: ${initialScaleValue * 100}%;`
}

function setupMediaExtDeck(deckId) {
    const { ipcRenderer } = require("electron");

    let currentMediaEl = document.getElementById(`MediaExtDeck${deckId}`);
    const video = currentMediaEl;
    let currentUrl = null;
    const playbackIcon = document.getElementById(`playbackIcon${deckId}`);
    let scanner = null;

    // Format seconds to mm:ss
    function formatTime(seconds) {
        if (isNaN(seconds)) return "00:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }

    const toggleLoopBtn = document.getElementById(`toggleLoopButton${deckId}`);

    let isAudio = true;

    toggleLoopBtn.addEventListener('click', () => {
        video.loop = !video.loop;

        if (video.loop) {
            const text = `Media Loop enabled`;
            snackbar(text);
            toggleLoopBtn.title = 'Disable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onActive");
            document.getElementById(`loopIcon${deckId}`).src = `icons/monosource/repeat_one.svg`
        } else {
            const text = `Media Loop disabled`;
            snackbar(text);
            toggleLoopBtn.title = 'Enable Loop';
            toggleLoopBtn.setAttribute("aria-details", "onInactive");
            document.getElementById(`loopIcon${deckId}`).src = `icons/monosource/repeat.svg`
        }
    });

    const speed = document.getElementById(`speed${deckId}`);
    const speedValue = document.getElementById(`speedValueText${deckId}`);

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
        currentMediaEl.preservesPitch = preservesPitchGlobal;
        currentMediaEl.playbackRate = parseFloat(speed.value)
    }

    const inputsubBTN = document.getElementById(`subtitleFile${deckId}_btn`);

    speed.oninput = () => {
        setSpeed();
    }

    speed.ondblclick = () => {
        speed.value = 1
        setSpeed();
    }

    let blob;

    inputsubBTN.addEventListener('click', async () => {
        const result = await ipcRenderer.invoke("pick-subtitle-file")

        if (!result) {
            console.log("User cancelled");
            return;
        }

        console.log("File:", result.name);
        console.log("Path:", result.path);

        importSubtitle(result.path);
    });

    async function importSubtitle(filePath) {
        const fs = require("fs").promises;
        if (!filePath) return;
        const allowedExtensions = [".srt", ".vtt"];
        const ext = path.extname(filePath).toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            console.warn("Unsupported subtitle file:", filePath);
            alert("Please select an .srt or .vtt subtitle file.", "Invalid subtitle file type!");
            return;
        }

        // ✅ Read file content using fs
        let text;
        try {
            text = await fs.readFile(filePath, "utf-8");
        } catch (err) {
            console.error("Failed to read subtitle file:", err);
            return;
        }

        let vttText = text;

        if (ext === ".srt") {
            vttText = "WEBVTT\n\n" + text
                .replace(/\r+/g, "")
                .replace(/^\d+\s*$/gm, "")
                .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
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
                .replace(/\{\\[^}]+\}/g, "");
        }

        // ✅ Create Blob URL and use it
        const blob = new Blob([vttText], { type: "text/vtt" });
        const blobURL = URL.createObjectURL(blob);

        setupSubtitle(blobURL, deckId);
        ipcRenderer.send("set-subtitle", blobURL, deckId);
    }

    const importSubtitlediv = document.getElementById(`subtitleImport${deckId}`);

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
        importSubtitle(file, deckId);
        importSubtitlediv.style.backgroundColor = "";
    });

    // Load file but do NOT autoplay
    function openAndLoadFile(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject("No file selected");

            // Stop previous playback
            currentMediaEl.pause();
            currentMediaEl.currentTime = 0;
            currentMediaEl.removeAttribute("src");
            currentMediaEl.load();
            currentMediaEl.src = file;
            setSpeed();
            currentMediaEl.addEventListener("loadeddata", () => {
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                updateTimestamps();
                resolve(currentMediaEl);
            }, { once: true });
        });
    }

    function importMedia(file, deckId) {
        if (file) {
            openAndLoadFile(file).finally(() => {
                if (currentMediaEl.duration <= 7200) {
                    StartWaveform(file, `audioWaveTime_MediaExtDeck${deckId}`, `spec_MediaExtDeck${deckId}`, deckId).then(() => {
                    }).catch(err => { console.error(err); RemoveWaveform(`audioWaveTime_MediaExtDeck${deckId}`, deckId); });
                } else {
                    snackbar("Audio duration exceeds 2 hours, skipping waveform generation.");
                }
            });
        }
    }

    document.getElementById(`clickImportMedia${deckId}`).onclick = () => {
        importMedia(file, deckId);
        targetID = `filedropforDeck${deckId}`
        closeImportDialog(true);
    };

    document.getElementById(`clickImportSubtitle${deckId}`).onclick = () => {
        importSubtitle(file, deckId);
        closeImportDialog(true);
    };

    const playPauseBtn = document.getElementById(`playPauseBtn${deckId}`);
    const stopBtn = document.getElementById(`stopBtn${deckId}`);
    const ejectBtn = document.getElementById(`ejectBtn${deckId}`);
    const ejectBtnCap = document.getElementById(`ejectBtnCap${deckId}`);
    const progress = document.getElementById(`progress${deckId}`);
    const progress2 = document.getElementById(`progress${deckId}_spec`);
    const timeDisplay = document.getElementById(`timeDisplay${deckId}`);
    const fileDropDiv = document.getElementById(`filedropforDeck${deckId}`);

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

    document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "hidden";
    document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "hidden";

    progress.disabled = true;
    progress2.disabled = true;

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                document.getElementById(`playbackIcon${deckId}`).src = `icons/monosource/play_arrow.svg`
                RemoveWaveform(`audioWaveTime_MediaExtDeck${deckId}`, deckId)
                RemoveWaveform(`spec_MediaExtDeck${deckId}`, deckId)

                if (!currentMediaEl.src) {
                    document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "hidden";
                    document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "hidden";
                    removeTimestamps();
                    progress.disabled = true;
                    progress2.disabled = true;
                } else {
                    document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "visible";
                    document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "visible";
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

        isAudio = false;
        disableAllTrackSub();
        document.getElementById(`playbackIcon${deckId}`).src = `icons/monosource/play_arrow.svg`
        progress.value = 0;
        progress2.value = 0;
        timeDisplay.textContent = "00:00 / 00:00";
        cancelAnimationFrame(rafId);
        const text = `<sstrong>Media Deck ${deckId}</strong> ejected.`;
        snackbar(text);
    };

    ejectBtnCap.onclick = () => {
        blob = URL.revokeObjectURL(blob);
        setupSubtitle("", deckId)
        ipcRenderer.send("set-subtitle", "", deckId);
        disableAllTrackSub();
        const text = `Caption for <strong>Media Deck ${deckId}</strong> ejected.`;
        snackbar(text);
    }

    currentMediaEl.addEventListener("pause", () => {
        disableAllTrackSub();
        document.getElementById(`playbackIcon${deckId}`).src = `icons/monosource/play_arrow.svg`
        cancelAnimationFrame(rafId);
    });

    currentMediaEl.addEventListener("play", () => {
        turnSubtitle();
        document.getElementById(`playbackIcon${deckId}`).src = `icons/monosource/pause.svg`
        rafId = requestAnimationFrame(syncSlider);
    });

    currentMediaEl.addEventListener("error", () => {
        ejectBtn.click();
        alert("An error occured while importing and decoding the video due to" +
            " unsupported codec, file has been moved or deleted, corrupted binary data or " +
            " buffering issues. Please try a different media or try to import again.", "Video Error!")
    });

    function updateCurrentTime() {
        const hasDuration = Number.isFinite(currentMediaEl.duration);

        if (hasDuration) {
            progress.disabled = false;
            progress2.disabled = false;
            updateTimestamps();
            document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "visible";
            document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "visible";
        } else {
            progress.disabled = true;
            progress2.disabled = true;
            document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "hidden";
            document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "hidden";
        }

        const current = formatTime(currentMediaEl.currentTime);

        const total = hasDuration
            ? ` / ${formatTime(currentMediaEl.duration)}`
            : "";

        return `${current}${total}`;
    }

    let progressDisable = false;
    let rafId;
    const zoomParent = document.getElementById(`zoomparent_${deckId}`);
    setupZoomSlider(`zoomslider_${deckId}`, `zoom_${deckId}`);

    function syncSlider() {
        if (currentMediaEl.duration) {
            if (!progressDisable) {
                progress.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
                progress2.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;

                if (zoomParent) {
                    const scrollWidth = zoomParent.scrollWidth;
                    const clientWidth = zoomParent.clientWidth;
                    if (scrollWidth > clientWidth) {
                        const scrollPosition = (currentMediaEl.currentTime / currentMediaEl.duration) * (scrollWidth - clientWidth);
                        zoomParent.scrollLeft = scrollPosition;
                        zoomParent.scroll({ left: scrollPosition, behavior: 'smooth' });
                    }
                }
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

        turnSubtitle();
    });

    // Dragging updates UI only
    progress.oninput = () => {
        if (currentMediaEl.duration) {
            progressDisable = true;
            timeDisplay.textContent = updateCurrentTime();
            if (zoomParent) {
                const scrollWidth = zoomParent.scrollWidth;
                const clientWidth = zoomParent.clientWidth;
                if (scrollWidth > clientWidth) {
                    const scrollPosition = (progress.value / 512) * (scrollWidth - clientWidth);
                    zoomParent.scrollLeft = scrollPosition;
                    zoomParent.scroll({ left: scrollPosition, behavior: 'smooth' });
                }
            }
            progress2.value = progress.value;
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
            if (zoomParent) {
                const scrollWidth = zoomParent.scrollWidth;
                const clientWidth = zoomParent.clientWidth;
                if (scrollWidth > clientWidth) {
                    const scrollPosition = (progress2.value / 512) * (scrollWidth - clientWidth);
                    zoomParent.scrollLeft = scrollPosition;
                    zoomParent.scroll({ left: scrollPosition, behavior: 'smooth' });
                }
            }
            progress.value = progress2.value;
        }
    };

    // Update media when drag ends
    progress2.onchange = () => {
        if (currentMediaEl.duration) {
            progressDisable = false;
            currentMediaEl.currentTime = (progress2.value / 512) * currentMediaEl.duration;
        }
    };

    document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "hidden";
    document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "hidden";

    progress.disabled = true;
    progress2.disabled = true;

    const mediaobserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            ipcRenderer.send(`show-lyrics-media${deckId}`, "");
            previousLine = "";

            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                playbackIcon.src = `icons/monosource/play_arrow.svg`
                RemoveWaveform(`audioWaveTime_MediaExtDeck${deckId}`, deckId)
                RemoveWaveform(`spec_MediaExtDeck${deckId}`, deckId)

                if (!currentMediaEl.src) {
                    document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "hidden";
                    document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "hidden";
                    removeTimestamps();
                    progress.disabled = true;
                    progress2.disabled = true;
                } else {
                    document.getElementById(`audioWaveTime_MediaExtDeck${deckId}`).style.visibility = "visible";
                    document.getElementById(`spec_MediaExtDeck${deckId}`).style.visibility = "visible";
                    progress.disabled = false;
                    progress2.disabled = false;
                }
            }
        });
    });

    mediaobserver.observe(currentMediaEl, { attributes: true });

    currentMediaEl.addEventListener("ended", () => {
        document.getElementById(`playbackIcon${deckId}`).src = `icons/monosource/replay.svg`
        timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
        cancelAnimationFrame(rafId);
    });
}

setupMediaExtDeck("1");
setupMediaExtDeck("2");

function setupMediaDeck(deckId) {
    function loopAToBInterval(audio, pointA, pointB, intervalMs = 20) {
        if (!(audio instanceof HTMLAudioElement)) {
            throw new Error("Not an audio element!");
        }
        if (pointA >= pointB) {
            snackbar("Point A must be less than Point B", "Loop Marker");
            throw new Error("Point A must be less than Point B");
        }

        audio.currentTime = pointA;

        snackbar("Loop enabled and will set to loop markers", "Loop Marker");

        const intervalId = setInterval(() => {
            if (audio.currentTime >= pointB || audio.currentTime <= pointA) {
                audio.currentTime = pointA;
            }
        }, intervalMs);

        // return cleanup function
        return () => {
            snackbar("Loop by marker has been disabled", "Loop Marker");
            clearInterval(intervalId)
        };
    }

    const currentMediaEl = document.getElementById(`media${deckId}`);
    const toggleLoopBtn = document.getElementById(`toggleLoopButton${deckId}`);
    const playPauseBtn = document.getElementById(`playPauseBtn${deckId}`);
    const stopBtn = document.getElementById(`stopBtn${deckId}`);
    const ejectBtn = document.getElementById(`ejectBtn${deckId}`);
    const lyricsBtn = document.querySelector(`[data-name="Lyrics ${deckId}"]`);
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
        speedValue.textContent = `${Number(speed.value).toFixed(2)}x`;
        currentMediaEl.preservesPitch = preservesPitchGlobal;
        currentMediaEl.playbackRate = parseFloat(speed.value)
    }

    function RemoveTagtoTitle(deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = ``;
        document.getElementById(`artist_${deckAssignment}`).textContent = ``;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;
        const el = document.getElementById(`mediaArtAlbum_${deckAssignment}`);
        el.dataset.source = "";
        el.style.setProperty('--source32', ``);

        document.getElementById(`media${deckAssignment}`).dataset.title = '';
        document.getElementById(`media${deckAssignment}`).dataset.artist = '';
        document.getElementById(`media${deckAssignment}`).dataset.album = '';
        document.getElementById(`media${deckAssignment}`).dataset.track = '';
        document.getElementById(`media${deckAssignment}`).dataset.year = '';
        document.getElementById(`media${deckAssignment}`).dataset.genre = '';
    }


    function GetFilenametoTitle(filePath, deckAssignment) {
        const fileName = filePath.split(/[\\/]/).pop();
        const ext = '.' + fileName.split('.').pop().toLowerCase();

        document.getElementById(`title_${deckAssignment}`).textContent = `${fileName}`;
        document.getElementById(`artist_${deckAssignment}`).textContent = `${getMimeTypeFromExt(ext)}`;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;
        const el = document.getElementById(`mediaArtAlbum_${deckAssignment}`);
        el.dataset.source = "";
        el.style.setProperty('--source32', ``);

        document.getElementById(`media${deckAssignment}`).dataset.title = `${filePath.name}`;
        document.getElementById(`media${deckAssignment}`).dataset.artist = '';
        document.getElementById(`media${deckAssignment}`).dataset.album = '';
        document.getElementById(`media${deckAssignment}`).dataset.track = '';
        document.getElementById(`media${deckAssignment}`).dataset.year = '';
        document.getElementById(`media${deckAssignment}`).dataset.date = '';
        document.getElementById(`media${deckAssignment}`).dataset.genre = '';
    }

    function getTagtoTitle(currentURI, deckAssignment) {
        document.getElementById(`title_${deckAssignment}`).textContent = String(currentURI.split(/[\\/]/).pop());
        document.getElementById(`artist_${deckAssignment}`).textContent = `Getting metadata...`;
        document.getElementById(`album_${deckAssignment}`).textContent = ``;

        getAudioMetadata(currentURI).then(meta => {
            document.getElementById(`title_${deckAssignment}`).textContent = meta.TITLE;
            document.getElementById(`artist_${deckAssignment}`).textContent = meta.ARTIST;
            document.getElementById(`album_${deckAssignment}`).textContent = ` - ${meta.ALBUM}`;
            const el = document.getElementById(`mediaArtAlbum_${deckAssignment}`);
            el.dataset.source = meta.COVER_FULL;
            el.style.setProperty('--source32', `url(${meta.COVER})`);

            document.getElementById(`media${deckAssignment}`).dataset.title = meta.TITLE;
            document.getElementById(`media${deckAssignment}`).dataset.artist = meta.ARTIST;
            document.getElementById(`media${deckAssignment}`).dataset.album = meta.ALBUM;
            document.getElementById(`media${deckAssignment}`).dataset.track = meta.TRACK;
            document.getElementById(`media${deckAssignment}`).dataset.year = meta.YEAR;
            document.getElementById(`media${deckAssignment}`).dataset.genre = meta.GENRE;
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

    getAudioSource(deckId);

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

            currentMediaEl.removeAttribute("src");
            currentMediaEl.load();

            currentMediaEl.src = file;
            setSpeed();
            currentMediaEl.addEventListener("loadeddata", () => {
                timeDisplay.textContent = `00:00${currentMediaEl.duration === Infinity ? "" : ` / ${formatTime(currentMediaEl.duration)}`}`;
                updateTimestamps();

                resolve(currentMediaEl);
            }, { once: true });
        });
    }

    let lrcEntries;

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

        const path = require('path');

        if (file) {
            setTimeout(() => {
                getTagtoTitle(file, deckId);
            }, 100);
            openAndLoadFile(file).finally(() => {
                const isFlac = path.extname(String(currentMediaEl.src)).toLowerCase() === '.flac';

                if (isFlac) {
                    if (currentMediaEl.duration >= 7200 || currentMediaEl.duration <= 0) {
                        snackbar("Audio duration exceeds 2 hours, skipping waveform generation.");
                    } else {
                        snackbar("Waveform generation will be processed but will use the progress bar after the audio ends.");
                        StartWaveform(file, `audioWaveTime_media${deckId}`, `spec_media${deckId}`, deckId).then(() => {
                        }).catch(err => { console.error(err); RemoveWaveform(`audioWaveTime_media${deckId}`, deckId) })
                    }
                } else if (currentMediaEl.duration <= 7200) {
                    StartWaveform(file, `audioWaveTime_media${deckId}`, `spec_media${deckId}`, deckId).then(() => {
                    }).catch(err => { console.error(err); RemoveWaveform(`audioWaveTime_media${deckId}`, deckId) })
                } else {
                    snackbar("Audio duration exceeds 2 hours, skipping waveform generation.");
                }
                lrcEntries = startLyricsData(file, deckId);
            });
        }
    }

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
        playPauseBtn.title = 'Play';
        speed.value = 1
        isAudio = false;
        progress.value = 0;
        progress2.value = 0;
        timeDisplay.textContent = "00:00 / 00:00";
        cancelAnimationFrame(rafId);
    };

    lyricsBtn.addEventListener("click", () => {
        ipcRenderer.send('open_lyrics', deckId);
    });

    isEditingLoopMark = false;

    document.getElementById(`progress_selectloopA_${deckId}`).step = 0.01;
    document.getElementById(`progress_selectloopB_${deckId}`).step = 0.01;

    document.getElementById(`progress_selectloopA_${deckId}`).addEventListener('change', () => {
        const loopA = parseFloat(document.getElementById(`progress_selectloopA_${deckId}`).value);
        const loopB = parseFloat(document.getElementById(`progress_selectloopB_${deckId}`).value);

        if (loopA >= loopB) {
            document.getElementById(`progress_selectloopA_${deckId}`).value = Math.max(0, loopB - 15);
            settoloopSelection();
        }
    });

    document.getElementById(`progress_selectloopB_${deckId}`).addEventListener('change', () => {
        const loopA = parseFloat(document.getElementById(`progress_selectloopA_${deckId}`).value);
        const loopB = parseFloat(document.getElementById(`progress_selectloopB_${deckId}`).value);

        if (loopB <= loopA) {
            document.getElementById(`progress_selectloopB_${deckId}`).value = Math.min(512, loopA + 15);
            settoloopSelection();
        }
    });

    function settoloopSelection() {
        document.getElementById(`loopselection${deckId}`).style.setProperty('--start-portion', `${(document.getElementById(`progress_selectloopA_${deckId}`).value / 512) * 100}%`);
        document.getElementById(`loopselection${deckId}`).style.setProperty('--end-portion', `${(document.getElementById(`progress_selectloopB_${deckId}`).value / 512) * 100}%`);
    }

    document.getElementById(`progress_selectloopA_${deckId}`).oninput = () => {
        settoloopSelection();
    }

    document.getElementById(`progress_selectloopB_${deckId}`).oninput = () => {
        settoloopSelection();
    }

    settoloopSelection();

    document.getElementById(`loopmark-a_${deckId}`).onclick = () => {
        document.getElementById(`progress_selectloopA_${deckId}`).value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
        settoloopSelection();
    }

    document.getElementById(`loopmark-b_${deckId}`).onclick = () => {
        document.getElementById(`progress_selectloopB_${deckId}`).value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
        settoloopSelection();
    }

    document.getElementById(`loopmark-select_${deckId}`).onclick = () => {
        if (!isEditingLoopMark) {
            isEditingLoopMark = true;
            snackbar("Loop Mark editing enabled.", "Loop Mark Editing");
            document.getElementById(`loopselection${deckId}`).hidden = false;
            document.getElementById(`progress_selectloopA_${deckId}`).hidden = false;
            document.getElementById(`progress_selectloopB_${deckId}`).hidden = false;
        } else {
            isEditingLoopMark = false;
            snackbar("Loop Mark editing disabled.", "Loop Mark Editing");
            document.getElementById(`loopselection${deckId}`).hidden = true;
            document.getElementById(`progress_selectloopA_${deckId}`).hidden = true;
            document.getElementById(`progress_selectloopB_${deckId}`).hidden = true;
        }
    }

    isLooping = false;
    let stopLoop;

    document.getElementById(`loopmark-start_${deckId}`).onclick = () => {
        if (!isLooping) {
            isLooping = true;
            stopLoop = loopAToBInterval(
                document.getElementById(`media${deckId}`),
                (document.getElementById(`progress_selectloopA_${deckId}`).value / 512) * currentMediaEl.duration,
                (document.getElementById(`progress_selectloopB_${deckId}`).value / 512) * currentMediaEl.duration,
                currentMediaEl.currentTime);
        } else {
            stopLoop();
            isLooping = false;
        }
    }

    currentMediaEl.addEventListener("pause", () => {
        playbackIcon.src = `icons/monosource/play_arrow.svg`
        playPauseBtn.title = 'Play';
        ipcRenderer.send(`show-lyrics-media${deckId}`, "");

        const el = document.getElementById('mediaArtAlbum_' + deckId);
        el.dataset.playing = false;

        document.getElementById(`previewLyrics_${deckId}`).textContent = ``;
        previousLine = "";
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
        playbackIcon.src = `icons/monosource/pause.svg`
        playPauseBtn.title = 'Pause';
        const el = document.getElementById('mediaArtAlbum_' + deckId);
        el.dataset.playing = true;

        function getMetadata(dataset, pronoun = 'from') {
            const test = (currentMediaEl.dataset[dataset] != '' || currentMediaEl.dataset.artist.toLowerCase().includes('unknown'))
            const text = test ? ` ${pronoun} ${currentMediaEl.dataset[dataset]}` : ``
            return text;
        }

        const text = `Now playing: ${document.getElementById(`title_${deckId}`).textContent}` +
            `${getMetadata('artist', 'by')}` +
            `${getMetadata('album', 'from the album of')}` +
            ` at Audio Deck ${deckId}`
        ipcRenderer.send('show-text', text);
        rafId = requestAnimationFrame(syncSlider);
    });

    let progressDisable = false;
    let rafId;
    let lastFrameTime = 0;
    const frameInterval = 1000 / 24; // 60fps limit
    const zoomParent = document.getElementById(`zoomparent_${deckId}`);
    setupZoomSlider(`zoomslider_${deckId}`, `zoom_${deckId}`);

    function syncSlider(currentTime) {
        if (currentTime - lastFrameTime >= frameInterval) {
            lastFrameTime = currentTime;
            const rotationsPerSecond = rpm / 60;
            const progressRPM = currentMediaEl.currentTime * rotationsPerSecond;
            const el = document.getElementById('mediaArtAlbum_' + deckId);
            el.style.setProperty('--progress', progressRPM);
        }

        if (currentMediaEl.duration) {
            if (!progressDisable) {
                progress.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;
                progress2.value = (currentMediaEl.currentTime / currentMediaEl.duration) * 512;

                const el = document.getElementById('mediaArtAlbum_' + deckId);
                el.style.setProperty('--time', (currentMediaEl.currentTime / currentMediaEl.duration));

                if (zoomParent) {
                    const scrollWidth = zoomParent.scrollWidth;
                    const clientWidth = zoomParent.clientWidth;
                    if (scrollWidth > clientWidth) {
                        const scrollPosition = (currentMediaEl.currentTime / currentMediaEl.duration) * (scrollWidth - clientWidth);
                        zoomParent.scrollLeft = scrollPosition;
                        zoomParent.scroll({ left: scrollPosition, behavior: 'smooth' });
                    }
                }
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
    });

    // Dragging updates UI only
    progress.oninput = () => {
        if (currentMediaEl.duration) {
            progressDisable = true;
            timeDisplay.textContent = updateCurrentTime();
            if (zoomParent) {
                const scrollWidth = zoomParent.scrollWidth;
                const clientWidth = zoomParent.clientWidth;
                if (scrollWidth > clientWidth) {
                    const scrollPosition = (progress.value / 512) * (scrollWidth - clientWidth);
                    zoomParent.scrollLeft = scrollPosition;
                    zoomParent.scroll({ left: scrollPosition, behavior: 'smooth' });
                }
            }
            progress2.value = progress.value;
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
            if (zoomParent) {
                const scrollWidth = zoomParent.scrollWidth;
                const clientWidth = zoomParent.clientWidth;
                if (scrollWidth > clientWidth) {
                    const scrollPosition = (progress2.value / 512) * (scrollWidth - clientWidth);
                    zoomParent.scrollLeft = scrollPosition;
                    zoomParent.scroll({ left: scrollPosition, behavior: 'smooth' });
                }
            }
            progress.value = progress2.value;
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

            document.getElementById(`progress_selectloopA_${deckId}`).value = 0;
            document.getElementById(`progress_selectloopB_${deckId}`).value = 512;
            settoloopSelection();

            if (isLooping) {
                stopLoop();
                isLooping = false;
            }

            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                playbackIcon.src = `icons/monosource/play_arrow.svg`
                RemoveWaveform(`audioWaveTime_media${deckId}`, deckId)
                RemoveWaveform(`spec_media${deckId}`, deckId)

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

        const el = document.getElementById('mediaArtAlbum_' + deckId);
        el.dataset.playing = false;
        timeDisplay.textContent = `00:00${currentMediaEl.duration === Infinity ? "" : ` / ${formatTime(currentMediaEl.duration)}`}`;
        cancelAnimationFrame(rafId);
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
            src = e.target.dataset.source || "images/albumart-default.svg";
            createDialogImage(src);
        });
    });

document.getElementById('toggleVisualiserCheckbox').addEventListener('change', (e) => {
    if (e.target.checked == false && toggleExternal) {
        const text = `External Casting stopped because the External Visualizer has been disabled.`;
        stopCast(text);
    }
})