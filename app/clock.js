(() => {
    // month abbreviations for "DD MMM YYYY"
    const MONTHS = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];

    const $time = document.getElementById('time');
    const $ampm = document.getElementById('ampm');
    const $date = document.getElementById('date');

    // format number with leading zero
    const pad = (n) => n.toString().padStart(2, '0');
    let withcolon = false

    function updateClock() {
        const now = new Date();

        // Hours in 12-hour format with leading zero
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';

        // convert to 12-hour; keep leading zero for hours like 08
        hours = hours % 12;
        if (hours === 0) hours = 12; // 12 AM / 12 PM
        const hoursStr = pad(hours);

        const mins = pad(now.getMinutes());

        // Time string: "HH:mm" with AM/PM shown in separate element
        if (!withcolon) {
            withcolon = true;
        } else if (withcolon) {
            withcolon = false;
        }

        $time.textContent = withcolon ? `${hoursStr}:${mins} ` : `${hoursStr} ${mins} `;
        $ampm.textContent = ampm;

        // Date string: "DD MMM YYYY"
        const day = pad(now.getDate());
        const mon = MONTHS[now.getMonth()];
        const year = now.getFullYear();
        $date.textContent = `${day} ${mon} ${year}`;
    }

    // update immediately, then every second (no heavy work)
    updateClock();
    setInterval(updateClock, 500);

    let lastFrame = performance.now();
    let fps = 0;

    // --- Functions ---
    function getFPS() {
        const now = performance.now();
        fps = Math.min(144, Math.max(0, 1000 / (now - lastFrame)));
        lastFrame = now;
        return fps;
    }

    setInterval(async () => {
        ipcRenderer.send('memory-update', {
            windowName: 'Clock', // give a unique name per window
            memory: {
                fpsRate: fps.toFixed(1),
            }
        });
    }, 1000);

    // --- Main loop ---
    function updateFPS() {
        getFPS();
        requestAnimationFrame(updateFPS);
    }

    updateFPS();
})();