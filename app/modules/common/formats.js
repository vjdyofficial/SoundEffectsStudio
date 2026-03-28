function formatTimeFromNumber(seconds) {
    if (isNaN(seconds)) return "00:00";

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const mm = m.toString().padStart(2, "0");
    const ss = s.toString().padStart(2, "0");

    if (h > 0) {
        const hh = h.toString().padStart(2, "0");
        return `${hh}:${mm}:${ss}`;
    } else {
        return `${mm}:${ss}`;
    }
}

function timecodeToFrames(timecode, fps) {
    const parts = timecode.split(":");

    if (parts.length !== 3) {
        throw new Error("Invalid format. Use HH:MM:SS.SSS");
    }

    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
    const frames = Math.round(totalSeconds * fps);
    return frames;
}

module.exports = {
    formatTimeFromNumber,
    timecodeToFrames,
};
