// Save settings
function decimalToHexAlpha(decimal) {
    // Clamp between 0 and 1 just in case
    const value = Math.round(Math.min(Math.max(decimal, 0), 1) * 255);
    // Convert to 2-digit hex
    return value.toString(16).padStart(2, '0').toUpperCase();
}

function saveCaptionSettings(data) {
    localStorage.setItem("captionSettings", JSON.stringify(data));
}

function applyCaptionSettings(data) {
    // Remove old style if any
    const getCaption = document.getElementById("captionStyle");
    const captionBGOpacity = data.captionBGOpacity
    const hexAlpha = decimalToHexAlpha(captionBGOpacity); // "80"

    const getOSD = document.getElementById("osdStyle");
    const osdBGOpacity = data.osdBGOpacity
    const hexAlpha2 = decimalToHexAlpha(osdBGOpacity); // "80"

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

    getCaption.style.cssText = `
        color: ${data.textColor};
        background: ${data.backgroundColor}${hexAlpha};
        font-family: ${data.fontFamily}, sans-serif;
        text-shadow: ${textShadow};
    `;

    getOSD.style.cssText = `
        color: ${data.textColor};
        background: ${data.backgroundColor}${hexAlpha2};
        font-family: ${data.fontFamily}, sans-serif;
        text-shadow: ${textShadow};
    `;
}

// Load settings
function loadCaptionSettings() {
    return JSON.parse(localStorage.getItem("captionSettings")) || {
        fontFamily: "Roboto",
        textColor: "#ffffff",
        backgroundColor: "#000000",
        edgeStyle: "default",
        captionBGOpacity: "0",
        osdBGOpacity: "0",
        strokeColor: "#000000",
    };
}

const settingsdata = loadCaptionSettings();

function sendcaptionsdata() {
    applyCaptionSettings(settingsdata);
    ipcRenderer.send("caption-settings-updated", settingsdata);
}

function testOSD() {
    const text = `
        <span id="overlaytextbold">Test On-screen display</span><br><br>
        On-screen display will look like this.<br>
        Supports HTML Text Formatting on the other hand.
    `
    ipcRenderer.send('show-text', text);
}

document.addEventListener("DOMContentLoaded", () => {
    sendcaptionsdata();
    document.getElementById("fontFamily").value = settingsdata.fontFamily || "";
    document.getElementById("textColor").value = settingsdata.textColor || "#ffffff";
    document.getElementById("bgColor").value = settingsdata.backgroundColor || "#000000";
    document.getElementById("edgeStyle").value = settingsdata.edgeStyle || "none";
    document.getElementById("captionBGOpacity").value = settingsdata.captionBGOpacity || "0";
    document.getElementById("osdBGOpacity").value = settingsdata.osdBGOpacity || "0";
    document.getElementById("strokeColor").value = settingsdata.strokeColor || "#000000";
});


// shared save function
function updateCaptionSettings() {
    const data = {
        fontFamily: document.getElementById("fontFamily").value,
        textColor: document.getElementById("textColor").value,
        backgroundColor: document.getElementById("bgColor").value,
        edgeStyle: document.getElementById("edgeStyle").value,
        captionBGOpacity: document.getElementById("captionBGOpacity").value,
        osdBGOpacity: document.getElementById("osdBGOpacity").value,
        strokeColor: document.getElementById("strokeColor").value
    }

    saveCaptionSettings(data); // localStorage save
    applyCaptionSettings(data);
    ipcRenderer.send('caption-settings-updated', data); // send to other windows
}

document.getElementById('testOSD').onclick = () => testOSD();

// for text/color inputs
["textColor", "bgColor", "strokeColor", "captionBGOpacity", "osdBGOpacity"].forEach(id => {
    document.getElementById(id).addEventListener("input", updateCaptionSettings);
});

// for dropdowns / selects
["fontFamily", "edgeStyle"].forEach(id => {
    document.getElementById(id).addEventListener("change", updateCaptionSettings);
});