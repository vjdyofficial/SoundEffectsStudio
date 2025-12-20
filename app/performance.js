const { stat } = require('original-fs');

// Canvas 1: FPS + CPU
const canvas1 = document.getElementById('perfCanvas1');
const ctxperf1 = canvas1.getContext('2d');
canvas1.width = 50;
canvas1.height = 28;

// Canvas 2: RAM + GPU
const canvas2 = document.getElementById('perfCanvas2');
const ctxperf2 = canvas2.getContext('2d');
canvas2.width = 50;
canvas2.height = 28;

const maxPoints = 200;

// --- Histories ---
let fpsHistory = [], cpuHistory = [];
let ramHistory = [], gpuHistory = [];

// --- CPU tracking ---
let prevCpu = os.cpus();
let lastCpuUpdate = 0;
const cpuUpdateInterval = 500;
let cpuCurrent = 0, cpuTarget = 0;

// --- RAM & GPU ---
let ramCurrent = 0, ramTarget = 0;
let gpuCurrent = 0, gpuTarget = 0;

function getRealCPU() {
    const cpus = os.cpus();
    let idleDiff = 0, totalDiff = 0;
    for (let i = 0; i < cpus.length; i++) {
        const prev = prevCpu[i].times;
        const curr = cpus[i].times;
        idleDiff += curr.idle - prev.idle;
        totalDiff += Object.values(curr).reduce((a, v) => a + v, 0) - Object.values(prev).reduce((a, v) => a + v, 0);
    }
    prevCpu = cpus;
    return totalDiff ? Math.min(Math.max(100 - Math.round((idleDiff / totalDiff) * 100), 0), 100) : 0;
}

function getRAM() {
    const used = os.totalmem() - os.freemem();
    return Math.round((used / os.totalmem()) * 100);
}

function getGPU() {
    // Replace with real GPU usage module later
    return Math.min(Math.max(Math.round(Math.random() * 50 + 10), 0), 100);
}

function drawGraph(ctx, data, color, sectionIndex, totalSections, width, height) {
    const sectionHeight = height / totalSections;
    const bottom = sectionHeight * (sectionIndex + 1);

    ctx.strokeStyle = color;
    ctx.beginPath();
    data.forEach((value, i) => {
        const x = (i / data.length) * width;
        const y = bottom - (value / 100) * sectionHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

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
        windowName: 'Main Window', // give a unique name per window
        memory: {
            fpsRate: fps.toFixed(1),
            workingSetMB: Math.round(mem.residentSet / 1024),
            privateMB: Math.round(mem.private / 1024),
            sharedMB: Math.round(mem.shared / 1024),
        }
    });
}, 1000);

// --- Text updates every 250ms ---
setInterval(() => {
    document.getElementById("fpsText").textContent = Math.round(fps);
    document.getElementById("cpuText").textContent = Math.round(cpuCurrent) + "%";
    document.getElementById("ramText").textContent = Math.round(ramCurrent) + "%";
    document.getElementById("gpuText").textContent = Math.round(gpuCurrent) + "%";
}, 250);

// --- Main loop ---
function update() {
    const now = performance.now();

    // FPS
    getFPS();
    fpsHistory.push((fps / 144) * 100);
    if (fpsHistory.length > maxPoints) fpsHistory.shift();

    // CPU, RAM, GPU every 500ms
    if (now - lastCpuUpdate >= cpuUpdateInterval) {
        cpuTarget = getRealCPU();
        ramTarget = getRAM();
        gpuTarget = getGPU();
        lastCpuUpdate = now;
    }

    cpuCurrent += (cpuTarget - cpuCurrent) * 0.1;
    ramCurrent += (ramTarget - ramCurrent) * 0.1;
    gpuCurrent += (gpuTarget - gpuCurrent) * 0.1;

    cpuHistory.push(cpuCurrent); if (cpuHistory.length > maxPoints) cpuHistory.shift();
    ramHistory.push(ramCurrent); if (ramHistory.length > maxPoints) ramHistory.shift();
    gpuHistory.push(gpuCurrent); if (gpuHistory.length > maxPoints) gpuHistory.shift();

    // Clear canvases
    ctxperf1.clearRect(0, 0, canvas1.width, canvas1.height);
    ctxperf2.clearRect(0, 0, canvas2.width, canvas2.height);

    const isDarkMode = matchMedia('(prefers-color-scheme: dark)').matches;

    // Colors
    const fpsColor = isDarkMode ? "#dfff93" : "#6b7a49ff";
    const cpuColor = isDarkMode ? "#77f8f4" : "#487e7cff";
    const ramColor = isDarkMode ? "#ffad5c" : "#aa6644";
    const gpuColor = isDarkMode ? "#ff5c77" : "#774455";

    // Draw FPS + CPU on canvas1
    drawGraph(ctxperf1, fpsHistory, fpsColor, 0, 2, canvas1.width, canvas1.height);
    drawGraph(ctxperf1, cpuHistory, cpuColor, 1, 2, canvas1.width, canvas1.height);

    // Draw RAM + GPU on canvas2
    drawGraph(ctxperf2, ramHistory, ramColor, 0, 2, canvas2.width, canvas2.height);
    drawGraph(ctxperf2, gpuHistory, gpuColor, 1, 2, canvas2.width, canvas2.height);

    requestAnimationFrame(update);
}

update();

function getTimeOfDayLabel(hour) {
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

    const lang = `label_${dayLanguageSelect.value}`
    return found ? found[lang] : "midnight";
}

// Get month name from array
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Get month name from array
const monthNamesLong = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

let clockBlink = false;

function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");
    clockBlink = !clockBlink;
    const day = now.getDate();
    const monthshort = monthNames[now.getMonth()];;
    const month = monthNamesLong[now.getMonth()];;
    const blink = clockBlink ? `:` : ` `;

    function getTimeFormat() {
        switch (timeSelect.value) {
            case "12h":
                return `${((now.getHours() + 11) % 12 + 1)}${blink}${minutes} ${now.getHours() >= 12 ? "PM" : "AM"}`;
            case "12h-noampm":
                return `${((now.getHours() + 11) % 12 + 1)}${blink}${minutes}`;
            case "12h-sec":
                return `${((now.getHours() + 11) % 12 + 1)}${blink}${minutes}${blink}${seconds} ${now.getHours() >= 12 ? "PM" : "AM"}`;
            case "12h-sec-noampm":
                return `${((now.getHours() + 11) % 12 + 1)}${blink}${minutes}${blink}${seconds}`;
            case "24h":
                return `${hours}${blink}${minutes}`;
            case "24h-sec":
                return `${hours}${blink}${minutes}${blink}${seconds}`;
            default:
                return `${hours}${blink}${minutes}`;
        }
    }

    function getDateFormat() {
        switch (dateSelect.value) {
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

    document.getElementById("clockText").textContent = getTimeFormat();
    document.getElementById("dateText").textContent = getDateFormat();
    document.getElementById("daytypeText").textContent = `${getTimeOfDayLabel(Number(hours)).toUpperCase()}`;
    const dayIcon = document.getElementById("dayIcon");
    if (now.getHours() >= 6 && now.getHours() < 18) {
        dayIcon.src = "icons/monosource/light_mode.svg";
        dayIcon.alt = "Light Mode Icon";
    } else {
        dayIcon.src = "icons/monosource/dark_mode.svg";
        dayIcon.alt = "Dark Mode Icon";
    }
    setTimeout(updateClock, 500);
}

updateClock();

const svgPath = "images/battery/";
const batteryDiv = document.getElementById("batterylevel");

const batteryStates = [
    "battery_android_alert",
    "battery_android_0",
    "battery_android_1",
    "battery_android_2",
    "battery_android_3",
    "battery_android_4",
    "battery_android_5",
    "battery_android_6",
    "battery_android_full"
];

let lowannounce = 0
let criticalannounce = true
let isChargingSoundPlaying = true
let isDisChargingSoundPlaying = true

function getBatteryState(level, isCharging) {
    const batteryElem = document.getElementById("batteryText");
    const percent = level * 100;
    const finalValue = Math.round(percent) === Math.floor(percent) ? Math.floor(percent) : Math.round(percent);

    document.getElementById('batteryIconDiv').title = `Battery Level: ${parseInt(percent)}%${isCharging ? " - on Charging" : ""}`;
    batteryElem.textContent = `${finalValue}`;

    if (isCharging) {
        document.getElementById("batteryIconCharging").style.display = "inline";
        criticalannounce = false
        isDisChargingSoundPlaying = false
        if (!isChargingSoundPlaying) {
            isChargingSoundPlaying = true
            playChargingSound();
        }

        const batterylow1 = document.querySelector('dialog[data-dialog-type="battery-warnlow"]');
        if (batterylow1) {
            CloseAnimationInit(batterylow1);
            setTimeout(() => {
                batterylow1.remove();
            }, 200);
        }
        const batterylow2 = document.querySelector('dialog[data-dialog-type="battery-criticallow"]');
        if (batterylow2) {
            CloseAnimationInit(batterylow2);
            setTimeout(() => {
                batterylow2.remove();
            }, 200);
        }
        const batterylow3 = document.querySelector('dialog[data-dialog-type="battery-low"]');
        if (batterylow3) {
            setTimeout(() => {
                batterylow3.remove();
            }, 200);
        }

        lowannounce = 0
    } else {
        document.getElementById("batteryIconCharging").style.display = "none";
        isChargingSoundPlaying = false
        if (!isDisChargingSoundPlaying) {
            isDisChargingSoundPlaying = true
            playDischargingSound();
        }
    }

    function statetoShowDailog() {
        if (level <= 0.10 && !isCharging) {
            const batterylow = document.querySelector('dialog[data-dialog-type="battery-criticallow"]');
            if (batterylow) {
                CloseAnimationInit(batterylow);
                setTimeout(() => {
                    batterylow.remove();
                }, 200);
            }
            const text = `Your battery is very critically low, please plug in immediately. charge your device now!`
            if (lowannounce !== 3) {
                alert(text, "Battery very critically low!", false, true, true, "battery-warnlow");
                lowannounce = 3
                playBatterySound(true);
                isChargingSoundPlaying = false
                isDisChargingSoundPlaying = true
            }
        } else if (level <= 0.15 && !isCharging) {
            const batterylow = document.querySelector('dialog[data-dialog-type="battery-low"]');
            if (batterylow) {
                CloseAnimationInit(batterylow);
                setTimeout(() => {
                    batterylow.remove();
                }, 200);
            }
            const title = "Battery critically low!"
            const text = `Your battery is very low, please plug in immediately. the app will warn if it reaches to lower than or at 10%. It's recommended to charge your device now!`
            if (lowannounce !== 2) {
                alert(text, title, false, false, false, "battery-criticallow");
                lowannounce = 2
                playBatterySound(false);
                isChargingSoundPlaying = false
                isDisChargingSoundPlaying = true
            }
        } else if (level <= 0.20 && !isCharging) {
            const title = "Battery Low!"
            const text = `Your battery is low, please plug in immediately. You can continue using this app and charge your device now!`
            if (lowannounce !== 1) {
                alert(text, title, false, false, false, "battery-low");
                lowannounce = 1
                playBatterySound(false);
                isChargingSoundPlaying = false
                isDisChargingSoundPlaying = true
            }
        } else if (level >= 0.21 && !isCharging) {
            lowannounce = 0
            criticalannounce = false
        }
    }

    statetoShowDailog();

    if (level <= 0.20) return isCharging ? "battery_android_0" : "battery_android_alert";
    if (percent >= 95) return "battery_android_full";
    const index = Math.floor(percent / (100 / 7)); // 0–6
    return `battery_android_${index}`;
}

async function initBattery() {
    if (!("getBattery" in navigator)) {
        console.warn("Battery API not supported");
        // hide battery div if no API
        batteryDiv.style.display = "none";
        return;
    }

    const battery = await navigator.getBattery();
    const img = document.getElementById("batteryIcon");
    batteryDiv.style.display = "flex"; // show battery info

    function update() {
        if (battery.level === 1 && battery.charging) {
            batteryDiv.style.display = "none";
            return;
        } else {
            batteryDiv.style.display = "flex";
        }

        const stateId = getBatteryState(battery.level, battery.charging);
        img.src = `${svgPath}${stateId}.svg`;
    }

    update();
    battery.addEventListener("levelchange", update);
    battery.addEventListener("chargingchange", update);
}

initBattery();

function sendVideoInfo(video) {
    if (!video) return;

    const videoInfo = {
        id: video.id,
        name: video.getAttribute('data-name') || video.id || 'Unnamed Video',
        currentTime: video.currentTime,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        // Approximate FPS by last frame delta
        videoFrameRate: video._lastFrameTime ? 1000 / (performance.now() - video._lastFrameTime) : 0
    };

    // Store timestamp for next frame FPS calculation
    video._lastFrameTime = performance.now();

    ipcRenderer.send('video-frame-info', videoInfo);
}

const videos = document.querySelectorAll('video');

setInterval(() => {
    videos.forEach(video => sendVideoInfo(video));
}, 500); // every 0.5s, adjust as needed

function sendAudioInfo(audio) {
    if (!audio) return;

    const audioInfo = {
        id: audio.id,
        name: audio.getAttribute('data-name') || audio.id || 'Unnamed Audio',
        currentTime: audio.currentTime,
        duration: audio.duration,
        volume: audio.volume,
        playbackRate: audio.playbackRate
    };

    ipcRenderer.send('audio-frame-info', audioInfo);
}

const audios = document.querySelectorAll('audio');

setInterval(() => {
    audios.forEach(audio => sendAudioInfo(audio));
}, 500); // every 0.5s