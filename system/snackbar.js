// Snackbar notification system for the application.
// This module provides a simple way to display temporary notifications
// to the user.

let currentSnackbar = null;

function snackbar(message, text = 'Notification', duration = 3000) {
    // Fade out existing snackbar
    if (currentSnackbar) {
        const old = currentSnackbar;
        old.classList.remove("show");
        old.addEventListener("transitionend", () => old.remove(), { once: true });
    }

    const s = document.createElement("div");
    s.className = "md-snackbar";
    s.innerHTML = `<span class="md-snackbar-text"><small>${text}</small><br>${message}</span>`;

    document.body.appendChild(s);
    currentSnackbar = s;

    s.offsetHeight;

    s.classList.add("show");

    setTimeout(() => {
        s.classList.remove("show");
        s.addEventListener("transitionend", () => {
            if (currentSnackbar === s) currentSnackbar = null;
            s.remove();
        }, { once: true });
    }, duration);
}