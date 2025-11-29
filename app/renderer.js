const { ipcRenderer } = require('electron');

ipcRenderer.send('request-window-state');

ipcRenderer.on('dialog-close', () => {
  closeDialogInsteadofApp();
});

document.getElementById('powershell_rundownload').addEventListener('click', () => {
  document.getElementById('downloadDialog').show();
  dropdownClose();
  ipcRenderer.send('powershell_rundownload');
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
    storedata.querySelectorAll('audio').length > 0 ||
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

document.getElementById('windows-soundsettings').addEventListener('click', (e) => {
  if (e.shiftKey) {
    ipcRenderer.send('window-action', 'windows-legacy-soundsettings');
  } else {
    ipcRenderer.send('window-action', 'windows-soundsettings');
  }
});

document.getElementById('windows-openvolumemixer').addEventListener('click', (e) => {
  if (e.shiftKey) {
    ipcRenderer.send('window-action', 'windows-legacy-openvolumemixer');
  } else {
    ipcRenderer.send('window-action', 'windows-openvolumemixer');
  }
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
  document.getElementById("profile-pic2").src = dataUrl;
});

ipcRenderer.on('username', (event, username) => {
  document.getElementById("username").textContent = username;
  document.getElementById('usrname_title').title = `You used this app as ${username}.`
});

ipcRenderer.on('sendInfo', (event, electronBuilderVersion, appVersion, chromiumVersion, electronVersion, nodeVersion, buildID) => {
  document.getElementById('appVersion').innerText = appVersion;
  document.getElementById('electronVersion').innerText = electronVersion;
  document.getElementById('chromeVersion').innerText = chromiumVersion;
  document.getElementById('nodeVersion').innerText = nodeVersion;
  document.getElementById('buildID').innerText = buildID;
});

ipcRenderer.on('sfx-status', (event, data) => {
  document.getElementById('packButton').innerText = data.text;
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
});

window.addEventListener('blur', () => {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);
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
  dialog.showModal();

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
  dialog.showModal();

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