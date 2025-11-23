function updateBackground(input) {
    const val = input.value;
        const minValue = input.min;
        const maxValue = input.max;
        const valRange = input.value;
        const percent = ((valRange - minValue) / (maxValue - minValue)) * 100;
        const angle = (percent / 100) * 270;
    if (input.classList.contains("monosource_range")) {
        input.style.backgroundImage = `linear-gradient(90deg, var(--backgroundrange-start) calc(9px + ${percent}% - 9px), var(--backgroundrange-end) calc(9px + ${percent}% - 9px))`;
    } else if (input.classList.contains("monosource_range_default")) {
        input.style.backgroundImage = `linear-gradient(90deg, var(--text) calc(9px + ${percent}% - 9px), var(--backgroundrange-end) calc(${percent}% - 9px))`;
    } else if (input.classList.contains("monosource_knob")) {
        document.getElementById(`${input.id}_graphic`).style.setProperty('transform', `rotate(${angle}deg)`);
    }
}

// Select all range inputs
const rangeInputs = document.querySelectorAll('input[type="range"]');

// Attach input and change listeners
rangeInputs.forEach(input => {
    updateBackground(input); // Initial update

    input.addEventListener('input', () => updateBackground(input));
    input.addEventListener('change', () => updateBackground(input));
});

// 🔁 Continuous refresh loop using requestAnimationFrame
function refreshLoop() {
    rangeInputs.forEach(updateBackground);
    requestAnimationFrame(refreshLoop);
}

// Start the loop
requestAnimationFrame(refreshLoop);