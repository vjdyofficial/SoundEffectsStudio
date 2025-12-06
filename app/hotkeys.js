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
    if (!el.isPlaying) {
      el.play();
    }
  } else {
    const el = document.getElementById('executeAnnouncementOff')
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

function goFullscreen() {
  const text = "Fullscreen Enabled";
  document.getElementById('fullscreenspacer').style.display = 'none';
  snackbar(text);
  const elem = document.documentElement; // Or any specific element
  fullscreenIcon.src = 'images/windows/exit-fullscreen.svg';
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) { // Safari
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) { // IE11
    elem.msRequestFullscreen();
  }
}

function exitFullscreen() {
  const text = "Fullscreen Disabled";
  document.getElementById('fullscreenspacer').style.display = 'block';
  snackbar(text);
  fullscreenIcon.src = 'images/windows/enter-fullscreen.svg';

  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

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


document.addEventListener("keydown", (event) => {
  if (event.key === "F1" && !event.repeat) {
    if (preventDialogfromOpening() == 0) { ipcRenderer.send('UserGuideExecute'); };
    dropdownClose();
  };

  if (!isTypingZone && event.key.toLowerCase() === "j" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (preventDialogfromOpening() == 0) { dialogHelp.show() };
    dropdownClose();
  }

  if (!isTypingZone && event.key.toLowerCase() === "k" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    if (preventDialogfromOpening() == 0) { aboutDialog.show() };
    dropdownClose();
  }

  if (!isTypingZone && event.key.toLowerCase() === "l" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    document.getElementById('toggle-btn').click();
  }

  if (!isTypingZone && event.key.toLowerCase() === "v" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    document.getElementById('prevBtn').click();
  }

  if (!isTypingZone && event.key.toLowerCase() === "b" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    document.getElementById('nextBtn').click();
  }

  if (event.key === "A" || event.key === "a" && !event.repeat) {
    if (canChangeVolume()) {
      document.getElementById('animateVolumeButton').click();
      preventDefault();
    };
  };

  if (event.key === "F8" && !event.repeat) {
    if (preventDialogfromOpening() == 0) { settings.show() };
    dropdownClose();
  };

  if (event.key === "F9" && !event.repeat) {
    if (preventDialogfromOpening() == 0) {
      const dialog = document.getElementById('devconsoleDialog');
      dialog.show()
    };
    dropdownClose();
  };

  if (event.key === "F10" && !event.repeat) {
    TogglePlayonHotkey();
  };

  if (event.key === "F11" && !event.repeat) {
    event.preventDefault(); // Prevent default browser behavior
    if (!document.fullscreenElement) {
      goFullscreen();
    } else {
      exitFullscreen();
    }
  };

  if (event.key === "Escape" && !event.repeat) {
    closeAllDialogs();
    dropdownClose();
    event.preventDefault();
  };

  if (event.key === "F12" && !event.repeat) {
    if (preventDialogfromOpening() == 0) { volumeControlUI() };
    dropdownClose();
  }

  if (event.key === "Backspace" && !event.repeat) {
    if (preventDialogfromOpening() == 0) { StopAllAudio() };
  }

  if (event.ctrlKey && event.key === "r") {
    // Prevent refresh (Ctrl+R)
    event.preventDefault();
    // Optionally, show a message or perform another action
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
    document.getElementById('playPauseBtnA').click();
  } else if (event.altKey && event.key === "2" && !event.repeat) {
    document.getElementById('playPauseBtnB').click();
  } else if (event.altKey && event.key === "3" && !event.repeat) {
    document.getElementById('playPauseBtnC').click();
  } else if (event.altKey && event.key === "4" && !event.repeat) {
    document.getElementById('playPauseBtnD').click();
  } else if (event.altKey && event.key === "4" && !event.repeat) {
    document.getElementById('playPauseBtn_1').click();
  } else if (event.altKey && event.key === "4" && !event.repeat) {
    document.getElementById('playPauseBtn_2').click();
  }

  if (!isTypingZone && event.key.toLowerCase() === "z" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    const btn = document.getElementById('bleepBtn');
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  }

  if (!isTypingZone && event.key.toLowerCase() === "n" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    executeAnnouncement(true);
  }

  if (!isTypingZone && event.key.toLowerCase() === "m" && !event.repeat) {
    // prevent beeping if typing in input areas
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
    executeAnnouncement(false);
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key.toLowerCase() === "z") {
    const btn = document.getElementById('bleepBtn');
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  }

  if (event.key.toLowerCase() === "n") {
    stopexecuteAnnouncement(true);
  }

  if (event.key.toLowerCase() === "m") {
    stopexecuteAnnouncement(false);
  }
});

const toggleBtn = document.getElementById('toggle-btn');
const toggleBtnDestroy = document.getElementById('toggle-btn-destroy');
const dropdownMenu = document.getElementById('dropdown-menu');

toggleBtn.addEventListener('click', () => {
  if (!dropdownMenu.classList.contains('show')) {
    dropdownMenu.classList.toggle('show');
  }
});

function dropdownClose() {
  if (dropdownMenu.classList.contains('show')) {
    dropdownMenu.classList.add('hide');
    setTimeout(() => {
      dropdownMenu.classList.remove('show');
      dropdownMenu.classList.remove('hide');
    }, 500);
  }

  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);

  hideContextMenu();
};

function dropdownCloseonTarget(e) {
  const dropdown = document.getElementById('dropdown-container');
  const dropdownmenu = document.getElementById('dropdown-menu');

  // 1. If click is inside the dropdown, ignore
  if (dropdown.contains(e.target) || dropdownmenu.contains(e.target)) return;

  // 2. If click is on a <details> or <summary>, ignore
  if (e.target.closest("details, summary")) return;

  // 3. Otherwise, close dropdown
  if (dropdownMenu.classList.contains('show')) {
    dropdownMenu.classList.add('hide');
    setTimeout(() => {
      dropdownMenu.classList.remove('show');
      dropdownMenu.classList.remove('hide');
    }, 500);
  }
}


// Close when clicking outside
document.addEventListener('click', (e) => {
  dropdownCloseonTarget(e);
});

document.addEventListener('contextmenu', (e) => {
  dropdownCloseonTarget(e);
});

const fullscrtoggleBtn = document.getElementById('fullscrtoggle-btn');
fullscrtoggleBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    goFullscreen();
  } else {
    exitFullscreen();
  }
});