const toggle = document.getElementById('hwToggle');

toggle.addEventListener('change', () => {
    ipcRenderer.send('set-hw-acceleration', toggle.checked);
});

ipcRenderer.on('hw-acceleration-updated', (_, enabled) => {
    if (enabled) {
        alert(
            `Hardware acceleration has been enabled. Please restart the application for the changes to take effect.`,
            "GPU acceleration enabled", true, false);
    } else {
        alert(
            `Hardware acceleration has been disabled. Please restart the application for the changes to take effect.`,
            "GPU acceleration disabled", true, false);
    }
});

ipcRenderer.on('hwtoggle', (event, bool) => {
    toggle.checked = bool;
});