const scaler = document.getElementById("overlaytext");
const captionText1 = document.getElementById("captionText1");
const captionText2 = document.getElementById("captionText2");
const captionTextLyrics = document.getElementById("captionTextLyrics");
const captionTextLyrics2 = document.getElementById("captionTextLyrics2");
const captionTextLyrics3 = document.getElementById("captionTextLyrics3");
const captionTextLyrics4 = document.getElementById("captionTextLyrics");
const video = document.getElementById('media');
const canvas = document.getElementById('c1');
const { ipcRenderer } = require('electron');

let posterize = false
let time = 5000;
let alignment = 'flex-end'
let innerWidth = window.innerWidth;
let innerHeight = window.innerHeight;
let videoTime = 0;

setInterval(() => {
    if (time >= 5000) {
        document.getElementById('scaler').style.opacity = 0;
    } else {
        time = time + 500
    }
}, 500);

function resizeFont() {
    const baseWidth = 1280;  // reference width
    const baseHeight = 720;  // reference height
    const baseFont = 44;     // font size at base resolution
    const baseFont2 = 64;     // font size at base resolution

    async function resiveCanvas(id) {
        const canvas = document.getElementById(id);
        const w = window.innerWidth;
        const h = window.innerHeight;
        canvas.width = w;
        canvas.height = h;
    }

    resiveCanvas("visualizer");

    const scaleW = window.innerWidth / baseWidth;
    const scaleH = window.innerHeight / baseHeight;

    innerWidth = window.innerWidth;
    innerHeight = window.innerHeight;

    // geometric mean gives proportional scale for both dimensions
    const scale = Math.sqrt(scaleW * scaleH);
    const newFont = Math.max(baseFont * scale, 10);
    const newFont2 = Math.max(baseFont2 * scale, 10);

    scaler.style.fontSize = `${newFont}px`;
    captionText1.style.fontSize = `${newFont}px`;
    captionText2.style.fontSize = `${newFont}px`;
    captionTextLyrics.style.fontSize = `${newFont}px`;
    captionTextLyrics2.style.fontSize = `${newFont}px`;
    captionTextLyrics3.style.fontSize = `${newFont}px`;
    captionTextLyrics4.style.fontSize = `${newFont}px`;
    document.documentElement.style.setProperty('--fontsize-to-subtitle', `${newFont}px`);
    document.documentElement.style.setProperty('--fontsize-to-teleprompt', `${newFont2}px`);

    const scaleWBlur = window.innerWidth / 640;
    const scaleHBlur = window.innerHeight / 480;

    // choose the limiting side so UI stays proportional
    const scaleBlur = Math.min(scaleWBlur, scaleHBlur) * 1;

    document.documentElement.style.setProperty("--scale", scaleBlur);
}


window.addEventListener('resize', resizeFont);

window.addEventListener('DOMContentLoaded', () => {
    resizeFont(); // call once on load
});

function updateBars(dataArray) {
    const container = document.getElementById('visualizer');
    const audioCanvasCtx = container.getContext('2d');
    audioCanvasCtx.imageSmoothingEnabled = false;
    const data = dataArray
    audioCanvasCtx.clearRect(0, 0, container.width, container.height);
    const barWidth = container.width / data.length;

    for (let i = 0; i < data.length; i++) {
        const value = data[i];
        const barHeight = (value / 255) * container.height;
        const x = i * barWidth;
        let y;
        if (alignment === 'flex-end') {
            // bottom aligned
            y = container.height - barHeight;
        } else if (alignment === 'flex-start') {
            // top aligned
            y = 0;
        } else {
            // center aligned
            y = (container.height - barHeight) / 2;
        }


        audioCanvasCtx.fillStyle = '#fff'
        audioCanvasCtx.fillRect(x, y, barWidth + 2, barHeight);
    }
}

function updateCircleBars(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const total = dataArray.length;
    const angleStep = (2 * Math.PI) / total;
    const maxBarLength = Math.min(centerX, centerY) * 0.9; // max bar length

    for (let i = 0; i < total; i++) {
        const value = dataArray[i];
        const barLength = (value / 255) * maxBarLength;
        const angle = i * angleStep;

        // coordinates for the bar
        const xStart = centerX + Math.cos(angle) * (maxBarLength * 0.3); // inner radius
        const yStart = centerY + Math.sin(angle) * (maxBarLength * 0.3);
        const xEnd = centerX + Math.cos(angle) * (maxBarLength * 0.3 + barLength);
        const yEnd = centerY + Math.sin(angle) * (maxBarLength * 0.3 + barLength);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 16; // like your bars
        ctx.beginPath();
        ctx.moveTo(xStart, yStart);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();
    }
}

let scale = 0.5;

function updateCubeVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // fade previous frame for alpha trail
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // cube size scales with canvas, but clamp to avoid too large on 4K
    const minDim = Math.min(canvas.width, canvas.height);
    const size = Math.max(60, Math.min(minDim * scale, minDim * 0.35));

    // static rotation variables stored in canvas element
    if (!canvas._rotation) canvas._rotation = { x: 0, y: 0 };

    // rotation speed based on audio peaks
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    canvas._rotation.x += avg / 5000;
    canvas._rotation.y += avg / 7000;

    // Reset rotation if >= 360, but keep overflow
    if (canvas._rotation.x >= 360) canvas._rotation.x -= 360;
    if (canvas._rotation.y >= 360) canvas._rotation.y -= 360;

    const rotationX = canvas._rotation.x;
    const rotationY = canvas._rotation.y;

    // Field of view: lock to avoid distortion on 4K screens
    const fov = Math.max(300, Math.min(minDim, 900)); // lock FOV between 300 and 900

    // simple 3D projection
    function project(x, y, z) {
        const scaleProj = fov / (fov + z);
        return {
            x: canvas.width / 2 + x * scaleProj,
            y: canvas.height / 2 - y * scaleProj,
            s: scaleProj
        };
    }

    // cube vertices
    const vertices = [
        [-1, -1, -1],
        [1, -1, -1],
        [1, 1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1]
    ].map(([x, y, z]) => {
        x *= size; y *= size; z *= size;
        // rotate X
        let y1 = y * Math.cos(rotationX) - z * Math.sin(rotationX);
        let z1 = y * Math.sin(rotationX) + z * Math.cos(rotationX);
        // rotate Y
        let x1 = x * Math.cos(rotationY) + z1 * Math.sin(rotationY);
        let z2 = -x * Math.sin(rotationY) + z1 * Math.cos(rotationY);
        return project(x1, y1, z2);
    });

    // cube edges
    const edges = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7]
    ];

    // Line width based on canvas size (resolution independent)
    const lineWidth = Math.max(2, Math.round(minDim * 0.008));

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = lineWidth;

    // Draw edges as rectangles for consistent thickness
    edges.forEach(([a, b]) => {
        const v0 = vertices[a];
        const v1 = vertices[b];
        const dx = v1.x - v0.x;
        const dy = v1.y - v0.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.translate(v0.x, v0.y);
        ctx.rotate(angle);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, -lineWidth / 2, len, lineWidth);
        ctx.restore();
    });
}

function updateCylinderVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const minDim = Math.min(canvas.width, canvas.height);
    const radius = Math.max(60, Math.min(minDim * 0.24, minDim * 0.35));
    const height = radius * 2;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Rotation
    if (!canvas._rotationCylinder) canvas._rotationCylinder = { y: 0 };
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    canvas._rotationCylinder.y += avg / 7000;
    if (canvas._rotationCylinder.y >= 360) canvas._rotationCylinder.y -= 360;

    const rotationY = canvas._rotationCylinder.y;

    // Draw vertical bars around a cylinder
    const numBars = dataArray.length;
    for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * 2 * Math.PI + rotationY;
        const value = dataArray[i];
        const barHeight = (value / 255) * height * 0.7 + height * 0.15;

        // 3D projection for ellipse
        const x = centerX + Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const scaleProj = 0.6 + 0.4 * (1 - z / radius); // fake perspective

        ctx.save();
        ctx.globalAlpha = 0.7 * scaleProj;
        ctx.fillStyle = `hsl(${(i / numBars) * 360}, 100%, 60%)`;
        ctx.fillRect(
            x - 4 * scaleProj,
            centerY - barHeight / 2,
            8 * scaleProj,
            barHeight
        );
        ctx.restore();
    }

    // Draw top and bottom ellipses
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - height / 2, radius, radius * 0.3, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + height / 2, radius, radius * 0.3, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
}

function updateConeVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const minDim = Math.min(canvas.width, canvas.height);
    const baseRadius = Math.max(60, Math.min(minDim * scale, minDim * 0.35));
    const height = baseRadius * 2;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2 + height / 4;

    // Rotation
    if (!canvas._rotationCone) canvas._rotationCone = { y: 0 };
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    canvas._rotationCone.y += avg / 7000;
    if (canvas._rotationCone.y >= 360) canvas._rotationCone.y -= 360;
    const rotationY = canvas._rotationCone.y;

    // Draw bars from base to tip
    const numBars = dataArray.length;
    for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * 2 * Math.PI + rotationY;
        const value = dataArray[i];
        const barLength = (value / 255) * height * 0.7 + height * 0.15;

        // Base point (ellipse)
        const xBase = centerX + Math.cos(angle) * baseRadius;
        const z = Math.sin(angle) * baseRadius;
        const scaleProj = 0.6 + 0.4 * (1 - z / baseRadius); // fake perspective
        const yBase = centerY + baseRadius * 0.3 * Math.sin(angle);

        // Tip of cone
        const xTip = centerX;
        const yTip = centerY - height / 2 - barLength * 0.2;

        ctx.save();
        ctx.globalAlpha = 0.7 * scaleProj;
        ctx.strokeStyle = `hsl(${(i / numBars) * 360}, 100%, 60%)`;
        ctx.lineWidth = 4 * scaleProj;
        ctx.beginPath();
        ctx.moveTo(xBase, yBase);
        ctx.lineTo(xTip, yTip);
        ctx.stroke();
        ctx.restore();
    }

    // Draw base ellipse
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, baseRadius, baseRadius * 0.3, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
}

function updatePyramidVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const minDim = Math.min(canvas.width, canvas.height);
    const baseSize = Math.max(60, Math.min(minDim * scale, minDim * 0.35));
    const height = baseSize * 1.5;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2 + baseSize / 2;

    // Rotation
    if (!canvas._rotationPyramid) canvas._rotationPyramid = { y: 0 };
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    canvas._rotationPyramid.y += avg / 7000;

    if (canvas._rotationPyramid.y >= 360) canvas._rotationPyramid.y -= 360;
    const rotationY = canvas._rotationPyramid.y;

    // Pyramid base vertices (square)
    const baseVerts = [];
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * 2 * Math.PI + rotationY;
        const x = centerX + Math.cos(angle) * baseSize;
        const y = centerY + Math.sin(angle) * baseSize * 0.5;
        baseVerts.push({ x, y, angle });
    }

    // Tip of pyramid
    const tip = { x: centerX, y: centerY - height };

    // Draw faces with color based on dataArray
    for (let i = 0; i < 4; i++) {
        const next = (i + 1) % 4;
        const value = dataArray[i % dataArray.length];
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(baseVerts[i].x, baseVerts[i].y);
        ctx.lineTo(baseVerts[next].x, baseVerts[next].y);
        ctx.closePath();
        ctx.fillStyle = `hsl(${(i / 4) * 360}, 100%, 60%, ${0.5 + 0.5 * (value / 255)})`;
        ctx.fill();
        ctx.restore();
    }

    // Draw base
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#fff';
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
        ctx.lineTo(baseVerts[i].x, baseVerts[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
}

function updateSphereVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // Fade previous frame for alpha trail
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const minDim = Math.min(canvas.width, canvas.height);
    const radius = Math.max(60, Math.min(minDim * scale, minDim * 0.35));

    // Static rotation variables stored in canvas element
    if (!canvas._rotationSphere) canvas._rotationSphere = { x: 0, y: 0 };
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    canvas._rotationSphere.x += avg / 5000;
    canvas._rotationSphere.y += avg / 7000;

    if (canvas._rotationSphere.x >= 360) canvas._rotationSphere.x -= 360;
    if (canvas._rotationSphere.y >= 360) canvas._rotationSphere.y -= 360;

    const rotationX = canvas._rotationSphere.x;
    const rotationY = canvas._rotationSphere.y;

    // Sphere vertices (icosphere-like, but simple latitude/longitude grid)
    const latSteps = 12;
    const lonSteps = dataArray.length;
    const vertices = [];

    for (let lat = 0; lat <= latSteps; lat++) {
        const theta = (lat * Math.PI) / latSteps;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon < lonSteps; lon++) {
            const phi = (lon * 2 * Math.PI) / lonSteps;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);

            // Modulate radius by audio data
            const value = dataArray[lon];
            const modRadius = radius + (value / 255) * (radius * 0.3);

            let x = modRadius * sinTheta * cosPhi;
            let y = modRadius * cosTheta;
            let z = modRadius * sinTheta * sinPhi;

            // Rotate X
            let y1 = y * Math.cos(rotationX) - z * Math.sin(rotationX);
            let z1 = y * Math.sin(rotationX) + z * Math.cos(rotationX);
            // Rotate Y
            let x1 = x * Math.cos(rotationY) + z1 * Math.sin(rotationY);
            let z2 = -x * Math.sin(rotationY) + z1 * Math.cos(rotationY);

            // Project to 2D
            const fov = Math.max(300, Math.min(minDim, 900));
            const scaleProj = fov / (fov + z2);
            vertices.push({
                x: canvas.width / 2 + x1 * scaleProj,
                y: canvas.height / 2 - y1 * scaleProj,
                s: scaleProj
            });
        }
    }

    // Draw points as circles for each vertex
    ctx.fillStyle = '#fff';
    const pointSize = Math.max(2, Math.round(minDim * 0.01));
    for (const v of vertices) {
        ctx.beginPath();
        ctx.arc(v.x, v.y, pointSize * v.s, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function updateVLC3DSpectrum(dataArray, state = {}) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const numBins = dataArray.length;
    const size = Math.min(canvas.width, canvas.height);

    const maxBarHeight = size * 0.6;
    const spacing = size * 0.05;
    const barWidth = size * 0.03;

    // store tilt state
    if (!state.tilt) state.tilt = 0;

    // oscillate tilt based on audio average
    const avg = dataArray.reduce((a, b) => a + b, 0) / numBins;
    state.tilt = Math.sin(avg / 1000) * 0.3; // left-right tilt factor

    // center of canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    for (let i = 0; i < numBins; i++) {
        const value = dataArray[i] / 255;
        const barHeight = Math.max(value * maxBarHeight, 2);

        // x position with spacing
        const x = (i - numBins / 2) * spacing;

        // apply tilt effect: x moves slightly up/down based on tilt
        const tiltOffset = x * state.tilt;

        // perspective scale: bars closer to center slightly bigger
        const scale = 0.8 + 0.2 * (1 - Math.abs(x) / (numBins / 2 * spacing));

        const rectWidth = barWidth * scale;
        const rectHeight = barHeight * scale;

        const rectX = centerX + x - rectWidth / 2;
        const rectY = centerY - rectHeight / 2 - tiltOffset;

        // main bar
        const shade = 0.5 + 0.5 * scale; // lighter at center
        ctx.fillStyle = `rgba(${255 * shade}, ${255 * shade}, ${255 * shade}, 1)`;
        ctx.fillRect(rectX, rectY, rectWidth, rectHeight);

        // side for pseudo-3D depth
        ctx.fillStyle = `rgba(180,180,180,${0.3 * scale})`;
        ctx.fillRect(rectX + rectWidth * 0.5, rectY, rectWidth * 0.5, rectHeight);
    }
}

function updateBatteryVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // instead of clearing fully, fade previous frame for alpha trail
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'; // alpha transparency for fading
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const numBins = dataArray.length;
    const barWidth = canvas.width / numBins * 0.8; // spacing between bars
    const maxBarHeight = canvas.height * 0.8; // leave top/bottom margin

    for (let i = 0; i < numBins; i++) {
        const value = dataArray[i];
        const barHeight = (value / 255) * maxBarHeight;

        const x = i * (canvas.width / numBins) + (canvas.width / numBins - barWidth) / 2;
        const y = canvas.height - barHeight; // bottom-aligned

        // alpha gradient for "scope" feel
        const alpha = Math.max(0.3, value / 255);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;

        ctx.fillRect(x, y, barWidth, barHeight);
    }
}

function updateAlchemyVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // fade previous frame for smooth trails
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) * 0.5;
    const numPoints = dataArray.length;

    // rotation angle stored in canvas (independent of dataArray)
    if (!canvas._rotation2) canvas._rotation2 = 0;
    canvas._rotation2 += 0.01; // slow constant rotation

    const rotation = canvas._rotation2;

    // size of the square scales with canvas
    const squareSize = Math.max(1, Math.min(canvas.width, canvas.height) * 0.01);

    for (let i = 0; i < numPoints; i++) {
        const value = dataArray[i];
        const angle = (i / numPoints) * 2 * Math.PI + rotation;
        const dist = radius + (value / 255) * radius;

        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;

        // color based on value
        const hue = (i / numPoints) * 360;
        const alpha = Math.max(0.3, value / 255);
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;

        // draw squares instead of circles
        ctx.fillRect(x - squareSize / 2, y - squareSize / 2, squareSize, squareSize);
    }
}

function updateGoomVisualizer(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // fade previous frame for smooth trails
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const maxRadius = Math.min(canvas.width, canvas.height) * 0.3;
    const numBlobs = dataArray.length;

    // animate rotation or movement over time
    if (!canvas._goom) canvas._goom = { rotation: 0 };
    canvas._goom.rotation += 0.005;

    const rotation = canvas._goom.rotation;

    for (let i = 0; i < numBlobs; i++) {
        const value = dataArray[i];
        const angle = (i / numBlobs) * 2 * Math.PI + rotation;

        // blob distance from center depends on audio value
        const dist = (value / 255) * maxRadius;

        const x = centerX + Math.cos(angle) * dist;
        const y = centerY + Math.sin(angle) * dist;

        // color based on frequency index
        const hue = (i / numBlobs) * 360;
        const alpha = Math.max(0.2, value / 255);
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${alpha})`;

        // draw blob as square to be resolution independent
        const blobSize = Math.max(2, Math.min(canvas.width, canvas.height) * 0.015);
        ctx.fillRect(x - blobSize / 2, y - blobSize / 2, blobSize, blobSize);
    }
}

function updateCircularBars(dataArray) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(canvas.width, canvas.height) * 0.18;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Bar thickness scales with canvas size
    const barThickness = Math.max(2, Math.min(canvas.width, canvas.height) * 0.012);

    for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i];
        const barHeight = (value / 255) * radius * 1.25;
        const angle = (i / dataArray.length) * Math.PI * 2;
        const hue = i * (360 / dataArray.length);

        // Rectangle center position (middle of bar)
        const midRadius = radius + barHeight / 2;
        const x = centerX + Math.cos(angle) * midRadius;
        const y = centerY + Math.sin(angle) * midRadius;

        // Rectangle rotation
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.fillRect(
            -barHeight / 2, // x: center the rectangle along the bar
            -barThickness / 2, // y: center thickness
            barHeight, // width: length of the bar
            barThickness // height: thickness
        );

        ctx.restore();
    }
}

function drawScope(dataArray, peak1, peak2) {

    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    const width = canvas.width;
    const height = canvas.height;

    // fade background
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, width, height);

    const rawDataArray = dataArray;

    // --- peak normalize ---
    const peakMix = Math.max(peak1, peak2);
    const gain = 0.4 + peakMix * 1.6;

    // --- color ---
    const damping = 0.05 + peakMix ** 0.6;
    const hue = 180 * damping;

    // ⚠️ your version missed backticks — this breaks color
    ctx.strokeStyle = `hsl(${hue},100%,55%)`;

    ctx.lineWidth = 20 * scale;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // --- zero-cross trigger ---
    let trigger = 0;
    for (let i = 1; i < rawDataArray.length; i++) {
        if (rawDataArray[i - 1] < 128 && rawDataArray[i] >= 128) {
            trigger = i;
            break;
        }
    }

    // --- PRECOMPUTE ratio (big screen fix) ---
    const ratio = rawDataArray.length / width;

    ctx.beginPath();

    for (let x = 0; x < width; x++) {

        let idx = trigger + (x * ratio) | 0;
        if (idx >= rawDataArray.length) idx -= rawDataArray.length;

        const normalized = (rawDataArray[idx] - 128) / 128;
        const y = height / 2 - normalized * height * 0.46 * gain;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }

    ctx.stroke();
}

function drawSpectrogram(data) {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const width = canvas.width;
    const height = canvas.height;
    const columnWidth = (canvas.width / 200); // scroll speed per frame

    // --- scroll old image left ---
    const oldImage = ctx.getImageData(columnWidth, 0, width - columnWidth, height);
    ctx.putImageData(oldImage, 0, 0);
    ctx.clearRect(width - columnWidth, 0, columnWidth, height);

    for (let i = 0; i < data.length; i++) {
        const value = data[i] / 255; // normalize 0–1
        const y = height - (i / data.length) * height;

        let r = 0, g = 0, b = 0;

        if (value > 0) {
            const t = value;

            if (t < 0.25) {
                // black → dark violet
                const tt = t / 0.25;
                r = 48 * tt;
                g = 0;
                b = 64 * tt;
            } else if (t < 0.5) {
                // dark violet → magenta
                const tt = (t - 0.25) / 0.25;
                r = 48 + (128 - 48) * tt;
                g = 0;
                b = 64 + (128 - 64) * tt;
            } else if (t < 0.75) {
                // magenta → orange
                const tt = (t - 0.5) / 0.25;
                r = 128 + (255 - 128) * tt;
                g = 0 + (128 - 0) * tt;
                b = 128 - (128 * tt);
            } else if (t < 0.95) {
                // orange → yellow
                const tt = (t - 0.75) / 0.2;
                r = 255;
                g = 128 + (127 * tt); // 128 → 255
                b = 0;
            } else {
                // 0.95 → 1.0 : yellow → white
                const tt = (t - 0.95) / 0.05;
                r = 255;
                g = 255;
                b = 0 + 255 * tt; // subtle white overlay
            }
        }

        ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
        ctx.fillRect(
            width - columnWidth,
            y,
            columnWidth,
            height / data.length + 1
        );
    }
}

let visualValue = 0;

const spectrumState = { tilt: 0 };
let targetScale = 0.5;
let ramping = false;

const ChannelWidget_External = new BroadcastChannel('widget_external');

ChannelWidget_External.onmessage = (event) => {
    if (!posterize) {
        if (event.data.type === 'DATA_ARRAY') {
            const dataArray = event.data.array;
            const { levelL, levelR } = event.data.peaks;
            if (visualValue == 0) {
                updateBars(dataArray); // Your flavor-reactive function
            } else if (visualValue == 1) {
                updateCircleBars(dataArray)
            } else if (visualValue == 2) {
                updateCubeVisualizer(dataArray)
            } else if (visualValue == 3) {
                updateSphereVisualizer(dataArray)
            } else if (visualValue == 4) {
                updateConeVisualizer(dataArray)
            } else if (visualValue == 5) {
                updatePyramidVisualizer(dataArray)
            } else if (visualValue == 6) {
                updateCylinderVisualizer(dataArray)
            } else if (visualValue == 7) {
                updateVLC3DSpectrum(dataArray, spectrumState)
            } else if (visualValue == 8) {
                updateBatteryVisualizer(dataArray)
            } else if (visualValue == 9) {
                updateAlchemyVisualizer(dataArray)
            } else if (visualValue == 10) {
                updateGoomVisualizer(dataArray)
            } else if (visualValue == 11) {
                updateCircularBars(dataArray)
            } else if (visualValue == 12) {
                drawScope(dataArray, levelL, levelR)
            } else if (visualValue == 13) {
                drawSpectrogram(dataArray)
            }

            const newScale = Math.max(0.10, (levelL + levelR) * 0.1);

            if (newScale > scale) {
                // Immediate attack
                scale = newScale;
                targetScale = newScale;
                ramping = false;
            } else {
                // Smooth release
                targetScale = newScale;
                if (!ramping) {
                    ramping = true;
                    const ramp = () => {
                        if (scale > targetScale) {
                            scale -= Math.max(0.005, (scale - targetScale) * 0.2);
                            if (scale < targetScale) scale = targetScale;
                            requestAnimationFrame(ramp);
                        } else {
                            ramping = false;
                        }
                    };
                    ramp();
                }
            }
        }
    }
}

ipcRenderer.on('sendWaveformType', (event, index) => {
    visualValue = index;
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (visualValue >= 9) {
        document.getElementById('visualizerlayer0').hidden = true;
        document.getElementById('visualizerlayer1').hidden = true;
    } else if (visualValue >= 2) {
        document.getElementById('visualizerlayer0').hidden = true;
        document.getElementById('visualizerlayer1').hidden = false;
    } else {
        document.getElementById('visualizerlayer0').hidden = false;
        document.getElementById('visualizerlayer1').hidden = false;
    }
});

ipcRenderer.on('show-textoverlay', (event, message) => {
    time = 0;
    if (document.getElementById('scaler').style.opacity == 1) {
        document.getElementById('scaler').style.opacity = 0;
        setTimeout(() => {
            document.getElementById('overlaytext').innerHTML = message;
            document.getElementById('scaler').style.opacity = 1;
        }, 250);
    } else {
        document.getElementById('overlaytext').innerHTML = message;
        document.getElementById('scaler').style.opacity = 1;
    }
});

let lyricstime;
let lyricstime2;
let lyricstime3;
let lyricstime4;

setInterval(() => {
    if (lyricstime >= 15000) {
        document.getElementById('captionTextLyrics').innerHTML = "";
    } else {
        lyricstime = lyricstime + 500
    }

    if (lyricstime2 >= 15000) {
        document.getElementById('captionTextLyrics2').innerHTML = "";
    } else {
        lyricstime2 = lyricstime2 + 500
    }

    if (lyricstime3 >= 15000) {
        document.getElementById('captionTextLyrics3').innerHTML = "";
    } else {
        lyricstime3 = lyricstime3 + 500
    }

    if (lyricstime3 >= 15000) {
        document.getElementById('captionTextLyrics4').innerHTML = "";
    } else {
        lyricstime4 = lyricstime4 + 500
    }
}, 500);

ipcRenderer.on('show-lyricsA', (event, message) => {
    lyricstime = 0;
    document.getElementById('captionTextLyrics').innerHTML = message;
});

ipcRenderer.on('show-lyricsB', (event, message) => {
    lyricstime2 = 0;
    document.getElementById('captionTextLyrics2').innerHTML = message;
});

ipcRenderer.on('show-lyricsC', (event, message) => {
    lyricstime3 = 0;
    document.getElementById('captionTextLyrics3').innerHTML = message;
});

ipcRenderer.on('show-lyricsD', (event, message) => {
    lyricstime4 = 0;
    document.getElementById('captionTextLyrics4').innerHTML = message;
});

let isFullscreen = false;

// --- Fullscreen toggle button ---
document.getElementById('fullscrtoggle-btn').addEventListener('click', () => {
    isFullscreen = !isFullscreen;
    ipcRenderer.send('set-fullscreen', isFullscreen);

    document.getElementById('fullscreenspacer').style.display = isFullscreen ? 'none' : 'block';
    document.getElementById('fullscreenIcon').src = isFullscreen
        ? 'images/windows/exit-fullscreen.svg'
        : 'images/windows/enter-fullscreen.svg';
});

// --- Escape key exits fullscreen ---
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isFullscreen) {
        isFullscreen = false;
        ipcRenderer.send('set-fullscreen', false);
        document.getElementById('fullscreenspacer').style.display = 'block';
        document.getElementById('fullscreenIcon').src = 'images/windows/enter-fullscreen.svg';
    }
});

ipcRenderer.on('sendcolor', (event, firstColor, secondColor) => {
    document.documentElement.style.setProperty('--firstcolor', `${firstColor}`);
    document.documentElement.style.setProperty('--endcolor', `${secondColor}`);
});

ipcRenderer.on('sendFilter', (event, brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue) => {
    document.documentElement.style.setProperty('--filter', `blur(${backdropblurValue * blurMultiplier}px) contrast(8) brightness(${brightnessValue})`);
    document.documentElement.style.setProperty('--filtermulti', `grayscale(${grayscaleValue}) sepia(${sepiaValue})`);
    document.documentElement.style.setProperty('--blurMultiplier', blurMultiplier);
    document.documentElement.style.setProperty(
        '--blurBackdrop',
        `blur(calc(${backdropblurValue}px * var(--blurMultiplier) * var(--scale)))`
    );

    document.documentElement.style.setProperty('--colorbarmulti', `linear-gradient(${angleValue}deg, var(--firstcolor), var(--endcolor))`);
});

ipcRenderer.on('sendbgcolor', (event, bgColor) => {
    document.documentElement.style.setProperty('--bodybg', `${bgColor}`);
});

ipcRenderer.on('sendWaveformAlignment', (event, setAlignment) => {
    alignment = setAlignment;
});

document.addEventListener("keydown", (event) => {
    event.stopPropagation();
    event.preventDefault();
});

let lastSubtitle1 = "";
let lastSubtitle2 = "";
let deckAppendNext = 1;
let detect = 1;

function disableAllTrackSub() {
    captionText1.textContent = "";
    captionText2.textContent = "";
    captionText1.style.visibility = 'hidden';
    captionText2.style.visibility = 'hidden';
    for (const t of video.textTracks) t.mode = "disabled";
}

const VideoBroadcast = new BroadcastChannel('videobroadcast');

VideoBroadcast.onmessage = (event) => {
    if (event.data.type === 'VIDEO_STATE') {
        const data = event.data;


        // 1️⃣ Eject: clear src if main has none
        if (data.eject) {
            video.src = '';
            disableAllTrackSub();
            return;
        }

        // 2️⃣ Change src if different
        if (video.src !== data.src) {
            video.src = data.src;
            disableAllTrackSub();

            video.currentTime = data.time;
            videoTime = data.time;

            if (data.playing) {
                video.play();
            }
            return;
        }

        // 3️⃣ Stop if main video ended
        if (data.stopped) {
            video.pause();

            video.currentTime = 0;
            videoTime = 0;
            return;
        }

        detect = data.deck;

        video.playbackRate = data.speed;

        // 4️⃣ Handle captions / text tracks
        if (deckAppendNext == detect) {
            if (detect == 2) {
                video.textTracks[1].mode = 'showing';
                captionText1.style.visibility = 'hidden';
                captionText2.style.visibility = 'visible';
            } else {
                video.textTracks[0].mode = 'showing';
                captionText1.style.visibility = 'visible';
                captionText2.style.visibility = 'hidden';
            }
        }

        // 5️⃣ Pause/play normally with proper sync
        if (data.playing) {
            if (video.paused) video.play();
            // Hard sync if main jumps
            if (Math.abs(video.currentTime - data.time) > 0.2) {
                video.currentTime = data.time;
                videoTime = data.time;
            }
        } else {
            video.pause();
        }
    }
};


ipcRenderer.on('video-hidden', (event, bool) => {
    if (bool) {
        disableAllTrackSub();
        posterize = false
        video.pause();
        video.currentTime = 0;
        video.src = "";
        video.style.visibility = 'hidden';
        ["visualizer", "visualizerlayer0", "visualizerlayer1"].forEach(id => {
            document.getElementById(id).style.visibility = 'visible';
        });
    } else {
        video.style.visibility = 'visible';
        ["visualizer", "visualizerlayer0", "visualizerlayer1"].forEach(id => {
            document.getElementById(id).style.visibility = 'hidden';
        });
    }
});

ipcRenderer.on('video-reconnect', (event, bool) => {
    document.getElementById('overlays3').style.visibility = bool ? 'visible' : 'hidden';
});


ipcRenderer.on('set-subtitle', (event, src, value) => {
    const track = document.getElementById(`subtitleTrack${value}`);

    // Clear subtitles if empty/null
    if (value === 0) {
        track.src = "";

        if (!src) {
            track.src = "";
            lastSubtitle1 = "";
            disableAllTrackSub();
            return;
        }

        // Prevent unnecessary reloads
        if (lastSubtitle1 === src) return;
        lastSubtitle1 = src;
        disableAllTrackSub();

        track.src = src;
    } else {
        track.src = "";

        if (!src) {
            track.src = "";
            lastSubtitle2 = "";
            disableAllTrackSub();
            return;
        }

        // Prevent unnecessary reloads
        if (lastSubtitle2 === src) return;
        lastSubtitle2 = src;
        disableAllTrackSub();

        track.src = src;
    }
});

ipcRenderer.on('changingDeck', (event, deckAppend) => {
    disableAllTrackSub();
    deckAppendNext = deckAppend;
});

ipcRenderer.on("teleprompt_output", (event, htmlLine) => {
    document.getElementById('telepromptText').innerHTML = htmlLine;
});

function decimalToHexAlpha(decimal) {
    // Clamp between 0 and 1 just in case
    const value = Math.round(Math.min(Math.max(decimal, 0), 1) * 255);
    // Convert to 2-digit hex
    return value.toString(16).padStart(2, '0').toUpperCase();
}

function applyCaptionSettings(data) {
    // Remove old style if any
    document.getElementById("captionStyle")?.remove();
    const captionBGOpacity = data.captionBGOpacity
    const hexAlpha = decimalToHexAlpha(captionBGOpacity); // "80"
    const osdBGOpacity = data.osdBGOpacity
    const osdhexAlpha = decimalToHexAlpha(osdBGOpacity); // "80"
    // Create a new <style> for ::cue rules
    const style = document.createElement("style");
    style.id = "captionStyle";

    function applyStyle(comp, alpha) {
        comp.style.fontFamily = `${data.fontFamily}, sans-serif`;
        comp.style.color = `${data.textColor}`;
        comp.style.backgroundColor = `${data.backgroundColor}${alpha}`;
        comp.style.textShadow = data.edgeStyle === "dropshadow" || data.edgeStyle === "default" ? "4px 4px 4px rgba(0,0,0,0.6)" : "none";
        comp.style.webkitTextStrokeWidth = data.edgeStyle === "outline" || data.edgeStyle === "default" ? "4px" : "";
        comp.style.webkitTextStrokeColor = data.edgeStyle === "outline" || data.edgeStyle === "default" ? data.strokeColor : "";
    }

    applyStyle(scaler, osdhexAlpha);
    applyStyle(captionText1, hexAlpha);
    applyStyle(captionText2, hexAlpha);
    applyStyle(captionTextLyrics, hexAlpha);
    applyStyle(captionTextLyrics2, hexAlpha);
    applyStyle(captionTextLyrics3, hexAlpha);
    applyStyle(captionTextLyrics4, hexAlpha);
}

ipcRenderer.on('caption-settings-updated', (_, data) => applyCaptionSettings(data));

// Get <track> references (the hidden data)
const track1 = document.getElementById("subtitleTrack1").track;
const track2 = document.getElementById("subtitleTrack2").track;

// Function to update captions
function updateCaption(track, captionElement) {
    track.addEventListener("cuechange", () => {
        const activeCue = track.activeCues[0];
        if (activeCue && track.mode !== "disabled") {
            captionElement.innerHTML = activeCue.text
                .replace(/\n/g, "<br>")
                .replace(/<b>/g, "<strong>")
                .replace(/<\/b>/g, "</strong>")
                .replace(/<i>/g, "<em>")
                .replace(/<\/i>/g, "</em>");
            captionElement.style.opacity = "1"; // fade in
        } else {
            captionElement.textContent = "";
            captionElement.style.opacity = "0"; // fade out
        }
    });
}

// Apply to both
updateCaption(track1, captionText1);
updateCaption(track2, captionText2);

// 1️⃣ Create a single AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 2️⃣ Function to attach audio routing for a video element
function attachVideoToAudioCtx(video) {
    // Ensure video is muted to avoid double sound
    video.muted = true;

    // Only create MediaElementSource once per video
    let source;

    video.addEventListener("play", () => {
        if (!source) {
            source = audioCtx.createMediaElementSource(video);
            source.connect(audioCtx.destination); // route audio to context
            console.log(`Video ${video.id || video.src} connected to AudioContext`);
        }

        // Resume AudioContext if it was suspended
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }
    });

    video.addEventListener("pause", () => {
        console.log(`Video ${video.id || video.src} paused`);
        // optional: disconnect or keep connected
        // source?.disconnect();
    });

    video.addEventListener("ended", () => {
        console.log(`Video ${video.id || video.src} ended`);
        // optional cleanup
        // source?.disconnect();
    });
}

let pinwindow = false;

document.getElementById('pinbtn').addEventListener('click', (e) => {
    pinwindow = !pinwindow;
    ipcRenderer.send('set-pinwindow', pinwindow);
})

ipcRenderer.on('icon-pinwindow', (event, bool) => {
    document.getElementById('pinIcon').src = bool ? 'icons/codicons/pinned.svg' : 'icons/codicons/pin.svg';
})

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
        windowName: 'External Visualizer', // give a unique name per window
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

ipcRenderer.on('update-video-settings', (event, adjustmentSettings) => {
    const { brightness, contrast, saturation, hue } = adjustmentSettings;
    video.style.filter = `
        brightness(${brightness}%)
        contrast(${contrast}%)
        saturate(${saturation}%)
        hue-rotate(${hue}deg)
    `;
});

ipcRenderer.on("toggle-lyrics", (event, bool) => {
    document.getElementById('overlays4').style.visibility = bool ? "visible" : "hidden";
});