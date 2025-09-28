// This file handles global hotkeys and prevents default actions for certain keys
// It is designed to work with Electron applications
// Removiung this will damage the application's functionality

const fullscreenText = document.getElementById('fullscreenText');
const fullscreenIcon = document.getElementById('fullscreenIcon');

function goFullscreen() {
  const text = "Fullscreen Enabled";
  snackbar(text); 
  const elem = document.documentElement; // Or any specific element
  fullscreenText.textContent = "Exit Fullscreen";
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
  snackbar(text); 
  fullscreenText.textContent = "Enter Fullscreen";
  fullscreenIcon.src = 'images/windows/enter-fullscreen.svg';
  
  if (document.exitFullscreen) {
    document.exitFullscreen();
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  } else if (document.msExitFullscreen) {
    document.msExitFullscreen();
  }
}

document.addEventListener("keydown", (event) => {
    if (event.key === "F1" && !event.repeat) {
      if (preventDialogfromOpening() == 0) {legendDialog.show()};
      dropdownClose();
    };

    if (event.key === "F2" && !event.repeat) {
      if (preventDialogfromOpening() == 0) {dialogHelp.show()};
      dropdownClose();
    };

    if (event.key === "F3" && !event.repeat) {
      if (preventDialogfromOpening() == 0) {aboutDialog.show()};
      dropdownClose();
    };

    if (event.key === "F8" && !event.repeat) {
      if (preventDialogfromOpening() == 0) {settings.show()};
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
      event.preventDefault();
    };

    if (event.key === "F12" && !event.repeat) {
      if (preventDialogfromOpening() == 0) {volumeControlUI()};
      dropdownClose();
    }

    if (event.ctrlKey && event.shiftKey && event.key === "R") {
      if (preventDialogfromOpening() == 0) {
        const dialog = document.getElementById('restartDialog');
        dialog.show()
        dropdownClose();
      };
      event.preventDefault();
    }

    if (event.key === "Backspace" && !event.repeat) {
      if (preventDialogfromOpening() == 0) {StopAllAudio()};
    }

    if (event.ctrlKey && event.key === "r") {
        // Prevent refresh (Ctrl+R)
        event.preventDefault();
        // Optionally, show a message or perform another action
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'r' || event.key === 'R' && !event.repeat) {
      e.preventDefault();
      console.log('Ctrl+R disabled in OBS browser dock');
    }
});

const toggleBtn = document.getElementById('toggle-btn');
const toggleBtnDestroy = document.getElementById('toggle-btn-destroy');
const dropdownMenu = document.getElementById('dropdown-menu');

toggleBtn.addEventListener('click', () => {
  dropdownMenu.classList.toggle('show');
});

function dropdownClose() {
  if (dropdownMenu.classList.contains('show')) {
    dropdownMenu.classList.add('hide');
    setTimeout(() => {
      dropdownMenu.classList.remove('show');
      dropdownMenu.classList.remove('hide');
    }, 500);
  }
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