function createStereoMeter(audioCtx, sourceNode, meterLeft, meterRight) {
    const splitter = audioCtx.createChannelSplitter(2);

    const analyserL = audioCtx.createAnalyser();
    const analyserR = audioCtx.createAnalyser();

    analyserL.fftSize = 256;
    analyserR.fftSize = 256;

    const dataL = new Uint8Array(analyserL.frequencyBinCount);
    const dataR = new Uint8Array(analyserR.frequencyBinCount);

    sourceNode.connect(splitter);
    splitter.connect(analyserL, 0);
    splitter.connect(analyserR, 1);

    function updateMeter() {
        analyserL.getByteTimeDomainData(dataL);
        analyserR.getByteTimeDomainData(dataR);

        const levelL = getPeak(dataL);
        const levelR = getPeak(dataR);

        // Update <meter> tags (range 0–1)
        if (meterLeft) meterLeft.value = levelL;
        if (meterRight) meterRight.value = levelR;

        requestAnimationFrame(updateMeter);
    }

    updateMeter();

    return { analyserL, analyserR };
}

function getPeak(dataArray) {
    let peak = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const value = Math.abs(dataArray[i] - 128) / 128;
        if (value > peak) peak = value;
    }
    return peak;
}


createStereoMeter(audioCtx, meterMixerNode, (left, right) => {
    // Example: update your UI
    document.getElementById("meter-left").style.height = (left * 100) + "%";
    document.getElementById("meter-right").style.height = (right * 100) + "%";
});

const meterL = document.getElementById("meterL");
const meterR = document.getElementById("meterR");

createStereoMeter(audioCtx, meterMixerNode, meterL, meterR);

const canvasMeter = document.getElementById("waveform");
const canvasMeterctx = canvasMeter.getContext("2d", { willReadFrequently: true });;
const canvasMeter2 = document.getElementById("spectrogram");
const canvasMeterctx2 = canvasMeter2.getContext("2d", { willReadFrequently: true });;

const analysermeter = audioCtx.createAnalyser();
analysermeter.fftSize = 256;
const dataArrayMeter = new Uint8Array(analysermeter.frequencyBinCount);

meterMixerNode.connect(analysermeter);
const freqData2 = new Uint8Array(analysermeter.frequencyBinCount);

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

function drawAudioVisuals() {
    requestAnimationFrame(drawAudioVisuals);

    // --- WAVEFORM ---
    analysermeter.getByteTimeDomainData(dataArrayMeter);

    // Shift waveform canvas left by 1 pixel
    const waveformImage = canvasMeterctx.getImageData(1, 0, canvasMeter.width - 1, canvasMeter.height);
    canvasMeterctx.putImageData(waveformImage, 0, 0);
    canvasMeterctx.clearRect(canvasMeter.width - 1, 0, 1, canvasMeter.height);

    // Draw waveform on rightmost column
    for (let i = 0; i < dataArrayMeter.length; i++) {
        const y = (dataArrayMeter[i] / 255) * canvasMeter.height;
        canvasMeterctx.fillStyle = `#ffffff80`;
        canvasMeterctx.fillRect(canvasMeter.width - 1, y, 1, 1);
    }

    // --- SPECTROGRAM ---
    analysermeter.getByteFrequencyData(freqData2);

    // Shift spectrogram canvas left by 1 pixel
    const specImage = canvasMeterctx2.getImageData(1, 0, canvasMeter2.width - 1, canvasMeter2.height);
    canvasMeterctx2.putImageData(specImage, 0, 0);
    canvasMeterctx2.clearRect(canvasMeter2.width - 1, 0, 1, canvasMeter2.height);

    // Draw frequency column (top = high freq)
    for (let i = 0; i < freqData2.length; i++) {
        const y = canvasMeter2.height - 1 - Math.floor(i / freqData2.length * canvasMeter2.height);
        const color = intensityToColor(freqData2[i]);
        canvasMeterctx2.fillStyle = color;
        canvasMeterctx2.fillRect(canvasMeter2.width - 1, y, 1, 1);
    }
}

drawAudioVisuals();
