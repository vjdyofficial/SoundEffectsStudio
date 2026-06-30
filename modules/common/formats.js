// Get month name from array
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Get month name from array
const monthNamesLong = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];



const now = new Date();
const hours = now.getHours().toString().padStart(2, "0");
const minutes = now.getMinutes().toString().padStart(2, "0");
const seconds = now.getSeconds().toString().padStart(2, "0");
const day = now.getDate();
const monthshort = monthNames[now.getMonth()];;
const month = monthNamesLong[now.getMonth()];;

function formatTimeFromNumber(seconds) {
    if (isNaN(seconds) || seconds <= 0) return "00:00";

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

function getTimeFormat(format) {
    switch (format) {
        case "12h":
            return `${((now.getHours() + 11) % 12 + 1)}:${minutes} ${now.getHours() >= 12 ? "PM" : "AM"}`;
        case "12h-noampm":
            return `${((now.getHours() + 11) % 12 + 1)}:${minutes}`;
        case "12h-sec":
            return `${((now.getHours() + 11) % 12 + 1)}:${minutes}:${seconds} ${now.getHours() >= 12 ? "PM" : "AM"}`;
        case "12h-sec-noampm":
            return `${((now.getHours() + 11) % 12 + 1)}:${minutes}:${seconds}`;
        case "24h":
            return `${hours}:${minutes}`;
        case "24h-sec":
            return `${hours}:${minutes}:${seconds}`;
        default:
            return `${hours}:${minutes}`;
    }
}

function getDateFormat(format) {
    switch (format) {
        case "dd-mmm":
            return `${day} ${monthshort}`;
        case "mmm-dd":
            return `${monthshort} ${day}`;
        case "dd-mmmm":
            return `${day} ${month}`;
        case "mmmm-dd":
            return `${month} ${day}`;
        default:
            return `${day} ${month}`;
    }
}

function getTimeOfDayLabel(hour, language) {
    // Define thresholds in descending order
    const timeLabels = [
        { threshold: 21, label_eng: "night", label_tgl: "gabi", label_bcl: "pagkabanggi", label_id: "malam", label_ceb: "gabi" },
        { threshold: 19, label_eng: "evening", label_tgl: "gabi", label_bcl: "banggi", label_id: "sore", label_ceb: "gabii" },
        { threshold: 18, label_eng: "dusk", label_tgl: "bago maggabi", label_bcl: "pagtakop kang aldaw", label_id: "senja", label_ceb: "takipsilim" },
        { threshold: 17, label_eng: "sunset", label_tgl: "malimlim", label_bcl: "pagsalop", label_id: "matahari terbenam", label_ceb: "pagsalop sa adlaw" },
        { threshold: 13, label_eng: "afternoon", label_tgl: "hapon", label_bcl: "hapon", label_id: "siang", label_ceb: "hapon" },
        { threshold: 12, label_eng: "noon", label_tgl: "tanghali", label_bcl: "udto", label_id: "tengah hari", label_ceb: "udto" },
        { threshold: 10, label_eng: "before noon", label_tgl: "bago magtanghali", label_bcl: "bago magudto", label_id: "sebelum tengah hari", label_ceb: "buntag padulong udto" },
        { threshold: 8, label_eng: "day", label_tgl: "araw", label_bcl: "aldaw", label_id: "siang", label_ceb: "adlaw" },
        { threshold: 6, label_eng: "morning", label_tgl: "umaga", label_bcl: "aga", label_id: "pagi", label_ceb: "buntag" },
        { threshold: 5, label_eng: "sunrise", label_tgl: "bukang-liwayway", label_bcl: "pagsirang kang aldaw", label_id: "matahari terbit", label_ceb: "pagsubang sa adlaw" },
        { threshold: 4, label_eng: "dawn", label_tgl: "bukang-liwayway", label_bcl: "liwayway", label_id: "fajar", label_ceb: "kahayag sa kabuntagon" },
        { threshold: 0, label_eng: "midnight", label_tgl: "hatinggabi", label_bcl: "matanga", label_id: "tengah malam", label_ceb: "tungang gabi-i" },
    ];


    // Find first threshold that matches the current hour
    const found = timeLabels.find(entry => hour >= entry.threshold);

    const lang = `label_${language}`
    return found ? found[lang] : found["label_eng"];
}

function getTimestamp() {
    const now = new Date();

    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(-2);

    const hh = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    return `${dd}${mm}${yy}_${hh}${min}${ss}`;
}

function bytesToSize(bytes) {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${units[i]}`;
}

module.exports = {
    formatTimeFromNumber,
    timecodeToFrames,
    getDateFormat,
    getTimeFormat,
    getTimeOfDayLabel,
    getTimestamp,
    bytesToSize
};
