let osc = null;
let gain = null;
let isTypingZone = false;
let onBleep = false;
let floatingCardCount = 0;

function countVisibleFloatingCards() {
  floatingCardCount = document.querySelectorAll('[aria-type="FLOATING_CARD"]')
    ? [...document.querySelectorAll('[aria-type="FLOATING_CARD"]')].filter(
        (card) => card.hidden === false,
      ).length
    : 0;
}

const floatingCardObserver = new MutationObserver((mutations) => {
  if (
    mutations.some(
      (mutation) =>
        mutation.type === "childList" ||
        (mutation.type === "attributes" && mutation.attributeName === "hidden"),
    )
  ) {
    countVisibleFloatingCards();
  }
});

floatingCardObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["hidden"],
});

countVisibleFloatingCards();

function radioBeep(active) {
  if (active && !onBleep) {
    onBleep = true;
    const ctx = new AudioContext();
    osc = ctx.createOscillator();
    gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.value = 1000;

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.connect(gain).connect(ctx.destination);
    osc.start();

    // Store the context so we can close it later
    osc.ctx = ctx;
  } else if (osc && gain) {
    onBleep = false;
    gain.gain.linearRampToValueAtTime(0, osc.ctx.currentTime + 0.1);
    osc.stop(osc.ctx.currentTime + 0.1);
    osc.ctx.close();
    osc = null;
    gain = null;
  }
}

// This file handles global hotkeys and prevents default actions for certain keys
// It is designed to work with Electron applications
// Removiung this will damage the application's functionality

const fullscreenIcon = document.getElementById("fullscreenIcon");

let isFullscreen = false;

function fullscreen() {
  isFullscreen = !isFullscreen;
  ipcRenderer.send("set-fullscreen", isFullscreen);

  document.getElementById("fullscreenspacer").style.display = isFullscreen
    ? "none"
    : "block";
  document.getElementById("fullscreenIcon").src = isFullscreen
    ? "icons/codicons/screen-normal.svg"
    : "icons/codicons/screen-full.svg";
}

document.getElementById("fullscrtoggle-btn").addEventListener("click", () => {
  fullscreen();
});

// Helper function to check if volume change is allowed
function canChangeVolume() {
  return (
    preventDialogfromOpening() == 0 &&
    isVolumeUIOpened &&
    !dropdownMenu.classList.contains("show")
  );
}

// Key handler
window.addEventListener("keydown", (event) => {
  if (!event.repeat && canChangeVolume()) {
    let targetValue = null;

    switch (event.key.toLowerCase()) {
      case "s":
        targetValue = 0.0;
        break;
      case "d":
        targetValue = 0.15;
        break;
      case "f":
        targetValue = 0.5;
        break;
      case "g":
        targetValue = 0.75;
        break;
      case "h":
        targetValue = 1.0;
        break;
    }

    if (targetValue !== null) {
      const slider = document.getElementById("volumeControlTarget");
      slider.value = targetValue;
      setTargetVolumeText(targetValue);
    }
  }
});

document.getElementById("bleepBtn").addEventListener("mousedown", (event) => {
  window.FUNCTION_OSCILLATOR_START();
});

document.getElementById("bleepBtn").addEventListener("mouseup", (event) => {
  window.FUNCTION_OSCILLATOR_STOP();
});

document.getElementById("bleepBtn").addEventListener("mouseleave", (event) => {
  window.FUNCTION_OSCILLATOR_STOP();
});

document.getElementById("bleepBtn2").addEventListener("mousedown", (event) => {
  window.FUNCTION_OSCILLATOR2_START();
});

document.getElementById("bleepBtn2").addEventListener("mouseup", (event) => {
  window.FUNCTION_OSCILLATOR2_STOP();
});

document.getElementById("bleepBtn2").addEventListener("mouseleave", (event) => {
  window.FUNCTION_OSCILLATOR2_STOP();
});

document.getElementById("bleepBtn3").addEventListener("mousedown", (event) => {
  window.FUNCTION_OSCILLATOR3_START();
});

document.getElementById("bleepBtn3").addEventListener("mouseup", (event) => {
  window.FUNCTION_OSCILLATOR3_STOP();
});

document.getElementById("bleepBtn3").addEventListener("mouseleave", (event) => {
  window.FUNCTION_OSCILLATOR3_STOP();
});

const tips = document.querySelector(".ANDROMEDA_ALT_TIPS");

function updateHotkeyHints(event) {
  const isToggleLoop = event.ctrlKey && event.altKey && event.shiftKey;
  const isStop = event.altKey && event.shiftKey && !event.ctrlKey;
  const showShift = event.altKey && event.shiftKey;

  document.querySelectorAll("h4[data-controldescription]").forEach((index) => {
    index.dataset.controldescription = isToggleLoop
      ? "Toggle Loop"
      : isStop
        ? "Stop"
        : "Play/Pause";
  });
  document.querySelectorAll('span[data-controls="shift"]').forEach((index) => {
    index.style.display = showShift ? "inherit" : "none";
  });
  document.querySelectorAll('span[data-controls="ctrl"]').forEach((index) => {
    index.style.display = isToggleLoop ? "inherit" : "none";
  });
}

function getEventKeyByAlt(event, key) {
  return (!isTypingZone && event.altKey && event.code === key && !event.shiftKey && !event.repeat)
}

function getEventKeyByAltShift(event, key) {
  return (!isTypingZone && event.altKey && event.code === key && event.shiftKey && !event.repeat)
}

function getEventKeyByCtrlAltShift(event, key) {
  return (!isTypingZone && event.ctrlKey && event.altKey && event.code === key && event.shiftKey && !event.repeat)
}

let lastzoom = 1;
let orginalZoom = 1;

function zoomEditorScreen(type) {
  lastzoom = orginalZoom;

  if (type === "add") {
    orginalZoom = orginalZoom + .1
  } else if (type === "back") {
    orginalZoom = 1;
  } else {
    orginalZoom = orginalZoom - .1
  }

  orginalZoom = Math.max(0.60, Math.min(1.20, orginalZoom));
  
  document.querySelectorAll(".andromeda_screen_workbench .editorscreen").forEach(index => {
    index.style.zoom = orginalZoom;
  })
}

window.addEventListener("keydown", (event) => {
  updateHotkeyHints(event);

  if (event.key === "F1" && !event.repeat) {
    if (preventDialogfromOpening() == 0) {
      ipcRenderer.send("UserGuideExecute");
    }
    dropdownClose();
  }

  if (!isTypingZone && event.key.toLowerCase() === "v" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA"
    )
      return;
    document.getElementById("prevBtn").click();
  }

  if (!isTypingZone && event.key.toLowerCase() === "b" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA"
    )
      return;
    document.getElementById("nextBtn").click();
  }

  if (event.key === "F8" && !event.repeat) {
    if (preventDialogfromOpening() == 0) {
      settings.show();
    }
    dropdownClose();
  }

  if (event.key === "F9" && !event.repeat) {
    if (preventDialogfromOpening() == 0) {
      ipcRenderer.send("open_devconsole");
    }
    dropdownClose();
  }

  if (event.key === "F10" && !event.repeat) {
    TogglePlayonHotkey();
  }

  if (event.key === "F11" && !event.repeat) {
    event.preventDefault(); // Prevent default browser behavior
    fullscreen();
  }

  if (event.key === "Escape" && !event.repeat) {
    event.preventDefault();
    if (isFullscreen) {
      isFullscreen = false;
      ipcRenderer.send("set-fullscreen", false);
      document.getElementById("fullscreenspacer").style.display = "block";
      document.getElementById("fullscreenIcon").src =
        "icons/codicons/screen-full.svg";
    } else {
      closeAllDialogs();
      dropdownClose();
      closeFloatingCard();
    }
  }

  if (!isTypingZone && event.key === "Backspace" && !event.repeat) {
    if (preventDialogfromOpening() == 0 && floatingCardCount == 0) {
      if (
        document.querySelector(".deckbarbutton[data-editor=A]").dataset.state ==
        "active"
      ) {
        document.getElementById("StopAllAudio").click();
      } else if (
        document.querySelector(".deckbarbutton[data-editor=E]").dataset.state ==
        "active"
      ) {
        document.getElementById("SFXSTUDIO_LOOPER_STOP").click();
      }
    }
  }

  if (event.altKey && event.key === "F4") {
    closeDialogInsteadofApp();
  }

  if (
    event.altKey ||
    (event.ctrlKey && event.key === "+") ||
    (event.ctrlKey && event.key === "=") ||
    (event.ctrlKey && event.key === "-")
  ) {
    event.preventDefault();
  }

  if (!isTypingZone && event.ctrlKey && event.key === "]") {
    zoomEditorScreen("add");
  } else if (!isTypingZone && event.ctrlKey && event.key === "[") {
    zoomEditorScreen("sub");
  } else if (!isTypingZone && event.ctrlKey && event.altKey && event.code === 'Digit0') {
    zoomEditorScreen("back");
  }

  const digitKeys = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"];
  const digitHotkeyGroups = [
    [getEventKeyByCtrlAltShift, ["toggleLoopButtonA", "toggleLoopButtonB", "toggleLoopButtonC", "toggleLoopButtonD", "toggleLoopButton1", "toggleLoopButton2"]],
    [getEventKeyByAltShift, ["stopBtnA", "stopBtnB", "stopBtnC", "stopBtnD", "stopBtn1", "stopBtn2"]],
    [getEventKeyByAlt, ["playPauseBtnA", "playPauseBtnB", "playPauseBtnC", "playPauseBtnD", "playPauseBtn1", "playPauseBtn2"]],
  ];

  for (const [matchesHotkey, buttonIds] of digitHotkeyGroups) {
    const digitIndex = digitKeys.findIndex((key) => matchesHotkey(event, key));
    if (digitIndex !== -1) {
      document.getElementById(buttonIds[digitIndex]).click();
      break;
    }
  }

  if (!isTypingZone && event.key.toLowerCase() === "," && !event.repeat) {
    // prevent beeping if typing in input areas
    if (
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA"
    )
      return;
    if (preventDialogfromOpening() == 0) {
      const btn = document.getElementById("bleepBtn");
      btn.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    }
  }

  if (!isTypingZone && event.key.toLowerCase() === "." && !event.repeat) {
    // prevent beeping if typing in input areas
    if (
      document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA"
    )
      return;
    if (preventDialogfromOpening() == 0) {
      const btn = document.getElementById("bleepBtn2");
      btn.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    }
  }

  if (
    !isTypingZone &&
    event.ctrlKey &&
    event.altKey &&
    event.key.toLowerCase() === "x" &&
    !event.repeat
  ) {
    confirmtoRemove();
  }

  if (
    event.ctrlKey &&
    !event.repeat &&
    document.querySelector(".deckbarbutton[data-editor=B]").dataset.state ==
      "active"
  ) {
    if (preventDialogfromOpening() == 0) {
      if (event.key.toLowerCase() === "s") {
        if (event.shiftKey) {
          document.getElementById("save_bbcode_as").click();
        } else {
          document.getElementById("save_bbcode").click();
        }
      } else if (event.key.toLowerCase() === "o") {
        document.getElementById("open_bbcode").click();
      } else if (event.key.toLowerCase() === "n") {
        document.getElementById("clear_bbcode").click();
      } else if (event.key.toLowerCase() === "r") {
        document.getElementById("bbcode_remove").click();
      }
    }
  }

  if (
    event.ctrlKey &&
    !event.repeat &&
    document.querySelector(".deckbarbutton[data-editor=C]").dataset.state ==
      "active"
  ) {
    if (preventDialogfromOpening() == 0) {
      if (event.key.toLowerCase() === "arrowleft") {
        document.querySelector(".container_video").dataset.show = "A";
      } else if (event.key.toLowerCase() === "arrowup") {
        document.querySelector(".container_video").dataset.show = "";
      } else if (event.key.toLowerCase() === "arrowright") {
        document.querySelector(".container_video").dataset.show = "B";
      }
    }
  }

  if (event.code.toLowerCase() === "altleft" && !event.repeat) {
    tips.classList.toggle("on", true);

    document.querySelectorAll(".alt-menu-item").forEach(index => {
      index.classList.toggle("on", true)
    })
  }
});

window.MASTERSLIDER_SNAP = []
window.MASTERSLIDER_SNAP[0] = .01;
window.MASTERSLIDER_SNAP[1] = .05;

window.addEventListener("keydown", (event) => {
  if (!event.ctrlKey || event.altKey) return;

  const direction = event.code === "Minus" ? -1 : event.code === "Equal" ? 1 : 0;
  if (!direction) return;

  const snap = window.MASTERSLIDER_SNAP[event.shiftKey ? 1 : 0];
  masterSlider.value = Number(masterSlider.value) + direction * snap;

  ipcRenderer.send('show-text', `Master Volume: <b>${Number(masterSlider.value * 100).toFixed(0)}%</b>`);
  masterSlider.dispatchEvent(new Event("input"));
});

window.addEventListener("keydown", (event) => {
  const activeEl = document.activeElement;

  isTypingZone =
    activeEl &&
    (activeEl.tagName === "TEXTAREA" ||
      activeEl.tagName === "INPUT" ||
      activeEl.isContentEditable);

  const key = event.key;

  if (
    !isTypingZone &&
    !event.repeat &&
    !event.altKey &&
    document.querySelector(".deckbarbutton[data-editor=A]").dataset.state ==
      "active"
  ) {
    event.stopPropagation();
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  updateHotkeyHints(event);

  if (event.key.toLowerCase() === ",") {
    if (preventDialogfromOpening() == 0) {
      const btn = document.getElementById("bleepBtn");
      btn.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
    }
  }

  if (event.key.toLowerCase() === ".") {
    if (preventDialogfromOpening() == 0) {
      const btn = document.getElementById("bleepBtn2");
      btn.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
    }
  }

  if (event.code.toLowerCase() === "altleft" && !event.repeat) {
    tips.classList.toggle("on", false);

    document.querySelectorAll(".alt-menu-item").forEach(index => {
      index.classList.toggle("on", false)
    })
  }
});

window.addEventListener("keydown", (event) => {
  if (
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.location === KeyboardEvent.DOM_KEY_LOCATION_NUMPAD
  )
    return;

  const editorE = document.querySelector('.deckbarbutton[data-editor="E"]');
  if (!editorE || editorE.dataset.state !== "active") return;

  const padIndex = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    q: 9,
    w: 10,
    e: 11,
    r: 12,
    t: 13,
    y: 14,
    u: 15,
    i: 16,
    a: 17,
    s: 18,
    d: 19,
    f: 20,
    g: 21,
    h: 22,
    j: 23,
    k: 24,
  }[event.key.toLowerCase()];

  if (padIndex === undefined) return;

  const looperPad = document.getElementById(`looperPad${padIndex}`);
  if (looperPad) {
    event.preventDefault();
    looperPad.click();
  }
});

const toggleBtnDestroy = document.getElementById("toggle-btn-destroy");
const dropdownMenu = document.getElementById("dropdown-menu");

function dropdownClose() {
  const menu = document.querySelector(".custom-menu");
  if (menu) closeMenu(menu);

  hideContextMenu();
}

window.addEventListener("blur", (e) => {
    tips.classList.toggle("on", false);

    document.querySelectorAll(".alt-menu-item").forEach(index => {
      index.classList.toggle("on", false)
    })
});

window.addEventListener("click", (e) => {
    tips.classList.toggle("on", false);

    document.querySelectorAll(".alt-menu-item").forEach(index => {
      index.classList.toggle("on", false)
    })
});