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