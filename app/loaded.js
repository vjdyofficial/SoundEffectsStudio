if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null;
    // Clear any handlers to prevent media controls from appearing
    navigator.mediaSession.setActionHandler('play', null);
    navigator.mediaSession.setActionHandler('pause', null);
    navigator.mediaSession.setActionHandler('seekbackward', null);
    navigator.mediaSession.setActionHandler('seekforward', null);
    navigator.mediaSession.setActionHandler('previoustrack', null);
    navigator.mediaSession.setActionHandler('nexttrack', null);
    navigator.mediaSession.setActionHandler('stop', null);
}


setTimeout(() => {
    const bootScreen = document.querySelector('.bootscreen');
    if (bootScreen) {
        bootScreen.style.transition = 'opacity 0.5s';
        bootScreen.style.opacity = '0';
        bootScreen.addEventListener('transitionend', () => {
            bootScreen.remove();
        }, { once: true });
    }
}, 2000);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
    }
});