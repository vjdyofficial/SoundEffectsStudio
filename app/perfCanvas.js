const perfCanvas = document.getElementById('spectrum');
const ctx = perfCanvas.getContext('2d');

// Set your perfCanvas size here
perfCanvas.width = 50;
perfCanvas.height = 28;

let fpsHistory = [];
let cpuHistory = [];

function getCPU() {
    const start = performance.now();

    // Simulated busy-work loop
    for (let i = 0; i < 1e5; i++) {
        Math.sqrt(i); // pretend workload
    }

    const duration = performance.now() - start;

    // Simulated CPU usage: normalize duration to ~0–100%
    const cpuPercent = Math.min(100, Math.round((duration / 16.67) * 100)); // ~16.67ms = 60FPS frame budget
    return Math.min(Math.max(cpuPercent, 0), 144);
}

let lastFrame = performance.now();
function getFPS() {
    const now = performance.now();
    const fps = 1000 / (now - lastFrame);
    lastFrame = now;
    return Math.min(Math.max(fps, 0), 144);
}

function drawGraph(data, color, sectionIndex, totalSections) {
    const sectionHeight = perfCanvas.height / totalSections;
    const bottom = sectionHeight * (sectionIndex + 1);
    
    ctx.strokeStyle = color;
    ctx.beginPath();
    data.forEach((value, i) => {
        const x = (i / data.length) * perfCanvas.width;
        const y = bottom - (value / 100) * sectionHeight;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function update() {
    const fps = getFPS();
    const cpu = getCPU();

    fpsHistory.push((fps / 144) * 100);
    cpuHistory.push(cpu);

    ctx.clearRect(0, 0, perfCanvas.width, perfCanvas.height);

    const maxPoints = 200; // resolution
    if (fpsHistory.length > maxPoints) fpsHistory.shift();
    if (cpuHistory.length > maxPoints) cpuHistory.shift();

    ctx.fillStyle = "#00000000";
    ctx.fillRect(0, 0, perfCanvas.width, perfCanvas.height);

    // Check if the user prefers dark mode
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (isDarkMode) {
        drawGraph(fpsHistory, "#dfff93", 0, 2);
        drawGraph(cpuHistory, "#77f8f4", 1, 2);
    } else {
        drawGraph(fpsHistory, "#3d442d", 0, 2);
        drawGraph(cpuHistory, "#314e4d", 1, 2);
    }

    requestAnimationFrame(update);
}

update();