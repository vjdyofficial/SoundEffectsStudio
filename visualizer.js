const scaler = document.getElementById("overlaytext");
const captionText1 = document.getElementById("captionText1");
const captionText2 = document.getElementById("captionText2");
const captionTextLyrics = document.getElementById("captionTextLyrics");
const captionTextLyrics2 = document.getElementById("captionTextLyrics2");
const captionTextLyrics3 = document.getElementById("captionTextLyrics3");
const captionTextLyrics4 = document.getElementById("captionTextLyrics");
const video = document.getElementById('media');
const canvas = document.getElementById('c1');
const { ipcRenderer } = require('electron');

let posterize = false
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
    captionText1.style.fontSize = `${newFont}px`;
    captionText2.style.fontSize = `${newFont}px`;
    captionTextLyrics.style.fontSize = `${newFont}px`;
    captionTextLyrics2.style.fontSize = `${newFont}px`;
    captionTextLyrics3.style.fontSize = `${newFont}px`;
    captionTextLyrics4.style.fontSize = `${newFont}px`;
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

let scale = 0.5;

ipcRenderer.on('show-textoverlay', (event, message) => {
    time = 0;
    if (document.getElementById('scaler').style.opacity == 1) {
        document.getElementById('scaler').style.opacity = 0;
        setTimeout(() => {
            document.getElementById('overlaytext').innerHTML = message;
            document.getElementById('scaler').style.opacity = 1;
        }, 250);
    } else {
        document.getElementById('overlaytext').innerHTML = message;
        document.getElementById('scaler').style.opacity = 1;
    }
});

let lyricstime;
let lyricstime2;
let lyricstime3;
let lyricstime4;

setInterval(() => {
    if (lyricstime >= 15000) {
        document.getElementById('captionTextLyrics').innerHTML = "";
    } else {
        lyricstime = lyricstime + 500
    }

    if (lyricstime2 >= 15000) {
        document.getElementById('captionTextLyrics2').innerHTML = "";
    } else {
        lyricstime2 = lyricstime2 + 500
    }

    if (lyricstime3 >= 15000) {
        document.getElementById('captionTextLyrics3').innerHTML = "";
    } else {
        lyricstime3 = lyricstime3 + 500
    }

    if (lyricstime3 >= 15000) {
        document.getElementById('captionTextLyrics4').innerHTML = "";
    } else {
        lyricstime4 = lyricstime4 + 500
    }
}, 500);

ipcRenderer.on('show-lyricsA', (event, message) => {
    lyricstime = 0;
    document.getElementById('captionTextLyrics').innerHTML = message;
});

ipcRenderer.on('show-lyricsB', (event, message) => {
    lyricstime2 = 0;
    document.getElementById('captionTextLyrics2').innerHTML = message;
});

ipcRenderer.on('show-lyricsC', (event, message) => {
    lyricstime3 = 0;
    document.getElementById('captionTextLyrics3').innerHTML = message;
});

ipcRenderer.on('show-lyricsD', (event, message) => {
    lyricstime4 = 0;
    document.getElementById('captionTextLyrics4').innerHTML = message;
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
    for (const t of video.textTracks) t.mode = "disabled";
}

const VideoBroadcast = new BroadcastChannel('videobroadcast');

VideoBroadcast.onmessage = (event) => {
    if (event.data.type === 'VIDEO_STATE') {
        const data = event.data;


        // 1️⃣ Eject: clear src if main has none
        if (data.eject) {
            video.src = '';
            disableAllTrackSub();
            return;
        }

        // 2️⃣ Change src if different
        if (video.src !== data.src) {
            video.src = data.src;
            disableAllTrackSub();

            video.currentTime = data.time;
            videoTime = data.time;

            if (data.playing) {
                video.play();
            }
            return;
        }

        // 3️⃣ Stop if main video ended
        if (data.stopped) {
            video.pause();

            video.currentTime = 0;
            videoTime = 0;
            return;
        }

        detect = data.deck;

        video.playbackRate = data.speed;

        // 4️⃣ Handle captions / text tracks
        if (deckAppendNext == detect) {
            if (detect == 2) {
                video.textTracks[1].mode = 'showing';
                captionText1.style.visibility = 'hidden';
                captionText2.style.visibility = 'visible';
            } else {
                video.textTracks[0].mode = 'showing';
                captionText1.style.visibility = 'visible';
                captionText2.style.visibility = 'hidden';
            }
        }

        // 5️⃣ Pause/play normally with proper sync
        if (data.playing) {
            if (video.paused) video.play();
            // Hard sync if main jumps
            if (Math.abs(video.currentTime - data.time) > 0.2) {
                video.currentTime = data.time;
                videoTime = data.time;
            }
        } else {
            video.pause();
        }
    }
};


ipcRenderer.on('video-hidden', (event, bool) => {
    if (bool) {
        disableAllTrackSub();
        posterize = false
        video.pause();
        video.currentTime = 0;
        video.src = "";
        video.style.visibility = 'hidden';
        ["visualizer", "visualizerlayer0", "visualizerlayer1"].forEach(id => {
            document.getElementById(id).style.visibility = 'visible';
        });
    } else {
        video.style.visibility = 'visible';
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
    applyStyle(captionText1, hexAlpha);
    applyStyle(captionText2, hexAlpha);
    applyStyle(captionTextLyrics, hexAlpha);
    applyStyle(captionTextLyrics2, hexAlpha);
    applyStyle(captionTextLyrics3, hexAlpha);
    applyStyle(captionTextLyrics4, hexAlpha);
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
updateCaption(track2, captionText2);

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
    ipcRenderer.send('memory-update', {
        windowName: 'External Visualizer', // give a unique name per window
        memory: {
            fpsRate: fps.toFixed(1),
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
    const { brightness, contrast, saturation, hue } = adjustmentSettings;
    video.style.filter = `
        brightness(${brightness}%)
        contrast(${contrast}%)
        saturate(${saturation}%)
        hue-rotate(${hue}deg)
    `;
});

ipcRenderer.on("toggle-lyrics", (event, bool) => {
    document.getElementById('overlays4').style.visibility = bool ? "visible" : "hidden";
});