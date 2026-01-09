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

function playSuccessGuideSound() {
  const audio = document.createElement('audio')

  audio.src = "audio/render_okay.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playClick() {
  const audio = document.createElement('audio')

  audio.src = "audio/click.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playTypewriter() {
  const audio = document.createElement('audio')

  audio.src = "audio/typewriter.wav";
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

  if (document.querySelector('.chibi-widget').style.display.toLowerCase() !== 'none') {
    snackbar('Closing app was disabled during spotlight tutorial. Please end the tutorial first. or click Skip to enable closing the app.');
  } else {
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

}

function closeDialogInsteadofApp() {
  if (!preventDialogfromOpening() == 0) {
    closeAllDialogs();
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
  document.getElementById('initText').textContent = "Optimizing application...";
  setTimeout(() => {
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
    <img class="widthfill aprt_1-1" src="${src}">
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
    if (document.getElementById("compileBtn").disabled === false) {
      document.getElementById("compileBtn").click();
    } else {
      snackbar("Cannot compile presentation. Please stop the teleprompter first.");
    }
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
const progressA = document.getElementById('progressA');
const progressB = document.getElementById('progressB');
const progressC = document.getElementById('progressC');
const progressD = document.getElementById('progressD');

// These sliders will be ignored by the wheel
enableSliderWheel(2, [progress1, progress2, progressA, progressB, progressC, progressD]);

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

ipcRenderer.on('system-close-clicked-clock', () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById('toggleClockCheckbox');
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
      loadSFXList();
    }, 3000);
  } else {
    downloadProgress.textContent = "Update failed:", result.error
    playRenderSound(false);
    setTimeout(() => {
      CloseAnimationInit(document.getElementById('downloadDialog'));
      loadSFXList();
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

function copyOBSURL() {
  const path = require("path");

  createDialogMessage(
    `
<p>This widget is applied to both of your livestream or TV-alike screen.</p><br>
<p class="mns-text-small">To use it, open OBS Studio and add a new "Browser" source to your scene.</p>
<p class="mns-text-small">Copy this URL and paste to the Properties of a Browser Source in OBS Studio.</p>
<div class="monosource_md2_textbox" data-label="OBS Clock URL">
<textarea readonly style="width:100%;height:60px; resize: none;" class="monosource_md2_input mns-text-small monospace_font">
${path.join(__dirname, "clock_obs.html")}
</textarea>
</div>
<p class="mns-text-small">You can adjust the width and height as needed, but the default size is based on screen pixels for optimal display.</p>
` + `
<p class="mns-text-small">Also copy this CSS to customize the color appearance:</p>
<div class="monosource_md2_textbox" data-label="CSS">
<textarea readonly style="width:100%;height:100px; resize: none;" class="monosource_md2_input mns-text-small monospace_font">
:root {
--defaultcolorobs: #dfff93;
}
</textarea>
</div>
<p class="mns-text-small">Click "OK" to add the source to your scene.</p>
`,
    "OBS Clock Widget Procedure",
  );
};

// Global SFX audio context
const audioCtxSFX = new (window.AudioContext || window.webkitAudioContext)();

const sfxBuffers = {
  typing: null
};

// preload typing sound
async function loadSFX(name, url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await audioCtxSFX.decodeAudioData(arrayBuffer);
  sfxBuffers[name] = audioBuffer;
}

// call once on app start
loadSFX('typing', 'audio/typing.wav');
loadSFX('typing2', 'audio/typing2.wav');
loadSFX('click', 'audio/click.wav');

function playSFX(name, volume = 0.15) {
  const buffer = sfxBuffers[name];
  if (!buffer) return;

  // resume context if needed (autoplay policy safe)
  if (audioCtxSFX.state === 'suspended') {
    audioCtxSFX.resume();
  }

  const source = audioCtxSFX.createBufferSource();
  const gain = audioCtxSFX.createGain();

  source.buffer = buffer;
  gain.gain.value = volume;

  source.connect(gain).connect(audioCtxSFX.destination);
  source.start();
}

let typewriterTimer = null;

function typewriter(
  el,
  text,
  framesPerChar = 2, // 1 = fast, 2 = natural
  rect,
  viewportWidth,
  viewportHeight
) {
  if (!el) return;

  // stop previous typing
  if (typewriterTimer) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
  }

  el.textContent = '';

  const chars = [...text];
  let i = 0;

  const frameTime = 16; // ~60fps
  let intervalTime = frameTime * framesPerChar;

  typewriterTimer = setInterval(() => {
    if (i >= chars.length) {
      clearInterval(typewriterTimer);
      typewriterTimer = null;
      return;
    }

    const ch = chars[i];
    el.textContent += ch;

    // 🔊 sound per frame (skip spaces)
    if (ch !== ' ') {
      playSFX('typing', 0.5);
    } else {
      playSFX('typing2', 0.5);
    }

    // keep spotlight synced
    moveSpotlight(rect, viewportWidth, viewportHeight);

    i++;
  }, intervalTime);
}

function stopTypewriter() {
  clearInterval(typewriterTimer);
  typewriterTimer = null;
}

function moveSpotlight(rect, viewportWidth, viewportHeight) {
  const chibi = document.querySelector('.chibi-widget');
  const chibiWidth = chibi.offsetWidth;
  const chibiHeight = chibi.offsetHeight;

  let chibiLeft;
  let chibiTop;

  const isFullWidth = rect.width >= viewportWidth - 20;
  const targetHitsBottom = rect.bottom >= viewportHeight - 10;

  /* -----------------------------
     HORIZONTAL
  ----------------------------- */
  if (isFullWidth) {
    chibiLeft = (viewportWidth - chibiWidth) / 2;
  } else {
    chibiLeft = rect.right + 20;
    if (chibiLeft + chibiWidth > viewportWidth) {
      chibiLeft = rect.left - chibiWidth - 20;
    }
  }

  /* -----------------------------
     VERTICAL (KEY FIX)
  ----------------------------- */
  if (targetHitsBottom) {
    // stick to TOP of spotlight
    chibiTop = rect.top - chibiHeight - 16;
  } else {
    // normal: align with target top
    chibiTop = rect.top;
  }

  // clamp inside viewport
  if (chibiTop < 10) chibiTop = 10;
  if (chibiTop + chibiHeight > viewportHeight) {
    chibiTop = viewportHeight - chibiHeight - 10;
  }

  chibi.style.left = `${Math.max(10, chibiLeft)}px`;
  chibi.style.top = `${chibiTop}px`;
}

function spotlight(targetId, emote, message) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let spotlightEl;

  if (!document.querySelector('.spotlight')) {
    spotlightEl = document.createElement('div');
    spotlightEl.className = 'spotlight';
    document.body.appendChild(spotlightEl);
  } else {
    spotlightEl = document.querySelector('.spotlight');
  }

  // spotlight overlay
  spotlightEl.style.top = `${rect.top}px`;
  spotlightEl.style.left = `${rect.left}px`;
  spotlightEl.style.width = `${rect.width}px`;
  spotlightEl.style.height = `${rect.height}px`;

  document.getElementById('chibi').src = `images/chibikaye/${emote}.png`;
  const speechEl = document.getElementById('chibi-speech-text');

  typewriter(
    speechEl,
    message,
    3,               // frames per character
    rect,
    viewportWidth,
    viewportHeight
  );

  moveSpotlight(rect, viewportWidth, viewportHeight);
}

function spotlightNoAnim(targetId, emote, message) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const rect = target.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let spotlightEl;

  if (!document.querySelector('.spotlight')) {
    spotlightEl = document.createElement('div');
    spotlightEl.className = 'spotlight';
    document.body.appendChild(spotlightEl);
  } else {
    spotlightEl = document.querySelector('.spotlight');
  }

  spotlightEl.style.top = `${rect.top}px`;
  spotlightEl.style.left = `${rect.left}px`;
  spotlightEl.style.width = `${rect.width}px`;
  spotlightEl.style.height = `${rect.height}px`;

  document.getElementById('chibi').src = `images/chibikaye/${emote}.png`;
  const speechEl = document.getElementById('chibi-speech-text');

  speechEl.textContent = message;

  moveSpotlight(rect, viewportWidth, viewportHeight);
}

const defaultspotlightSteps = [
  { id: 'intro', emote: 'default', message: 'Hi! I am Kaye! Your cute app guide! click Next to guide you through all of these features!' },
  { id: 'intro', emote: 'default', message: 'If you are advanced already, you can actually skip this by clicking the Skip button or just proceed.' },
  { id: 'rack_pageB', emote: 'default', message: 'This is your performance deck! we have Media, Audio, Teleprompter, Caption and Animator!' },
  { id: 'sptl_rack', emote: 'default', message: 'Here is the effects rack which you can mix the taste of sound to your choice!' },
  { id: 'waveform_range_container', emote: 'default', message: 'This is the waveform rack. which helpful for videos that you can skip through!' },
  { id: 'waveform_range_container', emote: 'angry', message: 'Each waveform will only generate for audios with less than 2 hours to preserve massive RAM space!' },
  { id: 'timecard', emote: 'default', message: 'This shows the current time of the earth today.' },
  { id: 'weathercard', emote: 'default', message: 'Your weather info is here. which... kinda not useful but so important tho.' },
  { id: 'audio-list', emote: 'default', message: 'These are the sound button deck, which is empty or has already. haha. I will show you how to add.' },
  { id: 'altmenu_3', emote: 'default', message: 'You can press this button to install pack!' },
  { id: 'altmenu_3', emote: 'default', message: 'You can update everytime you add more new sound effects!!' },
  { id: 'statusbar', emote: 'default', message: 'This is the status bar. you can see the battery percentage (if you use laptop), effect status, USB DAC indicator, waveform and spectrogram visuals.' },
  { id: 'usbdacIndicator', emote: 'default', message: 'Speaking of USB DAC... this indicator will sometimes shown. that was a rare gadget you can have. hehehe' },
  { id: 'StopAllAudio', emote: 'default', message: 'There! We have the Panic button! useful if you put too many sound effects and you can try to stop them!' },
  { id: 'bleepBtn', emote: 'default', message: 'Also, we have Bleep Button! This was commonly used in radio stations! one press can make off air sound!' },
  { id: 'categoryDropdown', emote: 'default', message: 'and... we can actually sort sound buttons! just select category and done!' },
  { id: 'recordercard', emote: 'default', message: 'you can actually record session! well dont worry! audio effects will not apply here! the only apply to record is the audio speed, volume and pitch shift!' },
  { id: 'mediaactivecard', emote: 'default', message: 'you can also see the indicator if one of the media decks have source!' },
  { id: 'audioactivecard', emote: 'default', message: 'especially here!' },
  { id: 'performancecard', emote: 'default', message: 'and then, you can see your PC performance from here! such as FPS, CPU, RAM and GPU usage!' },
  { id: 'visualisercard', emote: 'default', message: 'if you play audio, you can see the audio visualiser here! nice!' },
  { id: 'vumetercard', emote: 'default', message: 'also, you can see the audio level meter here! cool!' },
  { id: 'peakdbcard', emote: 'default', message: 'you will see the decibels of the master audio!' },
  { id: 'masterdbcard', emote: 'cry', message: 'also you will see here if the audio is peak. what I mean peak is yeah... you never like. clipping and distortion. huhu' },
  { id: 'altmenu_2', emote: 'default', message: 'what if you better import sample music here and try audio deck for yourself?' },
  { id: 'altmenu_4', emote: 'default', message: 'If you want to see me again, feel free to call me here! my codename anyway is ChibiKaye so you can find me there!' },
  { id: 'audio-list', emote: 'laugh', message: 'oh. I forgot! haha! you can actually drag your media here including video and audio and drop! boom! you can see the Import Media Dialog!' },
  { id: 'intro', emote: 'thanks', message: 'That is it! Hope you enjoy making your occasion bring to life!' },
  { id: 'altmenu_4', emote: 'thanks', message: 'You can see the User Guide documnetation here! enjoy and happy playing!' },
];

const bbcodeSteps = [
  { id: 'intro', emote: 'question', message: 'hmmm... BBCode Designer, huh? okay. Kaye will guide you!' },
  { id: 'intro', emote: 'default', message: 'But Before that! I will tell you the meaning about BBCode if you do not know!' },
  { id: 'intro', emote: 'default', message: 'BBCode stands for Bulletin Board Code. it was use to the OG Forums back in the day.' },
  { id: 'intro', emote: 'default', message: 'This is so easy to format everything with cool stuff. so yeah. that is why we put here in the app!' },
  { id: 'intro', emote: 'default', message: 'Okay! Lets proceed!' },
  { id: 'inputText', emote: 'default', message: 'on this text area, you can write your scripts, lyrics or even lines! and style it whatever you want powered by BBCode!' },
  { id: 'resultarea', emote: 'default', message: 'you can see the result here!' },
  { id: 'formatarea', emote: 'default', message: 'dont worry if you do not know about BBCode! you can edit the properties here so you can select text in the text area and add a node!' },
  { id: 'save_bbcode', emote: 'default', message: 'you can save everytime you modified or edit for future uses! it save as BBCode Teleprompter format or BBCX.' },
  { id: 'open_bbcode', emote: 'default', message: 'you can import BBCode Teleprompter format or BBCX.' },
  { id: 'bbcode_remove', emote: 'default', message: 'remove all BBCode tags if you have to remove its format' },
  { id: 'playanimation', emote: 'default', message: 'this checkbox lets you enable animation while editing. only applied to the parent animation node.' },
  { id: 'slideLength', emote: 'default', message: 'you will see how many slides you present for later.' },
  { id: 'warning_bbcode', emote: 'default', message: 'There is a warning icon to let you know if the document contains HTML element which is not allowed to use.' },
  { id: 'altmenu_4', emote: 'default', message: 'If you want to see me again for help, feel free to call me here!' },
  { id: 'intro', emote: 'thanks', message: 'That is it! Hope you learn something! Happy editing!' },
];

let spotlightSteps = defaultspotlightSteps;
let currentStepIndex = 0;

// store current step globally
let currentStep = null;

// add persistent resize listener once
window.addEventListener('resize', () => {
  if (currentStep) {
    spotlight(currentStep.id, currentStep.emote, currentStep.message);
  }
});

function hideSpotlight() {
  const chibi = document.querySelector('.chibi-widget');
  chibi.style.display = 'none';

  // remove spotlight & arrow
  const prevSpotlight = document.querySelector('.spotlight');
  if (prevSpotlight) prevSpotlight.remove();

  document.getElementById("blockArea3").classList.remove("enable");
  stopTypewriter();
  currentStepIndex = 0; // reset if you want to restart
  currentStep = null;   // reset current step
}

function spotlightNext() {
  if (typewriterTimer) {
    clearInterval(typewriterTimer);
    typewriterTimer = null;
    spotlightNoAnim(currentStep.id, currentStep.emote, currentStep.message);
  } else {
    if (currentStepIndex >= spotlightSteps.length) {
      hideSpotlight();
      playSuccessGuideSound();
      return;
    }

    currentStep = spotlightSteps[currentStepIndex]; // store current step
    spotlight(currentStep.id, currentStep.emote, currentStep.message);
    currentStepIndex++;

    if (currentStepIndex === spotlightSteps.length) {
      document.getElementById('spotlightNextBtn').textContent = 'Close';
      document.getElementById('spotlightCloseBtn').style.display = 'none';
    } else {
      document.getElementById('spotlightNextBtn').textContent = 'Next';
      document.getElementById('spotlightCloseBtn').style.display = 'inline-block';
    }
  }
}

document.getElementById('spotlightNextBtn').addEventListener('click', () => {
  playSFX('click', 0.5);
  spotlightNext();
});

document.getElementById('spotlightCloseBtn').addEventListener('click', () => {
  playSFX('click', 0.5);
  hideSpotlight();
});

function startSpotlightTutorial() {
  if (preventDialogfromOpening() == 0 || document.getElementById('textdesigner').open === true) {
    if (document.getElementById('textdesigner').open === true) {
      closeAllDialogsExceptOne('textdesigner');
      spotlightSteps = bbcodeSteps;
    } else {
      spotlightSteps = defaultspotlightSteps;
    }

    document.getElementById("blockArea3").classList.add("enable");

    const chibi = document.querySelector('.chibi-widget');
    chibi.style.display = 'block';
    currentStepIndex = 0;
    spotlightNext();
  } else {
    snackbar("Please close all open dialogs before starting the tutorial.");
  }
}

function startSpotlightTutorialOnRack(stepsArray = defaultspotlightSteps) {
  spotlightSteps = stepsArray;

  const chibi = document.querySelector('.chibi-widget');
  chibi.style.display = 'block';
  currentStepIndex = 0;
  spotlightNext();
}

ipcRenderer.on('start-spotlight-tutorial', () => {
  startSpotlightTutorial();
});