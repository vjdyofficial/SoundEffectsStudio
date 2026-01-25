let file;
const element = document.getElementById('dragsupport')
const videoformat = ["clickImportMedia1", "clickImportMedia2"]
const captionformat = ["clickImportSubtitle1", "clickImportSubtitle2"]
const audioformat = ["clickImportAudioA", "clickImportAudioB", "clickImportAudioC", "clickImportAudioD"]

async function scanImport() {
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
    } else if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
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
    } else if (file.name.endsWith('.bbcx') || file.name.endsWith('.b64i')) {
        alert(`These files are used in Sound Effect Studio App. so files including
            Base64 Image String and BBCode Teleprompter Format file 
            are skipped to import. please open it on File Explorer 
            or Import them manually. Bass Preset can still be imported for easy 
            configuration.`, "Cannot perform this action!")
    }

    else {
        alert(`File not supported. Please import supported format.`, "Import Error")
    }
}

document.getElementById("mediaImport").addEventListener("change", async (ev) => {
    file = ev.target.files[0];
    if (!file) return;
    scanImport();
});

function getMimeTypeFromExt(ext) {
    ext = ext.toLowerCase()
    switch (ext) {
        case '.mp3': return 'audio/mpeg'
        case '.wav': return 'audio/wav'
        case '.m4a': return 'audio/mp4'
        case '.ogg': return 'audio/ogg'
        case '.opus': return 'audio/opus'
        case '.mp4': return 'video/mp4'
        case '.webm': return 'video/webm'
        case '.3gp': return 'video/3gpp'
        case '.mov': return 'video/quicktime'
        case '.mkv': return 'video/x-matroska'
        case '.flac': return 'audio/flac'
        case '.subw': return 'application/x-subw'
        case '.b64i': return 'application/x-b64i'
        case '.bbcx': return 'application/x-bbcx'
        default: return '' // unknown or fallback
    }
}

async function loadBundledMusic(path) {
    const res = await fetch(path);
    const blob = await res.blob();

    file = new File(
        [blob],
        path.split("/").pop(),
        { type: blob.type }
    );

    scanImport();
}

let onBusy = false;

ipcRenderer.on('importmedia', async (event, filePath) => {
    if (!onBusy) {
        try {
            onBusy = true;
            document.getElementById('importIndicator').hidden = false;
            snackbar('Importing media... Please wait...')
            // Read file with progress
            const stat = await fsp.stat(filePath);
            const total = stat.size;
            let loaded = 0;
            const chunks = [];
            const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 8192 });

            await new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    chunks.push(chunk);
                    loaded += chunk.length;
                    // Update progress UI here (0-100%)
                    const percent = Math.floor((loaded / total) * 100);
                    document.getElementById('fsReadProgress').textContent = `Importing media... ${percent}%`;
                });
                stream.on('end', resolve);
                stream.on('error', reject);
            });

            const buffer = Buffer.concat(chunks);
            const ext = path.extname(filePath).toLowerCase()
            const mimeType = getMimeTypeFromExt(ext) // function to map extensions to MIME

            file = new File([buffer], path.basename(filePath), { type: mimeType })
            if (!file) throw new Error('File creation failed');
            scanImport(file) // now file.type always exists
            snackbar('Media Imported!')
            onBusy = false;
            document.getElementById('importIndicator').hidden = true;
            document.getElementById('fsReadProgress').textContent = `Importing media...`;
        } catch (err) {
            onBusy = false;
            document.getElementById('importIndicator').hidden = true;
            document.getElementById('fsReadProgress').textContent = `Importing media...`;
            console.error('Failed to load file:', err)
            alert(`${err}`, 'Import Error')
        }
    } else {
        snackbar('Importing media is still busy. Please wait for it to finish.')
    }
})

const blockAreaDrop = document.getElementById("blockAreaDrop");

let dragCounter = 0; // tracks nested dragenter/dragleave

window.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
});

window.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
});

window.addEventListener("dragleave", (e) => {
    dragCounter--;
});

window.addEventListener("drop", (e) => {
    dragCounter = 0;
});