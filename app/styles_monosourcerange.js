const mySliders = document.querySelectorAll('.monosource_range, .monosource_range_default, .monosource_knob');

mySliders.forEach(input => {
    const updateBackground = (el) => {
        const minValue = +el.min || 0;
        const maxValue = +el.max || 100;
        const valRange = +el.value;
        const percent = ((valRange - minValue) / (maxValue - minValue)) * 100;
        const angle = (percent / 100) * 270;
        const conic = (percent / 100 * 75);

        if (el.classList.contains("monosource_range")) {
            el.style.setProperty('--increment', `${percent}%`);
        } else if (el.classList.contains("monosource_range_default")) {
            el.style.backgroundImage = `linear-gradient(90deg, var(--text) calc(9px + ${percent}% - 9px), var(--backgroundrange-end) calc(${percent}% - 9px))`;
        } else if (el.classList.contains("monosource_knob")) {
            document.getElementById(`${el.id}_graphic`).style.setProperty('transform', `rotate(${angle}deg)`);
        }
    };

    // Initial update
    updateBackground(input);

    // User input
    input.addEventListener('input', () => updateBackground(input));
    input.addEventListener('change', () => updateBackground(input));

    // Observe attribute changes
    new MutationObserver(() => updateBackground(input))
        .observe(input, { attributes: true, attributeFilter: ['value'] });

    // Patch only this slider's value setter
    const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(input, 'value', {
        set(val) {
            nativeDescriptor.set.call(this, val); // set the value normally
            updateBackground(this);              // update only this slider
        },
        get() {
            return nativeDescriptor.get.call(this);
        }
    });
});
