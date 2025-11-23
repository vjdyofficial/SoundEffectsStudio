// === Audio Context Listen Stream Setup ===
// 🎧 Elements
const listenSelector = document.getElementById('listenSelector');
const listenCanvas = document.getElementById('listenCanvas');
const listenCanvasPreview = document.getElementById('listenCanvasPreview');
const listenCanvasCtx = listenCanvas.getContext('2d');
const listenCanvasPreviewCtx = listenCanvasPreview.getContext('2d');

listenCanvas.width = 100;
listenCanvas.height = 38;

listenCanvasPreview.width = 100;
listenCanvasPreview.height = 38;

let listenStream = null;
let listenSource = null;
let listenMixerNode = audioCtx.createGain(); // dedicated mixer node
listenMixerNode.gain.value = 1.0;

let outputMixerNode = audioCtx.createGain(); // dedicated mixer node
outputMixerNode.gain.value = 1.0;

let listenAnalyser = audioCtx.createAnalyser();
listenAnalyser.fftSize = 256;
let listenDataArray = new Uint8Array(listenAnalyser.frequencyBinCount);

// 🧩 Ensure saved key exists and load value
if (localStorage.getItem('preferredListenId') === null) {
    localStorage.setItem('preferredListenId', "-2"); // default to disable
}
let savedListenId = localStorage.getItem('preferredListenId');

// === Activate Listen Stream ===
function activateListen(deviceId) {
    if (listenStream) {
        listenStream.getTracks().forEach(track => track.stop());
        listenStream = null;
    }
    if (listenSource) {
        try { listenSource.disconnect(); } catch { }
        listenSource = null;
    }

    const constraints = {
        audio: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2,
            latencyHint: 'interactive'
        }
    };
    
    navigator.mediaDevices.getUserMedia(constraints)
        .then(stream => {
            listenStream = stream;
            console.log(stream.getAudioTracks())
            // Connect to AudioContext chain
            listenSource = audioCtx.createMediaStreamSource(stream);
            listenSource.connect(listenMixerNode);
            listenMixerNode.connect(listenAnalyser);
            listenAnalyser.connect(faderNode); // optional output
            listenAnalyser.connect(outputMixerNode); // optional output
            listenAnalyser.connect(meterMixerNode);
            document.getElementById('info_mic2').innerHTML = `${listenSelector.options[listenSelector.selectedIndex].textContent}`
        })
        .catch(err => snackbar(`Listen error<br><code>${err.message}</code>`));
}

// === Disconnect Listen ===
function disconnectListen() {
    document.getElementById('info_mic2').innerHTML = `null`
    if (listenSource) {
        try { listenSource.disconnect(); } catch { }
        listenSource = null;
    }
    if (listenStream) {
        listenStream.getTracks().forEach(track => track.stop());
        listenStream = null;
    }
}

// === Handle selection changes ===
listenSelector.addEventListener('change', () => {
    const selectedId = listenSelector.value;
    selectedId === "-2" ? disconnectListen() :
        selectedId === savedMicId ? alert('You cannot use same audio devices to input and output. Please use different audio device.', 'Output Device Select Error')
            : activateListen(selectedId);

    if (selectedId != savedMicId || selectedId == "-2" && savedMicId == "-2") {
        localStorage.setItem('preferredListenId', selectedId);
        savedListenId = localStorage.getItem('preferredListenId');
    } else {
        listenSelector.value = savedListenId;
    }
});

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', event => {
        refreshDevices();
        ipcRenderer.send('video-reconnect', true);
        if (recorder.state !== "inactive" || recorder.state === "recording") {
            recorder.pause();
        }
    });
}

document.getElementById('reconnectButton').addEventListener("click", () => {
    refreshDevices();
});