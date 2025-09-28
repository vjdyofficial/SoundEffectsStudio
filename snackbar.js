let def_duration = 3000;
let duration = 0

function snackbar(text) {
    const parent = document.getElementById('snackbars');

    // Create a new snackbar element
    const snackbar = document.createElement('div');
    snackbar.classList.add('snackbar');
    snackbar.innerHTML = text;

    // Append to parent
    parent.appendChild(snackbar);

    // Trigger show animation (next frame so CSS transition works)
    requestAnimationFrame(() => {
        snackbar.classList.add('show');
    });

    // Start hide sequence after 3s
    setTimeout(() => {
        snackbar.classList.remove('show');
        snackbar.classList.add('hide');

        // Remove from DOM after fade-out
        setTimeout(() => {
            snackbar.remove();
        }, 500);
    }, 3000);
}