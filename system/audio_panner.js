const panner = document.getElementById("surround_panner");
const handle = document.getElementById("panner_handle");

const xValue = document.getElementById("x_value");
const yValue = document.getElementById("y_value");

const xSlider = document.getElementById("x_slider");
const ySlider = document.getElementById("y_slider");

let isDragging = false;

// Normalized coordinates
let pannerX = 0; // -1 Front, +1 Rear
let pannerY = 0; // -1 Left, +1 Right

function getFrontRear(pannerX) {
    const front = 1 - Math.max(0, pannerX);
    const rear = 1 + Math.min(0, pannerX);

    return {
        front: Math.max(0, Math.min(1, front)),
        rear: Math.max(0, Math.min(1, rear))
    };
}

function getCenter(pannerY, rear) {

    // left side (Y: -1 → 0)
    if (pannerY <= 0) {
        return 1;
    }

    // right side (Y: 0 → 1)
    const sideFade = 1 - pannerY; // 1 → 0

    let center = sideFade * (1 - rear);

    return Math.max(0, Math.min(1, center));
}

function updateSurroundMatrix() {
    const vertical = 1 - ((pannerX + 1)); // top=1 bottom=0

    const { front, rear } = getFrontRear(pannerX);

    const left = (1 - pannerY);
    const right = (1 + pannerY);

    const edge = Math.abs(pannerX); // 0 center → 1 edges
    const sideBoost = 0.5 * edge;

    const gains = {
        SRS_FRONTLEFT: front * left,
        SRS_FRONTRIGHT: front * right,
        SRS_REARL: rear * left,
        SRS_REARR: rear * right,
        SRS_CENTER: (pannerX <= 0 ? 1 : 1 - pannerX),
        SRS_LFE: (pannerX >= 1 ? 1 : 1 + pannerX),
        SRS_SIDEL: ((pannerX >= 0 ? rear : front) * left) + sideBoost,
        SRS_SIDER: ((pannerX >= 0 ? rear : front) * right) + sideBoost,
    };

    Object.entries(gains).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (!el) return;

        el.value = Math.max(0, Math.min(1, value)).toFixed(3);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

function updatePanner(clientX, clientY) {
    const rect = panner.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    // Clamp
    x = Math.max(0, Math.min(rect.width, x));
    y = Math.max(0, Math.min(rect.height, y));

    // Move handle
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;

    // Normalize -1 → +1
    pannerX = (y / rect.height) * 2 - 1; // front/back
    pannerY = (x / rect.width) * 2 - 1;  // left/right

    var sidemap;

    if (pannerY < 0) {
        sidemap = " West"
    } else if (pannerY > 0) {
        sidemap = " East"
    } else {
        sidemap = ""
    }

    var northmap;

    if (pannerX < 0) {
        northmap = " North"
    } else if (pannerX > 0) {
        northmap = " South"
    } else {
        northmap = ""
    }

    xValue.textContent = Math.abs(pannerX).toFixed(2) + "∆" + northmap;
    yValue.textContent = Math.abs(pannerY).toFixed(2) + "∆" + sidemap;

    xSlider.value = pannerX.toFixed(2);
    ySlider.value = pannerY.toFixed(2);

    updateSurroundMatrix();
}

function updatePanneronSlider() {
    pannerX = Number(xSlider.value)
    pannerY = Number(ySlider.value)

    const rect = panner.getBoundingClientRect();
    const halfwidth = rect.width / 2;
    const halfheight = rect.width / 2;

    let y = (halfwidth * Number(xSlider.value) + halfwidth)
    let x = (halfheight * Number(ySlider.value) + halfheight)

    // Move handle
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;

    var sidemap;

    if (pannerY < 0) {
        sidemap = " West"
    } else if (pannerY > 0) {
        sidemap = " East"
    } else {
        sidemap = " Center"
    }

    var northmap;

    if (pannerX < 0) {
        northmap = " North"
    } else if (pannerX > 0) {
        northmap = " South"
    } else {
        northmap = " Center"
    }

    xValue.textContent = Math.abs(pannerX).toFixed(2) + "∆" + northmap;
    yValue.textContent = Math.abs(pannerY).toFixed(2) + "∆" + sidemap;

    updateSurroundMatrix();
}

xSlider.addEventListener("input", () => {
    updatePanneronSlider();
})

ySlider.addEventListener("input", () => {
    updatePanneronSlider();
})

// Mouse
handle.addEventListener("mousedown", () => {
    isDragging = true;
});

document.addEventListener("mouseup", () => {
    isDragging = false;
});

document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    updatePanner(e.clientX, e.clientY);
});

// Click anywhere inside panner
panner.addEventListener("mousedown", (e) => {
    isDragging = true;
    updatePanner(e.clientX, e.clientY);
});

panner.addEventListener("dbclick", (e) => {
    updatePanner(350 / 2, 350 / 2);
});

// Touch support
panner.addEventListener("touchstart", (e) => {
    const touch = e.touches[0];
    updatePanner(touch.clientX, touch.clientY);
});

panner.addEventListener("touchmove", (e) => {
    const touch = e.touches[0];
    updatePanner(touch.clientX, touch.clientY);
    e.preventDefault();
});

// Start centered
handle.style.left = "50%";
handle.style.top = "50%";

let SURROUND_CHANNEL_NAMING = 0;

const labels = [
    {
        0: "Left",
        1: "Right",
        2: "Center",
        3: "Subwoofer",
        4: "Rear Left",
        5: "Rear Right",
        6: "Side Left",
        7: "Side Right"
    },
    {
        0: "L",
        1: "R",
        2: "C",
        3: "Sub",
        4: "RL",
        5: "RR",
        6: "SL",
        7: "SR"
    },
    {
        0: "Ch1",
        1: "Ch2",
        2: "Ch3",
        3: "Ch4",
        4: "Ch5",
        5: "Ch6",
        6: "Ch7",
        7: "Ch8"
    },
    {
        0: "L",
        1: "R",
        2: "C",
        3: "LFE",
        4: "LsB",
        5: "RsB",
        6: "Ls",
        7: "Rs"
    },
    {
        0: "FL",
        1: "FR",
        2: "FC",
        3: "LFE",
        4: "LSB",
        5: "RSB",
        6: "LSS",
        7: "RSS"
    }
];

function setNames(param) {
    SURROUND_CHANNEL_NAMING = param;
    for (let i = 0; i < 8; i++) {
        const selectedElement = document.querySelector('.surround_map_retro_button[data-channel="' + i + '"] span');
        selectedElement.textContent = labels[param][i];
    }
}