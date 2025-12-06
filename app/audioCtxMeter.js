const audioCanvas = document.getElementById('audioForm');
const audioCanvasCtx = audioCanvas.getContext('2d');

const audioCanvasPreview = document.getElementById('audioFormPreview');
const audioCanvasPreviewCtx = audioCanvasPreview.getContext('2d');

audioCanvas.width = 100;
audioCanvas.height = 38;

audioCanvasPreview.width = 100;
audioCanvasPreview.height = 38;

const analysermeter = audioCtx.createAnalyser();
analysermeter.fftSize = 256;
const dataArrayMeter = new Uint8Array(analysermeter.frequencyBinCount);
const freqData2 = new Uint8Array(analysermeter.frequencyBinCount);

function drawSpectrum(data) {
    audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
    audioCanvasPreviewCtx.clearRect(0, 0, audioCanvasPreview.width, audioCanvasPreview.height);
    const barWidth = audioCanvas.width / data.length;
    const barWidthPreview = audioCanvasPreview.width / data.length;

    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        const barHeight = (value / 255) * audioCanvas.height;
        const barHeightPreview = (value / 255) * audioCanvasPreview.height;
        const x = i * barWidth;
        const xPrev = i * barWidthPreview;
        const y = audioCanvas.height - barHeight;
        const yPrev = audioCanvasPreview.height - barHeightPreview;

        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Example for main audio canvas
        const gradient = audioCanvasCtx.createLinearGradient(x, y, x, y + barHeight);
        const gradient2 = audioCanvasCtx.createLinearGradient(xPrev, yPrev, xPrev, yPrev + barHeightPreview);

        // Add three color stops
        gradient.addColorStop(0, isDarkMode ? micDarkColor : micLightColor);        // top
        gradient.addColorStop(0.5, isDarkMode ? samplerDarkColor : samplerLightColor);  // middle
        gradient.addColorStop(1, isDarkMode ? listenDarkColor : listenLightColor);     // bottom

        gradient2.addColorStop(0, isDarkMode ? micDarkColor : micLightColor);        // top
        gradient2.addColorStop(0.5, isDarkMode ? samplerDarkColor : samplerLightColor);  // middle
        gradient2.addColorStop(1, isDarkMode ? listenDarkColor : listenLightColor);     // bottom

        // Apply gradient
        audioCanvasCtx.fillStyle = gradient;
        audioCanvasCtx.fillRect(x, y, barWidth + 2, barHeight);
        audioCanvasPreviewCtx.fillStyle = gradient2;
        audioCanvasPreviewCtx.fillRect(xPrev, yPrev, barWidthPreview + 2, barHeightPreview);
    }
}

function valueToAngle(value) {
    const minValue = 0;    // input minimum
    const maxValue = 120;  // input maximum

    // Clamp the input
    const clamped = Math.min(Math.max(value, minValue), maxValue);

    // Convert to percent
    const percent = (clamped - minValue) / (maxValue - minValue); // 0 → 1

    // Map to angle
    return -45 + percent * 90; // -45 → +45
}

const vuLevels = {
    '#micdev': 0,      // start at min dB
    '#sampler': 0
};

function updateNeedleSmooth(query, rms) {
    const needle = document.querySelector(query);
    const targetDB = rms

    const attack = 0.5;   // rise speed (fast)
    const release = 0.2; // fall speed (slow)

    let current = vuLevels[query] || 0;

    if (targetDB > current) {
        current += (targetDB - current) * attack;
    } else {
        current += (targetDB - current) * release;
    }

    vuLevels[query] = current;

    const angle = valueToAngle(current);
    needle.style.transform = `rotate(${angle}deg)`;
}

function getPeak(dataArray) {
    let peak = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const value = Math.abs(dataArray[i] - 128) / 128;
        if (value > peak) peak = value;
    }
    return peak;
}

function getPeakScaled(dataArray) {
    let peak = 0;

    for (let i = 0; i < dataArray.length; i++) {
        const value = Math.abs(dataArray[i] - 128) / 128; // normalize [-1,1] → [0,1]
        if (value > peak) peak = value;
    }

    // Map 0 → 0 and 1 → 120
    return Math.round(peak * 120);
}

let FPS_LIMIT = 60; // default FPS
let RATESKIP = 1; // default FPS
let lastSentTime = 0;

const videoElements = [
    document.getElementById('MediaExtDeck1'),
    document.getElementById('MediaExtDeck2')
];

function updateFPSLimit() {
    // If any video has a src, limit to 48fps; otherwise 60fps
    FPS_LIMIT = videoElements.some(video => video.src) ? 30 : 60;
    RATESKIP = videoElements.some(video => video.src) ? 2 : 1;
}

// Function to send visualizer data with dynamic FPS
function sendVisualizerData(dataArray) {
    const now = performance.now();
    const MIN_INTERVAL = 1000 / FPS_LIMIT;

    if (now - lastSentTime >= MIN_INTERVAL) {
        if (!toggleExternal) {
            ipcRenderer.send('send-visualizer-data', dataArray);
        }
        lastSentTime = now;
    }
}

// Observe changes in the 'src' attribute of each video
videoElements.forEach(video => {
    if (!video) return;
    const observer = new MutationObserver(() => {
        updateFPSLimit();
    });
    observer.observe(video, { attributes: true, attributeFilter: ['src'] });
});

// Initial check
updateFPSLimit();

function updateAudioVisualizer(dataArray) {
    drawSpectrum(dataArray);
}

function updateDB(dataArray) {
    total = dataArray.reduce((sum, value) => sum + value, 0);
    
    const dBArray = dataArray.map(v => 20 * Math.log10(v || 1));
    const avgDB = (dBArray.reduce((a, b) => a + b, 0) / dBArray.length).toFixed(100);
    avgText.textContent = `${(avgDB - 30).toFixed(1)} dB`;
}

let dataL;
let dataR;
const analyserL = audioCtx.createAnalyser();
const analyserR = audioCtx.createAnalyser();
let levelL;
let levelR;
let levelLVU;
let levelRVU;

function createStereoMeter(audioCtx, sourceNode, meterLeft, meterRight) {
    const splitter = audioCtx.createChannelSplitter(2);

    analyserL.fftSize = 256;
    analyserR.fftSize = 256;

    dataL = new Uint8Array(analyserL.frequencyBinCount);
    dataR = new Uint8Array(analyserR.frequencyBinCount);

    sourceNode.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    const frame = 0;
    setInterval(() => {
        analyserL.getByteTimeDomainData(dataL);
        analyserR.getByteTimeDomainData(dataR);
        analysermeter.getByteTimeDomainData(dataArrayMeter);
        analysermeter.getByteFrequencyData(freqData2);

        levelL = getPeak(dataL);
        levelR = getPeak(dataR);

        levelLVU = getPeakScaled(dataL);
        levelRVU = getPeakScaled(dataR);
    }, frame); // ~60 FPS

    return { analyserL, analyserR };
}

function updateMeter() {
    // Update <meter> tags (range 0–1)
    if (meterL) meterL.value = levelL
    if (meterR) meterR.value = levelR;

    ipcRenderer.send('send-level-data', levelLVU, levelRVU)
    updateNeedleSmooth('#micdev', levelLVU);
    updateNeedleSmooth('#sampler', levelRVU);
}

const meterL = document.getElementById("meterL");
const meterR = document.getElementById("meterR");

createStereoMeter(audioCtx, meterMixerNode);

const canvasMeter = document.getElementById("waveform");
const canvasMeterctx = canvasMeter.getContext("2d", { willReadFrequently: true });;
const canvasMeter2 = document.getElementById("spectrogram");
const canvasMeterctx2 = canvasMeter2.getContext("2d", { willReadFrequently: true });;

meterMixerNode.connect(analysermeter);

function intensityToColor(intensity) {
    // intensity 0-255
    const t = intensity / 255; // normalize
    if (t < 0.3) {
        // dark purple
        return `rgb(${Math.floor(50 * t)}, 0, ${Math.floor(80 + 100 * t)})`;
    } else if (t < 0.6) {
        // red-orange
        return `rgb(${Math.floor(255 * (t - 0.3) / 0.3)}, ${Math.floor(100 * (t - 0.3) / 0.3)}, 0)`;
    } else if (t < 0.9) {
        // yellow
        return `rgb(255, ${Math.floor(255 * (t - 0.6) / 0.3)}, 0)`;
    } else {
        // white
        const val = Math.floor(255 * t);
        return `rgb(${val},${val},${val})`;
    }
}

const canvasMeterPrev = document.getElementById("waveform_prev");
const canvasMeterctxPrev = canvasMeterPrev.getContext("2d", { willReadFrequently: true });

const canvasMeter2Prev = document.getElementById("spectrogram_prev");
const canvasMeterctx2Prev = canvasMeter2Prev.getContext("2d", { willReadFrequently: true });

function drawAudioVisuals() {
    const waveformImage = canvasMeterctx.getImageData(1, 0, canvasMeter.width - 1, canvasMeter.height);
    canvasMeterctx.putImageData(waveformImage, 0, 0);
    canvasMeterctx.clearRect(canvasMeter.width - 1, 0, 1, canvasMeter.height);

    for (let i = 0; i < dataArrayMeter.length; i++) {
        const y = (dataArrayMeter[i] / 255) * canvasMeter.height;
        canvasMeterctx.fillStyle = onRecord ? `#62bbb8` : `#ffffff`;
        canvasMeterctx.fillRect(canvasMeter.width - 1, y, 1, 1);
    }

    // --- Copy waveform to preview canvas ---
    const waveformCopy = canvasMeterctx.getImageData(0, 0, canvasMeter.width, canvasMeter.height);
    canvasMeterctxPrev.putImageData(waveformCopy, 0, 0);

    const specImage = canvasMeterctx2.getImageData(1, 0, canvasMeter2.width - 1, canvasMeter2.height);
    canvasMeterctx2.putImageData(specImage, 0, 0);
    canvasMeterctx2.clearRect(canvasMeter2.width - 1, 0, 1, canvasMeter2.height);

    for (let i = 0; i < freqData2.length; i++) {
        const y = canvasMeter2.height - 1 - Math.floor(i / freqData2.length * canvasMeter2.height);
        const color = intensityToColor(freqData2[i]);
        canvasMeterctx2.fillStyle = color;
        canvasMeterctx2.fillRect(canvasMeter2.width - 1, y, 1, 1);
    }

    // --- Copy spectrogram to preview canvas ---
    const specCopy = canvasMeterctx2.getImageData(0, 0, canvasMeter2.width, canvasMeter2.height);
    canvasMeterctx2Prev.putImageData(specCopy, 0, 0);
}

function shouldSendFrame() {
    const effectiveSkip = skipFrames === 0 ? RATESKIP : skipFrames;
    frameCounter++;
    return frameCounter % effectiveSkip === 0;
}

function loopVisualizer() {
    const frameInterval = 16; // ~60 FPS

    setInterval(() => {
        if (shouldSendFrame()) {
            // Send visualizer data via IPC
            if (!toggleExternal) {
                ipcRenderer.send('send-visualizer-data', freqData2);
            }

            // Update visualizer UI
            updateAudioVisualizer(freqData2);
            drawAudioVisuals();
            updateMeter();
        }
    }, frameInterval);
}

loopVisualizer();

setInterval(() => {
    updateDB(freqData2);
}, 150);