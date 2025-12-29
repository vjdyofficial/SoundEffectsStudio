const scaler = document.getElementById("overlaytext");
const scaler_L0 = document.getElementById("overlaytext_L0");
const captionText1 = document.getElementById("captionText1");
const captionText2 = document.getElementById("captionText2");
const captionText1_L0 = document.getElementById("captionText1_L0");
const captionText2_L0 = document.getElementById("captionText2_L0");
const video = document.getElementById('media');
const videoInterlace = document.getElementById('media-interlace');
const { ipcRenderer } = require('electron');

let posterize = false
let posterize2 = false
let firstColor = '#fbff00';
let secondColor = '#00ffff';
let scale = 1;
let time = 5000;
let alignment = 'flex-end'
let innerWidth = window.innerWidth;
let innerHeight = window.innerHeight;
let videoTime = 0;

setInterval(() => {
    if (time >= 5000) {
        document.getElementById('scaler').style.opacity = 0;
    } else {
        time = time + 500
    }
}, 500);

function resizeFont() {
    const baseWidth = 1280;  // reference width
    const baseHeight = 720;  // reference height
    const baseFont = 44;     // font size at base resolution
    const baseFont2 = 64;     // font size at base resolution

    async function resiveCanvas(id) {
        const canvas = document.getElementById(id);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
    }

    resiveCanvas("visualizer");

    const scaleW = window.innerWidth / baseWidth;
    const scaleH = window.innerHeight / baseHeight;

    innerWidth = window.innerWidth;
    innerHeight = window.innerHeight;

    // geometric mean gives proportional scale for both dimensions
    const scale = Math.sqrt(scaleW * scaleH);
    const newFont = Math.max(baseFont * scale, 10);
    const newFont2 = Math.max(baseFont2 * scale, 10);

    scaler.style.fontSize = `${newFont}px`;
    scaler_L0.style.fontSize = `${newFont}px`;
    captionText1.style.fontSize = `${newFont}px`;
    captionText2.style.fontSize = `${newFont}px`;
    captionText1_L0.style.fontSize = `${newFont}px`;
    captionText2_L0.style.fontSize = `${newFont}px`;
    document.documentElement.style.setProperty('--fontsize-to-subtitle', `${newFont}px`);
    document.documentElement.style.setProperty('--fontsize-to-teleprompt', `${newFont2}px`);

    const scaleWBlur = window.innerWidth / 640;
    const scaleHBlur = window.innerHeight / 480;

    // choose the limiting side so UI stays proportional
    const scaleBlur = Math.min(scaleWBlur, scaleHBlur) * 1;

    document.documentElement.style.setProperty("--scale", scaleBlur);
}


window.addEventListener('resize', resizeFont);

window.addEventListener('DOMContentLoaded', () => {
    resizeFont(); // call once on load
});

function updateBars(dataArray) {
    const container = document.getElementById('visualizer');
    const audioCanvasCtx = container.getContext('2d');
    audioCanvasCtx.imageSmoothingEnabled = false;
    const data = dataArray
    audioCanvasCtx.clearRect(0, 0, container.width, container.height);
    const barWidth = container.width / data.length;

    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        const barHeight = (value / 255) * container.height;
        const x = i * barWidth;
        let y;
        if (alignment === 'flex-end') {
            // bottom aligned
            y = container.height - barHeight;
        } else if (alignment === 'flex-start') {
            // top aligned
            y = 0;
        } else {
            // center aligned
            y = (container.height - barHeight) / 2;
        }


        audioCanvasCtx.fillStyle = '#fff'
        audioCanvasCtx.fillRect(x, y, barWidth + 2, barHeight);
    }
}

ipcRenderer.on('visualizer-update', (event, dataArray) => {
    if (!posterize) {
        updateBars(dataArray); // Your flavor-reactive function
    }
});

ipcRenderer.on('show-textoverlay', (event, message) => {
    time = 0;
    if (document.getElementById('scaler').style.opacity == 1) {
        document.getElementById('scaler').style.opacity = 0;
        setTimeout(() => {
            document.getElementById('overlaytext').innerHTML = message;
            document.getElementById('overlaytext_L0').innerHTML = message;
            document.getElementById('scaler').style.opacity = 1;
        }, 250);
    } else {
        document.getElementById('overlaytext').innerHTML = message;
        document.getElementById('overlaytext_L0').innerHTML = message;
        document.getElementById('scaler').style.opacity = 1;
    }
});

let isFullscreen = false;

// --- Fullscreen toggle button ---
document.getElementById('fullscrtoggle-btn').addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    ipcRenderer.send('set-fullscreen', isFullscreen);

    document.getElementById('fullscreenspacer').style.display = isFullscreen ? 'none' : 'block';
    document.getElementById('fullscreenIcon').src = isFullscreen
        ? 'images/windows/exit-fullscreen.svg'
        : 'images/windows/enter-fullscreen.svg';
});

// --- Escape key exits fullscreen ---
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isFullscreen) {
        isFullscreen = false;
        ipcRenderer.send('set-fullscreen', false);
        document.getElementById('fullscreenspacer').style.display = 'block';
        document.getElementById('fullscreenIcon').src = 'images/windows/enter-fullscreen.svg';
    }
});

ipcRenderer.on('sendcolor', (event, firstColor, secondColor) => {
    document.documentElement.style.setProperty('--firstcolor', `${firstColor}`);
    document.documentElement.style.setProperty('--endcolor', `${secondColor}`);
});

ipcRenderer.on('sendFilter', (event, brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue) => {
    document.documentElement.style.setProperty('--filter', `blur(${backdropblurValue * blurMultiplier}px) contrast(8) brightness(${brightnessValue})`);
    document.documentElement.style.setProperty('--filtermulti', `grayscale(${grayscaleValue}) sepia(${sepiaValue})`);
    document.documentElement.style.setProperty('--blurMultiplier', blurMultiplier);
    document.documentElement.style.setProperty(
        '--blurBackdrop',
        `blur(calc(${backdropblurValue}px * var(--blurMultiplier) * var(--scale)))`
    );

    document.documentElement.style.setProperty('--colorbarmulti', `linear-gradient(${angleValue}deg, var(--firstcolor), var(--endcolor))`);
});

ipcRenderer.on('sendbgcolor', (event, bgColor) => {
    document.documentElement.style.setProperty('--bodybg', `${bgColor}`);
});

ipcRenderer.on('sendWaveformAlignment', (event, setAlignment) => {
    alignment = setAlignment;
});

document.addEventListener("keydown", (event) => {
    event.stopPropagation();
    event.preventDefault();
});

let lastSubtitle1 = "";
let lastSubtitle2 = "";
let deckAppendNext = 1;
let detect = 1;

function disableAllTrackSub() {
    captionText1.textContent = "";
    captionText2.textContent = "";
    captionText1.style.visibility = 'hidden';
    captionText2.style.visibility = 'hidden';
    captionText1_L0.textContent = "";
    captionText2_L0.textContent = "";
    captionText1_L0.style.visibility = 'hidden';
    captionText2_L0.style.visibility = 'hidden';
    for (const t of video.textTracks) t.mode = "disabled";
}

ipcRenderer.on('video-playsrc', (event, data) => {
    posterize = true;

    // Helper: sync interlace video with offset
    function syncInterlace(time, force = false) {
        const target = time + 0.025;
        if (force || Math.abs(videoInterlace.currentTime - target) > 0.15) {
            videoInterlace.currentTime = target;
        }
    }

    // 1️⃣ Eject: clear src if main has none
    if (data.eject) {
        video.src = '';
        videoInterlace.src = '';
        disableAllTrackSub();
        return;
    }

    // 2️⃣ Change src if different
    if (video.src !== data.src) {
        video.src = data.src;
        videoInterlace.src = data.src;
        disableAllTrackSub();

        video.currentTime = data.time;
        videoTime = data.time;
        syncInterlace(data.time, true);

        if (data.playing) {
            video.play();
            videoInterlace.play();
        }
        return;
    }

    // 3️⃣ Stop if main video ended
    if (data.stopped) {
        video.pause();
        videoInterlace.pause();

        video.currentTime = 0;
        videoTime = 0;
        syncInterlace(0, true);
        return;
    }

    detect = data.deck;

    video.playbackRate = data.speed;
    videoInterlace.playbackRate = data.speed;

    // 4️⃣ Handle captions / text tracks
    if (deckAppendNext == detect) {
        if (detect == 2) {
            video.textTracks[1].mode = 'showing';
            captionText1.style.visibility = 'hidden';
            captionText2.style.visibility = 'visible';
            captionText1_L0.style.visibility = 'hidden';
            captionText2_L0.style.visibility = 'visible';
        } else {
            video.textTracks[0].mode = 'showing';
            captionText1.style.visibility = 'visible';
            captionText2.style.visibility = 'hidden';
            captionText1_L0.style.visibility = 'visible';
            captionText2_L0.style.visibility = 'hidden';
        }
    }

    // 5️⃣ Pause/play normally with proper sync
    if (data.playing) {
        if (video.paused) video.play();

        if (videoInterlace.paused) {
            syncInterlace(data.time, true);
            videoInterlace.play();
        }

        // Hard sync if main jumps
        if (Math.abs(video.currentTime - data.time) > 0.2) {
            video.currentTime = data.time;
            videoTime = data.time;
            syncInterlace(data.time, true);
        }
    } else {
        video.pause();
        videoInterlace.pause();
    }
});

ipcRenderer.on('video-hidden', (event, bool) => {
    if (bool) {
        disableAllTrackSub();
        posterize = false
        video.style.visibility = `hidden`;
        videoInterlace.style.visibility = `hidden`;
        video.pause();
        videoInterlace.pause();
        video.currentTime = 0;
        videoInterlace.currentTime = 0;
        video.src = "";
        videoInterlace.src = "";
        ["visualizer", "visualizerlayer0", "visualizerlayer1"].forEach(id => {
            document.getElementById(id).style.visibility = 'visible';
        });
    } else {
        video.style.visibility = `visible`;
        videoInterlace.style.visibility = `visible`;
        ["visualizer", "visualizerlayer0", "visualizerlayer1"].forEach(id => {
            document.getElementById(id).style.visibility = 'hidden';
        });
    }
});

ipcRenderer.on('video-reconnect', (event, bool) => {
    document.getElementById('overlays3').style.visibility = bool ? 'visible' : 'hidden';
});


ipcRenderer.on('set-subtitle', (event, src, value) => {
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
    }
});

ipcRenderer.on('changingDeck', (event, deckAppend) => {
    disableAllTrackSub();
    deckAppendNext = deckAppend;
});

ipcRenderer.on("teleprompt_output", (event, htmlLine) => {
    document.getElementById('telepromptText').innerHTML = htmlLine;
});

function decimalToHexAlpha(decimal) {
    // Clamp between 0 and 1 just in case
    const value = Math.round(Math.min(Math.max(decimal, 0), 1) * 255);
    // Convert to 2-digit hex
    return value.toString(16).padStart(2, '0').toUpperCase();
}

function applyCaptionSettings(data) {
    // Remove old style if any
    document.getElementById("captionStyle")?.remove();
    const captionBGOpacity = data.captionBGOpacity
    const hexAlpha = decimalToHexAlpha(captionBGOpacity); // "80"
    const osdBGOpacity = data.osdBGOpacity
    const osdhexAlpha = decimalToHexAlpha(osdBGOpacity); // "80"
    // Create a new <style> for ::cue rules
    const style = document.createElement("style");
    style.id = "captionStyle";

    function applyStyle(comp, alpha) {
        comp.style.fontFamily = `${data.fontFamily}, sans-serif`;
        comp.style.color = `${data.textColor}`;
        comp.style.backgroundColor = `${data.backgroundColor}${alpha}`;
        comp.style.textShadow = data.edgeStyle === "dropshadow" || data.edgeStyle === "default" ? "4px 4px 4px rgba(0,0,0,0.6)" : "none";
        comp.style.webkitTextStrokeWidth = data.edgeStyle === "outline" || data.edgeStyle === "default" ? "4px" : "";
        comp.style.webkitTextStrokeColor = data.edgeStyle === "outline" || data.edgeStyle === "default" ? data.strokeColor : "";
    }

    applyStyle(scaler, osdhexAlpha);
    scaler_L0.style.color = data.textColor;
    scaler_L0.style.fontFamily = `${data.fontFamily}, sans-serif`;
    applyStyle(captionText1, hexAlpha);
    captionText1_L0.style.color = data.textColor;
    captionText1_L0.style.fontFamily = `${data.fontFamily}, sans-serif`;
    applyStyle(captionText2, hexAlpha);
    captionText2_L0.style.color = data.textColor;
    captionText2_L0.style.fontFamily = `${data.fontFamily}, sans-serif`;
}

ipcRenderer.on('caption-settings-updated', (_, data) => applyCaptionSettings(data));

// Get <track> references (the hidden data)
const track1 = document.getElementById("subtitleTrack1").track;
const track2 = document.getElementById("subtitleTrack2").track;

// Function to update captions
function updateCaption(track, captionElement) {
    track.addEventListener("cuechange", () => {
        const activeCue = track.activeCues[0];
        if (activeCue && track.mode !== "disabled") {
            captionElement.innerHTML = activeCue.text
                .replace(/\n/g, "<br>")
                .replace(/<b>/g, "<strong>")
                .replace(/<\/b>/g, "</strong>")
                .replace(/<i>/g, "<em>")
                .replace(/<\/i>/g, "</em>");
            captionElement.style.opacity = "1"; // fade in
        } else {
            captionElement.textContent = "";
            captionElement.style.opacity = "0"; // fade out
        }
    });
}

// Apply to both
updateCaption(track1, captionText1);
updateCaption(track1, captionText1_L0);
updateCaption(track2, captionText2);
updateCaption(track2, captionText2_L0);

// 1️⃣ Create a single AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 2️⃣ Function to attach audio routing for a video element
function attachVideoToAudioCtx(video) {
    // Ensure video is muted to avoid double sound
    video.muted = true;

    // Only create MediaElementSource once per video
    let source;

    video.addEventListener("play", () => {
        if (!source) {
            source = audioCtx.createMediaElementSource(video);
            source.connect(audioCtx.destination); // route audio to context
            console.log(`Video ${video.id || video.src} connected to AudioContext`);
        }

        // Resume AudioContext if it was suspended
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    });

    video.addEventListener("pause", () => {
        console.log(`Video ${video.id || video.src} paused`);
        // optional: disconnect or keep connected
        // source?.disconnect();
    });

    video.addEventListener("ended", () => {
        console.log(`Video ${video.id || video.src} ended`);
        // optional cleanup
        // source?.disconnect();
    });
}

let pinwindow = false;

document.getElementById('pinbtn').addEventListener('click', (e) => {
    pinwindow = !pinwindow;
    ipcRenderer.send('set-pinwindow', pinwindow);
})

ipcRenderer.on('icon-pinwindow', (event, bool) => {
    document.getElementById('pinIcon').src = bool ? 'icons/codicons/pinned.svg' : 'icons/codicons/pin.svg';
})

let lastFrame = performance.now();
let fps = 0;

// --- Functions ---
function getFPS() {
    const now = performance.now();
    fps = Math.min(144, Math.max(0, 1000 / (now - lastFrame)));
    lastFrame = now;
    return fps;
}

setInterval(async () => {
    const mem = await process.getProcessMemoryInfo(); // nodeIntegration required

    ipcRenderer.send('memory-update', {
        windowName: 'External Visualizer', // give a unique name per window
        memory: {
            fpsRate: fps.toFixed(1),
            workingSetMB: Math.round(mem.residentSet / 1024),
            privateMB: Math.round(mem.private / 1024),
            sharedMB: Math.round(mem.shared / 1024),
        }
    });
}, 1000);

// --- Main loop ---
function updateFPS() {
    getFPS();
    requestAnimationFrame(updateFPS);
}

updateFPS();

ipcRenderer.on('update-video-settings', (event, adjustmentSettings) => {
    const video = document.getElementById('media');
    if (!video) return;

    // Apply the filters dynamically
    const { brightness, contrast, saturation, hue } = adjustmentSettings;
    video.style.filter = `
        brightness(${brightness}%)
        contrast(${contrast}%)
        saturate(${saturation}%)
        hue-rotate(${hue}deg)
    `;

    videoInterlace.style.filter = `
        brightness(${brightness}%)
        contrast(${contrast}%)
        saturate(${saturation}%)
        hue-rotate(${hue}deg)
    `;
});

ipcRenderer.on("force-interlace-update", (event, enabled) => {
    videoInterlace.classList.toggle("interlace", enabled);
});