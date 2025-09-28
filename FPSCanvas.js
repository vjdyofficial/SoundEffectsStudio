let skipFrames = 0;
let frameCounter = 0;

const skipFramesSelector = document.getElementById('skipFramesSelector');

// 🗂️ Load saved value from localStorage
const savedSkip = localStorage.getItem('skipFrames');
if (savedSkip !== null) {
    skipFrames = parseInt(savedSkip);
    skipFramesSelector.value = savedSkip;
    console.log(`🔄 Restored skipFrames: ${skipFrames}`);
}

// 📝 Update skipFrames and save to localStorage
skipFramesSelector.addEventListener('change', () => {
    skipFrames = parseInt(skipFramesSelector.value);
    localStorage.setItem('skipFrames', skipFrames);
    console.log(`💾 Saved skipFrames: ${skipFrames}`);
});

function loopVisualizer() {
    const frame = skipFrames = -2 ? 0 : 16;
    setInterval(() => {
        if (frameCounter % (skipFrames + 1) === 0) {
            updateAudioVisualizer();
        }
        frameCounter++;
    }, frame); // ~60 FPS
}

function loopVisualizer2() {
    const frame = skipFrames = -2 ? 0 : 16;
    setInterval(() => {
        if (frameCounter % (skipFrames + 1) === 0) {
            updateVisualizer2();
        }
        frameCounter++;
    }, frame); // ~60 FPS
}

loopVisualizer();
loopVisualizer2();