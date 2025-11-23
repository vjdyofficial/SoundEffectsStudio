self.onmessage = (e) => {
    const { sampleRate, channelData } = e.data;
    const raw = channelData;

    const blockSize = 1024;
    const energies = [];

    // Compute energy per block
    for (let i = 0; i < raw.length; i += blockSize) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
            if (i + j < raw.length) sum += raw[i + j] * raw[i + j];
        }
        energies.push(sum);
    }

    // Autocorrelation
    const maxLag = 200;
    const corr = new Array(maxLag).fill(0);

    for (let lag = 1; lag < maxLag; lag++) {
        let sum = 0;
        for (let i = 0; i < energies.length - lag; i++) {
            sum += energies[i] * energies[i + lag];
        }
        corr[lag] = sum;
    }

    // Ignore first few lags to remove noise
    for (let i = 0; i < 4; i++) corr[i] = 0;

    // Find peak
    const bestLag = corr.indexOf(Math.max(...corr));
    const secondsPerBeat = (bestLag * blockSize) / sampleRate;
    let bpm = 60 / secondsPerBeat;

    // Clamp to realistic BPM
    while (bpm < 40) bpm *= 2;
    while (bpm > 200) bpm /= 2;

    bpm = Math.round(bpm);

    // Fallback if detection fails
    if (isNaN(bpm) || bpm < 40 || bpm > 220) bpm = 120;

    postMessage(bpm);
};
