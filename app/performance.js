const { stat } = require('original-fs');

// FPS Counter
let lastFrameTime = performance.now();
let frameCount = 0;
let fps = 0;

function updateFPS() {
    const now = performance.now();
    frameCount++;

    if (now - lastFrameTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
        document.getElementById("fpsText").textContent = `${fps}`;
    }

    requestAnimationFrame(updateFPS);
}

updateFPS();

// Simulated CPU Usage (based on main-thread load)
let cpuInterval = setInterval(() => {
    const start = performance.now();

    // Simulated busy-work loop
    for (let i = 0; i < 1e5; i++) {
        Math.sqrt(i); // pretend workload
    }

    const duration = performance.now() - start;

    // Simulated CPU usage: normalize duration to ~0–100%
    const cpuPercent = Math.min(100, Math.round((duration / 16.67) * 250)); // ~16.67ms = 60FPS frame budget
    document.getElementById("cpuText").textContent = `${cpuPercent}%`;
}, 250);

function updateClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");

    const day = now.getDate();

    // Get month name from array
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[now.getMonth()];

    // Format as (10 Aug)
    const formattedDate = `${day} ${month}`;

    document.getElementById("clockText").textContent = `${hours}:${minutes}`;
    document.getElementById("dateText").textContent = `${formattedDate}`;
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