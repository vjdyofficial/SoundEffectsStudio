function analyzeAudio(buffer) {
    const channels = buffer.numberOfChannels;

    const mono = toMono(buffer);
    const sampleRate = buffer.sampleRate;

    const bpm = detectBPM(mono, sampleRate);
    const key = detectKey(mono);

    return {
        channels,
        reversedChannels: reverseChannels(channels),
        bpm,
        key
    };
}

/* ---------------------------
   FAST CHANNEL UTILITY
---------------------------- */
function reverseChannels(ch) {
    return parseInt(String(ch).split("").reverse().join("")) || ch;
}

/* ---------------------------
   MONO CONVERSION (OPTIMIZED)
---------------------------- */
function toMono(buffer) {
    const ch = buffer.numberOfChannels;
    const len = buffer.length;

    const mono = new Float32Array(len);

    const channels = new Array(ch);
    for (let c = 0; c < ch; c++) {
        channels[c] = buffer.getChannelData(c);
    }

    for (let i = 0; i < len; i++) {
        let sum = 0;

        for (let c = 0; c < ch; c++) {
            sum += channels[c][i];
        }

        mono[i] = sum / ch;
    }

    return mono;
}

/* ---------------------------
   BPM DETECTION (FIXED + STABLE)
---------------------------- */
function detectBPM(data, sampleRate) {
    const hopSize = 512; // better time resolution

    // 1. build better onset-like envelope (RMS + difference)
    const envelope = [];

    let prevEnergy = 0;

    for (let i = 0; i < data.length; i += hopSize) {
        let sum = 0;

        for (let j = i; j < i + hopSize && j < data.length; j++) {
            const v = data[j];
            sum += v * v;
        }

        const energy = Math.sqrt(sum / hopSize);

        // emphasize changes (onset detection improvement)
        const onset = Math.max(0, energy - prevEnergy);
        envelope.push(onset);

        prevEnergy = energy;
    }

    // 2. remove mean (very important for autocorrelation stability)
    const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
    for (let i = 0; i < envelope.length; i++) {
        envelope[i] -= mean;
    }

    // 3. autocorrelation with normalization
    const minBPM = 60;
    const maxBPM = 180;

    const minLag = Math.floor((60 / maxBPM) * (sampleRate / hopSize));
    const maxLag = Math.floor((60 / minBPM) * (sampleRate / hopSize));

    let bestLag = 0;
    let bestScore = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
        let score = 0;
        let norm = 0;

        for (let i = 0; i < envelope.length - lag; i++) {
            score += envelope[i] * envelope[i + lag];
            norm += envelope[i] * envelope[i];
        }

        const normalized = norm > 0 ? score / norm : 0;

        // slight bias correction for higher lags
        const adjusted = normalized * (1 - lag / maxLag);

        if (adjusted > bestScore) {
            bestScore = adjusted;
            bestLag = lag;
        }
    }

    let bpm = 60 / ((bestLag * hopSize) / sampleRate);

    if (!isFinite(bpm)) return 120;

    bpm = Math.round(Math.max(60, Math.min(180, bpm)));

    // octave correction (same idea, but safer)
    while (bpm < 75) bpm *= 2;
    while (bpm > 160) bpm /= 2;

    return Math.round(bpm);
}

/* ---------------------------
   SIMPLE KEY DETECTION (UNCHANGED BUT SAFE)
   (Note: still basic, not music-theory accurate)
---------------------------- */
function detectKey(data) {
    const bins = new Array(12).fill(0);

    for (let i = 0; i < data.length; i += 2048) {
        const v = Math.abs(data[i]) * (i < data.length * 0.2 ? 2 : 1);
        const idx = Math.floor((v * 1000) % 12);
        bins[idx]++;
    }

    const keys = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];

    const max = bins.indexOf(Math.max(...bins));

    return keys[max];
}

/* ---------------------------
   EXPORTS
---------------------------- */
module.exports = {
    analyzeAudio,
    detectBPM,
    detectKey,
    toMono,
    reverseChannels
};