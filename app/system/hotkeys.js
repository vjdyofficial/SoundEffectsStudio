let osc = null;
let gain = null;

let onBleep = false;

function radioBeep(active) {
  if (active && !onBleep) {
    onBleep = true
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
    onBleep = false
    gain.gain.linearRampToValueAtTime(0, osc.ctx.currentTime + 0.1);
    osc.stop(osc.ctx.currentTime + 0.1);
    osc.ctx.close();
    osc = null;
    gain = null;
  }
}

function executeAnnouncement(active) {
  if (active) {
    const el = document.getElementById('executeAnnouncementOn')
    el.src = "audio/vibraon.mp3";
    if (!el.isPlaying) {
      el.play();
    }
  } else {
    const el = document.getElementById('executeAnnouncementOff')
    el.src = "audio/vibraoff.mp3";
    if (!el.isPlaying) {
      el.play();
    }
  }
}

function stopexecuteAnnouncement(active) {
  if (active) {
    const el = document.getElementById('executeAnnouncementOn')
    el.pause();
    el.currentTime = 0;
  } else {
    const el = document.getElementById('executeAnnouncementOff')
    el.pause();
    el.currentTime = 0;
  }
}

// This file handles global hotkeys and prevents default actions for certain keys
// It is designed to work with Electron applications
// Removiung this will damage the application's functionality

const fullscreenIcon = document.getElementById('fullscreenIcon');

let isFullscreen = false;

function fullscreen() {
  isFullscreen = !isFullscreen;
  ipcRenderer.send('set-fullscreen', isFullscreen);

  document.getElementById('fullscreenspacer').style.display = isFullscreen ? 'none' : 'block';
  document.getElementById('fullscreenIcon').src = isFullscreen
    ? 'icons/codicons/screen-normal.svg'
    : 'icons/codicons/screen-full.svg';
}

document.getElementById('fullscrtoggle-btn').addEventListener('click', () => { fullscreen(); });

// Helper function to check if volume change is allowed
function canChangeVolume() {
  return (
    preventDialogfromOpening() == 0 &&
    isVolumeUIOpened &&
    !dropdownMenu.classList.contains('show')
  );
}

// Key handler
document.addEventListener("keydown", (event) => {
  if (!event.repeat && canChangeVolume()) {
    let targetValue = null;

    switch (event.key.toLowerCase()) {
      case "s":
        targetValue = 0.00;
        break;
      case "d":
        targetValue = 0.15;
        break;
      case "f":
        targetValue = 0.50;
        break;
      case "g":
        targetValue = 0.75;
        break;
      case "h":
        targetValue = 1.00;
        break;
    }

    if (targetValue !== null) {
      const slider = document.getElementById("volumeControlTarget");
      slider.value = targetValue;
      setTargetVolumeText(targetValue);
    }
  }
});

document.getElementById('bleepBtn').addEventListener('mousedown', (event) => {
  radioBeep(true);
});

document.getElementById('bleepBtn').addEventListener('mouseup', (event) => {
  radioBeep(false);
});

document.getElementById('bleepBtn').addEventListener('mouseleave', (event) => {
  radioBeep(false);
});

function detectSpotlightTutorial() {
  const spotlightWidget = document.querySelector('.chibi-widget');
  return spotlightWidget && spotlightWidget.style.display.toLowerCase() !== 'none';
}

document.addEventListener("keydown", (event) => {
  if (event.key === "F1" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) { ipcRenderer.send('UserGuideExecute'); };
    dropdownClose();
  };

  if (!isTypingZone && event.key.toLowerCase() === "k" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (document.querySelector('.chibi-widget').style.display.toLowerCase() !== 'none') {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) { ipcRenderer.send('AboutExecute'); };
    dropdownClose();
  }

  if (!isTypingZone && event.key.toLowerCase() === "v" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('prevBtn').click();
  }

  if (!isTypingZone && event.key.toLowerCase() === "b" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('nextBtn').click();
  }

  if (event.key === "F7" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) { audioInfoDialog.show() };
    dropdownClose();
  };

  if (event.key === "F8" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) { settings.show() };
    dropdownClose();
  };

  if (event.key === "F9" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) {
      ipcRenderer.send('open_devconsole');
    };
    dropdownClose();
  };

  if (event.key === "F10" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    TogglePlayonHotkey();
  };

  if (event.key === "F11" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    event.preventDefault(); // Prevent default browser behavior
    fullscreen();
  };

  if (event.key === "Escape" && !event.repeat) {
    event.preventDefault();
    if (isFullscreen) {
      isFullscreen = false;
      ipcRenderer.send('set-fullscreen', false);
      document.getElementById('fullscreenspacer').style.display = 'block';
      document.getElementById('fullscreenIcon').src = 'icons/codicons/screen-full.svg';
    } else {
      if (document.querySelector('.chibi-widget').style.display.toLowerCase() !== 'none') {
        hideSpotlight();
        snackbar('Spotlight tutorial closed.');
      }

      closeAllDialogs();
      dropdownClose();
    }
  };

  if (event.key === "Backspace" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) { StopAllAudio() };
  }

  if (event.altKey && event.key === "F4") {
    closeDialogInsteadofApp();
  }

  if (event.altKey ||
    (event.ctrlKey && event.key === "+") ||
    (event.ctrlKey && event.key === "=") ||
    (event.ctrlKey && event.key === "-")) {
    event.preventDefault();
  }

  if (event.altKey && event.key === "1" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('playPauseBtnA').click();
  } else if (event.altKey && event.key === "2" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('playPauseBtnB').click();
  } else if (event.altKey && event.key === "3" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('playPauseBtnC').click();
  } else if (event.altKey && event.key === "4" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('playPauseBtnD').click();
  } else if (event.altKey && event.key === "5" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('playPauseBtn1').click();
  } else if (event.altKey && event.key === "6" && !event.repeat) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    document.getElementById('playPauseBtn2').click();
  }

  if (!isTypingZone && event.key.toLowerCase() === "z" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) {
      const btn = document.getElementById('bleepBtn');
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    }
  }

  if (!isTypingZone && event.key.toLowerCase() === "m" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) {
      document.getElementById('announceBtn').click();
    }
  }

  if (event.ctrlKey && !event.repeat && (document.querySelector('.deckbarbutton[data-editor=B]').dataset.state == 'active')) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) {
      if (event.key.toLowerCase() === "s") {
        if (event.shiftKey) {
          document.getElementById('save_bbcode_as').click();
        } else {
          document.getElementById('save_bbcode').click();
        }
      } else if (event.key.toLowerCase() === "o") {
        document.getElementById('open_bbcode').click();
      } else if (event.key.toLowerCase() === "n") {
        document.getElementById('clear_bbcode').click();
      } else if (event.key.toLowerCase() === "r") {
        document.getElementById('bbcode_remove').click();
      }
    }


  }

  if (event.ctrlKey && !event.repeat && (document.querySelector('.deckbarbutton[data-editor=C]').dataset.state == 'active')) {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) {
      if (event.key.toLowerCase() === "arrowleft") {
        document.querySelector('.container_video').dataset.show = 'A'
      } else if (event.key.toLowerCase() === "arrowup") {
        document.querySelector('.container_video').dataset.show = ''
      } else if (event.key.toLowerCase() === "arrowright") {
        document.querySelector('.container_video').dataset.show = 'B'
      }
    }
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key.toLowerCase() === "z") {
    if (detectSpotlightTutorial()) {
      snackbar('Keybinds disabled while spotlight tutorial is open.');
      return;
    }
    if (preventDialogfromOpening() == 0) {
      const btn = document.getElementById('bleepBtn');
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    }
  }
});

const toggleBtnDestroy = document.getElementById('toggle-btn-destroy');
const dropdownMenu = document.getElementById('dropdown-menu');

function dropdownClose() {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);

  hideContextMenu();
};