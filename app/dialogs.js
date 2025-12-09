const notifyDialog = document.getElementById('notifyDialog')
const notifyClose = document.getElementById('notifyClose')
const message = document.getElementById("message");
const openaboutDialog = document.getElementById('openaboutDialog');
const audioInfoDialog = document.getElementById('audioInfoDialog');
const legendOpen = document.getElementById('legendOpen');
const audioInfoDialogClose = document.getElementById('audioInfoDialogClose');
const dialogHelp = document.getElementById('helpDialog');
const closeBtnHelp = document.getElementById('closeBtnHelp');
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
  const dialog = document.getElementById('restartDialog');
  dialog.show()
  dropdownClose();
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

closeBtnHelp.addEventListener('click', () => {
  const dialogOnInit = dialogHelp
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

legendOpen.addEventListener('click', () => {
  ipcRenderer.send('UserGuideExecute');
  dropdownClose();
});

openaboutDialog.addEventListener('click', () => {
  ipcRenderer.send('AboutExecute');
  dropdownClose();
});

document.getElementById('openDevConsole').addEventListener('click', () => {
  const dialog = document.getElementById('devconsoleDialog');
  dialog.show()
  dropdownClose();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  ipcRenderer.send('window-action', 'restart');
});

document.getElementById('restart-btn-permanent').addEventListener('click', () => {
  if (!isElectron()) {
    location.reload();
  }
});

document.getElementById('resetSettings').addEventListener('click', () => {
  resetdialog.show();
  const dialogOnInit = settings
  CloseAnimationInit(dialogOnInit);
});

document.getElementById('resetBtn1').addEventListener('click', () => {
  localStorage.clear();
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('window-action', 'restart');
});

document.getElementById('resetBtn2').addEventListener('click', () => {
  const dialogOnInit = resetdialog
  CloseAnimationInit(dialogOnInit);
  settings.show();
});

document.getElementById('setonlaunch').addEventListener('click', () => {
  const dialogOnInit = document.getElementById('hwDialog');
  CloseAnimationInit(dialogOnInit);
  settings.show();
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

  const rightsidemenu = document.getElementById('dropdown-menu')
  dialogElements.forEach(dialog => {
    if (dialog.open || rightsidemenu.classList.contains("show")) {
      anyOpen = true;
    }
  });
  if (backdrop) {
    if (anyOpen) {
      backdrop.classList.add('onOpenDialog');
      backdrop.classList.remove('onCloseDialog');
      document.getElementById("secondTopbarItem").style.visibility = "hidden";
      document.getElementById('toggle-btn').disabled = true
      backdrop.onclick = null;
    } else {
      backdrop.classList.remove('onOpenDialog');
      backdrop.classList.add('onCloseDialog');
      document.getElementById("secondTopbarItem").style.visibility = "visible";
      document.getElementById('toggle-btn').disabled = false
      backdrop.onclick = null;
    }
  }
  requestAnimationFrame(updateBackdropVisibility);
}

// Initial check
updateBackdropVisibility();

settingsDialog.addEventListener("toggle", () => {
  if (settingsDialog.open) {
    document.getElementById("musictest").src = document.getElementById('musicTestOption').value;
    console.log("Settings dialog opened");
    // add your open function here
  } else {
    document.getElementById("musictest").src = "";
    console.log("Settings dialog closed");
    // add your close function here
  }
});

document.getElementById('musicTestOption').addEventListener("change", (e) => {
  document.getElementById("musictest").src = e.target.value;
})