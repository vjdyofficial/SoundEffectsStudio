const { EventDispatcher } = require("three");

let currentMenuItems = [];
let currentTarget = null;

function registerContextMenu(ev, element, items) {
    ev.preventDefault();
    currentTarget = element;
    showContextMenu(ev.pageX, ev.pageX, ev.pageY, items);
}

function registerContextMenuonButton(ev, element, items) {
    ev.preventDefault();
    currentTarget = element;

    // Get button position and size
    const rect = element.getBoundingClientRect();

    // Calculate center of the button
    const centerX = rect.left + window.scrollX;
    const centerX2 = rect.left + rect.width + window.scrollX;
    const centerY = rect.top + rect.height + window.scrollY;

    // Show menu in the center of the button
    showContextMenu(centerX, centerX2, centerY, items);
}

function showContextMenu(x, x2, y, items) {
    const menu = document.getElementById("globalContextMenu");
    const list = document.getElementById("contextMenuItems");

    // Clear previous items
    list.innerHTML = "";

    const anyIcons = items.some(i => i.icon);
    let directionClass = "anim_smoothright"; // for items

    // Build menu items
    items.forEach((item, index) => {
        if (item.titleholder) {
            const title = document.createElement("p");
            title.className = "context-menu-title";
            title.innerText = item.titleholder;
            list.appendChild(title);
            return;
        }

        const row = document.createElement("div");
        row.className = "context-menu-item";
        row.style.animationDelay = `${index * 0.025}s`;

        if (item.icon) {
            const icon = document.createElement("img");
            icon.src = item.icon;
            icon.className = "context-menu-icon";
            if (item.icontint) icon.classList.add("logo-onprimary");
            row.appendChild(icon);
        } else {
            const spacer = document.createElement("div");
            spacer.className = "context-menu-icon-spacer";
            row.appendChild(spacer);
        }

        const label = document.createElement("span");
        label.className = "context-menu-label";
        label.innerText = item.label || "";
        row.appendChild(label);

        if (item.type === "checkbox") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = !!item.checked;
            checkbox.className = "monosource_checkbox_small";

            checkbox.addEventListener("click", (e) => {
                e.stopPropagation();
                item.checked = checkbox.checked;
                if (typeof item.onchange === "function") item.onchange(checkbox.checked);
            });

            row.appendChild(checkbox);

            row.addEventListener("click", () => {
                checkbox.checked = !checkbox.checked;
                item.checked = checkbox.checked;
                if (typeof item.onchange === "function") item.onchange(checkbox.checked);
                hideContextMenu();
            });
        } else {
            row.addEventListener("click", () => {
                if (typeof item.action === "function") item.action();
                hideContextMenu();
            });
            const spacer = document.createElement("div");
            spacer.className = "context-menu-checkbox-spacer";
            row.appendChild(spacer);
        }

        list.appendChild(row);
    });

    // Hide icon column if unused
    if (!anyIcons) {
        list.querySelectorAll(".context-menu-icon, .context-menu-icon-spacer")
            .forEach(el => el.style.display = "none");
    }

    // ===== Render offscreen to measure real size =====
    menu.style.display = "block";
    menu.style.visibility = "hidden";

    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    let posX = x;
    let posX2 = x2;
    let posY = y;

    // Horizontal snap
    let horizontalSnap = "right";
    if (x + menuWidth > screenW) {
        posX = x - menuWidth;
        posX2 = x2 - menuWidth;
        horizontalSnap = "left";
    }

    // Vertical snap
    let verticalSnap = "bottom";
    if (y + menuHeight > screenH) {
        posY = y - menuHeight;
        verticalSnap = "top";
    }

    // Keep inside viewport
    posX = Math.max(0, Math.min(posX, screenW - menuWidth));
    posY = Math.max(0, Math.min(posY, screenH - menuHeight));

    let originX = "center";
    let originY = "center";

    // Horizontal
    if (horizontalSnap === "left") originX = "right";
    else if (horizontalSnap === "right") originX = "left";

    // Vertical
    if (verticalSnap === "top") originY = "bottom";
    else if (verticalSnap === "bottom") originY = "top";

    // Apply combined origin
    menu.style.transformOrigin = `${originX} ${originY}`;

    // Apply final position
    if (originX === "right") {
        menu.style.left = posX2 + "px";
    } else if (originX === "left") {
        menu.style.left = posX + "px";
    }

    menu.style.top = posY + "px";
    menu.style.visibility = "visible";

    // Apply item animation classes
    list.querySelectorAll(".context-menu-item").forEach(el => {
        el.classList.remove("anim_smoothleft", "anim_smoothright");
        if (originX === "right") {
            directionClass = "anim_smoothleft"; // for items
        } else if (originX === "left") {
            directionClass = "anim_smoothright"; // for items
        }

        el.classList.add(directionClass);
    });

    // Show menu with fade + scale
    menu.classList.remove("showopacity");
    void menu.offsetWidth; // force reflow
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
        document.getElementById('contextMenuItems').innerHTML = '';
    }, 120);
    isonContextMenu = false;
}

document.getElementById("blockArea2").addEventListener("click", hideContextMenu);

["mediaArtAlbum_A", "mediaArtAlbum_B", "mediaArtAlbum_C", "mediaArtAlbum_D"]
    .forEach(id => {
        const el = document.getElementById(id);

        el.addEventListener("contextmenu", (ev) => {
            registerContextMenu(ev, el, [
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
    });

["bbcode_remove"].forEach(id => {
    const el = document.getElementById(id);

    el.addEventListener("click", (ev) => {
        registerContextMenuonButton(ev, el, [
            { titleholder: "Remove Format" },
            { label: "Basic Formats", action: () => { stripSelectedBBCode(textarea, 1) } },
            { label: "Text Color", action: () => { stripSelectedBBCode(textarea, 2) } },
            { label: "Background Color", action: () => { stripSelectedBBCode(textarea, 11) } },
            { label: "Font Family", action: () => { stripSelectedBBCode(textarea, 3) } },
            { label: "Font Size", action: () => { stripSelectedBBCode(textarea, 12) } },
            { label: "Font Variable", action: () => { stripSelectedBBCode(textarea, 4) } },
            { label: "Letter Spacing", action: () => { stripSelectedBBCode(textarea, 5) } },
            { label: "Scale X and Y", action: () => { stripSelectedBBCode(textarea, 6) } },
            { label: "Shadow", action: () => { stripSelectedBBCode(textarea, 7) } },
            { label: "Blur", action: () => { stripSelectedBBCode(textarea, 13) } },
            { label: "Stroke", action: () => { stripSelectedBBCode(textarea, 14) } },
            { label: "Group Content", action: () => { stripSelectedBBCode(textarea, 8) } },
            { label: "Breaks and Lines", action: () => { stripSelectedBBCode(textarea, 15) } },
            { label: "Animation", action: () => { stripSelectedBBCode(textarea, 9) } },
            { label: "Alignment", action: () => { stripSelectedBBCode(textarea, 10) } },
            { label: "All", action: () => { stripSelectedBBCode(textarea, 20) } }
        ]);
    });
});


["subwPreset"].forEach(id => {
    const el = document.getElementById(id);

    el.addEventListener("click", (ev) => {
        registerContextMenuonButton(ev, el, [
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
                icon: "icons/monosource/refresh.svg",
                icontint: true,
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
});

["srsPreset"].forEach(id => {
    const el = document.getElementById(id);

    el.addEventListener("click", (ev) => {
        registerContextMenuonButton(ev, el, [
            {
                label: "Reset",
                action: () => {
                    const slider = document.getElementById('reduceSlider');
                    const slider2 = document.getElementById('centerSlider')
                    const select = document.getElementById('reduceThresholdSlider')
                    slider.value = 0;
                    slider.dispatchEvent(new Event('input'));
                    slider2.value = 0;
                    slider2.dispatchEvent(new Event('input'));
                    select.value = 1;
                    select.dispatchEvent(new Event('input'));
                }
            },
        ]);
    });
});

["reverbMoreOptions"].forEach(id => {
    const el = document.getElementById(id);

    el.addEventListener("click", (ev) => {
        registerContextMenuonButton(ev, el, [
            { titleholder: "Reverb Options" },
            {
                label: "Reset",
                action: () => {
                    document.getElementById("drySlider").value = 0;
                    document.getElementById("drySlider").dispatchEvent(new Event("input", { bubbles: true }));

                    document.getElementById("wetSlider").value = 0;
                    document.getElementById("wetSlider").dispatchEvent(new Event("input", { bubbles: true }));

                    document.getElementById("preSlider").value = 0;
                    document.getElementById("preSlider").dispatchEvent(new Event("input", { bubbles: true }));

                    document.getElementById("roomSlider").value = 0;
                    document.getElementById("roomSlider").dispatchEvent(new Event("input", { bubbles: true }));

                    document.getElementById("irDurationSlider").value = 0.1;
                    document.getElementById("irDurationSlider").dispatchEvent(new Event("input", { bubbles: true }));

                    document.getElementById("irDecaySlider").value = 0.1;
                    document.getElementById("irDecaySlider").dispatchEvent(new Event("input", { bubbles: true }));
                }
            },
        ]);
    });
});

let isonContextMenu = false;

function titlebarContextMenu() {
    ["altmenu_1"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonButton(ev, el, [
                        { titleholder: "Performance Decks" },
                        {
                            label: "Import Media",
                            icon: "icons/monosource/folder_open.svg",
                            icontint: true,
                            action: () => {
                                document.getElementById("mediaImport").click();
                            }
                        },
                        {
                            label: "Eject All Decks",
                            icon: "icons/monosource/deck-icon.svg",
                            icontint: true,
                            action: () => {
                                document.getElementById('ejectBtnA').click();
                                document.getElementById('ejectBtnB').click();
                                document.getElementById('ejectBtnC').click();
                                document.getElementById('ejectBtnD').click();
                                document.getElementById('ejectBtn1').click();
                                document.getElementById('ejectBtn2').click();
                            }
                        },
                        {
                            label: "Eject All Audio Decks",
                            icon: "icons/monosource/deck-iconvolume.svg",
                            icontint: true,
                            action: () => {
                                document.getElementById('ejectBtnA').click();
                                document.getElementById('ejectBtnB').click();
                                document.getElementById('ejectBtnC').click();
                                document.getElementById('ejectBtnD').click();
                            }
                        },
                        {
                            label: "Eject All Media Decks",
                            icon: "icons/monosource/deck-videoicon.svg",
                            icontint: true,
                            action: () => {
                                document.getElementById('ejectBtn1').click();
                                document.getElementById('ejectBtn2').click();
                            }
                        },
                        { titleholder: "Weather" },
                        {
                            icon: "icons/monosource/refresh.svg",
                            icontint: true,
                            label: "Refresh Weather Data",
                            action: () => {
                                clearWeatherInfo();
                            }
                        },
                        { titleholder: "Widgets" },
                        {
                            type: "checkbox",
                            icon: "icons/monosource/visulaiser.svg",
                            icontint: true,
                            label: "External Visualizer",
                            checked: letVisualser,
                            onchange: (v) => {
                                document.getElementById('toggleVisualiserCheckbox').checked = v
                                document.getElementById('toggleVisualiserCheckbox').dispatchEvent(new Event("change", { bubbles: true }));
                            }
                        },
                        {
                            type: "checkbox",
                            icon: "icons/monosource/vumeter.svg",
                            icontint: true,
                            label: "VU Meter",
                            checked: letVUMeter,
                            onchange: (v) => {
                                document.getElementById('toggleVUMeterCheckbox').checked = v
                                document.getElementById('toggleVUMeterCheckbox').dispatchEvent(new Event("change", { bubbles: true }));
                            }
                        },
                        { titleholder: "This App" },
                        {
                            icon: "icons/monosource/restart_alt.svg",
                            icontint: true,
                            label: "Restart",
                            action: () => {
                                restartFunc();
                            }
                        },
                        {
                            icon: "icons/monosource/power_settings_new.svg",
                            icontint: true,
                            label: "Force Close",
                            action: () => {
                                ipcRenderer.send('window-action', 'close-permanent');
                            }
                        },
                    ]);
                }
            });
        });
    });

    ["altmenu_2"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonButton(ev, el, [
                        { titleholder: "System Sound Options" },
                        {
                            label: "Open Volume Mixer",
                            action: () => {
                                ipcRenderer.send('window-action', 'windows-openvolumemixer');
                            }
                        },
                        {
                            label: "Open Legacy Volume Mixer",
                            action: () => {
                                ipcRenderer.send('window-action', 'windows-legacy-openvolumemixer');
                            }
                        },
                        {
                            label: "Open Sound Settings",
                            action: () => {
                                ipcRenderer.send('window-action', 'windows-soundsettings');
                            }
                        },
                        {
                            label: "Open Legacy Sound Settings",
                            action: () => {
                                ipcRenderer.send('window-action', 'windows-legacy-soundsettings');
                            }
                        },
                        { titleholder: "Operation" },
                        {
                            icon: "icons/monosource/webaudioapi_logo.svg",
                            icontint: true,
                            label: String(noiseText),
                            action: () => {
                                toggleNoise();
                            }
                        },
                        {
                            icon: "icons/monosource/media_output.svg",
                            icontint: true,
                            label: "Audio Info",
                            action: () => {
                                audioInfoDialog.show();
                            }
                        },
                        {
                            icon: "icons/monosource/notification_audio.svg",
                            icontint: true,
                            label: "Execute Announcement Intro",
                            action: () => {
                                executeAnnouncement(true);
                            }
                        },
                        {
                            icon: "icons/monosource/notification_audio_off.svg",
                            icontint: true,
                            label: "Execute Announcement Outro",
                            action: () => {
                                executeAnnouncement(false);
                            }
                        },
                    ]);
                }
            });
        });
    });

    ["altmenu_3"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonButton(ev, el, [
                        {
                            type: "checkbox",
                            icon: "icons/monosource/keyboard.svg",
                            icontint: true,
                            label: "Enable Hotkey Sampling",
                            checked: letPlayonHotkey,
                            onchange: (v) => {
                                document.getElementById('togglePlayCheckbox').checked = v
                                document.getElementById('togglePlayCheckbox').dispatchEvent(new Event("change", { bubbles: true }));
                            }
                        },
                        {
                            icon: "icons/monosource/download.svg",
                            icontint: true,
                            label: "Install or Update Pack",
                            action: () => {
                                document.getElementById('downloadDialog').show();
                                startUpdate();
                            }
                        },
                    ]);
                }
            });
        });
    });

    ["altmenu_4"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonButton(ev, el, [
                        { titleholder: "Support" },
                        {
                            label: "Linktree Page",
                            action: () => {
                                window.open("https://linktr.ee/vjdyofficial", "_blank");
                            }
                        },
                        {
                            label: "VJDY Official Page",
                            action: () => {
                                window.open("https://tinyurl.com/vjdyofficial", "_blank");
                            }
                        },
                        {
                            label: "Wordpress Article",
                            action: () => {
                                window.open("https://vjdyofficial.wordpress.com", "_blank");
                            }
                        },
                        { titleholder: "This App" },
                        {
                            label: "User Guide",
                            icon: "icons/monosource/help.svg",
                            icontint: true,
                            action: () => {
                                ipcRenderer.send('UserGuideExecute');
                            }
                        },
                        {
                            icon: "icons/monosource/info.svg",
                            icontint: true,
                            label: "About App",
                            action: () => {
                                ipcRenderer.send('AboutExecute');
                            }
                        },
                        {
                            icon: "icons/monosource/feedback.svg",
                            icontint: true,
                            label: "Send Issue",
                            action: () => {
                                window.open("https://github.com/vjdyofficial/SoundEffectsStudio/issues", "_blank");
                            }
                        },
                        {
                            icon: "icons/monosource/terminal.svg",
                            icontint: true,
                            label: "Developer Console",
                            action: () => {
                                ipcRenderer.send('open_devconsole');
                            }
                        },
                    ]);
                }
            });
        });
    });
}

titlebarContextMenu();