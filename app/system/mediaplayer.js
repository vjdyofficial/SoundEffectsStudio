class WaveformScanner {
    constructor(audioBlob, canvas, onProgress, fileId = "") {
        this.audioBlob = audioBlob
        this.canvas = canvas
        this.onProgress = onProgress
        this.stopFlag = false
        this.fileId = fileId

        this.cacheDir = path.join(
            process.env.APPDATA || path.join(os.homedir(), "AppData/Roaming"),
            "vjdyfm-sfxstudio",
            "chunkdata"
        )
    }

    async start() {
        const ctx = this.canvas.getContext("2d")
        const width = this.canvas.width
        const height = this.canvas.height
        ctx.clearRect(0, 0, width, height)

        let duration
        let columns = null

        // ============ CACHE ============
        const cacheKey = await this.getCacheKey()
        const cachePath = path.join(this.cacheDir, `${cacheKey}.cdt`)

        if (fs.existsSync(cachePath)) {
            const cached = this.loadCDT(cachePath)

            if (cached.columns) {
                columns = cached.columns
                duration = cached.duration

                // -------- FAST DRAW --------
                for (let x = 0; x < columns.length; x++) {
                    if (this.stopFlag) { break };
                    const c = columns[x]
                    const y = c.amp * height
                    ctx.fillStyle = `rgb(${c.r},${c.g},${c.b})`
                    ctx.fillRect(x, height / 2 - y / 2, 1, y)
                }

                return { duration } // Done instantly
            }

            // fallback for older CDT
            duration = cached.duration
        }

        // ============ DECODE AUDIO ============
        const arrayBuffer = await this.audioBlob.arrayBuffer()
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        const channelData = audioBuffer.getChannelData(0)
        duration = audioBuffer.duration

        // ============ SCAN & DRAW ============
        const totalSamples = channelData.length
        const step = Math.ceil(totalSamples / width)

        let maxAmp = 0
        for (let i = 0; i < totalSamples; i++) {
            const v = Math.abs(channelData[i])
            if (v > maxAmp) maxAmp = v
        }
        if (maxAmp === 0) maxAmp = 0.001

        const minHeightFactor = 0.15
        const boost = 1.5

        columns = new Array(width)

        for (let x = 0; x < width; x++) {
            if (this.stopFlag) break

            const start = x * step
            const end = Math.min(start + step, totalSamples)
            let sum = 0
            for (let i = start; i < end; i++) sum += Math.abs(channelData[i])
            const avg = sum / (end - start)
            let y = (avg / maxAmp) * height * boost
            if (y < height * minHeightFactor) y = height * minHeightFactor
            if (y > height) y = height

            // -------- COLOR LOGIC (UNCHANGED) --------
            const slice = channelData.slice(start, end)
            const fftSize = 256
            const fft = new Float32Array(fftSize)
            for (let i = 0; i < slice.length; i++) {
                const idx = Math.floor((i / slice.length) * fftSize)
                fft[idx] += Math.abs(slice[i])
            }

            let fftMax = Math.max(...fft)
            if (fftMax === 0) fftMax = 0.001

            const bass = this.sumRange(fft, 0, Math.floor(fftSize * 0.1)) / (fftSize * 0.1)
            const mid = this.sumRange(fft, Math.floor(fftSize * 0.1), Math.floor(fftSize * 0.3)) / (fftSize * 0.2)
            const high = this.sumRange(fft, Math.floor(fftSize * 0.3), Math.floor(fftSize * 0.6)) / (fftSize * 0.3)
            const hiss = this.sumRange(fft, Math.floor(fftSize * 0.6), fftSize) / (fftSize * 0.4)

            const r = Math.min(255, Math.floor((hiss + high) / fftMax * 255))
            const g = Math.min(255, Math.floor((mid + high) / fftMax * 255))
            const b = Math.min(255, Math.floor(bass / fftMax * 255))

            ctx.fillStyle = `rgb(${r},${g},${b})`
            ctx.fillRect(x, height / 2 - y / 2, 1, y)

            // -------- STORE COLUMN FOR CACHE --------
            columns[x] = { amp: y / height, r, g, b }

            this.onProgress?.(x / width)
            await new Promise(resolve => setTimeout(resolve, 0))
        }

        // ============ SAVE VISUAL CDT ============
        this.saveCDT(cachePath, columns, duration, width)

        return { duration }
    }

    // ================= CDT =================
    async getCacheKey() {
        if (this.fileId) return this.fileId
        const buf = await this.audioBlob.arrayBuffer()
        return crypto.createHash("md5").update(Buffer.from(buf)).digest("hex")
    }

    saveCDT(filePath, columns, duration, width) {
        fs.mkdirSync(this.cacheDir, { recursive: true })

        const header = Buffer.alloc(10)
        header.writeUInt16LE(width, 0)
        header.writeFloatLE(duration, 2)
        header.writeUInt32LE(columns.length, 6)

        const body = Buffer.alloc(columns.length * 7)
        let o = 0
        for (const c of columns) {
            body.writeFloatLE(c.amp, o); o += 4
            body[o++] = c.r
            body[o++] = c.g
            body[o++] = c.b
        }

        fs.writeFileSync(filePath, Buffer.concat([header, body]))
    }

    loadCDT(filePath) {
        const buf = fs.readFileSync(filePath)
        const width = buf.readUInt16LE(0)
        const duration = buf.readFloatLE(2)
        const count = buf.readUInt32LE(6)

        const columns = new Array(count)
        let o = 10
        for (let i = 0; i < count; i++) {
            columns[i] = {
                amp: buf.readFloatLE(o),
                r: buf[o + 4],
                g: buf[o + 5],
                b: buf[o + 6]
            }
            o += 7
        }

        return { columns, duration, width }
    }

    sumRange(arr, start, end) {
        let sum = 0
        for (let i = start; i < end; i++) sum += arr[i]
        return sum
    }

    terminate() {
        this.stopFlag = true
        const ctx = this.canvas.getContext("2d")
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    }
}

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

function updateCaption(track, captionElement, captionElement_next) {
    track.addEventListener("cuechange", () => {
        const activeCue = track.activeCues[0];
        if (activeCue && track.mode !== "disabled") {
            captionElement.innerHTML = activeCue.text
                .replace(/\n/g, "<br>")
                .replace(/<b>/g, "<strong>")
                .replace(/<\/b>/g, "</strong>")
                .replace(/<i>/g, "<em>")
                .replace(/<\/i>/g, "</em>");

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
        }
    });
}

// Apply to both
updateCaption(track1, captionText1, captionText1_next);
updateCaption(track2, captionText2, captionText2_next);

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
                });

                if (scanner) {
                    scanner.terminate();
                }

                scanner = new WaveformScanner(file, document.getElementById(`audioWaveTime_MediaExtDeck${assignedDeck}`), p => { })
                scanner.start();
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

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/play_arrow.svg`
                console.log('Source changed:', currentMediaEl.src);
                // Your code to handle new src
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

        if (scanner) {
            scanner.terminate();
        }

        hiddenInput.value = "";
        document.getElementById(`loadBtn${assignedDeck}`).setAttribute("aria-details", "onInactive");
        isAudio = false;
        disableAllTrackSub();
        document.getElementById(`playbackIcon${assignedDeck}`).src = `icons/monosource/play_arrow.svg`
        progress.value = 0;
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
    const progress = document.getElementById(`progress${deckId}`);
    const timeDisplay = document.getElementById(`timeDisplay${deckId}`);
    const fileDropDiv = document.getElementById(`filedropforDeck${deckId}`);
    const loopIcon = document.getElementById(`loopIcon${deckId}`);
    const playbackIcon = document.getElementById(`playbackIcon${deckId}`);
    const speed = document.getElementById(`speed${deckId}`);
    const speedValue = document.getElementById(`speedValueText_${deckId}`);

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
                timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
                return reject("Unsupported file type: " + file.type);
            }

            currentUrl = URL.createObjectURL(file);
            currentMediaEl.src = currentUrl;
            setSpeed();
            currentMediaEl.addEventListener("loadeddata", () => {
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

                if (scanner) {
                    scanner.terminate();
                }

                scanner = new WaveformScanner(file, document.getElementById(`audioWaveTime_media${deckId}`), p => { })
                scanner.start();
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

    ejectBtn.onclick = () => {
        if (!currentMediaEl.src) return;

        currentMediaEl.pause();
        currentMediaEl.currentTime = 0;

        if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
            currentUrl = null;
            if (scanner) { scanner.terminate(); }
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
        timeDisplay.textContent = "00:00 / 00:00";
        cancelAnimationFrame(rafId);
    };

    currentMediaEl.addEventListener("pause", () => {
        playbackIcon.src = `icons/monosource/play_arrow.svg`
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} paused`
        ipcRenderer.send('show-text', text);
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
        if (currentMediaEl.duration) {
            progressDisable = true;
            timeDisplay.textContent = `${formatTime((progress.value / 512) * currentMediaEl.duration)} / ${formatTime(currentMediaEl.duration)}`;
        }
    };

    // Update media when drag ends
    progress.onchange = () => {
        if (currentMediaEl.duration) {
            progressDisable = false;
            currentMediaEl.currentTime = (progress.value / 512) * currentMediaEl.duration;
        }
    };

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                playbackIcon.src = `icons/monosource/play_arrow.svg`
                console.log('Source changed:', currentMediaEl.src);
                // Your code to handle new src
            }
        });
    });

    observer.observe(currentMediaEl, { attributes: true });

    currentMediaEl.addEventListener("ended", () => {
        playbackIcon.src = `icons/monosource/replay.svg`;
        const text = `${document.getElementById(`title_${deckId}`).textContent} from Audio Deck ${deckId} ended`;
        ipcRenderer.send('show-text', text);
        timeDisplay.textContent = `00:00 / ${formatTime(currentMediaEl.duration)}`;
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