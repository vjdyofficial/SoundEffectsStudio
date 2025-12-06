let currentMenuItems = [];
let currentTarget = null;

function registerContextMenu(element, items) {
    element.addEventListener("contextmenu", (ev) => {
        ev.preventDefault();
        currentTarget = element;
        showContextMenu(ev.pageX, ev.pageY, items);
    });
}

function registerContextMenuonButton(element, items) {
    element.addEventListener("click", (ev) => {
        ev.preventDefault();
        currentTarget = element;

        // Get button position and size
        const rect = element.getBoundingClientRect();

        // Calculate center of the button
        const centerX = rect.left + rect.width / 2 + window.scrollX;
        const centerY = rect.top + rect.height / 2 + window.scrollY;

        // Show menu in the center of the button
        showContextMenu(centerX, centerY, items);
    });
}

function showContextMenu(x, y, items) {
    const menu = document.getElementById("globalContextMenu");
    const list = document.getElementById("contextMenuItems");

    // Build menu items
    list.innerHTML = "";
    items.forEach(item => {
        const div = document.createElement("div");
        div.className = "context-menu-item";
        div.innerText = item.label;

        div.onclick = () => {
            item.action(currentTarget);
            hideContextMenu();
        };

        list.appendChild(div);
    });

    const menuWidth = 180;
    const menuHeight = items.length * 36 + 15;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    let posX = x;
    let posY = y;

    if (x + menuWidth > screenW) {
        posX = x - menuWidth;
        menu.style.transformOrigin = "top right";
    } else {
        menu.style.transformOrigin = "top left";
    }

    if (y + menuHeight > screenH) {
        posY = y - menuHeight;
        menu.style.transformOrigin = "bottom";
    }

    menu.style.left = posX + "px";
    menu.style.top = posY + "px";

    menu.classList.remove("showopacity");
    menu.style.display = "block";
    void menu.offsetWidth;
    menu.classList.add("show");
    menu.classList.add("showopacity");

    document.getElementById("blockArea2").classList.add("enable");
}

function hideContextMenu() {
    const menu = document.getElementById("globalContextMenu");
    menu.classList.remove("showopacity");
    setTimeout(() => {
        menu.style.display = "none";
        menu.classList.remove("show");
        document.getElementById("blockArea2").classList.remove("enable");
    }, 120);
}

document.getElementById("blockArea2").addEventListener("click", hideContextMenu);

["mediaArtAlbum_A", "mediaArtAlbum_B", "mediaArtAlbum_C", "mediaArtAlbum_D"]
.forEach(id => {
    const el = document.getElementById(id);

    registerContextMenu(el, [
        {
            label: "Save as PNG Image",
            action: (target) => saveImage(target)  // pass element, not ID
        },
        {
            label: "Save as Base64 Image",
            action: (target) => saveBase64(target) // pass element, not ID
        }
    ]);
});

["bbcode_remove"].forEach(id => {
    const el = document.getElementById(id);

    registerContextMenuonButton(el, [
        { label: "Basic Formats", action: () => {stripSelectedBBCode(textarea, 1)} },
        { label: "Text Color", action: () => {stripSelectedBBCode(textarea, 2)} },
        { label: "Background Color", action: () => {stripSelectedBBCode(textarea, 11)} },
        { label: "Font Family", action: () => {stripSelectedBBCode(textarea, 3)} },
        { label: "Font Size", action: () => {stripSelectedBBCode(textarea, 12)} },
        { label: "Font Variable", action: () => {stripSelectedBBCode(textarea, 4)} },
        { label: "Letter Spacing", action: () => {stripSelectedBBCode(textarea, 5)} },
        { label: "Scale X and Y", action: () => {stripSelectedBBCode(textarea, 6)} },
        { label: "Shadow", action: () => {stripSelectedBBCode(textarea, 7)} },
        { label: "Blur", action: () => {stripSelectedBBCode(textarea, 13)} },
        { label: "Stroke", action: () => {stripSelectedBBCode(textarea, 14)} },
        { label: "Group Content", action: () => {stripSelectedBBCode(textarea, 8)} },
        { label: "Breaks and Lines", action: () => {stripSelectedBBCode(textarea, 15)} },
        { label: "Animation", action: () => {stripSelectedBBCode(textarea, 9)} },
        { label: "Alignment", action: () => {stripSelectedBBCode(textarea, 10)} },
        { label: "All", action: () => {stripSelectedBBCode(textarea, 20)} }
    ]);
});


["subwPreset"].forEach(id => {
    const el = document.getElementById(id);

    registerContextMenuonButton(el, [
        {
            label: "Save Preset",
            action: () => {
                const preset = {
                    gain: document.getElementById("bassSlider").value,
                    limit: document.getElementById("limiterSlider").value,
                    pass: document.getElementById("passSlider").value,
                    filter: document.getElementById("filterSlider").value
                };
                saveSUBW(preset)
            }
        },
        {
            label: "Load Preset",
            action: () => document.getElementById("subwImport").click()
        },
        {
            label: "Reset",
            action: () => {
                const sliders = [
                    { id: "bassSlider", value: 0 },
                    { id: "limiterSlider", value: 0 },
                    { id: "passSlider", value: 65 },
                    { id: "filterSlider", value: 0 }
                ];

                sliders.forEach(slider => {
                    const el = document.getElementById(slider.id);
                    if (el) {
                        el.value = Number(slider.value);

                        // Trigger event listeners
                        el.dispatchEvent(new Event("input", { bubbles: true }));
                    }
                });
            }
        },
    ]);
});

["srsPreset"].forEach(id => {
    const el = document.getElementById(id);

    registerContextMenuonButton(el, [
        {
            label: "Reset",
            action: () => {
                const slider = document.getElementById('reduceSlider')
                const select = document.getElementById('channelTypeSelect')
                slider.value = 0;
                slider.dispatchEvent(new Event('input'));
                select.value = 1;
                select.dispatchEvent(new Event('change'));
            }
        },
    ]);
});