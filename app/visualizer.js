const scaler = document.getElementById("overlaytext");
const captionText1 = document.getElementById("captionText1");
const captionText2 = document.getElementById("captionText2");

const { ipcRenderer } = require('electron');
let posterize = false
let posterize2 = false
let firstColor = '#fbff00';
let secondColor = '#00ffff';
let scale = 1;
let time = 5000;

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

    const scaleW = window.innerWidth / baseWidth;
    const scaleH = window.innerHeight / baseHeight;

    // geometric mean gives proportional scale for both dimensions
    const scale = Math.sqrt(scaleW * scaleH);
    const newFont = Math.max(baseFont * scale, 10);

    scaler.style.fontSize = `${newFont}px`;
    captionText1.style.fontSize = `${newFont}px`;
    captionText2.style.fontSize = `${newFont}px`;
    document.documentElement.style.setProperty('--fontsize-to-subtitle', `${newFont}px`);
}


window.addEventListener('resize', resizeFont);

window.addEventListener('DOMContentLoaded', () => {
    resizeFont(); // call once on load
});

function updateBars(dataArray) {
    const container = document.getElementById('visualizer');
    container.innerHTML = ''; // Clear previous bars

    const maxHeight = container.clientHeight;
    const maxValue = Math.max(...dataArray, 1); // Avoid division by zero
    dataArray.forEach(value => {
        const bar = document.createElement('div');
        bar.className = 'bar';
        const percent = (value / maxValue) * 100;
        bar.style.height = `${percent}%`;
        container.appendChild(bar);
    });
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
            document.getElementById('scaler').style.opacity = 1;
        }, 250);
    } else {
        document.getElementById('overlaytext').innerHTML = message;
        document.getElementById('scaler').style.opacity = 1;
    }
});

function updateBars2(dataArray) {
    const container = document.getElementById('visualizer2');
    container.innerHTML = ''; // Clear previous bars

    const maxHeight = container.clientHeight;
    const maxValue = Math.max(...dataArray, 1); // Avoid division by zero
    dataArray.forEach(value => {
        const bar = document.createElement('div');
        bar.className = 'bar2';
        const percent = (value / maxValue) * 100;
        bar.style.height = `${percent}%`;
        container.appendChild(bar);
    });
}

ipcRenderer.on('visualizer-update2', (event, dataArray) => {
    if (!posterize) {
        updateBars2(dataArray); // Your flavor-reactive function
    }
});

document.getElementById('visualizer-container').addEventListener('dblclick', () => {
    const elem = document.getElementById('visualizer-container');
    if (!document.fullscreenElement) {
        elem.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

ipcRenderer.on('sendcolor', (event, firstColor, secondColor) => {
    document.documentElement.style.setProperty('--firstcolor', `${firstColor}`);
    document.documentElement.style.setProperty('--endcolor', `${secondColor}`);
});

ipcRenderer.on('sendFilter', (event, brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue) => {
    document.documentElement.style.setProperty('--filter', `blur(${backdropblurValue * blurMultiplier}px) contrast(8) brightness(${brightnessValue})`);
    document.documentElement.style.setProperty('--filtermulti', `grayscale(${grayscaleValue}) sepia(${sepiaValue})`);
    document.documentElement.style.setProperty('--blurBackdrop', `blur(${backdropblurValue * blurMultiplier}px)`);
    document.documentElement.style.setProperty('--colorbarmulti', `linear-gradient(${angleValue}deg, var(--firstcolor), var(--endcolor))`);
});

ipcRenderer.on('sendbgcolor', (event, bgColor) => {
    document.documentElement.style.setProperty('--bodybg', `${bgColor}`);
});

ipcRenderer.on('sendWaveformAlignment', (event, setAlignment) => {
    document.documentElement.style.setProperty('--alignment', `${setAlignment}`);
});

document.addEventListener("keydown", (event) => {
    event.stopPropagation();
    event.preventDefault();
});

const video = document.getElementById('media');
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

ipcRenderer.on('video-playsrc', (event, data) => {
    posterize = true
    // Eject: clear src if main has none
    if (data.eject) {
        video.src = '';
        disableAllTrackSub();
        return;
    }

    // Change src if different
    if (video.src !== data.src) {
        video.src = data.src;
        disableAllTrackSub();
        video.currentTime = data.time;
        if (data.playing) video.play();
        return;
    }

    // Stop if main video ended
    if (data.stopped) {
        video.pause();
        video.currentTime = 0;
        return;
    }

    detect = data.deck;

    video.playbackRate = data.speed;

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

    // Pause/play normally
    if (data.playing) {
        if (video.paused) video.play();
        if (Math.abs(video.currentTime - data.time) > 0.2) {
            video.currentTime = data.time;
        }
    } else {
        video.pause();
    }
});

ipcRenderer.on('video-hidden', (event, bool) => {
    if (bool) {
        disableAllTrackSub();
        posterize = false
        video.style.visibility = `hidden`;
        video.pause();
        video.currentTime = 0;
        video.src = "";
        ["visualizer", "visualizer2", "visualizerlayer0", "visualizerlayer1"].forEach(id => {
            document.getElementById(id).style.visibility = 'visible';
        });
    } else {
        video.style.visibility = `visible`;
        ["visualizer", "visualizer2", "visualizerlayer0", "visualizerlayer1"].forEach(id => {
            document.getElementById(id).style.visibility = 'hidden';
        });
    }
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

    const textShadow =
        data.edgeStyle === "outline"
            ? `
                        2px  0   0 ${data.strokeColor},
                        -2px  0   0 ${data.strokeColor},
                        0   2px  0 ${data.strokeColor},
                        0  -2px  0 ${data.strokeColor},
                        2px  2px 0 ${data.strokeColor},
                        -2px  2px 0 ${data.strokeColor},
                        2px -2px 0 ${data.strokeColor},
                        -2px -2px 0 ${data.strokeColor}
                    `
            : data.edgeStyle === "dropshadow"
                ? "2px 2px 3px rgba(0,0,0,0.6)"
                : data.edgeStyle === "default"
                    ? `
                    2px  0   0 ${data.strokeColor},
                    -2px  0   0 ${data.strokeColor},
                    0   2px  0 ${data.strokeColor},
                    0  -2px  0 ${data.strokeColor},
                    2px  2px 0 ${data.strokeColor},
                    -2px  2px 0 ${data.strokeColor},
                    2px -2px 0 ${data.strokeColor},
                    -2px -2px 0 ${data.strokeColor},
                    4px 4px 4px rgba(0,0,0,0.6)
                `
                    : "none";

    function applyStyle(comp, alpha) {
        comp.style.fontFamily = `${data.fontFamily}, sans-serif`;
        comp.style.color = `${data.textColor}`;
        comp.style.backgroundColor = `${data.backgroundColor}${alpha}`;
        comp.style.textShadow = `${textShadow}`;
    }

    applyStyle(scaler, osdhexAlpha);
    applyStyle(captionText1, hexAlpha);
    applyStyle(captionText2, hexAlpha);
}

ipcRenderer.on('caption-settings-updated', (_, data) => applyCaptionSettings(data));

// Get <track> references (the hidden data)
const track1 = document.getElementById("subtitleTrack1").track;
const track2 = document.getElementById("subtitleTrack2").track;

// Get the <div> elements that will display the captions
const caption1 = document.getElementById("captionText1");
const caption2 = document.getElementById("captionText2");

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
updateCaption(track1, caption1);
updateCaption(track2, caption2);