const toggle = document.getElementById('hwToggle');

toggle.addEventListener('change', () => {
    ipcRenderer.send('set-hw-acceleration', toggle.checked);
});

ipcRenderer.on('hw-acceleration-updated', (_, enabled) => {
    const dialogOnInit = document.getElementById('settingsDialog');
    CloseAnimationInit(dialogOnInit);
    document.getElementById('hwDialog').show();
    document.getElementById('hwstatus').textContent =
        enabled ?
            `enabled. The app will now use GPU rendering for smoother animations and video playback. ` +
            `This enhances the External Visualizer from posterize issues.`
            : 
            `disabled. The app will now rely on software rendering (CPU-based). ` + 
            `This may reduce performance but can help fix black screens or driver issues. \n\n` +
            `Take note that the External Visualizer will not posterize really well and cause the app to drop frames.`
        ;
});

ipcRenderer.on('hwtoggle', (event, bool) => {
    toggle.checked = bool;
})