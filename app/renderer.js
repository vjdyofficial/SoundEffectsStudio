const { ipcRenderer } = require('electron');

ipcRenderer.send('request-window-state');

ipcRenderer.on('window-state', (event, state) => {
  const icon = document.getElementById('iconImg');
  const button = document.getElementById('maximize-btn');
  if (state.isMaximized) {
    icon.src = 'images/windows/restore-down.svg';
    button.title = 'Restore Down';
  } else {
    icon.src = 'images/windows/maximize.svg';
    button.title = 'Maximize';
  }
});

ipcRenderer.on('dialog-close', () => {
  closeDialogInsteadofApp();
});

ipcRenderer.on('fullscr-state', (event, state) => {
  const icon = document.getElementById('iconImg');
  const button = document.getElementById('maximize-btn');
  if (state.isFullscreen) {
    icon.src = 'images/windows/exit-fullscreen.svg';
    button.title = 'Exit Fullscreen';
  }
});

document.getElementById('minimize-btn').addEventListener('click', () => {
  ipcRenderer.send('window-action', 'minimize');
});

document.getElementById('powershell_rundownload').addEventListener('click', () => {
  document.getElementById('downloadDialog').show();
  dropdownClose();
  ipcRenderer.send('powershell_rundownload');
});

document.getElementById('maximize-btn').addEventListener('click', () => {
  if (!document.fullscreenElement) {
    ipcRenderer.send('window-action', 'maximize');
  } else {
    exitFullscreen();
  }
});

// Show Windows 11-style snap suggestion using Electron's native UI
document.getElementById('maximize-btn').addEventListener('mouseenter', () => {
  ipcRenderer.send('show-snap-suggestions');
});

// Optionally, hide suggestion on mouseleave (handled natively if using overlay)
document.getElementById('maximize-btn').addEventListener('mouseleave', () => {
  ipcRenderer.send('hide-snap-suggestions');
});

function closeFunc() {
  const storedata = document.getElementById('storedata');
  if (storedata && storedata.querySelectorAll('audio').length > 0) {
    const securityDialog = document.getElementById('securityDialog');
    securityDialog.show()
  } else {
    ipcRenderer.send('window-action', 'close-permanent');
  }
}

function closeDialogInsteadofApp() {
  if (!preventDialogfromOpening() == 0) {
    closeAllDialogs();
    event.preventDefault();
  } else {
    closeFunc()
  }
}

document.addEventListener("keydown", (event) => {
  if (event.altKey && event.key === "F4" && !event.repeat) {
    e.preventDefault();
  };
});

document.getElementById('close-btn').addEventListener('click', () => {
  closeDialogInsteadofApp()
});

document.getElementById('close-btn-permanent').addEventListener('click', () => {
  ipcRenderer.send('window-action', 'close-permanent');
});

document.getElementById('restart-btn-permanent').addEventListener('click', () => {
  ipcRenderer.send('window-action', 'restart');
});

document.getElementById('windows-soundsettings').addEventListener('click', (e) => {
  if (e.shiftKey) {
    ipcRenderer.send('window-action', 'windows-legacy-soundsettings');
  } else {
    ipcRenderer.send('window-action', 'windows-soundsettings');
  }
});

document.getElementById('windows-openvolumemixer').addEventListener('click', (e) => {
  if (e.shiftKey) {
    ipcRenderer.send('window-action', 'windows-legacy-openvolumemixer');
  } else {
    ipcRenderer.send('window-action', 'windows-openvolumemixer');
  }
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
  document.getElementById("profile-pic2").src = dataUrl;
});

ipcRenderer.on('username', (event, username) => {
  document.getElementById("username").textContent = username;
  document.getElementById('usrname_title').title = `You used this app as ${username}.`
});

ipcRenderer.on('sendInfo', (event, electronBuilderVersion, appVersion, chromiumVersion, electronVersion, nodeVersion, buildID) => {
  document.getElementById('appVersion').innerText = appVersion;
  document.getElementById('electronVersion').innerText = electronVersion;
  document.getElementById('chromeVersion').innerText = chromiumVersion;
  document.getElementById('nodeVersion').innerText = nodeVersion;
  document.getElementById('buildID').innerText = buildID;
});