const notifyDialog = document.getElementById('notifyDialog')
const notifyClose = document.getElementById('notifyClose')
const message = document.getElementById("message");
const audioInfoDialog = document.getElementById('audioInfoDialog');
const audioInfoDialogClose = document.getElementById('audioInfoDialogClose');
const securityClose = document.getElementById('securityClose');
const securityDialog = document.getElementById('securityDialog');
const restartDialog = document.getElementById('restartDialog');
const settings = document.getElementById('settingsDialog');
const opensettings = document.getElementById('opensettings');
const closesettings = document.getElementById('closesettings');
const resetdialog = document.getElementById('resetDialog');

let targetID;

let isVolumeUIOpened = false;

function restartFunc() {
  const storedata = document.getElementById('storedata');
  const mediaplayer = document.getElementById('MediaExtDeck1');
  const mediaplayer2 = document.getElementById('MediaExtDeck2');
  dropdownClose();
  if (storedata &&
    storedata.querySelectorAll('audio').length > 0 || (recorder && recorder.state !== "inactive") ||
    isPlaying(mediaplayer) || isPlaying(mediaplayer2) || isPlaying(document.getElementById('mediaA')) ||
    isPlaying(document.getElementById('mediaB')) || isPlaying(document.getElementById('mediaC')) ||
    isPlaying(document.getElementById('mediaD'))) {
    document.getElementById('restartDialog').show();
  } else {
    ipcRenderer.send('window-action', 'restart');
  }
};

function preventDialogfromOpening() {
  const dialogs = document.querySelectorAll('dialog');
  let length = 0
  dialogs.forEach((dialog, index) => {
    if (dialog.open) {
      length = length + 1
    }
  });
  return length
}

function closeAllDialogs() {
  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach((dialog, index) => {
    // Skip volumeDialog—it has its own animation ritual
    if (dialog.id === 'testspkDialog' ||
      dialog.id === 'downloadDialog' ||
      dialog.id === "imagePreviewDialog" ||
      dialog.id === "alertMessage" ||
      dialog.id === "deviceDetectionDialog") {
      return;
    }

    const dialogOnInit = dialog;
    CloseAnimationInit(dialogOnInit);
  });

  if (document.getElementById('settingsDialog').classList.contains('onColorPicker')) {
    document.getElementById('settingsDialog').classList.remove('onColorPicker');
  }
}

function closeAllDialogsExceptOne(id) {
  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach((dialog, index) => {
    // Skip volumeDialog—it has its own animation ritual
    if (dialog.id === 'testspkDialog' ||
      dialog.id === 'downloadDialog' ||
      dialog.id === "imagePreviewDialog" ||
      dialog.id === "alertMessage" ||
      dialog.id === "deviceDetectionDialog" ||
      dialog.id === id) {
      return;
    }

    const dialogOnInit = dialog;
    CloseAnimationInit(dialogOnInit);
  });

  if (document.getElementById('settingsDialog').classList.contains('onColorPicker')) {
    document.getElementById('settingsDialog').classList.remove('onColorPicker');
  }
}

function CloseAnimationInit(dialogOnInit) {
  dialogOnInit.classList.add('onCloseDialog');
  setTimeout(() => {
    dialogOnInit.close();
    dialogOnInit.classList.remove("onCloseDialog"); // Reset for next time
  }, 200);
}

const userAgent = navigator.userAgent;
if (userAgent.includes("Firefox")) {
  // 🚧 TODO: Add dialog handling logic for Firefox here
  message.textContent = "Battery Status API is deprecated on Firefox 51 and later. Mozilla decided to remove this feature due to privacy concerns. So, Battery status is hidden. Press OK to continue.";
  notifyDialog.show()
}

if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
  // 🚧 TODO: Add Safari-specific code here
  console.log("Battery Status API is not supported on Safari. So, Battery status is hidden. Press OK to continue.");
  notifyDialog.show()
}

function isElectron() {
  return typeof navigator === 'object' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.toLowerCase().includes('electron');
}

closesettings.addEventListener('click', () => {
  const dialogOnInit = settings
  CloseAnimationInit(dialogOnInit);
});

audioInfoDialogClose.addEventListener('click', () => {
  const dialogOnInit = audioInfoDialog
  CloseAnimationInit(dialogOnInit);
});

securityClose.addEventListener('click', () => {
  const dialogOnInit = securityDialog
  CloseAnimationInit(dialogOnInit);
});

notifyClose.addEventListener('click', () => {
  const dialogOnInit = notifyDialog
  CloseAnimationInit(dialogOnInit);
});

restartClose.addEventListener('click', () => {
  const dialogOnInit = restartDialog
  CloseAnimationInit(dialogOnInit);
});

opensettings.addEventListener('click', () => {
  settings.show();
  dropdownClose();
});

document.getElementById('restart-btn-permanent').addEventListener('click', () => {
  if (!isElectron()) {
    location.reload();
  }
});

document.getElementById('resetSettings').addEventListener('click', () => {
  resetdialog.show();
});

document.getElementById('resetBtn1').addEventListener('click', () => {
  localStorage.clear();
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('window-action', 'reset-app');
});

document.getElementById('resetBtn2').addEventListener('click', () => {
  const dialogOnInit = resetdialog
  CloseAnimationInit(dialogOnInit);
});

document.getElementById('setonlaunch').addEventListener('click', () => {
  const dialogOnInit = document.getElementById('hwDialog');
  CloseAnimationInit(dialogOnInit);
});

document.getElementById('devconsoleDialogClose').addEventListener('click', () => {
  const dialogOnInit = document.getElementById('devconsoleDialog');
  CloseAnimationInit(dialogOnInit);
});

function closeImportDialog(isImportGoing) {
  const dialogOnInit = document.getElementById('ImportDialog');
  CloseAnimationInit(dialogOnInit);

  if (isImportGoing) {
    // Auto-scroll after 500ms
    setTimeout(() => {
      const target = document.getElementById(targetID);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);

    function addOutline(id) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('focustoDeck')

        // Remove outline after 500ms
        setTimeout(() => {
          el.classList.remove('focustoDeck')
        }, 1250);
      }
    }

    addOutline(targetID);
  }
}

function updateBackdropVisibility() {
  const dialogElements = document.querySelectorAll('dialog');
  const backdrop = document.getElementById('backdropDialog');
  let anyOpen = false;

  dialogElements.forEach(dialog => {
    if (dialog.open) {
      anyOpen = true;
    }
  });
  if (backdrop) {
    if (anyOpen) {
      backdrop.classList.add('onOpenDialog');
      backdrop.classList.remove('onCloseDialog');
      document.getElementById("secondTopbarItem").style.visibility = "hidden";
      backdrop.onclick = null;
    } else {
      backdrop.classList.remove('onOpenDialog');
      backdrop.classList.add('onCloseDialog');
      document.getElementById("secondTopbarItem").style.visibility = "visible";
      backdrop.onclick = null;
    }
  }
  requestAnimationFrame(updateBackdropVisibility);
}

// Initial check
updateBackdropVisibility();

function initDialogStacking(
  backdropId = "backdropDialog",
  backdropBase = 500,
  dialogBase = 501
) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) return;

  let dialogStack = [];

  const updateIndexes = () => {
    // Backdrop always below dialogs
    backdrop.style.setProperty(
      "--index",
      backdropBase + dialogStack.length,
      "important"
    );

    dialogStack.forEach((dialog, i) => {
      dialog.style.setProperty(
        "--index",
        dialogBase + i,
        "important"
      );
    });
  };

  const bringToFront = (dialog) => {
    dialogStack = dialogStack.filter(d => d !== dialog);
    dialogStack.push(dialog);
    updateIndexes();
  };

  const syncDialogs = () => {
    const openDialogs = Array.from(document.querySelectorAll("dialog[open]"));

    // Add newly opened dialogs
    openDialogs.forEach(d => {
      if (!dialogStack.includes(d)) {
        dialogStack.push(d);
      }
    });

    // Remove closed dialogs
    dialogStack = dialogStack.filter(d => d.hasAttribute("open"));

    // Reset closed dialogs
    document.querySelectorAll("dialog:not([open])").forEach(d => {
      d.style.removeProperty("--index");
    });

    updateIndexes();
  };

  // Observe open / close
  const observer = new MutationObserver(syncDialogs);
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"]
  });

  // Click / focus brings dialog to front
  document.addEventListener("mousedown", (e) => {
    const dialog = e.target.closest("dialog[open]");
    if (dialog) bringToFront(dialog);
  });

  // Initial sync
  syncDialogs();

  return {
    observer,
    bringToFront
  };
}

// Usage
const dialogStackObserver = initDialogStacking();