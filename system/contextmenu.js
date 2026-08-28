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

["stopRec"].forEach(id => {
    const el = document.getElementById(id);

    el.addEventListener("click", (ev) => {
        registerContextMenuonButton(ev, el, [
            {
                label: "Save Record",
                action: () => {
                    recordState(0)
                }
            },
            {
                label: "Save Record As",
                action: () => {
                    recordState(2)
                }
            },
            {
                label: "Discard Record",
                action: () => {
                    recordState(1)
                }
            },
            {
                label: "Cancel",
                action: () => { }
            },
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
                        { titlegroup: "Weather" },
                        {
                            icon: "icons/monosource/refresh.svg",
                            icontint: true,
                            label: "Refresh Weather Data",
                            action: () => {
                                clearWeatherInfo();
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
                            icon: "icons/monosource/power_settings_new.svg",
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
                        { titlegroup: "Operation" },
                        {
                            icon: "icons/monosource/webaudioapi_logo.svg",
                            icontint: true,
                            label: String(noiseText),
                            action: () => {
                                toggleNoise();
                            }
                        },
                        {
                            icon: "icons/monosource/webaudioapi_logo.svg",
                            icontint: true,
                            label: 'Close AudioContext',
                            action: () => {
                                choice({
                                    title: "Are you sure you want to close the AudioContext?",
                                    message: "Closing AudioContext will also exit the app for a second.",
                                    onConfirm: () => {
                                        if (audioCtx && audioCtx.state == "running" || audioCtx.state == "suspended") { audioCtx.close(); }
                                    }
                                });
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
                    ]);
                }
            });
        });
    });

    ["altmenu_5"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonAltMenu(ev, el, [
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
                        },
                        {
                            type: "checkbox",
                            icon: "icons/monosource/tv.svg",
                            icontint: true,
                            label: "External TV",
                            checked: document.getElementById('toggleVisualiserCheckbox').checked,
                            onchange: (v) => {
                                document.getElementById('toggleVisualiserCheckbox').checked = v
                                document.getElementById('toggleVisualiserCheckbox').dispatchEvent(new Event("change", { bubbles: true }));
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
                        {
                            icon: "icons/monosource/terminal.svg",
                            icontint: true,
                            label: "Developer Console",
                            action: () => {
                                ipcRenderer.send('open_devconsole');
                            }
                        },
                        { titlegroup: "On-screen Graphic" },
                        {
                            icon: "icons/monosource/analogclock.svg",
                            icontint: true,
                            label: "Browser Source",
                            action: () => {
                                copyOBSURL();
                            }
                        },
                        {
                            icon: "icons/monosource/deck-iconvolume.svg",
                            icontint: true,
                            label: "Control Panel",
                            action: () => {
                                copyOBS_AudioDock();
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
                    registerContextMenuonAltMenu(ev, el, [
                        {
                            icon: "icons/monosource/download.svg",
                            icontint: true,
                            label: "Install or Update Pack",
                            action: () => {
                                choice({
                                    title: "You are about to download a sound effects pack",
                                    message: "The app will download a sample pack from the separate repository on GitHub," +
                                        " By clicking 'Yes', you are agree to remove existiing Sound Effects to update (if you have already). " + "or download for first setup.",
                                    onConfirm: () => {
                                        document.getElementById('downloadDialog').show();
                                        startUpdate();
                                    }
                                });
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
                            label: "Donate via GCash",
                            action: () => {
                                window.open("https://sites.google.com/view/vjdyofficial/donate-via-gcash", "_blank");
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
                            label: "Call ChibiKaye for Guide",
                            icon: "icons/monosource/call.svg",
                            icontint: true,
                            action: () => {
                                startSpotlightTutorial();
                            }
                        },
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
                    ]);
                }
            });
        });
    });

    ["altmenu_7"].forEach(id => {
        const el = document.getElementById(id);
        ['click', 'mouseenter'].forEach(listener => {
            el.addEventListener(listener, (ev) => {
                if (ev.type !== 'click' && isonContextMenu || !isonContextMenu && ev.type !== 'mouseenter') {
                    isonContextMenu = true;
                    registerContextMenuonAltMenu(ev, el, [
                        {
                            icon: "icons/monosource/lyrics.svg",
                            icontint: true,
                            label: "Get Text Event",
                            action: () => {
                                copyeventtext()
                            }
                        },
                    ]);
                }
            });
        });
    });
}

["visualisercard", "visualisercard_2", "visualisercard_3"].forEach(id => {
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
                    icon: "icons/monosource/spectrogram.svg",
                    icontint: true,
                    label: "Spectrogram",
                    checked: (VISUALIZER_TYPE == 3),
                    onchange: (v) => {
                        clearBeforeSetVisualizer(3);
                    }
                },
                {
                    type: "radio",
                    icon: "icons/monosource/sampler.svg",
                    icontint: true,
                    label: "Waveform",
                    checked: (VISUALIZER_TYPE == 1),
                    onchange: (v) => {
                        clearBeforeSetVisualizer(1);
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

const WM = new WindowManager();
WM.createWindow("surround_floatingwindow", '1/1', '400px', '400px', 'Surround Spectator');

["surround_spectator"].forEach(id => {
    const el = document.getElementById(id);
    ['contextmenu'].forEach(listener => {
        el.addEventListener(listener, (ev) => {
            registerContextMenu(event, el, [
                {
                    label: ((document.querySelector('[data-app="surround_spectator"]') === null) ? "Floating Window" : "Back to Panel"),
                    icon: ((document.querySelector('[data-app="surround_spectator"]') === null) ? "icons/monosource/picture_in_picture.svg" : "icons/monosource/deck-layout-right.svg"),
                    icontint: true,
                    action: () => {
                        if (document.querySelector('[data-app="surround_spectator"]') === null) {
                            WM.bringToWindow("surround_spectator", "surround_floatingwindow");
                            document.querySelector('.deckbarbutton_srs[data-editorsrs="A"]').click();
                            document.querySelector('.deckbarbutton_srs[data-editorsrs="C"]').hidden = true;
                        } else {
                            WM.quitFromWindow("surround_spectator");
                        };
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

titlebarContextMenu();

WM.onWindowQuit = (appId) => {
    if (appId === "surround_spectator") {
        document.querySelector('.deckbarbutton_srs[data-editorsrs="C"]').click();
        document.querySelector('.deckbarbutton_srs[data-editorsrs="C"]').hidden = false;
    }
}