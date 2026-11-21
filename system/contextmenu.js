let isonContextMenu = false;

["mediaArtAlbum_A", "mediaArtAlbum_B", "mediaArtAlbum_C", "mediaArtAlbum_D"].forEach(id => {
    const el = document.getElementById(id);

    el.addEventListener("contextmenu", (ev) => {
        registerContextMenu(ev, el, [
            {
                icon: "icons/monosource/image.svg",
                icontint: true,
                label: "Save as PNG Image",
                action: () => { saveMedia(el) }  // pass element, not ID
            },
            {
                icon: "icons/monosource/info.svg",
                icontint: true,
                label: "Audio Metadata Info",
                action: () => { showMediaInfo(String(id).replace('mediaArtAlbum_', '')); } // pass element, not ID
            },
        ]);
    });
});

["MediaExtDeck1", "MediaExtDeck2"].forEach(id => {
    const el = document.getElementById(id);

    el.addEventListener("contextmenu", (ev) => {
        registerContextMenu(ev, el, [
            {
                icon: "icons/monosource/picture_in_picture.svg",
                icontint: true,
                label: "Picture-in-picture",
                action: () => { requestPIP(el) }
            },
            {
                icon: "icons/monosource/fullscreen.svg",
                icontint: true,
                label: "Fullscreen",
                action: () => { requestFullscreen(el) }
            },
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

function titlebarContextMenu() {
    ["altmenu_1"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonAltMenu(ev, el, [
                        { titleholder: "Performance Decks" },
                        {
                            label: "Import Media",
                            icon: "icons/monosource/folder_open.svg",
                            icontint: true,
                            action: () => {
                                openMediaFile();
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
                        { titlegroup: "System" },
                        {
                            icon: "icons/monosource/refresh.svg",
                            icontint: true,
                            label: 'Restart',
                            action: () => {
                                choice({
                                    title: "Confirmation",
                                    message: "Are you sure you want to restart your computer?",
                                    onConfirm: () => {
                                        if (audioCtx && audioCtx.state == "running" || audioCtx.state == "suspended") { audioCtx.close(); window.TYPE_FUNCTION = "RESTART" }
                                    }
                                });
                            }
                        },
                        {
                            icon: "icons/monosource/power_settings_new.svg",
                            icontint: true,
                            label: 'Shutdown',
                            action: () => {
                                choice({
                                    title: "Confirmation",
                                    message: "Are you sure you want to shut down your computer?",
                                    onConfirm: () => {
                                        if (audioCtx && audioCtx.state == "running" || audioCtx.state == "suspended") { audioCtx.close(); window.TYPE_FUNCTION = "SHUTDOWN" }
                                    }
                                });
                            }
                        },
                        {
                            icon: "icons/monosource/sleep.svg",
                            icontint: true,
                            label: 'Hibernate',
                            action: () => {
                                choice({
                                    title: "Confirmation",
                                    message: "Are you sure you want to shut down your computer?",
                                    onConfirm: () => {
                                        if (audioCtx && audioCtx.state == "running" || audioCtx.state == "suspended") { audioCtx.close(); window.TYPE_FUNCTION = "HIBERNATE" }
                                    }
                                });
                            }
                        },
                        { titlegroup: "This App" },
                        {
                            icon: "icons/monosource/restart_alt.svg",
                            icontint: true,
                            label: "Restart",
                            action: () => {
                                restartFunc();
                            }
                        },
                        {
                            icon: "icons/monosource/close.svg",
                            icontint: true,
                            label: "Exit",
                            action: () => {
                                closeFunc();
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
                    registerContextMenuonAltMenu(ev, el, [
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
                    ]);
                }
            });
        });
    });

    ["altmenu_6"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonAltMenu(ev, el, [
                        { titlegroup: "Operation" },
                        {
                            icon: "icons/monosource/folder_open.svg",
                            icontint: true,
                            label: "Media Browser",
                            action: () => {
                                ipcRenderer.send('open_mediabrowser');
                            }
                        },
                        { titlegroup: "Debug" },
                        {
                            icon: "icons/monosource/terminal.svg",
                            icontint: true,
                            label: "Console",
                            action: () => {
                                ipcRenderer.send('open_devconsole');
                            }
                        },
                        {
                            icon: "icons/monosource/webaudioapi_logo.svg",
                            icontint: true,
                            label: "Show System Renderer",
                            action: () => {
                                ipcRenderer.send('open_systemRenderer');
                            }
                        },
                        { titlegroup: "External TV" },
                        {
                            type: "checkbox",
                            icon: "icons/monosource/tv.svg",
                            icontint: true,
                            label: "Enable",
                            checked: document.getElementById('toggleVisualiserCheckbox').checked,
                            onchange: (v) => {
                                document.getElementById('toggleVisualiserCheckbox').checked = v
                                document.getElementById('toggleVisualiserCheckbox').dispatchEvent(new Event("change", { bubbles: true }));
                            }
                        },
                        {
                            type: "checkbox",
                            icon: "icons/monosource/lyrics.svg",
                            icontint: true,
                            label: "Show Embedded Lyrics",
                            checked: letLyric,
                            onchange: (v) => {
                                document.getElementById('toggleLyricCheckbox').checked = v
                                document.getElementById('toggleLyricCheckbox').dispatchEvent(new Event("change", { bubbles: true }));
                            }
                        }
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
                    registerContextMenuonAltMenu(ev, el, [
                        { titlegroup: "Install Packs" },
                        {
                            icon: "icons/monosource/download.svg",
                            icontint: true,
                            label: "Sampler",
                            action: () => {
                                choice({
                                    title: "You are about to download a sound effects pack",
                                    message: "The app will download a sample pack from the separate repository on GitHub," +
                                        " By clicking 'Yes', you are agree to remove existiing Sound Effects to update (if you have already). " + "or download for first setup.",
                                    onConfirm: () => {
                                        document.getElementById('downloadDialog').show();
                                        startUpdate(0);
                                    }
                                });
                            }
                        },
                        {
                            icon: "icons/monosource/download.svg",
                            icontint: true,
                            label: "Looper",
                            action: () => {
                                choice({
                                    title: "You are about to download a looper pack",
                                    message: "The app will download a looper pack from the separate repository on GitHub," +
                                        " By clicking 'Yes', you are agree to remove existiing Looper Pack to update (if you have already). " + "or download for first setup.",
                                    onConfirm: () => {
                                        document.getElementById('downloadDialog').show();
                                        startUpdate(1);
                                    }
                                });
                            }
                        },
                        { titlegroup: "Dashboard" },
                        {
                            icon: "icons/monosource/refresh.svg",
                            icontint: true,
                            label: "Refresh Data",
                            action: () => {
                                clearInfo();
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
                    registerContextMenuonAltMenu(ev, el, [
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
                                window.open("https://vjdyofficial.github.io", "_blank");
                            }
                        },
                        {
                            label: "VJDY News",
                            action: () => {
                                window.open("https://vjdyofficialpictures.blogspot.com", "_blank");
                            }
                        },
                        { titlegroup: "Feedback" },
                        {
                            label: "User Guide",
                            icon: "icons/monosource/help.svg",
                            icontint: true,
                            action: () => {
                                window.open("https://vjdyofficial.github.io/docs/sfxstudio.html", "_blank")
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
                        { titlegroup: "This App" },
                        {
                            label: "Welcome",
                            icon: "icons/monosource/waving_hand.svg",
                            icontint: true,
                            action: () => {
                                ipcRenderer.send('welcome');
                            }
                        },
                        {
                            icon: "icons/monosource/info.svg",
                            icontint: true,
                            label: "About this app...",
                            action: () => {
                                ipcRenderer.send('AboutExecute');
                            }
                        },
                        {
                            icon: "icons/monosource/electron_2.svg",
                            icontint: true,
                            label: "About Electron...",
                            action: () => {
                                ipcRenderer.send('AboutElectron');
                            }
                        },
                    ]);
                }
            });
        });
    });
}

["visualisercard"].forEach(id => {
    const el = document.getElementById(id);
    ['click'].forEach(listener => {
        el.addEventListener(listener, (ev) => {
            registerContextMenu(ev, el, [
                { titleholder: "Type" },
                {
                    type: "radio",
                    icon: "icons/monosource/visulaiser.svg",
                    icontint: true,
                    label: "Spectrum",
                    checked: (VISUALIZER_TYPE == 0),
                    onchange: (v) => {
                        clearBeforeSetVisualizer(0);
                    }
                },
                {
                    type: "radio",
                    icon: "icons/monosource/osc.svg",
                    icontint: true,
                    label: "Oscillioscope",
                    checked: (VISUALIZER_TYPE == 2),
                    onchange: (v) => {
                        clearBeforeSetVisualizer(2);
                    }
                },
            ]);
        });
    });
});

["surround_spectator"].forEach(id => {
    const el = document.getElementById(id);
    ['contextmenu'].forEach(listener => {
        el.addEventListener(listener, (ev) => {
            registerContextMenu(event, el, [
                {
                    label: ((!ituTest.running) ? "Start BLITS Test" : "Stop BLITS Test"),
                    icon: "icons/monosource/surround_sound.svg",
                    icontint: true,
                    action: () => {
                        audiotestSurround();
                    }
                },
                { titleholder: "Channel Label" },
                {
                    type: "radio",
                    label: "Name",
                    checked: (SURROUND_CHANNEL_NAMING == 0),
                    onchange: (v) => {
                        setNames(0);
                    }
                },
                {
                    type: "radio",
                    label: "Channel Number",
                    checked: (SURROUND_CHANNEL_NAMING == 2),
                    onchange: (v) => {
                        setNames(2);
                    }
                },
                {
                    type: "radio",
                    label: "Windows Code",
                    checked: (SURROUND_CHANNEL_NAMING == 1),
                    onchange: (v) => {
                        setNames(1);
                    }
                },
                {
                    type: "radio",
                    label: "DaVinci Resolve",
                    checked: (SURROUND_CHANNEL_NAMING == 3),
                    onchange: (v) => {
                        setNames(3);
                    }
                },
                {
                    type: "radio",
                    label: "Standard Identifiers",
                    checked: (SURROUND_CHANNEL_NAMING == 4),
                    onchange: (v) => {
                        setNames(4);
                    }
                },
            ]);
        });
    });
});

[".ANDROMEDA_METERS"].forEach(id => {
    const el = document.querySelector(id);
    ['contextmenu'].forEach(listener => {
        el.addEventListener(listener, (ev) => {
            registerContextMenu(ev, el, [
                { titleholder: "Type" },
                {
                    type: "radio",
                    label: "Horizontal",
                    checked: (document.querySelector(".ANDROMEDA_METERS").dataset.orientation == "portrait"),
                    onchange: (v) => {
                        localStorage.setItem("ANDROMEDA_METERS", "portrait");
                        (document.querySelector(".ANDROMEDA_METERS").dataset.orientation = "portrait");
                    }
                },
                {
                    type: "radio",
                    label: "Vertical",
                    checked: (document.querySelector(".ANDROMEDA_METERS").dataset.orientation == "landscape"),
                    onchange: (v) => {
                        localStorage.setItem("ANDROMEDA_METERS", "landscape");
                        (document.querySelector(".ANDROMEDA_METERS").dataset.orientation = "landscape");
                    }
                }
            ]);
        });
    });
});

titlebarContextMenu();