let file;
const element = document.getElementById('dragsupport')
const videoformat = ["clickImportMedia1", "clickImportMedia2"]
const captionformat = ["clickImportSubtitle1", "clickImportSubtitle2"]
const audioformat = ["clickImportAudioA", "clickImportAudioB", "clickImportAudioC", "clickImportAudioD"]

// Prevent browser from opening the file
element.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Optional visual cue
    element.classList.add("dragging");
});

element.addEventListener("dragleave", (e) => {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove("dragging");
});

element.addEventListener("drop", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    file = e.dataTransfer.files[0];

    element.classList.remove("dragging");

    if (file.type.startsWith("video/")) {
        videoformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = false;
        });
        captionformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        audioformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = false;
        });
        document.getElementById('ImportDialog').show();
    } else if (file.type.startsWith("audio/")) {
        videoformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        captionformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        audioformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = false;
        });
        document.getElementById('ImportDialog').show();
    } else if (file.type.startsWith("text/srt") || file.type.startsWith("text/vtt")) {
        videoformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        captionformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = false;
        });
        audioformat.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        document.getElementById('ImportDialog').show();
    } else if (file.name.endsWith('.subw')) {
        try {
            const json = await loadSUBW(file)
            console.log("Loaded SUBW preset:", json);
            alert("Bass Preset Imported!", "Conformation");
        } catch (err) {
            console.error("Failed to load SUBW:", err);
            alert(`${err}`, "Import Error");
        }
    }

    else {
        alert(`File not supported. Please import supported format.`, "Import Error")
    }
});