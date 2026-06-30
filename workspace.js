ipcRenderer.send('request-window-state');
window.ISMIDIPLAYING = false;

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
  if (audioCtx && audioCtx.state === "closed") return;
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
      isPlaying(document.getElementById('mediaD')) || window.ISMIDIPLAYING) {

      choice({
        title: "Security Warning",
        message: "Are you sure you want to exit? This will cause interrupted or technical error scenes " +
          "if you have played sound effects. also, if you recording the session, the record won't be saved. " +
          "Click Cancel to avoid any unexpected scene error.",
        onConfirm: () => {
          ipcRenderer.send('window-action', 'close-permanent')
        }
      });
    } else {
      ipcRenderer.send('window-action', 'close-permanent')
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

navigator.mediaSession.metadata = null;
navigator.mediaSession.setActionHandler('play', null);
navigator.mediaSession.setActionHandler('pause', null);
navigator.mediaSession.setActionHandler('seekbackward', null);
navigator.mediaSession.setActionHandler('seekforward', null);
navigator.mediaSession.setActionHandler('previoustrack', null);
navigator.mediaSession.setActionHandler('nexttrack', null);

ipcRenderer.on('sendInfo', (event, electronBuilderVersion, appVersion, chromiumVersion, electronVersion, nodeVersion, buildID) => {
  document.getElementById('appVersion').innerText = appVersion;
  document.getElementById('electronVersion').innerText = electronVersion;
  document.getElementById('chromeVersion').innerText = chromiumVersion;
  document.getElementById('nodeVersion').innerText = nodeVersion;
  document.getElementById('buildID').innerText = buildID;
});

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
  dialog.classList.add('monosource_dialog_full')
  dialog.id = 'imagePreviewDialog'
  dialog.innerHTML = `
<button id="alertClickClosw" class="monosource_retro_button" style="osition: absolute; top: 0px; left: 4px; z-index: 10;">
<img src="icons/monosource/close.svg" alt="back">
</button>
<div class="version_flex" style="height: 100%;"><img class="aprt_1-1" style="height: calc(100% - 80px);" src="${src}"></div>
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
  ipcRenderer.send('alert', msg, title, needsrestart, needsexit, hideOKButton, dialogtype)
};

function getSource(element) {
  if (!element) return null;

  return (
    element.dataset.source ||
    null
  );
}

async function saveMedia(element) {

  const src = getSource(element);
  if (!src) return;

  let finalSrc = src;

  // -------------------------
  // HANDLE BLOB URL
  // -------------------------
  if (src.startsWith("blob:")) {

    const blob = await fetch(src).then(r => r.blob());

    const buffer = await blob.arrayBuffer();

    const base64 = Buffer.from(buffer).toString("base64");

    const mimeType = blob.type || "image/png";

    finalSrc = `data:${mimeType};base64,${base64}`;
  }

  await ipcRenderer.invoke("save-media", {
    src: finalSrc,
    name: element.id || "file"
  });
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
    document.querySelector('.deckbarbutton[data-editor=B]').click();
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
      // Skip disabled sliders
      if (slider.disabled) {
        e.preventDefault(); // prevent page scroll
        return
      };

      e.preventDefault(); // prevent page scroll

      const min = parseFloat(slider.min) || 0;
      const max = parseFloat(slider.max) || 100;
      const step = parseFloat(slider.step) || 1;

      // Calculate change with acceleration based on wheel delta
      let change = (e.deltaY < 0 ? 1 : -1) * step * acceleration;

      slider.value = Math.min(max, Math.max(min, parseFloat(slider.value) + change));

      // Dispatch input event so any live listeners update
      slider.dispatchEvent(new Event('input'));
      slider.dispatchEvent(new Event('change'));
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
const progress1_spec = document.getElementById('progress1_spec');
const progress2_spec = document.getElementById('progress2_spec');
const progressA_spec = document.getElementById('progressA_spec');
const progressB_spec = document.getElementById('progressB_spec');
const progressC_spec = document.getElementById('progressC_spec');
const progressD_spec = document.getElementById('progressD_spec');

// These sliders will be ignored by the wheel
enableSliderWheel(2, [progress1, progress2, progressA, progressB, progressC, progressD, progress1_spec, progress2_spec, progressA_spec, progressB_spec, progressC_spec, progressD_spec]);

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

ipcRenderer.on('system-close-clicked-srs', () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById('toggleSurroundCheckbox');
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
  const template = document.getElementById('obs-clock-template');
  const clone = template.content.cloneNode(true);

  // Insert the dynamic URL into the textarea
  clone.querySelector('#pathOSBTVClock').textContent = path.join(__dirname, "plugins", "obs_clock.html");
  clone.querySelector('#pathOSBTVClockCSS').textContent = `:root { --defaultcolorobs: #dfff93;}`;

  // Convert the fragment to a string for innerHTML
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(clone); // append the fragment to a temporary container
  const htmlContent = tempDiv.innerHTML; // now you have a string of HTML

  createDialogMessage(
    htmlContent,
    "OBS Browser Source Procedure",
  );

  tempDiv.remove();
};

function copyOBS_AudioDock() {
  const template = document.getElementById('obs-template');
  const clone = template.content.cloneNode(true);

  // Insert the dynamic URL into the textarea
  clone.querySelector('#pathOBS_DockTitle').textContent = `This applied as media player but for livestream in OBS.`
  clone.querySelector('#pathOBS_DockDescription').innerHTML =
    `<img src="images/help/obsdock.png"><br>` +
    `To add <strong>Audio Dock</strong> to OBS Studio, go to <code>Docks > Custom Browser Docks</code>. <br><br>` +
    `<img src="images/help/obsdock2.png"><br>` +
    `Copy the path to the URL (2) to use it, 
    and on Dock Name (1) give it a name like <strong>Audio Dock</strong>, or <strong>Audio Player.</strong>`

  clone.querySelector('#pathOBS_DockDescription2').innerHTML =
    `Click "Apply" and click "Close" to add the dock to your OBS Studio. <br><br>` +
    `Take note that <strong>audio effects are excluded</strong> as to record it to the system desktop audio using it's original and no processing sound.`

  clone.querySelector('#pathOBS_Dock').textContent = path.join(__dirname, "plugins", "obs_audio.html");

  // Convert the fragment to a string for innerHTML
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(clone); // append the fragment to a temporary container
  const htmlContent = tempDiv.innerHTML; // now you have a string of HTML

  createDialogMessage(
    htmlContent,
    "OBS Control Panel Procedure",
  );

  tempDiv.remove();
};

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
  { id: 'volume-rack', emote: 'default', message: 'Here is the effects rack which you can mix the taste of sound to your choice!' },
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
  { id: 'intro', emote: 'laugh', message: 'oh. I forgot! haha! you can actually drag your media here including video and audio or supported files and drop! boom! you can see the Import Media Dialog!' },
  { id: 'intro', emote: 'laugh', message: 'but you can now import BBCode Telempropter document, and Bass Preset Here!' },
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
  { id: 'inputText', emote: 'default', message: 'and by the way, you must be careful on layering the tags.' },
  { id: 'inputText', emote: 'default', message: 'you will see weird results since it is actually layering elements.' },
  { id: 'altmenu_4', emote: 'default', message: 'If you want to see me again for help, feel free to call me here!' },
  { id: 'intro', emote: 'thanks', message: 'That is it! Hope you learn something! Happy editing!' },
];

const videoSteps = [
  { id: 'intro', emote: 'question', message: 'ohhh... you will see video here!' },
  { id: 'intro', emote: 'default', message: 'yeah. i will show you the basics here!' },
  { id: 'MediaExtDeck1', emote: 'default', message: 'This is the Video Preview for Deck A,' },
  { id: 'MediaExtDeck2', emote: 'default', message: 'and this is the Video Preview for Deck B.' },
  { id: 'showdeck', emote: 'default', message: 'You can switch these 3 layouts to show what can be enlarged.' },
  { id: 'previewLyrics_A', emote: 'default', message: 'Also. you can see lyrics from Audio Deck A,' },
  { id: 'previewLyrics_B', emote: 'default', message: 'Audio Deck B,' },
  { id: 'previewLyrics_C', emote: 'default', message: 'Audio Deck C,' },
  { id: 'previewLyrics_D', emote: 'default', message: 'and... Audio Deck D!' },
  { id: 'altmenu_4', emote: 'default', message: 'If you want to see me again for help, feel free to call me here!' },
  { id: 'intro', emote: 'thanks', message: 'That is it! Hope you learn something! Happy previewing!' },
];

const spectroSteps = [
  { id: 'intro', emote: 'question', message: 'ohhh... that might be interesting...' },
  { id: 'spectrogramGrid', emote: 'default', message: 'yeah. this is Spectrogram!' },
  { id: 'spectrogramGrid', emote: 'default', message: 'this was one of the popular thing to do look at hidden... something... hehehe yeah' },
  { id: 'spectrogramGrid', emote: 'default', message: 'hidden messages... hidden arts and more...' },
  { id: 'spectrogramGrid', emote: 'default', message: 'you can actually scroll here so you can skip throught some part of the audio or videos!' },
  { id: 'altmenu_4', emote: 'default', message: 'If you want to see me again for help, feel free to call me here!' },
  { id: 'intro', emote: 'thanks', message: 'That is it! Hope you learn something! Happy spectation!' },
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
  currentStepIndex = 0; // reset if you want to restart
  currentStep = null;   // reset current step
}

function spotlightNext() {
  if (currentStepIndex >= spotlightSteps.length) {
    hideSpotlight();
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

document.getElementById('spotlightNextBtn').addEventListener('click', () => {
  spotlightNext();
});

document.getElementById('spotlightCloseBtn').addEventListener('click', () => {
  hideSpotlight();
});

function startSpotlightTutorial() {
  if (preventDialogfromOpening() == 0) {
    document.querySelector('.deckbarbutton[data-editor="A"]').click();
    spotlightSteps = defaultspotlightSteps;

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

async function isPIP(video) {
  // Ensure video is an element
  if (!(video instanceof HTMLVideoElement)) return false;

  // Returns true if this video is in PiP
  return document.pictureInPictureElement === video;
}

async function requestPIP(id) {
  const video = id;
  try {
    if (video !== document.pictureInPictureElement) {
      // Enter Picture-in-Picture
      await video.requestPictureInPicture();
    } else {
      // Exit Picture-in-Picture
      await document.exitPictureInPicture();
    }
  } catch (error) {
    alert(error, 'Picture-in-picture error!')
  }
}

async function requestFullscreen(id) {
  const video = id;
  try {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      await video.requestFullscreen();
      console.log('Entered fullscreen');
    } else {
      // Exit fullscreen
      await document.exitFullscreen();
      console.log('Exited fullscreen');
    }
  } catch (error) {
    console.error('Fullscreen error:', error);
  }
}

ipcRenderer.on('high-contrast-state', (event, isHighContrast) => {
  if (isHighContrast) {
    document.getElementById('highcontrast_text').style.display = `block`
    document.getElementById('usePerformanceMode').disabled = true
    document.body.dataset.highcontrast = 'true';
  } else {
    document.getElementById('highcontrast_text').style.display = `none`
    document.getElementById('usePerformanceMode').disabled = false
    document.body.dataset.highcontrast = 'false';
  }
});

ipcRenderer.on('win11-state', (event, isWindows11) => {
  if (isWindows11) {
    document.getElementById('isWindows10_text').style.display = `none`
    document.getElementById('forceAcrylicToggle').disabled = false
  } else {
    document.getElementById('isWindows10_text').style.display = `block`
    document.getElementById('forceAcrylicToggle').disabled = true
  }
});

ipcRenderer.on('gpu-acceleration-support', (event, isNotSupported) => {
  if (isNotSupported) {
    document.getElementById('gpusupport_text').style.display = `block`
    document.getElementById('hwToggle').disabled = true
  } else {
    document.getElementById('gpusupport_text').style.display = `none`
    document.getElementById('hwToggle').disabled = false
  }
});

function workspace_deletecache() {
  ipcRenderer.invoke('delete-cache')
}

ipcRenderer.on('window_state', (event, state) => {
  const titlebar = document.querySelector('.titlebar')
  if (titlebar) { titlebar.dataset.state = state }

  const titlebar_text = document.querySelector('.titlebar_fortext')
  if (titlebar_text) { titlebar_text.dataset.state = state }
});

// Here's how to Format time from seconds to 00:00 or 00:00:00
// in JavaScript. This is useful for displaying time in media
// players or timers.

function formatTimeFromNumber(seconds) {
  if (isNaN(seconds)) return "00:00";

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");

  if (h > 0) {
    const hh = h.toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } else {
    return `${mm}:${ss}`;
  }
}

// Returns the **setup name** based on channelCount (1-8)
function getChannelSetupName(channelCount) {
  switch (channelCount) {
    case 1:
      return 'Single channel'; // was Mono
    case 2:
      return 'Stereo'; // Front Left / Right
    case 3:
      return '2.1 Channel'; // Front L/R + LFE
    case 4:
      return 'Quadraphonic'; // FL/FR/RL/RR
    case 5:
      return '4.1 / 5 channel'; // FL/FR/C/RL/RR
    case 6:
      return '5.1 Channel'; // FL/FR/C/LFE/RL/RR
    case 7:
      return '6.1 Channel'; // FL/FR/C/LFE/RL/RR/RC
    case 8:
      return '7.1 Channel'; // FL/FR/C/LFE/RL/RR/SL/SR
    default:
      return `${channelCount} channel`;
  }
}

function getChannelCode(channelCount) {
  switch (channelCount) {
    case 1:
      return 'Mono'; // was Mono
    case 2:
      return 'Stereo'; // Front Left / Right
    case 3:
      return '2.1'; // Front L/R + LFE
    case 4:
      return 'Quad'; // FL/FR/RL/RR
    case 5:
      return '4.1'; // FL/FR/C/RL/RR
    case 6:
      return '5.1'; // FL/FR/C/LFE/RL/RR
    case 7:
      return '6.1'; // FL/FR/C/LFE/RL/RR/RC
    case 8:
      return '7.1'; // FL/FR/C/LFE/RL/RR/SL/SR
    default:
      return `${channelCount} channel`;
  }
}

function getChannelSetupIcon(channelCount) {
  switch (channelCount) {
    case 1:
      return 'monoch'; // was Mono
    case 2:
      return 'stereoch'; // Front Left / Right
    case 3:
      return 'stereoch'; // Front L/R + LFE
    case 4:
      return 'quadch'; // FL/FR/RL/RR
    case 5:
      return 'quadch'; // FL/FR/C/RL/RR
    case 6:
      return '51ch'; // FL/FR/C/LFE/RL/RR
    case 7:
      return '61ch'; // FL/FR/C/LFE/RL/RR/RC
    case 8:
      return '71ch'; // FL/FR/C/LFE/RL/RR/SL/SR
    default:
      return 'unknown';
  }
}

const osd = document.getElementById("osdSend");
let intervalStatus = null;

ipcRenderer.on('show-osd', (event, message) => {
  if (!osd) return;
  osd.textContent = '';

  // Normalize message (remove line breaks properly)
  const cleanMessage = message
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\n/g, ' ')
    .trim();

  // Set message
  osd.innerHTML = cleanMessage;
});

const textElementsOSD = document.querySelectorAll("#osdticker .scroll-text p");

textElementsOSD.forEach(el => {
  const parent = el.parentElement;
  if (!parent) return;

  const updateAnimation = () => {
    const parentWidth = parent.clientWidth;
    const childWidth = el.scrollWidth;

    const overflowing = childWidth > parentWidth;

    if (intervalStatus) {
      clearTimeout(intervalStatus);
      intervalStatus = null;
    }

    if (overflowing) {
      el.setAttribute("data-direction", "tv_inapp");
      el.style.setProperty("--tv-start", `${parentWidth}px`);

      // compute dynamic duration
      const defaultParent = parentWidth;    // baseline width
      const defaultDuration = 10;   // 10s at 200px

      const ratio = childWidth / defaultParent;
      const newDuration = ratio * defaultDuration;

      el.style.animationDuration = `${newDuration}s`;
      el.style.animationFillMode = 'forwards';

      // Auto-clear after 8s
      intervalStatus = setTimeout(() => {
        osd.textContent = '';
        intervalStatus = null;
      }, (newDuration * 1000) + 500);
    } else {
      el.removeAttribute("data-direction");
      el.style.animationDuration = ""; // reset

      // Auto-clear after 8s
      intervalStatus = setTimeout(() => {
        osd.textContent = '';
        intervalStatus = null;
      }, 8000);
    }
  };

  // Initial check
  updateAnimation();

  // Observe parent and child size changes
  const observer = new ResizeObserver(updateAnimation);
  observer.observe(parent);
  observer.observe(el);
});

function setCustomValue(sliderId, formatter, title) {
  const slider = document.getElementById(sliderId);

  slider.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    // remove existing
    document.querySelector('.custom-value-box')?.remove();

    // container
    const box = document.createElement('div');
    box.className = 'custom-value-box';

    // set position
    box.style.left = e.clientX + 'px';
    box.style.top = e.clientY + 'px';

    // header
    const header = document.createElement('div');
    header.className = 'custom-value-header';
    header.textContent = title || 'Set Custom Value';
    box.appendChild(header);

    // input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'custom-value-input';
    box.appendChild(input);

    // output
    const output = document.createElement('div');
    output.className = 'custom-value-output';
    box.appendChild(output);

    // set initial values
    const rawValue = parseFloat(slider.value);
    input.value = rawValue;

    if (typeof formatter === 'function') output.textContent = formatter(rawValue);
    else if (typeof formatter === 'string' && formatter === 'x') output.textContent = rawValue + 'x';
    else output.textContent = rawValue;

    document.body.appendChild(box);
    input.focus();
    input.select();

    // live update
    input.addEventListener('input', () => {
      let text = input.value.trim();
      if (typeof formatter === 'string' && formatter === 'x') text = text.replace(/x/gi, '');
      const num = parseFloat(text);
      if (typeof formatter === 'function') output.textContent = isNaN(num) ? '' : formatter(num);
      else if (typeof formatter === 'string' && formatter === 'x') output.textContent = isNaN(num) ? '' : num + 'x';
      else output.textContent = isNaN(num) ? '' : num;
    });

    // confirm / escape
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        let text = input.value.trim();
        if (typeof formatter === 'string' && formatter === 'x') text = text.replace(/x/gi, '');
        const value = parseFloat(text);
        if (!isNaN(value)) {
          slider.value = value;
          slider.dispatchEvent(new Event('input'));
        }
        box.remove();
      }
      if (ev.key === 'Escape') box.remove();
    });

    // click outside
    setTimeout(() => {
      document.addEventListener('click', function handler() {
        box.remove();
        document.removeEventListener('click', handler);
      });
    }, 0);
  });
}

function setCustomValue(sliderId, formatter, title) {
  const slider = document.getElementById(sliderId);

  slider.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    // remove existing
    document.querySelector('.custom-value-box')?.remove();

    // container
    const box = document.createElement('div');
    box.className = 'custom-value-box';

    // set position
    box.style.left = e.clientX + 'px';
    box.style.top = e.clientY + 'px';

    // header
    const header = document.createElement('div');
    header.className = 'custom-value-header';
    header.textContent = title || 'Set Custom Value';
    box.appendChild(header);

    // input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'custom-value-input';
    box.appendChild(input);

    // output
    const output = document.createElement('div');
    output.className = 'custom-value-output';
    box.appendChild(output);

    // set initial values
    const rawValue = parseFloat(slider.value);
    input.value = rawValue;

    if (typeof formatter === 'function') output.textContent = formatter(rawValue);
    else if (typeof formatter === 'string' && formatter === 'x') output.textContent = rawValue + 'x';
    else output.textContent = rawValue;

    document.body.appendChild(box);
    input.focus();
    input.select();

    // live update
    input.addEventListener('input', () => {
      let text = input.value.trim();
      if (typeof formatter === 'string' && formatter === 'x') text = text.replace(/x/gi, '');
      const num = parseFloat(text);
      if (typeof formatter === 'function') output.textContent = isNaN(num) ? '' : formatter(num);
      else if (typeof formatter === 'string' && formatter === 'x') output.textContent = isNaN(num) ? '' : num + 'x';
      else output.textContent = isNaN(num) ? '' : num;
    });

    // confirm / escape
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        let text = input.value.trim();
        if (typeof formatter === 'string' && formatter === 'x') text = text.replace(/x/gi, '');
        const value = parseFloat(text);
        if (!isNaN(value)) {
          slider.value = value;
          slider.dispatchEvent(new Event('input'));
        }
        box.remove();
      }
      if (ev.key === 'Escape') box.remove();
    });

    // click outside
    setTimeout(() => {
      document.addEventListener('click', function handler() {
        box.remove();
        document.removeEventListener('click', handler);
      });
    }, 0);
  });
}

function setTimeSeekbar(sliderId, mediaElement) {
  const slider = document.getElementById(sliderId);

  slider.addEventListener('contextmenu', (e) => {
    e.preventDefault();

    // remove existing
    document.querySelector('.custom-value-box')?.remove();

    // container
    const box = document.createElement('div');
    box.className = 'custom-value-box';
    document.body.appendChild(box); // append first so we can measure

    // header
    const header = document.createElement('div');
    header.className = 'custom-value-header';
    header.textContent = 'Set Time';
    box.appendChild(header);

    // convert currentTime to H/M/S
    let current = Math.floor(mediaElement.currentTime || 0);
    let h = Math.floor(current / 3600);
    let m = Math.floor((current % 3600) / 60);
    let s = current % 60;

    // create inputs container
    const inputsContainer = document.createElement('div');
    inputsContainer.className = 'custom-value-inputs';
    box.appendChild(inputsContainer);

    // helper to create each input
    function createInput(value, placeholder) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 0;
      input.max = 59;
      input.value = value;
      input.placeholder = placeholder;
      input.className = 'custom-value-input';
      return input;
    }

    const inputH = createInput(h, 'HH');
    const inputM = createInput(m, 'MM');
    const inputS = createInput(s, 'SS');
    inputsContainer.appendChild(inputH);
    inputsContainer.appendChild(inputM);
    inputsContainer.appendChild(inputS);

    // output display
    const output = document.createElement('div');
    output.className = 'custom-value-output';
    output.textContent = formatTime(h, m, s);
    box.appendChild(output);

    // position box
    let left = e.clientX;
    let top = e.clientY;
    const boxRect = box.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    if (left + boxRect.width > winWidth) left = Math.max(0, left - boxRect.width);
    if (top + boxRect.height > winHeight) top = Math.max(0, top - boxRect.height);
    box.style.left = left + 'px';
    box.style.top = top + 'px';

    // focus first input
    inputH.focus();
    inputH.select();

    // live update output
    function updateOutput() {
      const hh = parseInt(inputH.value) || 0;
      const mm = parseInt(inputM.value) || 0;
      const ss = parseInt(inputS.value) || 0;
      output.textContent = formatTime(hh, mm, ss);
    }

    [inputH, inputM, inputS].forEach(input => {
      input.addEventListener('input', updateOutput);
    });

    // enter key sets media time
    [inputH, inputM, inputS].forEach(input => {
      input.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          const seconds = parseTime(
            parseInt(inputH.value) || 0,
            parseInt(inputM.value) || 0,
            parseInt(inputS.value) || 0
          );
          mediaElement.currentTime = seconds;
          box.remove();
        }
      });
    });

    // click outside closes the box
    setTimeout(() => {
      document.addEventListener('click', function handler(ev) {
        if (!box.contains(ev.target)) {
          box.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 0);

    // helpers
    function formatTime(h, m, s) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function parseTime(h, m, s) {
      return h * 3600 + m * 60 + s;
    }
  });
}

function addSliderTooltip(sliderId, mediaElement, padding = 0) {
  const slider = document.getElementById(sliderId);

  // create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'slider-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  let update = false;

  slider.addEventListener('mouseup', (e) => {
    tooltip.style.display = 'none';
    update = false;
  });

  slider.addEventListener('mousedown', (e) => {
    tooltip.style.display = 'none';
    update = true;
  });

  slider.addEventListener('mousemove', (e) => {
    if (!update) { return };
    const rect = (slider.getBoundingClientRect());
    const pos = Math.min(Math.max(0, e.clientX - rect.left), rect.width);
    const percent = pos / rect.width;
    const seconds = percent * mediaElement.duration;

    tooltip.textContent = formatTime(seconds);

    // place tooltip above slider handle
    tooltip.style.left = e.clientX + 'px';
    tooltip.style.top = rect.top - 10 + 'px'; // 10px above slider
    tooltip.style.display = 'block';
  });

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}

['1', '2', 'A', 'B', 'C', 'D'].forEach(id => {
  setCustomValue(`speed${id}`, "x", "Set Speed Value");
})

document.addEventListener('DOMContentLoaded', () => {
  ['A', 'B', 'C', 'D'].forEach(id => {
    const audio = document.getElementById(`media${id}`);
    const slider = document.getElementById(`progress${id}`);

    if (!audio) return console.warn(`Missing audio element: media${id}`);
    if (!slider) return console.warn(`Missing slider element: progress${id}`);

    setTimeSeekbar(`progress${id}`, audio);
    setTimeSeekbar(`progress${id}_spec`, audio);
  });

  ['A', 'B', 'C', 'D'].forEach(id => {
    const audio = document.getElementById(`media${id}`);
    if (!audio) return;
    addSliderTooltip(`progress${id}`, audio);
    addSliderTooltip(`progress${id}_spec`, audio);
  });

  ['1', '2'].forEach(id => {
    const audio = document.getElementById(`MediaExtDeck${id}`);
    const slider = document.getElementById(`progress${id}`);

    if (!audio) return console.warn(`Missing audio element: media${id}`);
    if (!slider) return console.warn(`Missing slider element: progress${id}`);

    setTimeSeekbar(`progress${id}`, audio);
    setTimeSeekbar(`progress${id}_spec`, audio);
  });

  ['1', '2'].forEach(id => {
    const audio = document.getElementById(`MediaExtDeck${id}`);
    if (!audio) return;
    addSliderTooltip(`progress${id}`, audio);
    addSliderTooltip(`progress${id}_spec`, audio, 24);
  });
});