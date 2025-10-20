const { ipcRenderer } = require('electron');

ipcRenderer.send('request-window-state');

ipcRenderer.on('dialog-close', () => {
  closeDialogInsteadofApp();
});

document.getElementById('powershell_rundownload').addEventListener('click', () => {
  document.getElementById('downloadDialog').show();
  dropdownClose();
  ipcRenderer.send('powershell_rundownload');
});

function isPlaying(mediaEl) {
  return !!(
    mediaEl.currentTime > 0 &&
    !mediaEl.paused &&
    !mediaEl.ended &&
    mediaEl.readyState > 2
  );
}

function closeFunc() {
  const storedata = document.getElementById('storedata');
  const mediaplayer = document.getElementById('MediaExtDeck_1');
  const mediaplayer2 = document.getElementById('MediaExtDeck_2');
  dropdownClose();
  if (storedata &&
    storedata.querySelectorAll('audio').length > 0 ||
    isPlaying(mediaplayer) || isPlaying(mediaplayer2) || isPlaying(document.getElementById('mediaA')) ||
    isPlaying(document.getElementById('mediaB')) || isPlaying(document.getElementById('mediaC')) ||
    isPlaying(document.getElementById('mediaD'))) {
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

ipcRenderer.on('sfx-status', (event, data) => {
  document.getElementById('packButton').innerText = data.text;
});

ipcRenderer.on('fadeIn', () => {
  setInterval(() => {
    document.getElementById('initBackdropFirst').classList.add('onInitReady');
  }, 2500);
});

document.querySelectorAll('select').forEach(select => {
  select.addEventListener('mousedown', (e) => {
    e.preventDefault(); // stop native dropdown
    setTimeout(() => openCustomMenu(select), 0);
  });
});

function openCustomMenu(select) {
  const existing = document.querySelector('.custom-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'custom-menu';
  menu.innerHTML = Array.from(select.options)
    .map(
      (opt) => `
        <div class="item ${opt.disabled ? 'disabled' : ''}" 
             data-value="${opt.value}">
          ${opt.innerHTML}
        </div>`
    )
    .join('');
  document.body.appendChild(menu);

  const rect = select.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.minWidth = `${rect.width}px`;
  menu.style.left = `${rect.left}px`;
  menu.style.zIndex = 2025;
  menu.style.opacity = 0;
  menu.style.transform = 'scaleY(0.95)'; // start slightly shrunken
  if (select.id !== 'categoryDropdown') {
    menu.style.maxHeight = '250px';
    menu.style.overflowY = 'auto';
  }

  // Let DOM render first
  requestAnimationFrame(() => {
    const menuHeight = menu.offsetHeight;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let openUp = false;
    if (menuHeight > spaceBelow && spaceAbove > spaceBelow) {
      openUp = true;
      menu.style.top = `${rect.top - menuHeight - 4}px`;
      menu.classList.add('flip-up');
    } else {
      menu.style.top = `${rect.bottom + 4}px`;
      menu.classList.remove('flip-up');
    }

    requestAnimationFrame(() => {
      menu.classList.add('show');
      menu.style.opacity = 1;
      menu.style.transform = 'scaleY(1)';
      menu.dataset.direction = openUp ? 'up' : 'down';
    });
  });

  // Click select
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (!item || item.classList.contains('disabled')) {
      closeMenu(menu);
    } else {
      select.value = item.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu(menu);
    }
  });

  // Click outside
  const close = (e2) => {
    if (!menu.contains(e2.target)) closeMenu(menu);
  };
  document.addEventListener('mousedown', close, { once: true });
}

// Hide animation
function closeMenu(menu) {
  menu.classList.remove('show');
  menu.style.opacity = 0;
  menu.style.transform = 'scaleY(0.95)';
  setTimeout(() => menu.remove(), 150);
}

// ESC closes
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const menu = document.querySelector('.custom-menu');
    if (menu) closeMenu(menu);
  }
});

// Hotkey: close custom menu when pressing any key while focus is outside the menu
document.addEventListener('keydown', (e) => {
  const menu = document.querySelector('.custom-menu');
  if (!menu) return;
  // If focus is not inside the menu, close it on any key
  if (!menu.contains(document.activeElement)) {
    closeMenu(menu);
  }
});

// Close custom menu on window resize
window.addEventListener('resize', () => {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);
});

window.addEventListener('blur', () => {
  const menu = document.querySelector('.custom-menu');
  if (menu) closeMenu(menu);
});

let rafCount = 0;

function monitorCustomMenu() {
  const menu = document.querySelector('.custom-menu');
  const blockArea = document.getElementById('blockArea');
  if (menu && menu.classList.contains('show')) {
    rafCount++;
    if (blockArea) blockArea.classList.add('enable');
  } else {
    rafCount = 0;
    if (blockArea) blockArea.classList.remove('enable');
  }
  requestAnimationFrame(monitorCustomMenu);
}

monitorCustomMenu();

