ipcRenderer.send("request-window-state");
window.ISMIDIPLAYING = false;

ipcRenderer.on("dialog-close", () => {
  closeDialogInsteadofApp();
});

function playRenderSound(bool) {
  const audio = document.createElement("audio");
  audio.id = "render";

  audio.src = bool ? "audio/render_okay.wav" : "audio/render_fail.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playSuccessGuideSound() {
  const audio = document.createElement("audio");

  audio.src = "audio/render_okay.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playClick() {
  const audio = document.createElement("audio");

  audio.src = "audio/click.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playTypewriter() {
  const audio = document.createElement("audio");

  audio.src = "audio/typewriter.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playChargingSound() {
  const audio = document.createElement("audio");
  audio.id = "render";

  audio.src = "audio/charging.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playDischargingSound() {
  const audio = document.createElement("audio");
  audio.id = "render";

  audio.src = "audio/discharging.wav";
  audio.addEventListener("loadeddata", () => {
    audio.play();
  });
  audio.addEventListener("ended", () => {
    audio.remove();
  });
}

function playBatterySound(bool) {
  const audio = document.createElement("audio");
  audio.id = "render";

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
  dropdownClose();

  choice({
    title: "Security Warning",
    message: "Are you sure you want to exit the app?",
    onConfirm: () => {
      if (
        (audioCtx && audioCtx.state == "running") ||
        audioCtx.state == "suspended"
      ) {
        audioCtx.close();
        window.TYPE_FUNCTION = "CLOSE_APP";
      }
    },
  });
}

function restartFunc() {
  if (audioCtx && audioCtx.state === "closed") return;
  dropdownClose();

  choice({
    title: "Security Warning",
    message: "Are you sure you want to restart?",
    onConfirm: () => {
      if (
        (audioCtx && audioCtx.state == "running") ||
        audioCtx.state == "suspended"
      ) {
        audioCtx.close();
        window.TYPE_FUNCTION = "RESTART_APP";
      }
    },
  });
};

function closeDialogInsteadofApp() {
  if (!preventDialogfromOpening() == 0) {
    closeAllDialogs();
  } else {
    closeFunc();
  }
}

document.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "F4" && !event.repeat) {
    e.preventDefault();
  }
});

navigator.mediaSession.metadata = null;
navigator.mediaSession.setActionHandler("play", null);
navigator.mediaSession.setActionHandler("pause", null);
navigator.mediaSession.setActionHandler("seekbackward", null);
navigator.mediaSession.setActionHandler("seekforward", null);
navigator.mediaSession.setActionHandler("previoustrack", null);
navigator.mediaSession.setActionHandler("nexttrack", null);

ipcRenderer.on(
  "sendInfo",
  (
    event,
    electronBuilderVersion,
    appVersion,
    chromiumVersion,
    electronVersion,
    nodeVersion,
    buildID,
  ) => {
    document.getElementById("appVersion").innerText = appVersion;
    document.getElementById("electronVersion").innerText = electronVersion;
    document.getElementById("chromeVersion").innerText = chromiumVersion;
    document.getElementById("nodeVersion").innerText = nodeVersion;
    document.getElementById("buildID").innerText = buildID;
  },
);

function createDialogMessage(
  msg,
  title = "Alert",
  needsrestart = false,
  needsexit = false,
  hideOKButton = false,
  dialogtype = "",
) {
  const visibleOKBtn = hideOKButton ? "none" : "inherit";
  const visibleExitBtn = needsexit ? "inherit" : "none";
  const visibleRestartBtn = needsrestart ? "inherit" : "none";

  const dialog = document.createElement("dialog");
  dialog.classList.add("monosource_dialog");
  dialog.dataset.dialogType = dialogtype;
  dialog.id = "alertMessage";
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
  `;

  document.body.append(dialog);
  dialog.show();

  const length = document.querySelectorAll("#alertMessage").length - 1;

  document
    .querySelectorAll("#alertClickClose")
    [length].addEventListener("click", () => {
      const dialogOnInit = document.querySelectorAll("#alertMessage")[length];
      CloseAnimationInit(dialogOnInit);
      setTimeout(() => {
        dialogOnInit.remove();
      }, 200);
    });

  document
    .querySelectorAll("#alertClickRestart")
    [length].addEventListener("click", () => {
      ipcRenderer.send("window-action", "restart");
    });

  document
    .querySelectorAll("#alertClickExit")
    [length].addEventListener("click", () => {
      ipcRenderer.send("window-action", "close-permanent");
    });
}

window.alert = (
  msg,
  title,
  needsrestart,
  needsexit,
  hideOKButton,
  dialogtype,
) => {
  ipcRenderer.send(
    "alert",
    msg,
    title,
    needsrestart,
    needsexit,
    hideOKButton,
    dialogtype,
  );
};

function getSource(element) {
  if (!element) return null;

  return element.dataset.source || null;
}

async function saveMedia(element) {
  const src = getSource(element);
  if (!src) return;

  let finalSrc = src;

  // -------------------------
  // HANDLE BLOB URL
  // -------------------------
  if (src.startsWith("blob:")) {
    const blob = await fetch(src).then((r) => r.blob());

    const buffer = await blob.arrayBuffer();

    const base64 = Buffer.from(buffer).toString("base64");

    const mimeType = blob.type || "image/png";

    finalSrc = `data:${mimeType};base64,${base64}`;
  }

  await ipcRenderer.invoke("save-media", {
    src: finalSrc,
    name: element.id || "file",
  });
}

ipcRenderer.on("openbase64_image", async (_event, filePath) => {
  const blob = await fetch(filePath).then((response) => response.blob());
  const blobUrl = URL.createObjectURL(blob);

  ipcRenderer.send("open-image-viewer", {
      src: blobUrl
  });
});

function decimalToHexAlpha(decimal) {
  // Clamp between 0 and 1 just in case
  const value = Math.round(Math.min(Math.max(decimal, 0), 1) * 255);
  // Convert to 2-digit hex
  return value.toString(16).padStart(2, "0").toUpperCase();
}

const textElements = document.querySelectorAll(".scroll-text p");

textElements.forEach((el) => {
  const parent = el.parentElement;
  if (!parent) return;

  const updateAnimation = () => {
    const parentWidth = parent.clientWidth;
    const childWidth = el.scrollWidth;

    const overflowing = childWidth > parentWidth;

    if (overflowing) {
      el.setAttribute("data-direction", "loop-ease");

      // compute dynamic duration
      const defaultParent = 200; // baseline width
      const defaultDuration = 10; // 10s at 200px

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

ipcRenderer.on("importbbcx", async (event, content) => {
  if (content !== null) {
    document.getElementById("inputText").value = content;
    updatePreview();
    document.querySelector(".deckbarbutton[data-editor=B]").click();
  }
});

ipcRenderer.on("import_presentbbcx", async (event, content) => {
  if (content !== null) {
    document.getElementById("inputText").value = content;
    updatePreview();
    if (document.getElementById("compileBtn").disabled === false) {
      document.getElementById("compileBtn").click();
    } else {
      snackbar(
        "Cannot compile presentation. Please stop the teleprompter first.",
      );
    }
  }
});

document.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => {
    btn.blur(); // lose focus immediately after click
  });
});

function enableSliderWheel(acceleration = 1, exclude = []) {
  document.querySelectorAll('input[type="range"]').forEach((slider) => {
    // Skip sliders in the exclude array
    if (exclude.includes(slider)) return;

    slider.addEventListener(
      "wheel",
      (e) => {
        // Skip disabled sliders
        if (slider.disabled) {
          e.preventDefault(); // prevent page scroll
          return;
        }

        e.preventDefault(); // prevent page scroll

        const min = parseFloat(slider.min) || 0;
        const max = parseFloat(slider.max) || 100;
        const step = parseFloat(slider.step) || 1;

        // Calculate change with acceleration based on wheel delta
        let change = (e.deltaY < 0 ? 1 : -1) * step * acceleration;

        slider.value = Math.min(
          max,
          Math.max(min, parseFloat(slider.value) + change),
        );

        // Dispatch input event so any live listeners update
        slider.dispatchEvent(new Event("input"));
        slider.dispatchEvent(new Event("change"));
      },
      { passive: false },
    );
  });
}

// Example usage:
const progress1 = document.getElementById("progress1");
const progress2 = document.getElementById("progress2");
const progressA = document.getElementById("progressA");
const progressB = document.getElementById("progressB");
const progressC = document.getElementById("progressC");
const progressD = document.getElementById("progressD");
const progress1_spec = document.getElementById("progress1_spec");
const progress2_spec = document.getElementById("progress2_spec");
const progressA_spec = document.getElementById("progressA_spec");
const progressB_spec = document.getElementById("progressB_spec");
const progressC_spec = document.getElementById("progressC_spec");
const progressD_spec = document.getElementById("progressD_spec");

// These sliders will be ignored by the wheel
enableSliderWheel(2, [
  progress1,
  progress2,
  progressA,
  progressB,
  progressC,
  progressD,
  progress1_spec,
  progress2_spec,
  progressA_spec,
  progressB_spec,
  progressC_spec,
  progressD_spec,
]);

ipcRenderer.on("system-close-clicked", () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById("toggleVisualiserCheckbox");
  chk.checked = false;

  chk.dispatchEvent(new Event("change", { bubbles: true }));
});

ipcRenderer.on("system-close-clicked-vumeter", () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById("toggleVUMeterCheckbox");
  chk.checked = false;
  chk.dispatchEvent(new Event("change", { bubbles: true }));
});

ipcRenderer.on("system-close-clicked-srs", () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById("toggleSurroundCheckbox");
  chk.checked = false;

  chk.dispatchEvent(new Event("change", { bubbles: true }));
});

ipcRenderer.on("system-close-clicked-clock", () => {
  // uncheck checkbox, dispatch event, whatever logic
  const chk = document.getElementById("toggleClockCheckbox");
  chk.checked = false;

  chk.dispatchEvent(new Event("change", { bubbles: true }));
});

let activeInput = null;
document.querySelectorAll("input[type=color]").forEach((inp) => {
  inp.addEventListener("click", (e) => {
    e.preventDefault();
    activeInput = inp;
    ipcRenderer.send("open-color-dialog", inp.value);
  });
});

ipcRenderer.on("apply-color", (event, color) => {
  if (activeInput) {
    activeInput.value = color;
    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    activeInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

downloadProgress = document.getElementById("downloadPorgress");

// Start download
async function startUpdate(item) {
  downloadProgress.textContent = `Starting...`;
  const result = await ipcRenderer.invoke("download-update-pack", item);
  if (result.success) {
    downloadProgress.textContent = "Update complete!";
    playRenderSound(true);
    setTimeout(() => {
      CloseAnimationInit(document.getElementById("downloadDialog"));
    }, 3000);

    scanLooperPacks(SFXSTUDIO_LOOPER_PACK_SELECTION);
  } else {
    ((downloadProgress.textContent = "Update failed:"), result.error);
    playRenderSound(false);
    setTimeout(() => {
      CloseAnimationInit(document.getElementById("downloadDialog"));
    }, 3000);

    scanLooperPacks(SFXSTUDIO_LOOPER_PACK_SELECTION);
  }
}

// Listen for progress
ipcRenderer.on("download-progress", (event, data) => {
  const { stage, percent } = data;
  downloadProgress.textContent = `[${stage}] ${percent}%`;
});

let pinwindow = false;

document.getElementById("pinbtn").addEventListener("click", (e) => {
  pinwindow = !pinwindow;
  ipcRenderer.send("set-pinwindow", pinwindow);
});

ipcRenderer.on("icon-pinwindow", (event, bool) => {
  document.getElementById("pinIcon").src = bool
    ? "icons/codicons/pinned.svg"
    : "icons/codicons/pin.svg";
});

ipcRenderer.on("force-scale-updated", (_, scale) => {
  createDialogMessage(
    `Interface Scale has been applied to ${Number(scale).toFixed(2)}. Please restart app to take effect.`,
    "Confirmation",
    true,
    false,
    false,
  );
});

ipcRenderer.on("scale-updated", (e, scale) => {
  document.getElementById("scaleSlider").value = Number(scale).toFixed(2);
  document
    .getElementById("scaleSlider")
    .dispatchEvent(new Event("input", { bubbles: true }));
});

document.getElementById("scaleSlider").addEventListener("input", (e) => {
  document.getElementById("scaleSliderText").textContent = Number(
    e.target.value,
  ).toFixed(2);
});

document.getElementById("scaleSlider").addEventListener("change", (e) => {
  ipcRenderer.send("set-force-scale", Number(e.target.value));
});

document.addEventListener("click", (e) => {
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
  ripple.addEventListener(
    "animationend",
    () => {
      ripple.remove();
    },
    { once: true },
  ); // 'once' ensures it only runs one time
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
    alert(error, "Picture-in-picture error!");
  }
}

async function requestFullscreen(id) {
  const video = id;
  try {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      await video.requestFullscreen();
      console.log("Entered fullscreen");
    } else {
      // Exit fullscreen
      await document.exitFullscreen();
      console.log("Exited fullscreen");
    }
  } catch (error) {
    console.error("Fullscreen error:", error);
  }
}

ipcRenderer.on("high-contrast-state", (event, isHighContrast) => {
  if (isHighContrast) {
    document.getElementById("highcontrast_text").style.display = `block`;
    document.getElementById("usePerformanceMode").disabled = true;
    document.body.dataset.highcontrast = "true";
  } else {
    document.getElementById("highcontrast_text").style.display = `none`;
    document.getElementById("usePerformanceMode").disabled = false;
    document.body.dataset.highcontrast = "false";
  }
});

ipcRenderer.on("win11-state", (event, isWindows11) => {
  if (isWindows11) {
    document.getElementById("isWindows10_text").style.display = `none`;
    document.getElementById("forceAcrylicToggle").disabled = false;
  } else {
    document.getElementById("isWindows10_text").style.display = `block`;
    document.getElementById("forceAcrylicToggle").disabled = true;
  }
});

ipcRenderer.on("gpu-acceleration-support", (event, isNotSupported) => {
  if (isNotSupported) {
    document.getElementById("gpusupport_text").style.display = `block`;
    document.getElementById("hwToggle").disabled = true;
  } else {
    document.getElementById("gpusupport_text").style.display = `none`;
    document.getElementById("hwToggle").disabled = false;
  }
});

ipcRenderer.on("window_state", (event, state) => {
  const titlebar = document.querySelector(".titlebar");
  if (titlebar) {
    titlebar.dataset.state = state;
  }

  const titlebar_text = document.querySelector(".titlebar_fortext");
  if (titlebar_text) {
    titlebar_text.dataset.state = state;
  }
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
      return "Single channel"; // was Mono
    case 2:
      return "Stereo"; // Front Left / Right
    case 3:
      return "2.1 Channel"; // Front L/R + LFE
    case 4:
      return "Quadraphonic"; // FL/FR/RL/RR
    case 5:
      return "4.1 / 5 channel"; // FL/FR/C/RL/RR
    case 6:
      return "5.1 Channel"; // FL/FR/C/LFE/RL/RR
    case 7:
      return "6.1 Channel"; // FL/FR/C/LFE/RL/RR/RC
    case 8:
      return "7.1 Channel"; // FL/FR/C/LFE/RL/RR/SL/SR
    default:
      return `${channelCount} channel`;
  }
}

function getChannelCode(channelCount) {
  switch (channelCount) {
    case 1:
      return "Mono"; // was Mono
    case 2:
      return "Stereo"; // Front Left / Right
    case 3:
      return "2.1"; // Front L/R + LFE
    case 4:
      return "Quad"; // FL/FR/RL/RR
    case 5:
      return "4.1"; // FL/FR/C/RL/RR
    case 6:
      return "5.1"; // FL/FR/C/LFE/RL/RR
    case 7:
      return "6.1"; // FL/FR/C/LFE/RL/RR/RC
    case 8:
      return "7.1"; // FL/FR/C/LFE/RL/RR/SL/SR
    default:
      return `${channelCount} channel`;
  }
}

function getChannelSetupIcon(channelCount) {
  switch (channelCount) {
    case 1:
      return "monoch"; // was Mono
    case 2:
      return "stereoch"; // Front Left / Right
    case 3:
      return "stereoch"; // Front L/R + LFE
    case 4:
      return "quadch"; // FL/FR/RL/RR
    case 5:
      return "quadch"; // FL/FR/C/RL/RR
    case 6:
      return "51ch"; // FL/FR/C/LFE/RL/RR
    case 7:
      return "61ch"; // FL/FR/C/LFE/RL/RR/RC
    case 8:
      return "71ch"; // FL/FR/C/LFE/RL/RR/SL/SR
    default:
      return "unknown";
  }
}

const osd = document.getElementById("osdSend");
let intervalStatus = null;

ipcRenderer.on("show-osd", (event, message) => {
  if (!osd) return;
  osd.textContent = "";

  // Normalize message (remove line breaks properly)
  const cleanMessage = message
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\n/g, " ")
    .trim();

  // Set message
  osd.innerHTML = cleanMessage;
});

ipcRenderer.on("devtools", (event, boolean) => {});

const textElementsOSD = document.querySelectorAll("#osdticker .scroll-text p");

textElementsOSD.forEach((el) => {
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
      const defaultParent = parentWidth; // baseline width
      const defaultDuration = 10; // 10s at 200px

      const ratio = childWidth / defaultParent;
      const newDuration = ratio * defaultDuration;

      el.style.animationDuration = `${newDuration}s`;
      el.style.animationFillMode = "forwards";

      // Auto-clear after 8s
      intervalStatus = setTimeout(
        () => {
          osd.textContent = "";
          intervalStatus = null;
        },
        newDuration * 1000 + 500,
      );
    } else {
      el.removeAttribute("data-direction");
      el.style.animationDuration = ""; // reset

      // Auto-clear after 8s
      intervalStatus = setTimeout(() => {
        osd.textContent = "";
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

  slider.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    // remove existing
    document.querySelector(".custom-value-box")?.remove();

    // container
    const box = document.createElement("div");
    box.className = "custom-value-box";

    // set position
    box.style.left = e.clientX + "px";
    box.style.top = e.clientY + "px";

    // header
    const header = document.createElement("div");
    header.className = "custom-value-header";
    header.textContent = title || "Set Custom Value";
    box.appendChild(header);

    // input
    const input = document.createElement("input");
    input.type = "text";
    input.className = "custom-value-input";
    box.appendChild(input);

    // output
    const output = document.createElement("div");
    output.className = "custom-value-output";
    box.appendChild(output);

    // set initial values
    const rawValue = parseFloat(slider.value);
    input.value = rawValue;

    if (typeof formatter === "function")
      output.textContent = formatter(rawValue);
    else if (typeof formatter === "string" && formatter === "x")
      output.textContent = rawValue + "x";
    else output.textContent = rawValue;

    document.body.appendChild(box);
    input.focus();
    input.select();

    // live update
    input.addEventListener("input", () => {
      let text = input.value.trim();
      if (typeof formatter === "string" && formatter === "x")
        text = text.replace(/x/gi, "");
      const num = parseFloat(text);
      if (typeof formatter === "function")
        output.textContent = isNaN(num) ? "" : formatter(num);
      else if (typeof formatter === "string" && formatter === "x")
        output.textContent = isNaN(num) ? "" : num + "x";
      else output.textContent = isNaN(num) ? "" : num;
    });

    // confirm / escape
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        let text = input.value.trim();
        if (typeof formatter === "string" && formatter === "x")
          text = text.replace(/x/gi, "");
        const value = parseFloat(text);
        if (!isNaN(value)) {
          slider.value = value;
          slider.dispatchEvent(new Event("input"));
        }
        box.remove();
      }
      if (ev.key === "Escape") box.remove();
    });

    // click outside
    setTimeout(() => {
      document.addEventListener("click", function handler() {
        box.remove();
        document.removeEventListener("click", handler);
      });
    }, 0);
  });
}

function setCustomValue(sliderId, formatter, title) {
  const slider = document.getElementById(sliderId);

  slider.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    // remove existing
    document.querySelector(".custom-value-box")?.remove();

    // container
    const box = document.createElement("div");
    box.className = "custom-value-box";

    // set position
    box.style.left = e.clientX + "px";
    box.style.top = e.clientY + "px";

    // header
    const header = document.createElement("div");
    header.className = "custom-value-header";
    header.textContent = title || "Set Custom Value";
    box.appendChild(header);

    // input
    const input = document.createElement("input");
    input.type = "text";
    input.className = "custom-value-input";
    box.appendChild(input);

    // output
    const output = document.createElement("div");
    output.className = "custom-value-output";
    box.appendChild(output);

    // set initial values
    const rawValue = parseFloat(slider.value);
    input.value = rawValue;

    if (typeof formatter === "function")
      output.textContent = formatter(rawValue);
    else if (typeof formatter === "string" && formatter === "x")
      output.textContent = rawValue + "x";
    else output.textContent = rawValue;

    document.body.appendChild(box);
    input.focus();
    input.select();

    // live update
    input.addEventListener("input", () => {
      let text = input.value.trim();
      if (typeof formatter === "string" && formatter === "x")
        text = text.replace(/x/gi, "");
      const num = parseFloat(text);
      if (typeof formatter === "function")
        output.textContent = isNaN(num) ? "" : formatter(num);
      else if (typeof formatter === "string" && formatter === "x")
        output.textContent = isNaN(num) ? "" : num + "x";
      else output.textContent = isNaN(num) ? "" : num;
    });

    // confirm / escape
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        let text = input.value.trim();
        if (typeof formatter === "string" && formatter === "x")
          text = text.replace(/x/gi, "");
        const value = parseFloat(text);
        if (!isNaN(value)) {
          slider.value = value;
          slider.dispatchEvent(new Event("input"));
          slider.dispatchEvent(new Event("change"));
        }
        box.remove();
      }
      if (ev.key === "Escape") box.remove();
    });

    // click outside
    setTimeout(() => {
      document.addEventListener("click", function handler() {
        box.remove();
        document.removeEventListener("click", handler);
      });
    }, 0);
  });
}

function setTimeSeekbar(sliderId, mediaElement) {
  const slider = document.getElementById(sliderId);

  slider.addEventListener("contextmenu", (e) => {
    e.preventDefault();

    // remove existing
    document.querySelector(".custom-value-box")?.remove();

    // container
    const box = document.createElement("div");
    box.className = "custom-value-box";
    document.body.appendChild(box); // append first so we can measure

    // header
    const header = document.createElement("div");
    header.className = "custom-value-header";
    header.textContent = "Set Time";
    box.appendChild(header);

    // convert currentTime to H/M/S
    let current = Math.floor(mediaElement.currentTime || 0);
    let h = Math.floor(current / 3600);
    let m = Math.floor((current % 3600) / 60);
    let s = current % 60;

    // create inputs container
    const inputsContainer = document.createElement("div");
    inputsContainer.className = "custom-value-inputs";
    box.appendChild(inputsContainer);

    // helper to create each input
    function createInput(value, placeholder) {
      const input = document.createElement("input");
      input.type = "number";
      input.min = 0;
      input.max = 59;
      input.value = value;
      input.placeholder = placeholder;
      input.className = "custom-value-input";
      return input;
    }

    const inputH = createInput(h, "HH");
    const inputM = createInput(m, "MM");
    const inputS = createInput(s, "SS");
    inputsContainer.appendChild(inputH);
    inputsContainer.appendChild(inputM);
    inputsContainer.appendChild(inputS);

    // output display
    const output = document.createElement("div");
    output.className = "custom-value-output";
    output.textContent = formatTime(h, m, s);
    box.appendChild(output);

    // position box
    let left = e.clientX;
    let top = e.clientY;
    const boxRect = box.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    if (left + boxRect.width > winWidth)
      left = Math.max(0, left - boxRect.width);
    if (top + boxRect.height > winHeight)
      top = Math.max(0, top - boxRect.height);
    box.style.left = left + "px";
    box.style.top = top + "px";

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

    [inputH, inputM, inputS].forEach((input) => {
      input.addEventListener("input", updateOutput);
    });

    // enter key sets media time
    [inputH, inputM, inputS].forEach((input) => {
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          const seconds = parseTime(
            parseInt(inputH.value) || 0,
            parseInt(inputM.value) || 0,
            parseInt(inputS.value) || 0,
          );
          mediaElement.currentTime = seconds;
          box.remove();
        }
      });
    });

    // click outside closes the box
    setTimeout(() => {
      document.addEventListener("click", function handler(ev) {
        if (!box.contains(ev.target)) {
          box.remove();
          document.removeEventListener("click", handler);
        }
      });
    }, 0);

    // helpers
    function formatTime(h, m, s) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    function parseTime(h, m, s) {
      return h * 3600 + m * 60 + s;
    }
  });
}


["1", "2", "A", "B", "C", "D"].forEach((id) => {
  setCustomValue(`speed${id}`, "x", "Set Speed Value");
});

document.addEventListener("DOMContentLoaded", () => {
  ["A", "B", "C", "D"].forEach((id) => {
    const audio = document.getElementById(`media${id}`);
    const slider = document.getElementById(`progress${id}`);

    if (!audio) return console.warn(`Missing audio element: media${id}`);
    if (!slider) return console.warn(`Missing slider element: progress${id}`);

    setTimeSeekbar(`progress${id}`, audio);
    setTimeSeekbar(`progress${id}_spec`, audio);
  });

  ["1", "2"].forEach((id) => {
    const audio = document.getElementById(`MediaExtDeck${id}`);
    const slider = document.getElementById(`progress${id}`);

    if (!audio) return console.warn(`Missing audio element: media${id}`);
    if (!slider) return console.warn(`Missing slider element: progress${id}`);

    setTimeSeekbar(`progress${id}`, audio);
    setTimeSeekbar(`progress${id}_spec`, audio);
  });
});

function createStats(audio) {
  return {
    media: {
      name: audio.src ? decodeURIComponent(audio.src.split("/").pop()) : null,

      currentTime: audio.currentTime,
      duration: audio.duration,

      playback: !audio.paused,
      ended: audio.ended,
      loop: audio.loop,
      playbackRate: audio.playbackRate,

      volume: audio.volume,
      muted: audio.muted,
    },

    element: {
      readyState: audio.readyState,
      networkState: audio.networkState,

      readyStateText: [
        "HAVE_NOTHING",
        "HAVE_METADATA",
        "HAVE_CURRENT_DATA",
        "HAVE_FUTURE_DATA",
        "HAVE_ENOUGH_DATA",
      ][audio.readyState],

      networkStateText: [
        "NETWORK_EMPTY",
        "NETWORK_IDLE",
        "NETWORK_LOADING",
        "NETWORK_NO_SOURCE",
      ][audio.networkState],
    },

    audioContext: {
      state: audioCtx.state,
      sampleRate: audioCtx.sampleRate,
      baseLatency: audioCtx.baseLatency,
      outputLatency: audioCtx.outputLatency,
    },
  };
}

const { spawn } = require("child_process");
const ffprobe = require("@derhuerst/ffprobe-static");

function createStatsInfo(file, ffprobePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      file,
    ];

    const process = spawn(ffprobePath, args);

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("error", reject);

    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
        return;
      }

      try {
        const data = JSON.parse(stdout);

        const streams = data.streams
          .filter(
            (stream) =>
              stream.codec_type === "audio" || stream.codec_type === "video",
          )
          .map((stream) => {
            if (stream.codec_type === "audio") {
              return {
                type: "audio",
                index: stream.index,

                codec: stream.codec_name,
                codecLong: stream.codec_long_name,

                sampleRate: stream.sample_rate
                  ? Number(stream.sample_rate)
                  : null,

                channels: stream.channels ?? null,
                channelLayout: stream.channel_layout ?? null,

                bitrate: stream.bit_rate ? Number(stream.bit_rate) : null,

                bitsPerSample:
                  stream.bits_per_sample ?? stream.bits_per_raw_sample ?? null,

                duration: stream.duration ? Number(stream.duration) : null,

                language: stream.tags?.language ?? null,

                title: stream.tags?.title ?? null,
              };
            }

            if (stream.codec_type === "video") {
              return {
                type: "video",
                index: stream.index,

                codec: stream.codec_name,
                codecLong: stream.codec_long_name,

                width: stream.width ?? null,
                height: stream.height ?? null,

                frameRate: stream.r_frame_rate ?? null,

                bitrate: stream.bit_rate ? Number(stream.bit_rate) : null,

                duration: stream.duration ? Number(stream.duration) : null,

                pixelFormat: stream.pix_fmt ?? null,

                profile: stream.profile ?? null,

                language: stream.tags?.language ?? null,

                title: stream.tags?.title ?? null,
              };
            }
          });

        resolve({
          format: {
            name: data.format?.format_name ?? null,
            longName: data.format?.format_long_name ?? null,
            duration: data.format?.duration
              ? Number(data.format.duration)
              : null,
            size: data.format?.size ? Number(data.format.size) : null,
            bitrate: data.format?.bit_rate
              ? Number(data.format.bit_rate)
              : null,
          },

          streams,
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createStatsAdvanced(file) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      file,
    ];

    const process = spawn(ffprobe, args);

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data;
    });

    process.stderr.on("data", (data) => {
      stderr += data;
    });

    process.on("error", reject);

    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}\n${stderr}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

window.SFXSTUDIO_CODECFORMAT = [];

function statsToHTML(stats, id) {
  let html = "";

  html += `
        <div class="stats-section">
            <div class="stats-title">Format</div>

            <div class="stats-row">
                <span>Format</span>
                <span>${stats.format.name ?? "Unknown"}</span>
            </div>

            <div class="stats-row">
                <span>Format name</span>
                <span>${stats.format.longName ?? "Unknown"}</span>
            </div>

            <div class="stats-row">
                <span>Duration</span>
                <span>${formatDuration(stats.format.duration)}</span>
            </div>

            <div class="stats-row">
                <span>Size</span>
                <span>${formatBytes(stats.format.size)}</span>
            </div>

            <div class="stats-row">
                <span>Bitrate</span>
                <span>${formatBitrate(stats.format.bitrate)}</span>
            </div>
        </div>
    `;

  for (const stream of stats.streams) {
    if (stream.type === "audio") {
      document.getElementById("channels_" + id).textContent =
        getChannelLayoutName(stream.channels ?? "Unknown") +
        " - " +
        formatBitrate(stream.bitrate ?? stats.format.bitrate) +
        " - " +
        (stream.sampleRate
          ? (Number(stream.sampleRate) / 1000).toFixed(1) + "kHz"
          : "Unknown");

      window.SFXSTUDIO_CODECFORMAT[id] = stream.codec ?? "";

      html += `
                <div class="stats-section">
                    <div class="stats-title">Audio</div>

                    <div class="stats-row">
                        <span>Codec Description</span>
                        <span>${stream.codecLong ?? stream.codec ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Codec</span>
                        <span>${stream.codec ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Sample rate</span>
                        <span>${
                          stream.sampleRate
                            ? `${stream.sampleRate.toLocaleString()} Hz`
                            : "Unknown"
                        }</span>
                    </div>

                    <div class="stats-row">
                        <span>Channels</span>
                        <span>${stream.channels ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Channel layout</span>
                        <span>${stream.channelLayout ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Bitrate</span>
                        <span>${formatBitrate(stream.bitrate)}</span>
                    </div>

                    <div class="stats-row">
                        <span>Bit depth</span>
                        <span>${
                          stream.bitsPerSample
                            ? `${stream.bitsPerSample}-bit`
                            : "Unknown"
                        }</span>
                    </div>

                    <div class="stats-row">
                        <span>Duration</span>
                        <span>${formatDuration(stream.duration)}</span>
                    </div>

                    ${
                      stream.language
                        ? `
                        <div class="stats-row">
                            <span>Language</span>
                            <span>${stream.language}</span>
                        </div>
                    `
                        : ""
                    }

                    ${
                      stream.title
                        ? `
                        <div class="stats-row">
                            <span>Title</span>
                            <span>${stream.title}</span>
                        </div>
                    `
                        : ""
                    }
                </div>
            `;
    }

    if (stream.type === "video") {
      html += `
                <div class="stats-section">
                    <div class="stats-title">Video</div>

                    <div class="stats-row">
                        <span>Codec Description</span>
                        <span>${stream.codecLong ?? stream.codec ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Codec</span>
                        <span>${stream.codec ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Resolution</span>
                        <span>${
                          stream.width && stream.height
                            ? `${stream.width} × ${stream.height}`
                            : "Unknown"
                        }</span>
                    </div>

                    <div class="stats-row">
                        <span>Frame rate</span>
                        <span>${formatFrameRate(stream.frameRate)}</span>
                    </div>

                    <div class="stats-row">
                        <span>Bitrate</span>
                        <span>${formatBitrate(stream.bitrate)}</span>
                    </div>

                    <div class="stats-row">
                        <span>Pixel format</span>
                        <span>${stream.pixelFormat ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Profile</span>
                        <span>${stream.profile ?? "Unknown"}</span>
                    </div>

                    <div class="stats-row">
                        <span>Duration</span>
                        <span>${formatDuration(stream.duration)}</span>
                    </div>

                    ${
                      stream.language
                        ? `
                        <div class="stats-row">
                            <span>Language</span>
                            <span>${stream.language}</span>
                        </div>
                    `
                        : ""
                    }

                    ${
                      stream.title
                        ? `
                        <div class="stats-row">
                            <span>Title</span>
                            <span>${stream.title}</span>
                        </div>
                    `
                        : ""
                    }
                </div>
            `;
    }
  }

  return html;
}

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "Unknown";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${secs
      .toFixed(3)
      .padStart(6, "0")}`;
  }

  return `${minutes}:${secs.toFixed(3).padStart(6, "0")}`;
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return "Unknown";

  const units = ["B", "KiB", "MiB", "GiB"];

  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

function formatBitrate(bitrate) {
  if (bitrate == null || !Number.isFinite(bitrate)) return "Unknown";

  if (bitrate >= 1000000) return `${(bitrate / 1000000).toFixed(2)} Mbps`;

  return `${Math.round(bitrate / 1000)} kbps`;
}

function formatFrameRate(value) {
  if (!value) return "Unknown";

  if (value.includes("/")) {
    const [num, den] = value.split("/").map(Number);

    if (den) return `${(num / den).toFixed(3)} fps`;
  }

  return `${value} fps`;
}

async function showStats(file, ffprobePath, statsElement, id) {
  try {
    const stats = await createStatsInfo(file, ffprobePath);
    statsElement.innerHTML = statsToHTML(stats, id);
  } catch (error) {
    console.error("Failed to get media information:", error);

    statsElement.innerHTML = `
            <div class="stats-error">
                Unable to read media information.
            </div>
        `;
  }
}

window.MEDIAIMPORT_FUNCTION = [];

window.SFXSTUDIO_DESC1 = () => {
  ipcRenderer.send("description", {
    title: "Virtualizer Effect",
    message:
      "The virtualizer effect gives the ability to enhance the stereo and " +
      "surround channels. It uses the special Mid/Side stereo separation, which means " +
      "It will only work on Stereo Channels. Playing audio on mono channel will not be able " +
      "to heard any side input which leads the Separation from 0-100% separate value will be bypassed.",
  });
};
