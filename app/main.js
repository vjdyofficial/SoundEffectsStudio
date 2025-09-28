const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeTheme, nativeImage, Notification, dialog } = require('electron');
const { shell } = require('electron');
const os = require('os');
const fs = require('fs');
const exec = require('child_process').exec;
const { spawn } = require('child_process');
const path = require('path');
const { screen } = require('electron');
const { exit } = require('process');
const WinReg = require("winreg");

function getBestUserProfilePic(callback) {
  const regKey = new WinReg({
    hive: WinReg.HKLM,
    key: `\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AccountPicture\\Users`
  });

  regKey.keys((err, subkeys) => {
    if (err || !subkeys.length) {
      console.log("❌ No registry keys found for AccountPicture.");
      return callback(null);
    }

    // Use first SID found (you can filter for current user if needed)
    const userKey = subkeys[0];

    userKey.values((err, items) => {
      if (err) {
        console.log("⚠️ Error reading registry values:", err);
        return callback(null);
      }

      // Prefer largest size (Image1080), fallback to any ImageX
      const imageEntry =
        items.find(i => i.name === "Image1080") ||
        items.reverse().find(i => i.name.startsWith("Image"));

      if (imageEntry && fs.existsSync(imageEntry.value)) {
        const img = fs.readFileSync(imageEntry.value).toString("base64");
        return callback(`data:image/jpeg;base64,${img}`);
      }

      console.log("⚠️ No profile picture found in registry.");
      callback(null);
    });
  });
}

let mainWindow;
let splashWindow;
let tray = null;

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
const electronVersion = process.versions.electron
const electronBuilderVersion = packageJson.devDependencies?.['electron-builder'] || 'Not found';
const buildID = 2025280901
const appVersion = app.getVersion();
const chromiumVersion = process.versions.chrome;
const nodeVersion = process.versions.node;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const bgColor = nativeTheme.shouldUseDarkColors
  ? "#141414" // fully transparent black for dark mode
  : "#f8f8f8ff"; // fully transparent white for light mode

const buildNumber = parseInt(os.release().split(".")[2]);
const isWin11 = process.platform === "win32" && buildNumber >= 22000;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit(); // Another instance is already running
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // If someone tried to open a second instance, focus the existing window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.commandLine.appendSwitch('high-dpi-support', '1');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');

  app.whenReady().then(async () => {
    let progressWindow;
    function createProgressWindow() {
      const progressWin = new BrowserWindow({
        width: 600,
        height: 200,
        frame: true,
        backgroundColor: "#00000000",
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        titleBarStyle: 'hidden', // optional, for macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      progressWin.loadFile('progress.html');
      return progressWin;
    }

    let progressCopyWindow;
    function createProgressCopyWindow() {
      const progressCopyWindow = new BrowserWindow({
        width: 600,
        height: 200,
        frame: true,
        backgroundColor: "#00000000",
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        titleBarStyle: 'hidden', // optional, for macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      progressCopyWindow.loadFile('progress-copying.html');
      return progressCopyWindow;
    }

    const sfxSrc = path.join(__dirname, 'sfx');
    const sfxDest = path.join(app.getPath('appData'), 'vjdyfm-sfxstudio', 'assets', 'sfx');
    const sfxAsset = path.join(app.getPath('appData'), 'vjdyfm-sfxstudio', 'assets');

    if (!fs.existsSync(sfxDest) && fs.existsSync(sfxSrc)) {
      progressCopyWindow = createProgressCopyWindow(); // store the window
      await delay(3000);
      fs.mkdirSync(sfxDest, { recursive: true });
      fs.cpSync(sfxSrc, sfxDest, { recursive: true });
      progressCopyWindow.close();
    }

    // Reverse copy: restore to local folder if missing
    if (!fs.existsSync(sfxSrc) && fs.existsSync(sfxDest)) {
      progressWindow = createProgressWindow(); // store the window
      await delay(3000);

      fs.mkdirSync(sfxSrc, { recursive: true });
      fs.cpSync(sfxDest, sfxSrc, { recursive: true });

      progressWindow.close();
      console.log("✅ SFX folder restored from appData to local project folder.");
    }

    splashWindow = new BrowserWindow({
      width: 1000,
      height: 375,
      frame: true,
      backgroundColor: "#00000000",
      backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
      visualEffectState: isWin11 ? "active" : "inactive",
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      titleBarStyle: 'hidden', // optional, for macOS
      autoHideMenuBar: true, // 🪄 This hides the menu bar!
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
        devTools: false
      }
    });

    splashWindow.loadFile('splash.html');

    // Disable Play/Pause
    globalShortcut.register('MediaPlayPause', () => {
      console.log('Play/Pause intercepted — surreal silence maintained.');
    });

    // Disable Next Track
    globalShortcut.register('MediaNextTrack', () => {
      console.log('Next Track blocked — stay tuned to Spinning Seal FM.');
    });

    // Disable Previous Track
    globalShortcut.register('MediaPreviousTrack', () => {
      console.log('Previous Track blocked — no rewinds in matcha mode.');
    });

    const isDarkMode = nativeTheme.shouldUseDarkColors;
    const win = new BrowserWindow({
      width: 1024,
      height: 768,
      minWidth: 750,
      minHeight: 600,
      icon: path.join(__dirname, "icon.ico"),
      backgroundColor: bgColor,
      show: false,
      frame: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      resizable: true,
      titleBarStyle: 'hidden', // optional, for macOS
      autoHideMenuBar: true, // 🪄 This hides the menu bar!
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        backgroundThrottling: false,
        contextIsolation: false,
        nodeIntegration: true,
        // devTools: true,
      }
    });

    function createTray() {
      const iconPath = getIconForTheme(nativeTheme.shouldUseDarkColors);
      tray = new Tray(iconPath);
      tray.setToolTip('VJDY FM Sound Effect Studio');

      // icons
      const icon = nativeImage.createFromPath(getIconForTheme(nativeTheme.shouldUseDarkColors));

      const contextMenu = Menu.buildFromTemplate([
        { label: 'Sound Effects Studio', icon, enabled: false },
        // { label: 'Debug', click: () => win.webContents.openDevTools() },
        { type: 'separator' }, // ← This adds the divider line
        {
          label: 'VU Meter', submenu: [
            {
              label: 'Always on Top',
              type: 'checkbox',
              checked: vumeter.isAlwaysOnTop(),
              click: (menuItem) => {
                vumeter.setAlwaysOnTop(menuItem.checked);
                console.log(`Always on top: ${menuItem.checked ? 'Enabled' : 'Disabled'} HAHAHA`);
              }
            },
            {
              label: "Set Position",
              submenu: [
                {
                  label: "Top Left",
                  click: () => {
                    vumeter.setBounds({
                      x: 0,
                      y: 0,
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                },
                {
                  label: "Top",
                  click: () => {
                    const { width } = screen.getPrimaryDisplay().workAreaSize;
                    vumeter.setBounds({
                      x: Math.floor((width - vumeter.getBounds().width) / 2),
                      y: 0,
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                },
                {
                  label: "Top Right",
                  click: () => {
                    const { width } = screen.getPrimaryDisplay().workAreaSize;
                    vumeter.setBounds({
                      x: width - vumeter.getBounds().width,
                      y: 0,
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                },
                {
                  label: "Left",
                  click: () => {
                    const { height } = screen.getPrimaryDisplay().workAreaSize;
                    vumeter.setBounds({
                      x: 0,
                      y: Math.floor((height - vumeter.getBounds().height) / 2),
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                },
                {
                  label: "Right",
                  click: () => {
                    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
                    vumeter.setBounds({
                      x: width - vumeter.getBounds().width,
                      y: Math.floor((height - vumeter.getBounds().height) / 2),
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                },
                {
                  label: "Bottom Left",
                  click: () => {
                    const { height } = screen.getPrimaryDisplay().workAreaSize;
                    vumeter.setBounds({
                      x: 0,
                      y: height - vumeter.getBounds().height,
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                },
                {
                  label: "Bottom",
                  click: () => {
                    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
                    vumeter.setBounds({
                      x: Math.floor((width - vumeter.getBounds().width) / 2),
                      y: height - vumeter.getBounds().height,
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                },
                {
                  label: "Bottom Right",
                  click: () => {
                    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
                    vumeter.setBounds({
                      x: width - vumeter.getBounds().width,
                      y: height - vumeter.getBounds().height,
                      width: vumeter.getBounds().width,
                      height: vumeter.getBounds().height
                    });
                  }
                }
              ]
            },
            {
              label: '2 Views Mode',
              type: 'checkbox',
              checked: vumeter.getBounds().height >= 425,
              click: (menuItem) => {
                const bounds = vumeter.getBounds(); // get current x, y, w, h

                if (menuItem.checked) {
                  // Expand to 2 views
                  vumeter.setBounds({
                    x: bounds.x,
                    y: bounds.y,
                    width: 300,
                    height: 440,
                  });
                  vumeter.setMinimumSize(300, 440);
                  console.log("Switched to 2 views");
                } else {
                  // Shrink back to 1 view
                  vumeter.setBounds({
                    x: bounds.x,
                    y: bounds.y,
                    width: 300,
                    height: 240,
                  });
                  vumeter.setMinimumSize(300, 240);
                  console.log("Switched to 1 view");
                }
              }
            }
          ],
          enabled: vumeter.isVisible
        },
        {
          label: 'Clock widget', submenu: [
            {
              label: 'Always on Top',
              type: 'checkbox',
              checked: clockWindow.isAlwaysOnTop(),
              click: (menuItem) => {
                clockWindow.setAlwaysOnTop(menuItem.checked);
                console.log(`Always on top: ${menuItem.checked ? 'Enabled' : 'Disabled'} HAHAHA`);
              }
            },
            {
              label: "Set Position",
              submenu: [
                {
                  label: "Top Left",
                  click: () => {
                    clockWindow.setBounds({
                      x: 0,
                      y: 0,
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                },
                {
                  label: "Top",
                  click: () => {
                    const { width } = screen.getPrimaryDisplay().workAreaSize;
                    clockWindow.setBounds({
                      x: Math.floor((width - clockWindow.getBounds().width) / 2),
                      y: 0,
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                },
                {
                  label: "Top Right",
                  click: () => {
                    const { width } = screen.getPrimaryDisplay().workAreaSize;
                    clockWindow.setBounds({
                      x: width - clockWindow.getBounds().width,
                      y: 0,
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                },
                {
                  label: "Left",
                  click: () => {
                    const { height } = screen.getPrimaryDisplay().workAreaSize;
                    clockWindow.setBounds({
                      x: 0,
                      y: Math.floor((height - clockWindow.getBounds().height) / 2),
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                },
                {
                  label: "Right",
                  click: () => {
                    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
                    clockWindow.setBounds({
                      x: width - clockWindow.getBounds().width,
                      y: Math.floor((height - clockWindow.getBounds().height) / 2),
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                },
                {
                  label: "Bottom Left",
                  click: () => {
                    const { height } = screen.getPrimaryDisplay().workAreaSize;
                    clockWindow.setBounds({
                      x: 0,
                      y: height - clockWindow.getBounds().height,
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                },
                {
                  label: "Bottom",
                  click: () => {
                    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
                    clockWindow.setBounds({
                      x: Math.floor((width - clockWindow.getBounds().width) / 2),
                      y: height - clockWindow.getBounds().height,
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                },
                {
                  label: "Bottom Right",
                  click: () => {
                    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
                    clockWindow.setBounds({
                      x: width - clockWindow.getBounds().width,
                      y: height - clockWindow.getBounds().height,
                      width: clockWindow.getBounds().width,
                      height: clockWindow.getBounds().height
                    });
                  }
                }
              ]
            },
          ],
        },
        { type: 'separator' },
        { label: 'Main Window', type: 'normal', enabled: false },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: win.isAlwaysOnTop(),
          click: (menuItem) => {
            win.setAlwaysOnTop(menuItem.checked);
            console.log(`Always on top: ${menuItem.checked ? 'Enabled' : 'Disabled'} HAHAHA`);
          }
        },
        {
          label: 'Event Mode',
          type: 'checkbox',
          checked: !win.isResizable(),
          click: (menuItem) => {
            win.setResizable(!menuItem.checked);
            console.log(`Always on top: ${menuItem.checked ? 'Enabled' : 'Disabled'} HAHAHA`);
          }
        },
        { label: 'Exit App', role: 'quit' },
      ]);

      tray.setContextMenu(contextMenu);
    }

    function restartApp() {
      app.relaunch(); // Relaunch the app
      app.exit(0);     // Exit current instance
    }

    function getIconForTheme(isDark) {
      return path.join(__dirname, isDark ? 'images/tray/icon-dark.png' : 'images/tray/icon-light.png');
    }

    // 🌀 React to theme changes dynamically
    nativeTheme.on('updated', () => {
      const newIcon = getIconForTheme(nativeTheme.shouldUseDarkColors);
      tray.setImage(newIcon);
    });

    win.loadFile('index.html');
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    mainWindow = win;

    const sfxPath = path.join(__dirname, 'sfx');
    if (fs.existsSync(sfxPath)) {
      // Send message to renderer
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('sfx-status', { text: 'Update Pack' });
      });
    } else {
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('sfx-status', { text: 'Install Pack' });
      });
    }

    ipcMain.on('toggle-maximize', () => {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    });

    setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const isMaximized = mainWindow.isMaximized();
        const isFullscreen = mainWindow.isFullScreen();
        if (isFullscreen) {
          win.webContents.send('fullscr-state', { isFullscreen });
        } else {
          win.webContents.send('window-state', { isMaximized });
        }
      }
    }, 0);

    ipcMain.on('window-action', (event, action) => {
      const win = BrowserWindow.getFocusedWindow();
      if (action === 'minimize') {
        win.minimize();
      } else if (action === 'full-scr') {
        win.setFullScreen(true);
      } else if (action === 'maximize') {
        if (win.isFullScreen()) {
          win.setFullScreen(false);
        } else if (win.isMaximized()) {
          win.unmaximize(); // restore down
        } else {
          win.maximize(); // maximize
        }
      } else if (action === 'restart') {
        restartApp();
      } else if (action === 'close-permanent') {
        app.exit(0);
      } else if (action === 'openMain') {
        console.log('true');
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
          mainWindow.show();
        } else {
          app.exit(0);
        }
      } else if (action === 'initSound') {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.webContents.send('playInitSound');
        }
      } else if (action === 'windows-soundsettings') {
        exec('start ms-settings:sound');
      } else if (action === 'windows-openvolumemixer') {
        exec('start ms-settings:apps-volume');
      } else if (action === 'windows-legacy-soundsettings') {
        exec('control mmsys.cpl');
      } else if (action === 'windows-legacy-openvolumemixer') {
        exec('sndvol.exe');
      }
    });

    mainWindow.webContents.once("dom-ready", () => {
      getBestUserProfilePic(pic => {
        const username = os.userInfo().username;
        mainWindow.webContents.send("username", username);
        mainWindow.webContents.send("sendInfo", electronBuilderVersion, appVersion, chromiumVersion, electronVersion, nodeVersion, buildID);
        if (pic) {
          mainWindow.webContents.send("profile-picture", pic);
          console.log("✅ Profile picture sent!");
        } else {
          const svgFallback = `images/system/fallback_profile.svg`
          mainWindow.webContents.send("profile-picture", svgFallback);
        }
      });
    });

    mainWindow.on('close', (e) => {
      e.preventDefault(); // Prevent the default close action
      win.webContents.send('dialog-close');
    });

    let visualizerWindow;

    const iconPathforExternalVisualizer = isDarkMode
      ? __dirname + '/icons/visualiser.png'
      : __dirname + '/icons/visualiser-light.png';

    const iconPathforVUMeter = isDarkMode
      ? __dirname + '/icons/vumeter.png'
      : __dirname + '/icons/vumeter-light.png';

    function createVisualizerWindow() {
      visualizerWindow = new BrowserWindow({
        width: 512,
        height: 512,
        minWidth: 512,
        minHeight: 512,
        backgroundColor: bgColor,
        icon: iconPathforExternalVisualizer,
        show: false,
        frame: true,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        closable: false,
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: true,
        }
      });

      // Disable close button (prevent window from closing)
      visualizerWindow.on('close', (e) => {
        e.preventDefault(); // Prevent close
        // Optionally, you can show a message or do nothing
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      visualizerWindow.loadFile('visualizer.html');
    }

    createVisualizerWindow();

    let vumeter;
    function createVUMeterWindow() {
      vumeter = new BrowserWindow({
        width: 300,
        minWidth: 300,
        maxWidth: 300,
        height: 240,
        minHeight: 240,
        maxHeight: 440,
        x: 0,
        y: 0,
        icon: iconPathforVUMeter,
        backgroundColor: "#00000000",
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",

        show: false,
        frame: true,
        alwaysOnTop: false,
        resizable: false,     // ✅ can resize
        maximizable: false,  // 🚫 no maximize button
        skipTaskbar: false,
        closable: false,
        titleBarStyle: 'hidden', // optional, for macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: false,
        }


      });

      ["close", "maximize"].forEach(evt => {
        vumeter.on(evt, (e) => {
          e.preventDefault();
        });
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      vumeter.loadFile('vumeter.html');
    }

    createVUMeterWindow();

    let clockWindow;
    function createclockWindow() {
      clockWindow = new BrowserWindow({
        width: 350,
        height: 160,
        minWidth: 350,
        maxWidth: 350,
        minHeight: 160,
        maxHeight: 160,
        x: 0,
        y: 0,
        backgroundColor: "#00000000",
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",

        show: false,
        frame: true,
        alwaysOnTop: false,
        resizable: false,     // ✅ can resize
        maximizable: false,  // 🚫 no maximize button

        skipTaskbar: false,
        closable: false,
        titleBarStyle: 'hidden', // optional, for macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: false,
        }
      });

      ["close", "maximize"].forEach(evt => {
        clockWindow.on(evt, (e) => {
          e.preventDefault();
        });
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      clockWindow.loadFile('clock.html');
    }

    createclockWindow();

    createTray();

    function closeifWarnPermanently() {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.hide();
      }
      win.hide();
      vumeter.hide();
      visualizerWindow.hide();
      clockWindow.hide();
    }

    ipcMain.on('powershell_rundownload', (event) => {
      const scriptPath = path.join(__dirname, 'downloadsfx.ps1');

      if (fs.existsSync(sfxDest)) {
        fs.rmSync(sfxDest, { recursive: true, force: true });
      }

      const ps = spawn('powershell.exe', [
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Start-Process powershell.exe -ArgumentList '-ExecutionPolicy Bypass -File "${scriptPath}"'`
      ], { windowsHide: false });

      ps.stdout.on('data', (data) => console.log(`stdout: ${data}`));
      ps.stderr.on('data', (data) => console.error(`stderr: ${data}`));

      ps.on('exit', (code) => {
        app.exit(0);
      });
    });

    ipcMain.on('show-notification', (event) => {
      closeifWarnPermanently();
      const choice = dialog.showMessageBoxSync(win, {
        type: 'warning',
        title: 'Sound Effects Studio',
        message: 'Sound Effects Studio closed automatically!',
        detail:
          'Sound Effects Studio will be closed because your device battery is critically low. ' +
          'Please charge your device to continue operation. This will prevent the app from performance issues, ' +
          'AudioContext and WebAudio API errors.\n\n' +
          'Press OK to exit, charge you device and restart the app again.',
        buttons: ['OK']
      });

      if (choice === 0) {
        app.quit();
      }
    });

    ipcMain.handle('show-audiocontexterror', async () => {
      closeifWarnPermanently();
      const choice = dialog.showMessageBoxSync(win, {
        type: 'error',
        title: 'Sound Effects Studio',
        message: 'AudioContext WebAudioAPI error!',
        detail:
          `The AudioContext encountered an error from the audio device or the WebAudio renderer. ` +
          `If you made changes to your audio devices and unable to scan for no reason, ` +
          `Restart the app to try again or exit.`,
        buttons: ['Exit App', 'Restart'],
      });

      if (choice === 0) {
        app.quit();
      } else if (choice === 1) {
        restartApp();
      }
    });

    nativeTheme.on('updated', () => {
      const newIcon1 = nativeTheme.shouldUseDarkColors
        ? __dirname + '/icons/visualiser.png'
        : __dirname + '/icons/visualiser-light.png';

      visualizerWindow.setIcon(newIcon1); // Only works on Linux; Windows/macOS don’t support live icon swap

      const newIcon2 = nativeTheme.shouldUseDarkColors
        ? __dirname + '/icons/vumeter.png'
        : __dirname + '/icons/vumeter-light.png';

      vumeter.setIcon(newIcon2); // Only works on Linux; Windows/macOS don’t support live icon swap

      win.setBackgroundColor(bgColor);
      visualizerWindow.setBackgroundColor(bgColor);
    });

    ipcMain.on("announce-batterylow", (event, text, title) => {
      if (win) {
        dialog.showMessageBox(win, {
          type: 'warning',
          title: 'Sound Effects Studio Battery Alarm System',
          message: title,
          detail: text,
          buttons: ['OK']
        });
      }
    });

    ipcMain.on("open-devtools", () => {
      if (win) {
        win.webContents.openDevTools();
      }
    });

    ipcMain.on('sendcolor', (event, firstColor, secondColor) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('sendcolor', firstColor, secondColor);
      }
    });

    ipcMain.on('sendbgcolor', (event, bgColor) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('sendbgcolor', bgColor);
      }
    });

    ipcMain.on('sendWaveformAlignment', (event, setAlignment) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('sendWaveformAlignment', setAlignment);
      }
    });

    ipcMain.on('sendFilter', (event, brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('sendFilter', brightnessValue, grayscaleValue, sepiaValue, backdropblurValue, blurMultiplier, angleValue);
      }
    });

    ipcMain.on('toggle-visualiser', (event, letVisualser) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        if (letVisualser) {
          visualizerWindow.show();
        } else {
          visualizerWindow.hide();
        }
      }
    });

    ipcMain.on('toggle-clock', (event, letClock) => {
      if (clockWindow && !clockWindow.isDestroyed()) {
        if (letClock) {
          clockWindow.show();
        } else {
          clockWindow.hide();
        }
      }
    });

    ipcMain.on('toggle-vumeter', (event, letVUMeter) => {
      if (vumeter && !vumeter.isDestroyed()) {
        if (letVUMeter) {
          vumeter.show();
        } else {
          vumeter.hide();
        }
      }
    });

    ipcMain.on('send-visualizer-data', (event, dataArray) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed() && visualizerWindow.isVisible()) {
        visualizerWindow.webContents.send('visualizer-update', dataArray);
      }
      if (vumeter && !vumeter.isDestroyed() && vumeter.isVisible()) {
        vumeter.webContents.send('vumeter-update', dataArray);
      }
    });

    ipcMain.on('send-visualizer-data2', (event, dataArray2) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed() && visualizerWindow.isVisible()) {
        visualizerWindow.webContents.send('visualizer-update2', dataArray2);
      }
      if (vumeter && !vumeter.isDestroyed() && vumeter.isVisible()) {
        vumeter.webContents.send('vumeter-update2', dataArray2);
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  process.on('uncaughtException', (error) => {
    closeifWarnPermanently();
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Guru Meditation',
      message: 'An error occured while running the client application due to instances of unstable functionality which cause an uncaught exception. Press OK to terminate this application.',
      detail: error.stack || error.message,
      buttons: ['Close']
    });
    if (choice === 0) {
      app.quit();
    }
  });

  process.on('unhandledRejection', (reason) => {
    closeifWarnPermanently();
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Guru Meditation',
      message: 'An error occured while running the client application due to instances of unstable functionality which cause an unhandled rejection. Press OK to terminate this application.',
      detail: reason?.stack || String(reason),
      buttons: ['OK']
    });
    if (choice === 0) {
      app.quit();
    }
  });
}