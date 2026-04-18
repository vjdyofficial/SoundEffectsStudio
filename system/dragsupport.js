let file;
const videoformat = ["clickImportMedia1", "clickImportMedia2"]
const captionformat = ["clickImportSubtitle1", "clickImportSubtitle2"]
const audioformat = ["clickImportAudioA", "clickImportAudioB", "clickImportAudioC", "clickImportAudioD"]

function getMimeTypeFromExt(ext) {
    ext = ext.toLowerCase();

    switch (ext) {
        case '.mp3': return 'audio/mpeg';
        case '.wav': return 'audio/wav';
        case '.m4a': return 'audio/mp4';
        case '.weba': return 'audio/weba';
        case '.ogg': return 'audio/ogg';
        case '.opus': return 'audio/opus';
        case '.flac': return 'audio/flac';
        case '.mka': return 'audio/x-matroska';

        case '.mp4': return 'video/mp4';
        case '.webm': return 'video/webm';
        case '.3gp': return 'video/3gpp';
        case '.mov': return 'video/quicktime';
        case '.mkv': return 'video/x-matroska';

        case '.srt': return 'application/x-subrip';
        case '.vtt': return 'text/vtt';

        case '.subw': return 'application/x-subw';
        case '.b64i': return 'application/x-b64i';
        case '.bbcx': return 'application/x-bbcx';

        default: return '';
    }
}

async function scanImport(filePath) {
    try {
        if (!filePath) throw new Error('No file path provided')
        file = filePath;
        const fileName = filePath.split(/[\\/]/).pop()
        const ext = '.' + fileName.split('.').pop().toLowerCase()
        const mimeType = getMimeTypeFromExt(ext)

        if (mimeType.startsWith("video/")) {
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
        } else if (mimeType.startsWith("audio/")) {
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
        } else if (ext === '.srt' || ext === '.vtt') {
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
        } else {
            alert(`File not supported. Please import supported format.`, "Import Error")
        }
    } catch (err) {
        console.error('Failed to load:', err)
        alert(`Cannot import file because: ${err}`, 'Import Error')
    }
}

async function loadBundledMusic(filePath) {
    const fileUrl = pathToFileURL(filePath).href; // safe file:// URL
    await scanImport(filePath)
    snackbar('Media Imported!')
}

// ---------------- IPC import ----------------
let onBusy = false;
ipcRenderer.on('importmedia', async (event, filePath) => {
    if (!onBusy) {
        try {
            onBusy = true;
            document.getElementById('importIndicator').hidden = false;
            console.log(filePath);
            await scanImport(filePath)
            snackbar('Media Imported!')
            onBusy = false;
        } catch (err) {
            onBusy = false;
            console.error('Failed to load file:', err)
            alert(`${err}`, 'Import Error')
        } finally {
            document.getElementById('importIndicator').hidden = true;
        }
    } else {
        snackbar('Importing media is still busy. Please wait.')
    }
})

// Function to open file
async function openMediaFile() {
    const file = await ipcRenderer.invoke('open-supported-file');
    if (!file) return;
    await scanImport(file)
    snackbar('Media Imported!')
}

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