function updateBackground(input) {
    if (input.classList.contains("monosource_range")) {
        const val = input.value;
        const minValue = input.min;
        const maxValue = input.max;
        const valRange = maxValue - minValue;
        const percent = Math.round(((val - minValue) / valRange) * 90 + 10);
        input.style.backgroundImage = `linear-gradient(90deg, var(--backgroundrange-start) ${percent}%, var(--backgroundrange-end) ${percent}%)`;
    } else if (input.classList.contains("monosource_knob")) {
        const val = input.value;
        const minValue = input.min;
        const maxValue = input.max;
        const valRange = maxValue - minValue;
        const percent = Math.round(((val - minValue) / valRange) * 270);
        document.getElementById(`${input.id}_graphic`).style.setProperty('transform', `rotate(${percent}deg)`);
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