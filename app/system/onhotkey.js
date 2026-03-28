let isTypingZone = false;

document.addEventListener("keydown", (event) => {

    const activeEl = document.activeElement;

    isTypingZone =
        activeEl &&
        (
            activeEl.tagName === "TEXTAREA" ||
            activeEl.tagName === "INPUT" ||
            activeEl.isContentEditable
        );

    const key = event.key;

    if (!isTypingZone &&
        hotkeyAudioMap[key] &&
        !event.repeat &&
        !event.altKey &&
        (document.querySelector('.deckbarbutton[data-editor=A]').dataset.state == 'active')) {

        event.stopPropagation();
        event.preventDefault();

        if (detectSpotlightTutorial()) {
            snackbar('Keybinds disabled while spotlight tutorial is open.');
            return;
        }

        if (saveIndexDialogOpen) return;

        hotkeyAudioMap[key].forEach(idx => {
            const buttonEl = document.querySelector(`[data-audio-btn-index="${idx}"]`);
            if (!buttonEl) return;
            if (letPlayonHotkey && preventDialogfromOpening() == 0) {
                buttonEl.click();
            }
        });
    }

});