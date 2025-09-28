const notifyDialog = document.getElementById('notifyDialog')
const notifyClose = document.getElementById('notifyClose')
const message = document.getElementById("message");
const aboutDialog = document.getElementById('aboutDialog');
const openaboutDialog = document.getElementById('openaboutDialog');
const closeaboutDialog = document.getElementById('closeaboutDialog');
const legendDialog = document.getElementById('legendDialog');
const legendOpen = document.getElementById('legendOpen');
const legendClose = document.getElementById('legendClose');
const dialogHelp = document.getElementById('helpDialog');
const openBtnHelp = document.getElementById('openBtnHelp');
const closeBtnHelp = document.getElementById('closeBtnHelp');
const securityClose = document.getElementById('securityClose');
const volumeControl = document.getElementById('volumeControl');
const securityDialog = document.getElementById('securityDialog');
const restartDialog = document.getElementById('restartDialog');
const settings = document.getElementById('settingsDialog');
const opensettings = document.getElementById('opensettings');
const closesettings = document.getElementById('closesettings');
const resetdialog = document.getElementById('resetDialog');

let isVolumeUIOpened = false;

function volumeControlUI() {
  if (isVolumeUIOpened === false) {
    isVolumeUIOpened = true;
    document.getElementById('volume-rack').classList.add('show');
    document.getElementById('audio-list').classList.add('hasVolumeRack');
    document.getElementById('audio-list').classList.remove('hasVolumeRackClosed');
    document.getElementById('contentCheck').classList.add('hasVolumeRack');
    document.getElementById('contentCheck').classList.remove('hasVolumeRackClosed');
    document.getElementById('audio-list').classList.add('volumeRackenabled');
  } else {
    isVolumeUIOpened = false;
    document.getElementById('volume-rack').classList.remove('show');
    document.getElementById('audio-list').classList.remove('hasVolumeRack');
    document.getElementById('audio-list').classList.remove('volumeRackenabled');
    document.getElementById('audio-list').classList.add('hasVolumeRackClosed');
    document.getElementById('contentCheck').classList.remove('hasVolumeRack');
    document.getElementById('contentCheck').classList.add('hasVolumeRackClosed');
  }
}

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
    if (dialog.id === 'testspkDialog' || dialog.id === 'downloadDialog') {
      return;
    }
    const dialogOnInit = dialog;
    CloseAnimationInit(dialogOnInit);
  });
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

legendClose.addEventListener('click', () => {
  const dialogOnInit = legendDialog
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

closeaboutDialog.addEventListener('click', () => {
  const dialogOnInit = aboutDialog
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

openBtnHelp.addEventListener('click', () => {
  dialogHelp.show();
  dropdownClose();
});

legendOpen.addEventListener('click', () => {
  legendDialog.show();
  dropdownClose();
});

openaboutDialog.addEventListener('click', () => {
  aboutDialog.show();
  dropdownClose();
});

document.getElementById('openDevConsole').addEventListener('click', () => {
  const dialog = document.getElementById('devconsoleDialog');
  dialog.show()
  dropdownClose();
});

document.getElementById('restart-btn').addEventListener('click', () => {
  const dialog = document.getElementById('restartDialog');
  dialog.show()
  dropdownClose();
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
  const dialogOnInit = resetdialog
  CloseAnimationInit(dialogOnInit);
  settings.show();
  localStorage.clear();
  loadSettings();
  saveSettings();
  resetColor();
  loadFilter();
  document.getElementById('micSelector').value = localStorage.getItem('preferredMicId') || "-2";
  disconnectMic();
  document.getElementById('skipFramesSelector').value = savedSkip || "0"
  skipFrames = parseInt(skipFramesSelector.value);
  localStorage.setItem('skipFrames', skipFrames);
  const text = 'All settings have been reset.';
  snackbar(text);
});

document.getElementById('resetBtn2').addEventListener('click', () => {
  const dialogOnInit = resetdialog
  CloseAnimationInit(dialogOnInit);
  settings.show();
});

document.getElementById('devconsoleDialogClose').addEventListener('click', () => {
  const dialogOnInit = document.getElementById('devconsoleDialog');
  CloseAnimationInit(dialogOnInit);
});

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
      document.getElementById('topbar_backdrop').classList.add('onHide');
      document.getElementById('volume-rack').classList.remove('isDialogClosed');
      document.getElementById('volume-rack').classList.add('isDialogOpened');
      document.getElementById('topbar2_container').style.visibility = "hidden";
      document.getElementById('audio-list').classList.add('onDialogOpenRescroll');
      backdrop.onclick = null;
    } else {
      backdrop.classList.remove('onOpenDialog');
      backdrop.classList.add('onCloseDialog');
      document.getElementById('volume-rack').classList.remove('isDialogOpened');
      document.getElementById('volume-rack').classList.add('isDialogClosed');
      document.getElementById("secondTopbarItem").style.visibility = "visible";
      document.getElementById('topbar_backdrop').classList.remove('onHide');
      document.getElementById('topbar2_container').style.visibility = "visible";
      document.getElementById('audio-list').classList.remove('onDialogOpenRescroll');
      backdrop.onclick = null;
    }
  }
  requestAnimationFrame(updateBackdropVisibility);
}

// Initial check
updateBackdropVisibility();