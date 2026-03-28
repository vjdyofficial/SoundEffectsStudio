let skipFrames = 0;
let frameCounter = 0;

const powerpeakL = document.getElementById('powerpeakL')
const powerpeakR = document.getElementById('powerpeakR')
const skipFramesSelector = document.getElementById('skipFramesSelector');
const frameratevalue = localStorage.getItem('framerate') || 60;

const fftbarsizeSelector = document.getElementById('FFTSizeSelector');
const fftbarsizevalue = localStorage.getItem('fftbarsize') || 128;

const audioCanvas = document.getElementById('audioForm');
const audioCanvasCtx = audioCanvas.getContext('2d', { willReadFrequently: true });

const audioCanvasPreview = document.getElementById('audioFormPreview');
const audioCanvasPreviewCtx = audioCanvasPreview.getContext('2d', { willReadFrequently: true });

const audioCanvasPreview2 = document.getElementById('audioFormPreview2');
const audioCanvasPreviewCtx2 = audioCanvasPreview2.getContext('2d', { willReadFrequently: true });

const VUMeter = new BroadcastChannel('vumeter');
const ChannelWidget_External = new BroadcastChannel('widget_external');

audioCanvas.width = 512;
audioCanvas.height = 256;

audioCanvasPreview.width = 512;
audioCanvasPreview.height = 256;

audioCanvasPreview2.width = 512;
audioCanvasPreview2.height = 256;

const visualizersplit = audioCtx.createChannelSplitter(8);

const analysermeter = audioCtx.createAnalyser();
analysermeter.fftSize = 256;
const dataArrayMeter = new Uint8Array(analysermeter.frequencyBinCount);
const freqData = new Uint8Array(analysermeter.frequencyBinCount);

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

    const attack = 1;   // rise speed (fast)
    const release = 0.5; // fall speed (slow)

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

function drawSpectrum(data) {
    audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
    const barWidth = audioCanvas.width / (Number(fftbarsizeSelector.value) || 255);

    for (let i = 0; i < (Number(fftbarsizeSelector.value) || data.length || 128); i++) {
        const value = data[i];
        const barHeight = (value / 255) * audioCanvas.height;
        const x = i * barWidth;
        const y = audioCanvas.height - barHeight;

        // Example for main audio canvas
        const gradient = audioCanvasCtx.createLinearGradient(x, y, x, y + barHeight);

        // Add three color stops
        gradient.addColorStop(0, onRecord ? micDarkColor : micLightColor);        // top
        gradient.addColorStop(0.5, onRecord ? samplerDarkColor : samplerLightColor);  // middle
        gradient.addColorStop(1, onRecord ? listenDarkColor : listenLightColor);     // bottom

        // Apply gradient
        audioCanvasCtx.fillStyle = gradient;
        audioCanvasCtx.fillRect(x, y, barWidth + 2, barHeight);
    }

    // --- Preview copy ---
    const waveformCopy = audioCanvasCtx.getImageData(0, 0, audioCanvas.width, audioCanvas.height);
    audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
    audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
}

function drawSpectrogram(data) {
    const width = audioCanvas.width;
    const height = audioCanvas.height;
    const columnWidth = 2; // scroll speed per frame

    // --- scroll old image left ---
    const oldImage = audioCanvasCtx.getImageData(columnWidth, 0, width - columnWidth, height);
    audioCanvasCtx.putImageData(oldImage, 0, 0);
    audioCanvasCtx.clearRect(width - columnWidth, 0, columnWidth, height);

    for (let i = 0; i < data.length; i++) {
        const value = data[i] / 255; // normalize 0–1
        const y = height - (i / data.length) * height;

        let r = 0, g = 0, b = 0;

        if (value > 0) {
            const t = value;

            if (t < 0.25) {
                // black → dark violet
                const tt = t / 0.25;
                r = 48 * tt;
                g = 0;
                b = 64 * tt;
            } else if (t < 0.5) {
                // dark violet → magenta
                const tt = (t - 0.25) / 0.25;
                r = 48 + (128 - 48) * tt;
                g = 0;
                b = 64 + (128 - 64) * tt;
            } else if (t < 0.75) {
                // magenta → orange
                const tt = (t - 0.5) / 0.25;
                r = 128 + (255 - 128) * tt;
                g = 0 + (128 - 0) * tt;
                b = 128 - (128 * tt);
            } else if (t < 0.95) {
                // orange → yellow
                const tt = (t - 0.75) / 0.2;
                r = 255;
                g = 128 + (127 * tt); // 128 → 255
                b = 0;
            } else {
                // 0.95 → 1.0 : yellow → white
                const tt = (t - 0.95) / 0.05;
                r = 255;
                g = 255;
                b = 0 + 255 * tt; // subtle white overlay
            }
        }

        audioCanvasCtx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
        audioCanvasCtx.fillRect(
            width - columnWidth,
            y,
            columnWidth,
            height / data.length + 1
        );
    }

    // --- preview copy ---
    const frame = audioCanvasCtx.getImageData(0, 0, width, height);
    audioCanvasPreviewCtx.putImageData(frame, 0, 0);
    audioCanvasPreviewCtx2.putImageData(frame, 0, 0);
}

function prepareDataArray(rawData, maxSamples = 50) {
    if (!rawData || rawData.length === 0) {
        // default to single midline value
        return [128];
    }

    // downsample if too many points
    if (rawData.length > maxSamples) {
        const step = rawData.length / maxSamples;
        const newData = [];
        for (let i = 0; i < maxSamples; i++) {
            newData.push(rawData[Math.floor(i * step)]);
        }
        return newData;
    }

    return rawData;
}

function drawWave(rawDataArray, peak1, peak2) {
    const width = audioCanvas.width;
    const height = audioCanvas.height;
    const scrollWidth = 10;

    const dataArray = prepareDataArray(rawDataArray);

    // --- Scroll ---
    const oldImage = audioCanvasCtx.getImageData(scrollWidth, 0, width - scrollWidth, height);
    audioCanvasCtx.putImageData(oldImage, 0, 0);
    audioCanvasCtx.clearRect(width - scrollWidth, 0, scrollWidth, height);

    // ✅ Combine peaks safely (0–1 expected)
    const peakMix = Math.max(peak1, peak2);

    // ✅ Damping curve (more natural response)
    const damping = 0.025 + (peakMix ** 0.6) * 0.9;
    // range ≈ 0.25 → 1.15

    // ✅ Color mapping (no negatives)
    const hue = 180 * damping;
    const hueRecord = 10 + (170 * -damping);

    for (let i = 0; i < dataArray.length; i++) {

        const x = width - scrollWidth + (i * scrollWidth / dataArray.length);

        const normalized = (dataArray[i] - 128) / 128;
        const barHeight = Math.abs(normalized) * height * 0.5 * damping;

        const yTop = height / 2 - barHeight;
        const yBottom = height / 2 + barHeight;

        audioCanvasCtx.fillStyle =
            onRecord
                ? `hsl(${hueRecord},100%,50%)`
                : `hsl(${hue},100%,50%)`;

        audioCanvasCtx.fillRect(
            x - 2,
            yTop,
            scrollWidth / dataArray.length * 25,
            yBottom - yTop
        );
    }

    // --- Preview copy ---
    const waveformCopy = audioCanvasCtx.getImageData(0, 0, width, height);
    audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
    audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
}

function drawScope(peak1, peak2) {
    const width = audioCanvas.width;
    const height = audioCanvas.height;

    audioCanvasCtx.fillStyle = "rgba(0,0,0,0.5)";
    audioCanvasCtx.fillRect(0, 0, width, height);

    rawDataArray = dataArrayMeter;

    // --- peak normalize ---
    const peakMix = Math.max(peak1, peak2);
    const gain = 0.4 + peakMix * 1.6; // never flat

    // --- color ---
    const damping = 0.05 + peakMix ** 0.6;
    const hue = 180 * damping;
    const hueRecord = 10 + (170 * -damping);

    const strokeColor = onRecord
        ? `hsl(${hueRecord},100%,55%)`
        : `hsl(${hue},100%,55%)`;

    audioCanvasCtx.strokeStyle = strokeColor;
    audioCanvasCtx.lineWidth = 7.5;
    audioCanvasCtx.lineJoin = "round";
    audioCanvasCtx.lineCap = "round";

    // --- zero-cross trigger ---
    let trigger = 0;
    for (let i = 1; i < rawDataArray.length; i++) {
        if (rawDataArray[i - 1] < 128 && rawDataArray[i] >= 128) {
            trigger = i;
            break;
        }
    }

    // --- draw line ---
    audioCanvasCtx.beginPath();

    for (let x = 0; x < width; x++) {
        const idx =
            (trigger + Math.floor(x * rawDataArray.length / width)) %
            rawDataArray.length;

        const normalized = (rawDataArray[idx] - 128) / 128;
        const y = height / 2 - normalized * height * 0.46 * gain;

        if (x === 0) audioCanvasCtx.moveTo(x, y);
        else audioCanvasCtx.lineTo(x, y);
    }

    audioCanvasCtx.stroke();

    const waveformCopy = audioCanvasCtx.getImageData(0, 0, width, height);
    audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
    audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);
}

let VISUALIZER_TYPE = 0;

function clearBeforeSetVisualizer(index) {
    audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
    audioCanvasPreviewCtx.clearRect(0, 0, audioCanvasPreview.width, audioCanvasPreview.height);
    VISUALIZER_TYPE = index;
    localStorage.setItem('VISUALIZER_TYPE', index)
}

clearBeforeSetVisualizer(Number(localStorage.getItem('VISUALIZER_TYPE')) || 0)

let lasttotal = 0;
let detectNoArray = 0;

function updateDB(dataArray) {
    total = dataArray.reduce((sum, value) => sum + value, 0);
    lasttotal = total;

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

const VISUALCHECK = document.getElementById('toggleVisualiserCheckbox');
const VUCHECK = document.getElementById('toggleVUMeterCheckbox');
const SRSCHECK = document.getElementById('toggleSurroundCheckbox');

function updateAudioVisualizer(dataArray, peak1, peak2) {
    if (!VISUALCHECK.checked) {
        switch (VISUALIZER_TYPE) {
            case 3:
                drawSpectrogram(dataArray);
                break;
            case 2:
                drawScope(peak1, peak2);
                break;
            case 1:
                drawWave(dataArray, peak1, peak2);
                break;
            default:
                drawSpectrum(dataArray);
        }
    } else {
        audioCanvasCtx.clearRect(0, 0, audioCanvas.width, audioCanvas.height);
        const waveformCopy = audioCanvasCtx.getImageData(0, 0, audioCanvas.width, audioCanvas.height);
        audioCanvasPreviewCtx.putImageData(waveformCopy, 0, 0);
        audioCanvasPreviewCtx2.putImageData(waveformCopy, 0, 0);

        if (!toggleExternal) {
            ChannelWidget_External.postMessage({
                type: 'DATA_ARRAY',
                array: dataArray,
                peaks: { levelL, levelR }  // names must match receiver
            });
        }
    }
}

function createStereoMeter(audioCtx, sourceNode, meterLeft, meterRight) {
    const splitter = audioCtx.createChannelSplitter(8);

    analyserL.fftSize = 256;
    analyserR.fftSize = 256;

    dataL = new Uint8Array(analyserL.frequencyBinCount);
    dataR = new Uint8Array(analyserR.frequencyBinCount);

    sourceNode.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);
    splitter.connect(analyserL, 2);
    splitter.connect(analyserR, 2);
    splitter.connect(analyserL, 3);
    splitter.connect(analyserR, 3);
    splitter.connect(analyserL, 4);
    splitter.connect(analyserR, 5);
    splitter.connect(analyserL, 6);
    splitter.connect(analyserR, 7);

    let frameuse = null;

    function getFrameInterval() {
        analyserL.getByteTimeDomainData(dataL);
        analyserR.getByteTimeDomainData(dataR);
        analysermeter.getByteTimeDomainData(dataArrayMeter);
        analysermeter.getByteFrequencyData(freqData);
        levelL = getPeak(dataL);
        levelR = getPeak(dataR);
        levelLVU = getPeakScaled(dataL);
        levelRVU = getPeakScaled(dataR);
    }

    frameuse = setInterval(getFrameInterval, 16);

    return { analyserL, analyserR };
}

let smoothL = 0;
let smoothR = 0;

const release = 0.04; // seconds (meter fall speed)
let lastTime = performance.now();

function updateMeters(levelL, levelR) {
    if (meterL) meterL.value = levelL;
    if (meterR) meterR.value = levelR;

    if (!VUCHECK.checked) {
        updateNeedleSmooth('#micdev', levelLVU);
        updateNeedleSmooth('#sampler', levelRVU);
    } else {
        VUMeter.postMessage({
            type: 'VU_METER',
            data: { levelLVU, levelRVU }
        });
    }
}

const meterL = document.getElementById("meterL");
const meterR = document.getElementById("meterR");

const gainmasterMeter = audioCtx.createGain();
gainmasterMeter.gain.value = 1;
gainmasterMeter.channelCount = 8;
createStereoMeter(audioCtx, gainmasterMeter);

masterVolume.connect(gainmasterMeter);
meterMixerNode.connect(gainmasterMeter);

masterVolume.connect(visualizersplit);
meterMixerNode.connect(visualizersplit);

for (let i = 0; i < 8; i++) {
    visualizersplit.connect(analysermeter, i);
}

function shouldSendFrame() {
    const effectiveSkip = skipFrames === 0 ? RATESKIP : skipFrames;
    frameCounter++;
    return frameCounter % effectiveSkip === 0;
}

function shouldSendVisualFrame() {
    const effectiveSkip = 2;
    frameCounter++;
    return frameCounter % effectiveSkip === 0;
}

let canUpdate = 0;
let intervalVisual = null;
let framerate = 1000 / 60;

function startVisualUpdates() {
    if (intervalVisual) clearInterval(intervalVisual);

    intervalVisual = setInterval(() => {
        updateAudioVisualizer(freqData, levelL, levelR);
        updateMeters(levelL, levelR);
    }, framerate);
};

function createMasterMeter(audioCtx, masterVolumeNode, channels = 8) {
    const splitter = audioCtx.createChannelSplitter(channels);
    masterVolumeNode.connect(splitter);
    const analysers = [];
    const dataArrays = [];

    for (let i = 0; i < channels; i++) {
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.3;

        splitter.connect(analyser, i);

        analysers.push(analyser);
        dataArrays.push(new Uint8Array(analyser.fftSize));
    }

    const channel = new BroadcastChannel("master-meter");
    const peakHold = new Array(channels).fill(0);
    const holdDecay = 0.0025;

    function toDB(value) {
        if (value <= 0) return -Infinity;
        return 20 * Math.log10(value);
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
        return Math.round(getPeak(dataArray) * 120);
    }

    function update() {
        const meterData = [];
        analysers.forEach((analyser, i) => {
            analyser.getByteTimeDomainData(dataArrays[i]);

            const peak = getPeak(dataArrays[i]);
            const rms = Math.sqrt(
                dataArrays[i].reduce((sum, v) => {
                    const sample = (v - 128) / 128;
                    return sum + sample * sample;
                }, 0) / dataArrays[i].length
            );

            // Peak hold logic
            if (peak > peakHold[i]) {
                peakHold[i] = peak;
            } else {
                peakHold[i] -= holdDecay;
                if (peakHold[i] < peak) peakHold[i] = peak;
                if (peakHold[i] < 0) peakHold[i] = 0;
            }

            meterData.push({
                peak,
                rms,
                peakDB: toDB(peak),
                rmsDB: toDB(rms),
                peakHold: peakHold[i],
                peakScaled: getPeakScaled(dataArrays[i]) // scaled 0-120
            });
        });

        if (SRSCHECK.checked) {
            channel.postMessage({
                type: "meter",
                channels: meterData
            });
        }

        if (VUCHECK.checked) {
            channel.postMessage({
                type: "vu",
                channels: meterData
            });
        }
    }

    let interval = setInterval(update, 16);
    let onpause = false;
    let frame = 16;

    return {
        splitter,
        analysers,
        stop() {
            clearInterval(interval);
            channel.close();
        },
        setUpdateTime(value = 16) {
            if (!onpause) {
                clearInterval(interval);
                interval = setInterval(update, value);
            }
            frame = value;
        },
        pause() {
            if (!onpause) {
                clearInterval(interval);
                onpause = true;
            } else {
                throw new ReferenceError("The Master Meter is paused already.");
            }
        },
        resume() {
            if (onpause) {
                clearInterval(interval);
                interval = setInterval(update, frame);
                onpause = false;
            } else {
                throw new ReferenceError("The Master Meter is already running.");
            }
        },
    };
}

let masterMeter = createMasterMeter(audioCtx, gainmasterMeter);

// 📝 Update skipFrames and save to localStorage
skipFramesSelector.addEventListener('change', () => {
    framerate = 1000 / Number(skipFramesSelector.value);
    localStorage.setItem('framerate', skipFramesSelector.value);
    startVisualUpdates();
    if (masterMeter) { masterMeter.setUpdateTime(framerate) }
});

VUCHECK.addEventListener("change", () => {
    document.querySelectorAll('#vu-meter_38h').forEach(el => {
        el.style.opacity = VUCHECK.checked ? 0.25 : 1;
    });
});

VISUALCHECK.addEventListener("change", (e) => {
    if (e.target.checked) {
        ['visualStatus', 'visualStatus2', 'visualStatus3'].forEach(id => {
            document.getElementById(id).hidden = false;
        })
    } else {
        ['visualStatus', 'visualStatus2', 'visualStatus3'].forEach(id => {
            document.getElementById(id).hidden = true;
        })
    }
});

framerate = 1000 / frameratevalue;
skipFramesSelector.value = frameratevalue;
skipFramesSelector.dispatchEvent(new Event('change')); // trigger initial setup

// 📝 Update skipFrames and save to localStorage
fftbarsizeSelector.addEventListener('change', (e) => {
    localStorage.setItem('fftbarsize', e.target.value);
});

fftbarsizeSelector.value = fftbarsizevalue;
fftbarsizeSelector.dispatchEvent(new Event('change')); // trigger initial setup



setInterval(() => {
    updateDB(freqData);
    const ispL = (meterL.value >= 0.70)
    powerpeakL.dataset.peak = ispL;
    const ispR = (meterR.value >= 0.70)
    powerpeakR.dataset.peak = ispR;
}, 150);

// Suspend/resume to toggle effect
function toggleNoise() {
    if (audioCtx.state === "running") {
        audioCtx.suspend();
    } else if (audioCtx.state === "suspended") {
        canUpdate = 0;
        audioCtx.resume();
    }
}

// audio-engine.js

const audioInfoChannel = new BroadcastChannel("sfx-audio-info");

function sendAudioCtxInfo() {
    if (!audioCtx) return;

    audioInfoChannel.postMessage({
        type: "audio-info",
        currentTime: audioCtx.currentTime,
        baseLatency: audioCtx.baseLatency || 0,
        outputLatency: audioCtx.outputLatency || 0,
        sampleRate: audioCtx.sampleRate,
        state: audioCtx.state,
        timestamp: performance.now()
    });
}

// Send every 500ms (don't spam every frame)
setInterval(sendAudioCtxInfo, 500);