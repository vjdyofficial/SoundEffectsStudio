let currentSnackbar = null;

function snackbar(message, duration = 3000) {
    // Fade out existing snackbar if any
    if (currentSnackbar) {
        const oldSnackbar = currentSnackbar;
        oldSnackbar.style.opacity = 0;
        oldSnackbar.addEventListener("transitionend", () => oldSnackbar.remove(), { once: true });
    }

    // Create new snackbar
    const s = document.createElement("div");
    s.innerHTML = message;
    s.style.cssText = `
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: #fff !important;
        padding: 10px 20px;
        border-radius: 6px;
        opacity: 0;
        transition: opacity 0.3s ease;
        z-index: 9999;
    `;

    // Force white color on all child elements (including code tags)
    s.querySelectorAll("*").forEach(el => el.style.setProperty("color", "#fff", "important"));

    document.body.appendChild(s);
    currentSnackbar = s;

    // Show
    requestAnimationFrame(() => { s.style.opacity = 1; });

    ipcRenderer.send('show-text', `<span id="overlaytextbold">Main</span><br>${message}`);

    // Hide after duration
    setTimeout(() => {
        s.style.opacity = 0;
        s.addEventListener("transitionend", () => {
            if (currentSnackbar === s) currentSnackbar = null;
            s.remove();
        }, { once: true });
    }, duration);
}