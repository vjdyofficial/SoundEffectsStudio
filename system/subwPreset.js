function saveSUBW(jsonObject, filename = "preset.subw") {
    // Convert JSON to string
    const jsonStr = JSON.stringify(jsonObject);

    // Encode to base64
    const base64 = btoa(unescape(encodeURIComponent(jsonStr)));

    // Create Blob and download
    const blob = new Blob([base64], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
}

function loadSUBW(file) {
    console.log(`file preload at ${file}`)
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            try {
                const base64 = reader.result;
                const jsonStr = decodeURIComponent(escape(atob(base64)));
                const json = JSON.parse(jsonStr);

                // -----------------------------
                // REQUIRED KEYS CHECK
                // -----------------------------
                const requiredKeys = ["gain", "limit", "pass", "filter"];
                const missing = requiredKeys.filter(key => !(key in json));

                if (missing.length > 0) {
                    return reject(
                        new Error(`Invalid preset file: missing keys → ${missing.join(", ")}`)
                    );
                }

                // -----------------------------
                // APPLY SLIDER VALUES
                // -----------------------------
                const sliders = [
                    { id: "bassSlider", value: json.gain },
                    { id: "limiterSlider", value: json.limit },
                    { id: "passSlider", value: json.pass },
                    { id: "filterSlider", value: json.filter }
                ];

                sliders.forEach(slider => {
                    const el = document.getElementById(slider.id);
                    if (el) {
                        el.value = Number(slider.value);

                        // Trigger event listeners
                        el.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                });

                resolve(json);

            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = reject;
        reader.readAsText(file);
    });
}

document.getElementById("subwImport").addEventListener("change", async (ev) => {
    const SUBWfile = ev.target.files[0];
    if (!SUBWfile) return;

    try {
        const preset = await loadSUBW(SUBWfile);
        console.log("Loaded preset:", preset);
        // Apply your settings (bass, eq, limiter, etc.)
    } catch (err) {
        console.error("Failed to load SUBW file:", err);
    }
});

ipcRenderer.on('importsubw', async (event, filePath) => {
    const buffer = fs.readFileSync(filePath);
    const file = new File([buffer], path.basename(filePath));
    if (!file) return;

    try {
        const json = await loadSUBW(file)
        console.log("Loaded SUBW preset:", json);
        alert("Bass Preset Imported!", "Conformation");
    } catch (err) {
        console.error("Failed to load SUBW:", err);
        alert(`${err}`, "Import Error");
    }
});