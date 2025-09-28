document.addEventListener("keydown", (event) => {
    const activeEl = document.activeElement;
    const isTypingZone = (
        activeEl &&
        activeEl.tagName === 'INPUT' &&
        activeEl.type === 'text'
    );

    // 🎹 Define hotkey-to-audio mapping
    const hotkeyAudioMap = {
        "Insert": ["default/vibraon.mp3"],
        "Delete": ["default/vibraoff.mp3"],
        "q": ["orchhit/hit-c.wav"],
        "w": ["orchhit/hit-d.wav"],
        "e": ["orchhit/hit-e.wav"],
        "r": ["orchhit/hit-f.wav"],
        "t": ["orchhit/hit-g.wav"],
        "y": ["orchhit/hit-a.wav"],
        "u": ["orchhit/hit-b.wav"],
        "i": ["orchhit/hit-c2.wav"],
        "Q": ["orchhit/hit-c.wav"],
        "W": ["orchhit/hit-d.wav"],
        "E": ["orchhit/hit-e.wav"],
        "R": ["orchhit/hit-f.wav"],
        "T": ["orchhit/hit-g.wav"],
        "Y": ["orchhit/hit-a.wav"],
        "U": ["orchhit/hit-b.wav"],
        "I": ["orchhit/hit-c2.wav"],
        "2": ["orchhit/hit-cs.wav"],
        "3": ["orchhit/hit-ds.wav"],
        "5": ["orchhit/hit-fs.wav"],
        "6": ["orchhit/hit-gs.wav"],
        "7": ["orchhit/hit-as.wav"]
    };

    const key = event.key;

    // 🛡️ Only trigger ritual if not typing and key is mapped
    if (!isTypingZone && hotkeyAudioMap[key] && !event.repeat) {
        hotkeyAudioMap[key].forEach(fileName => {
            if (letPlayonHotkey) {
                if (preventDialogfromOpening() == 0) {playAudioSampleMode(fileName)};
            }
        });

        event.stopPropagation();
        event.preventDefault();
    }
});