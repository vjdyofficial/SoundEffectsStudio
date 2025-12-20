const { ipcRenderer } = require('electron');

ipcRenderer.send('request-window-state');

ipcRenderer.on('dialog-close', () => {
  closeDialogInsteadofApp();
});

function playRenderSound(bool) {
  const audio = document.createElement('audio')
  audio.id = "render"

  audio.src = bool ? "audio/render_okay.wav" : "audio/render_fail.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playChargingSound() {
  const audio = document.createElement('audio')
  audio.id = "render"

  audio.src = "audio/charging.wav"
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playDischargingSound() {
  const audio = document.createElement('audio')
  audio.id = "render"

  audio.src = "audio/discharging.wav"
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playBatterySound(bool) {
  const audio = document.createElement('audio');
  audio.id = "render"

  audio.src = bool ? "audio/batterycriticallow.wav" : "audio/batterylow.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function isPlaying(mediaEl) {
  return !!(
    mediaEl.currentTime > 0 &&
    !mediaEl.paused &&
    !mediaEl.ended &&
    mediaEl.readyState > 2
  );
}

function closeFunc() {
  const storedata = document.getElementById('storedata');
  const mediaplayer = document.getElementById('MediaExtDeck1');
  const mediaplayer2 = document.getElementById('MediaExtDeck2');
  dropdownClose();
  if (storedata &&
    storedata.querySelectorAll('audio').length > 0 || (recorder && recorder.state !== "inactive") ||
    isPlaying(mediaplayer) || isPlaying(mediaplayer2) || isPlaying(document.getElementById('mediaA')) ||
    isPlaying(document.getElementById('mediaB')) || isPlaying(document.getElementById('mediaC')) ||
    isPlaying(document.getElementById('mediaD'))) {
    const securityDialog = document.getElementById('securityDialog');
    securityDialog.show()
  } else {
    ipcRenderer.send('window-action', 'close-permanent');
  }
}

function closeDialogInsteadofApp() {
  if (!preventDialogfromOpening() == 0) {
    closeAllDialogs();
    event.preventDefault();
  } else {
    closeFunc()
  }
}

document.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "F4" && !event.repeat) {
    e.preventDefault();
  };
});

document.getElementById('close-btn-permanent').addEventListener('click', () => {
  ipcRenderer.send('window-action', 'close-permanent');
});

document.getElementById('restart-btn-permanent').addEventListener('click', () => {
  ipcRenderer.send('window-action', 'restart');
});

navigator.mediaSession.metadata = null;
navigator.mediaSession.setActionHandler('play', null);
navigator.mediaSession.setActionHandler('pause', null);
navigator.mediaSession.setActionHandler('seekbackward', null);
navigator.mediaSession.setActionHandler('seekforward', null);
navigator.mediaSession.setActionHandler('previoustrack', null);
navigator.mediaSession.setActionHandler('nexttrack', null);

ipcRenderer.on('profile-picture', (event, dataUrl) => {
  document.getElementById("profile-pic").src = dataUrl;
});

ipcRenderer.on('username', (event, username) => {
  document.getElementById('usrname_title').title = `You used this app as ${username}.`
});

ipcRenderer.on('sendInfo', (event, electronBuilderVersion, appVersion, chromiumVersion, electronVersion, nodeVersion, buildID) => {
  document.getElementById('appVersion').innerText = appVersion;
  document.getElementById('electronVersion').innerText = electronVersion;
  document.getElementById('chromeVersion').innerText = chromiumVersion;
  document.getElementById('nodeVersion').innerText = nodeVersion;
  document.getElementById('buildID').innerText = buildID;
});

ipcRenderer.on('fadeIn', () => {
  setInterval(() => {
    document.getElementById('initBackdropFirst').classList.add('onInitReady');
  }, 2500);
});

document.querySelectorAll('select').forEach(select => {
  select.addEventListener('mousedown', (e) => {
    e.preventDefault(); // stop native dropdown
    setTimeout(() => openCustomMenu(select), 0);
  });
});

function openCustomMenu(select) {
  const existing = document.querySelector('.custom-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'custom-menu';
  menu.innerHTML = Array.from(select.options)
    .map(
      (opt) => `
        <div class="item ${opt.disabled ? 'disabled' : ''}" 
             data-value="${opt.value}">
          ${opt.innerHTML}
        </div>`
    )
    .join('');
  document.body.appendChild(menu);

  const rect = select.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.minWidth = `${rect.width}px`;
  menu.style.left = `${rect.left}px`;
  menu.style.zIndex = 2025;
  menu.style.opacity = 0;
  menu.style.transform = 'scaleY(0.95)'; // start slightly shrunken
  if (select.id !== 'categoryDropdown') {
    menu.style.maxHeight = '250px';
    menu.style.overflowY = 'auto';
  }

  // Let DOM render first
  requestAnimationFrame(() => {
    const menuHeight = menu.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let openUp = false;
    if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
      openUp = true;
      menu.style.top = `${rect.top - menuHeight - 4}px`;
      menu.classList.add('flip-up');
    } else {
      menu.style.top = `${rect.bottom + 4}px`;
      menu.classList.remove('flip-up');
    }

    requestAnimationFrame(() => {
      menu.classList.add('show');
      menu.style.opacity = 1;
      menu.style.transform = 'scaleY(1)';
      menu.dataset.direction = openUp ? 'up' : 'down';
    });
  });

  // Click select
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (!item || item.classList.contains('disabled')) {
      closeMenu(menu);
    } else {
      select.value = item.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu(menu);
    }
  });

  // Click outside
  const close = (e2) => {
    if (!menu.contains(e2.target)) closeMenu(menu);
  };
  document.addEventListener('mousedown', close, { once: true });
}

// Hide animation
function closeMenu(menu) {
  menu.classList.remove('show');
  menu.style.opacity = 0;
  setTimeout(() => menu.remove(), 150);
}

// ESC closes
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const menu = document.querySelector('.custom-menu');
    if (menu) closeMenu(menu);
  }
});

// Hotkey: close custom menu when pressing any key while focus is outside the menu
document.addEventListener('keydown', (e) => {
  const menu = document.querySelector('.custom-menu');
  if (!menu) return;
  // If focus is not inside the menu, close it on any key
  if (!menu.contains(document.activeElement)) {
    closeMenu(menu);
  }
});

// Close custom menu on window resize
window.addEventListener('resize', () => {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);
  hideContextMenu();
});

window.addEventListener('blur', () => {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);
  hideContextMenu();
});

let rafCount = 0;

function monitorCustomMenu() {
  const menu = document.querySelector('.custom-menu');
  const blockArea = document.getElementById('blockArea');
  if (menu && menu.classList.contains('show')) {
    rafCount++;
    if (blockArea) blockArea.classList.add('enable');
  } else {
    rafCount = 0;
    if (blockArea) blockArea.classList.remove('enable');
  }
  requestAnimationFrame(monitorCustomMenu);
}

monitorCustomMenu();

function createDialogMessage(
  msg, title = "Alert",
  needsrestart = false,
  needsexit = false,
  hideOKButton = false,
  dialogtype = ""
) {
  const visibleOKBtn = hideOKButton ? 'none' : 'inherit';
  const visibleExitBtn = needsexit ? 'inherit' : 'none';
  const visibleRestartBtn = needsrestart ? 'inherit' : 'none';

  const dialog = document.createElement('dialog')
  dialog.classList.add('monosource_dialog')
  dialog.dataset.dialogType = dialogtype
  dialog.id = 'alertMessage'
  dialog.innerHTML = `
    <h3>${title}</h3>
        <div class="arrangement">
            <div class="content">
                <div class="spacerelement"></div>
                <p>
                    ${msg}
                </p>
                <div class="spacerelement-large"></div>
            </div>
            <div class="spacerelement">
                <!-- This space is for layout purposes -->
            </div>
        </div>
        <div class="mns-button-placeholder monosource_span">
            <div class="spacer"></div>
            <button id="alertClickClose" class="monosource_secbutton" style="display: ${visibleOKBtn};">OK</button>
            <button id="alertClickRestart" class="monosource_secbutton" style="display: ${visibleRestartBtn};">Restart</button>
            <button id="alertClickExit" class="monosource_secbutton" style="display: ${visibleExitBtn};">Exit</button>
        </div>
  `

  document.body.append(dialog)
  dialog.show();

  const length = document.querySelectorAll('#alertMessage').length - 1

  document.querySelectorAll('#alertClickClose')[length].addEventListener('click', () => {
    const dialogOnInit = document.querySelectorAll('#alertMessage')[length]
    CloseAnimationInit(dialogOnInit);
    setTimeout(() => {
      dialogOnInit.remove();
    }, 200);
  });

  document.querySelectorAll('#alertClickRestart')[length].addEventListener('click', () => {
    ipcRenderer.send('window-action', 'restart');
  });

  document.querySelectorAll('#alertClickExit')[length].addEventListener('click', () => {
    ipcRenderer.send('window-action', 'close-permanent');
  });
}

function createDialogImage(src = "") {
  const dialog = document.createElement('dialog')
  dialog.classList.add('monosource_dialog')
  dialog.id = 'imagePreviewDialog'
  dialog.innerHTML = `
    <img class="widthfill" src="${src}">
    <hr class="spacerelement">
        <div class="mns-button-placeholder monosource_span">
            <div class="spacer"></div>
            <button id="alertClickClose" class="monosource_secbutton">Close</button>
        </div>
  `

  document.body.append(dialog)
  dialog.show();

  const length = document.querySelectorAll('#imagePreviewDialog').length - 1

  document.querySelectorAll('#imagePreviewDialog')[length].addEventListener('click', () => {
    const dialogOnInit = document.querySelectorAll('#imagePreviewDialog')[length]
    CloseAnimationInit(dialogOnInit);
    setTimeout(() => {
      dialogOnInit.remove();
    }, 200);
  });
}

window.alert = (msg, title, needsrestart, needsexit, hideOKButton, dialogtype) => {
  createDialogMessage(msg, title, needsrestart, needsexit, hideOKButton, dialogtype)
};

function saveImage(element) {
  if (!element) return;

  // Ensure element is an HTMLImageElement
  const img = element instanceof HTMLImageElement ? element : null;
  if (!img) {
    console.error("saveImage: element is not an HTMLImageElement");
    return;
  }

  // Wait for image to load if not loaded yet
  if (!img.complete || img.naturalWidth === 0) {
    img.onload = () => saveImage(img);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  canvas.toBlob(blob => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);

    const name = element.id || "image";
    a.download = name + ".png";

    a.click();
    URL.revokeObjectURL(a.href); // clean up
  });
}

function saveBase64(element) {
  if (!element) return;

  const img = element instanceof HTMLImageElement ? element : null;
  if (!img) {
    console.error("saveBase64: element is not an HTMLImageElement");
    return;
  }

  // Wait for image to load
  if (!img.complete || img.naturalWidth === 0) {
    img.onload = () => saveBase64(img);
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const base64 = canvas.toDataURL("image/png");

  // Save as text file
  const blob = new Blob([base64], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);

  const name = element.id || "image";
  a.download = name + "image.b64i";

  a.click();
  URL.revokeObjectURL(a.href); // clean up
}

ipcRenderer.on("openbase64_image", (event, filePath) => {
  createDialogImage(filePath);
})

function decimalToHexAlpha(decimal) {
  // Clamp between 0 and 1 just in case
  const value = Math.round(Math.min(Math.max(decimal, 0), 1) * 255);
  // Convert to 2-digit hex
  return value.toString(16).padStart(2, '0').toUpperCase();
}

const textElements = document.querySelectorAll(".scroll-text p");

textElements.forEach(el => {
  const parent = el.parentElement;
  if (!parent) return;

  const updateAnimation = () => {
    const parentWidth = parent.clientWidth;
    const childWidth = el.scrollWidth;

    const overflowing = childWidth > parentWidth;

    if (overflowing) {
      el.setAttribute("data-direction", "loop-ease");

      // compute dynamic duration
      const defaultParent = 200;    // baseline width
      const defaultDuration = 10;   // 10s at 200px

      const ratio = childWidth / defaultParent;
      const newDuration = ratio * defaultDuration;

      el.style.animationDuration = `${newDuration}s`;
    } else {
      el.removeAttribute("data-direction");
      el.style.animationDuration = ""; // reset
    }
  };

  // Initial check
  updateAnimation();

  // Observe parent and child size changes
  const observer = new ResizeObserver(updateAnimation);
  observer.observe(parent);
  observer.observe(el);
});

ipcRenderer.on('importbbcx', async (event, content) => {
  if (content !== null) {
    document.getElementById('inputText').value = content;
    updatePreview();
    document.getElementById('textdesigner').show();
  }
});

ipcRenderer.on('import_presentbbcx', async (event, content) => {
  if (content !== null) {
    document.getElementById('inputText').value = content;
    updatePreview();
    document.getElementById("compileBtn").click();
  }
});

document.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.blur(); // lose focus immediately after click
  });
});

function enableSliderWheel(acceleration = 1, exclude = []) {
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    // Skip sliders in the exclude array
    if (exclude.includes(slider)) return;

    slider.addEventListener('wheel', (e) => {
      e.preventDefault(); // prevent page scroll

      const min = parseFloat(slider.min) || 0;
      const max = parseFloat(slider.max) || 100;
      const step = parseFloat(slider.step) || 1;

      // Calculate change with acceleration based on wheel delta
      let change = (e.deltaY < 0 ? 1 : -1) * step * acceleration;

      slider.value = Math.min(max, Math.max(min, parseFloat(slider.value) + change));

      // Dispatch input event so any live listeners update
      slider.dispatchEvent(new Event('input'));
    }, { passive: false });
  });
}

// Example usage:
const progress1 = document.getElementById('progress1');
const progress2 = document.getElementById('progress2');

// These sliders will be ignored by the wheel
enableSliderWheel(2, [progress1, progress2]);

ipcRenderer.on('system-close-clicked', () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById('toggleVisualiserCheckbox');
  chk.checked = false;

  chk.dispatchEvent(new Event('change', { bubbles: true }));
});

ipcRenderer.on('system-close-clicked-vumeter', () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById('toggleVUMeterCheckbox');
  chk.checked = false;

  chk.dispatchEvent(new Event('change', { bubbles: true }));
});

let activeInput = null;
document.querySelectorAll('input[type=color]').forEach(inp => {
  inp.addEventListener('click', e => {
    e.preventDefault();
    activeInput = inp;
    ipcRenderer.send('open-color-dialog', inp.value);
  });
});

ipcRenderer.on('apply-color', (event, color) => {
  if (activeInput) {
    activeInput.value = color;
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
});

downloadProgress = document.getElementById('downloadPorgress')

// Start download
async function startUpdate() {
  downloadProgress.textContent = `Starting...`
  StopAllAudio();
  clearAudioButtons();
  const result = await ipcRenderer.invoke("download-update-pack");
  if (result.success) {
    downloadProgress.textContent = "Update complete!"
    playRenderSound(true);
    setTimeout(() => {
      CloseAnimationInit(document.getElementById('downloadDialog'));
      loadSFX();
    }, 3000);
  } else {
    downloadProgress.textContent = "Update failed:", result.error
    playRenderSound(false);
    setTimeout(() => {
      CloseAnimationInit(document.getElementById('downloadDialog'));
      loadSFX();
    }, 3000);
  }
}

// Listen for progress
ipcRenderer.on("download-progress", (event, data) => {
  const { stage, percent } = data;
  downloadProgress.textContent = `[${stage}] ${percent}%`
});

let pinwindow = false;

document.getElementById('pinbtn').addEventListener('click', (e) => {
  pinwindow = !pinwindow;
  ipcRenderer.send('set-pinwindow', pinwindow);
})

ipcRenderer.on('icon-pinwindow', (event, bool) => {
  document.getElementById('pinIcon').src = bool ? 'icons/codicons/pinned.svg' : 'icons/codicons/pin.svg';
})

ipcRenderer.on('force-scale-updated', (_, scale) => {
  createDialogMessage(`Interface Scale has been applied to ${Number(scale).toFixed(2)}. Please restart app to take effect.`, "Confirmation", true, false, false);
});

ipcRenderer.on('scale-updated', (e, scale) => {
  document.getElementById('scaleSlider').value = Number(scale).toFixed(2);
  document.getElementById('scaleSlider').dispatchEvent(new Event("input", { bubbles: true }));
});

document.getElementById('scaleSlider').addEventListener('input', (e) => {
  document.getElementById('scaleSliderText').textContent = Number(e.target.value).toFixed(2);
});

document.getElementById('scaleSlider').addEventListener('change', (e) => {
  ipcRenderer.send('set-force-scale', Number(e.target.value));
});

document.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;

    let ripple = btn.querySelector(".ripple");
    if (!ripple) {
        ripple = document.createElement("span");
        ripple.className = "ripple";
        btn.appendChild(ripple);
    }

    const rect = btn.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 1.05;

    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left}px`;
    ripple.style.top = `${e.clientY - rect.top}px`;

    ripple.classList.remove("animate");
    void ripple.offsetWidth; // trigger reflow
    ripple.classList.add("animate");

    // Remove ripple after animation ends to preserve memory
    ripple.addEventListener("animationend", () => {
        ripple.remove();
    }, { once: true }); // 'once' ensures it only runs one time
});

const cursorToggle = document.getElementById("highlight-cursor-toggle");
const cursor = document.getElementById("cursor-highlight");
const cursorbg = document.getElementById("cursor-highlight-bg");

// Load user preference from localStorage
const highlightEnabled = localStorage.getItem("appearance-highlightcursor") === "true";

// Set initial state
cursorToggle.checked = highlightEnabled;
cursor.style.display = highlightEnabled ? "block" : "none";
cursorbg.style.display = highlightEnabled ? "block" : "none";

// Toggle on checkbox change
cursorToggle.addEventListener("change", e => {
  const enabled = e.target.checked;
  localStorage.setItem("appearance-highlightcursor", enabled);
  cursor.style.display = enabled ? "block" : "none";
  cursorbg.style.display = enabled ? "block" : "none";
});

// Follow the mouse
document.addEventListener("mousemove", e => {
  cursor.style.left = `${e.clientX}px`;
  cursor.style.top = `${e.clientY}px`;
  cursorbg.style.left = `${e.clientX}px`;
  cursorbg.style.top = `${e.clientY}px`;

  // make visible when moving inside window
  cursor.style.opacity = "1";
  cursorbg.style.opacity = "1";
});

// On click, do a “pop” animation
document.addEventListener("mousedown", () => {
  cursor.classList.add("active");
  cursorbg.classList.add("active");
});
document.addEventListener("mouseup", () => {
  cursor.classList.remove("active");
  cursorbg.classList.remove("active");
});

// Hide when leaving window
document.addEventListener("mouseleave", () => {
  cursor.style.opacity = "0";
  cursorbg.style.opacity = "0";
});