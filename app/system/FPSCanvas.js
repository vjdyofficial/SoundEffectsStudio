let skipFrames = 0;
let frameCounter = 0;

const skipFramesSelector = document.getElementById('skipFramesSelector');

// 🗂️ Load saved value from localStorage
const savedSkip = localStorage.getItem('skipFrames');
if (savedSkip !== null) {
    skipFrames = parseInt(savedSkip);
    skipFramesSelector.value = savedSkip;
    ipcRenderer.send('frames', skipFrames);
}

// 📝 Update skipFrames and save to localStorage
skipFramesSelector.addEventListener('change', () => {
    skipFrames = parseInt(skipFramesSelector.value);
    localStorage.setItem('skipFrames', skipFrames);
    ipcRenderer.send('frames', skipFrames);
});