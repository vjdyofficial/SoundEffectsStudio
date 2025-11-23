const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeTheme, nativeImage, Notification, dialog } = require('electron');
const { shell } = require('electron');
const os = require('os');
const fs = require('fs');
const exec = require('child_process').exec;
const { spawn } = require('child_process');
const { execSync } = require("child_process");
const path = require('path');
const { screen } = require('electron');
const { exit, argv0, execArgv } = require('process');
const WinReg = require("winreg");

function getBestUserProfilePic(callback) {
  const regKey = new WinReg({
    hive: WinReg.HKLM,
    key: `\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AccountPicture\\Users`
  });

  regKey.keys((err, subkeys) => {
    if (err || !subkeys.length) {
      console.log("No registry keys found for AccountPicture.");
      return callback(null);
    }

    // Use first SID found (you can filter for current user if needed)
    const userKey = subkeys[0];

    userKey.values((err, items) => {
      if (err) {
        console.log("Error reading registry values:", err);
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

let tray = null;
let progressWindow;
let progressCopyWindow;
let splashWindow;
let clockWindow;
let vumeter;
let visualizerWindow;
let mainWindow;

let userGuideWindow;
let firstFile;
let hwvalue = true;
nativeTheme.themeSource = "system"; // or "light" or "system"

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('uncaughtException', (error) => {
  const choice = dialog.showMessageBoxSync(
    mainWindow || null,
    {
      type: 'error',
      title: 'Guru Meditation',
      message: 'An error occured while running the client application due to instances of unstable functionality which cause an uncaught exception.',
      detail: error.stack || error.message,
      buttons: ['OK']
    }
  );
});

process.on('unhandledRejection', (reason) => {
  const choice = dialog.showMessageBoxSync(
    mainWindow || null,
    {
      type: 'error',
      title: 'Guru Meditation',
      message: 'An error occured while running the client application due to instances of unstable functionality which cause an unhandled rejection.',
      detail: reason?.stack || String(reason),
      buttons: ['OK']
    }
  );
});

function handleFile(filePath) {
  if (!filePath) return;

  // Only handle .b64i files
  if (filePath.endsWith('.b64i')) {
    console.log("Handling .b64i file:", filePath);

    try {
      // Read the base64 text from the .b64i file
      const b64data = fs.readFileSync(filePath, 'utf8');

      // Send buffer to renderer for later usage (e.g., as src)
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("openbase64_image", b64data);
      }

      console.log("Sent .b64i content to renderer");

    } catch (err) {
      console.error('Error reading .b64i file:', err);
    }
  } else if (filePath.endsWith('.subw')) {
    const choice = dialog.showMessageBoxSync(
      mainWindow || null,
      {
        type: 'info',
        title: 'Bass Preset Import',
        message: 'Bass Preset Detected',
        detail: 'The app has detected a Bass Preset File to import. \n' +
          'Are you sure you want to import and continue?',
        buttons: ['Yes', 'No']
      }
    );

    if (choice === 0) {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("importsubw", filePath);
      }
    }
  }
}

app.setAsDefaultProtocolClient('subw');
app.setAsDefaultProtocolClient('b64i');
app.setAsDefaultProtocolClient('srs');

function fileExecute(listArg) {
  const file = listArg.find(arg =>
    typeof arg === "string" &&
    (arg.endsWith(".b64i") || arg.endsWith(".subw") || arg.endsWith(".srs"))
  );
  if (file) {
    handleFile(file);
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit(); // Another instance is already running
} else {
  app.on('second-instance', (event, argv, workingDirectory) => {
    const listArg = Array.isArray(argv) ? argv.slice(1) : [argv];
    fileExecute(listArg);

    if (!mainWindow) return;

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus(); // sets focus
  });

  app.on('ready', () => {
    // First instance
    const listArg = process.argv.slice(1); // argv for first instance
    console.log(listArg);
    firstFile = listArg;
  });

  const settingsPath = path.join(app.getPath('appData'), 'settings.json');

  // ✅ Load settings
  function loadSettings() {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      return { hardwareAcceleration: true }; // default
    }
  }

  // ✅ Save settings
  function saveSettings(settings) {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }

  // Load settings before app ready
  const settings = loadSettings();

  // ✅ Enable / disable hardware acceleration BEFORE app ready
  if (!settings.hardwareAcceleration) {
    app.disableHardwareAcceleration();
    hwvalue = false;
  }

  app.commandLine.appendSwitch('high-dpi-support', '1');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.commandLine.appendSwitch('disable-direct-write', '1'); // Use legacy GDI font rendering
  app.commandLine.appendSwitch('enable-font-antialiasing', '1');
  app.commandLine.appendSwitch('enable-smooth-scrolling', '1');

  // For font hinting or subpixel rendering
  app.commandLine.appendSwitch('font-render-hinting', 'none');  // Options: none | slight | medium | full
  app.commandLine.appendSwitch('enable-lcd-text', '1');         // Force LCD subpixel AA

  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
  const electronVersion = process.versions.electron
  const electronBuilderVersion = packageJson.devDependencies?.['electron-builder'] || 'Not found';
  const buildID = 2511062049 // YYMMDDHHMM format
  const appVersion = app.getVersion();
  const chromiumVersion = process.versions.chrome;
  const nodeVersion = process.versions.node;

  const bgColor = nativeTheme.shouldUseDarkColors
    ? "#141414" // fully transparent black for dark mode
    : "#f8f8f8ff"; // fully transparent white for light mode

  const buildNumber = parseInt(os.release().split(".")[2]);
  const isWin11 = process.platform === "win32" && buildNumber >= 22000;

  app.whenReady().then(async () => {
    const isDarkMode = nativeTheme.shouldUseDarkColors;
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea; // excludes taskbar area'

    const minWin10Build = 17763; // Windows 10 1903
    if (process.platform === "win32" && buildNumber < minWin10Build) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Unsupported Windows Version',
        message: 'You are using the old version of Windows',
        detail: `Your current Windows version is not supported. The app requires Windows 10 version 1809 or later.` +
          `and be sure to use 64-bit architure. Please update your system to continue. If you are using Compatibility Feature, ` +
          `please ensure that you disable that feature to avoid confusions.`,
        buttons: ['OK']
      });
      app.exit(1);
      return;
    }

    const iconPathforExternalVisualizer = isDarkMode
      ? __dirname + '/icons/visualiser.png'
      : __dirname + '/icons/visualiser-light.png';

    const iconPathforVUMeter = isDarkMode
      ? __dirname + '/icons/vumeter.png'
      : __dirname + '/icons/vumeter-light.png';

    colorset = nativeTheme.shouldUseHighContrastColors ? bgColor : isWin11 ? "#00000000" : bgColor;

    let icon_option1;
    let icon_option2;
    let icon_option3;
    let iconPath = path.join(__dirname, "icon.png");
    tray = new Tray(iconPath);
    tray.setToolTip('VJDY FM Sound Effect Studio');

    function updateWindowColor() {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.setBackgroundColor(bgColor);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBackgroundColor(colorset);
        mainWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      }

      if (vumeter && !vumeter.isDestroyed()) {
        mainWindow.setBackgroundColor(colorset);
      }

      if (clockWindow && !clockWindow.isDestroyed()) {
        clockWindow.setBackgroundColor(colorset);
      }

      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.setBackgroundColor(colorset);
      }

      if (progressCopyWindow && !progressCopyWindow.isDestroyed()) {
        progressCopyWindow.setBackgroundColor(colorset);
      }

      if (progressWindow && !progressWindow.isDestroyed()) {
        progressWindow.setBackgroundColor(colorset);
      }

      icon_option1 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/close_16dp_F.png' : 'images/tray/close_16dp_0.png');
      icon_option2 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/restart_alt_16dp_F.png' : 'images/tray/restart_alt_16dp_0.png');
      icon_option3 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/bug_report_16dp_F.png' : 'images/tray/bug_report_16dp_0.png');

      createTray();
    }

    nativeTheme.on('updated', () => {
      updateWindowColor();
    });

    function createProgressWindow() {
      const progressWin = new BrowserWindow({
        width: 600,
        height: 200,
        backgroundColor: colorset,
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        frame: false,          // ✅ Required for custom title bars
        titleBarStyle: 'hiddenInset', // Optional: gives macOS-style hidden title
        trafficLightPosition: { x: 15, y: 15 }, // optional macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      progressWin.loadFile('progress.html');
      return progressWin;
    }

    function createProgressCopyWindow() {
      const progressCopyWindow = new BrowserWindow({
        width: 600,
        height: 200,
        backgroundColor: colorset,
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        frame: false,          // ✅ Required for custom title bars
        titleBarStyle: 'hiddenInset', // Optional: gives macOS-style hidden title
        trafficLightPosition: { x: 15, y: 15 }, // optional macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      progressCopyWindow.loadFile('progress-copying.html');
      return progressCopyWindow;
    }

    function createSplash() {
      splashWindow = new BrowserWindow({
        width: 1000,
        height: 375,
        backgroundColor: colorset,
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        frame: false,          // ✅ Required for custom title bars
        titleBarStyle: 'hiddenInset', // Optional: gives macOS-style hidden title
        trafficLightPosition: { x: 15, y: 15 }, // optional macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: true,
          devTools: false
        }
      });
      splashWindow.setIgnoreMouseEvents(true);
      splashWindow.loadFile('splash.html');
    }

    function createMain() {
      mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        minWidth: 800,
        minHeight: 768,
        useContentSize: true,
        icon: path.join(__dirname, "icon.png"),
        backgroundColor: colorset,
        backgroundMaterial: isWin11 ? "mica" : "none",
        visualEffectState: isWin11 ? "active" : "inactive",
        show: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        frame: true,          // ✅ Required for custom title bars
        titleBarStyle: 'hiddenInset', // Optional: gives macOS-style hidden title
        trafficLightPosition: { x: 15, y: 15 }, // optional macOS
        // autoHideMenuBar: true, // 🪄 This hides the menu bar!
        hasShadow: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          backgroundThrottling: false,
          contextIsolation: false,
          nodeIntegration: true,
          subpixelFontScaling: true,
          devTools: !app.isPackaged
          // devTools: true,
        }
      });

      mainWindow.loadFile('main.html');

      // 🧠 Intercept any attempt to open a new window (target="_blank", etc.)
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); // Open in default browser
        return { action: 'deny' }; // Prevent Electron from opening it internally
      });

      // 🚫 Prevent navigation to external sites inside the same window
      mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== mainWindow.webContents.getURL()) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      const template = [];

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    async function copyFolderWithProgress(src, dest, mainWindow, channel) {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      const total = entries.length;
      let count = 0;

      await fs.promises.mkdir(dest, { recursive: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await copyFolderWithProgress(srcPath, destPath, mainWindow, channel);
        } else {
          await new Promise((resolve, reject) => {
            const read = fs.createReadStream(srcPath);
            const write = fs.createWriteStream(destPath);

            read.on("error", reject);
            write.on("error", reject);
            write.on("finish", () => {
              count++;
              const progress = Math.round((count / total) * 100);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(channel, progress);
              }
              resolve();
            });

            read.pipe(write);
          });
        }
      }
    }

    function createWindows() {
      createSplash();
      createMain();
    }

    const sfxSrc = path.join(__dirname, 'sfx');
    const sfxDest = path.join(app.getPath('appData'), 'vjdyfm-sfxstudio', 'assets', 'sfx');
    const sfxAsset = path.join(app.getPath('appData'), 'vjdyfm-sfxstudio', 'assets');

    async function copyFolderWithProgress(src, dest, mainWindow, channel) {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      const total = entries.length;
      let count = 0;

      await fs.promises.mkdir(dest, { recursive: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
          await copyFolderWithProgress(srcPath, destPath, mainWindow, channel);
        } else {
          await new Promise((resolve, reject) => {
            const read = fs.createReadStream(srcPath);
            const write = fs.createWriteStream(destPath);

            read.on("error", reject);
            write.on("error", reject);
            write.on("finish", () => {
              count++;
              const progress = Math.round((count / total) * 100);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send(channel, progress);
              }
              resolve();
            });

            read.pipe(write);
          });
        }
      }
    }

    async function handleSfxSync() {
      return new Promise(async (resolve) => {
        let operationPerformed = false;

        // --- Forward copy (local → appData)
        if (!fs.existsSync(sfxDest) && fs.existsSync(sfxSrc)) {
          operationPerformed = true;
          const progressCopyWindow = createProgressCopyWindow();

          await delay(300);
          try {
            await copyFolderWithProgress(sfxSrc, sfxDest, progressCopyWindow, "copy-progress");
          } finally {
            if (!progressCopyWindow.isDestroyed()) progressCopyWindow.close();
            console.log("✅ SFX folder copied to appData.");
            createWindows();
            resolve(); // ✅ finish signal
          }
        }

        // --- Reverse copy (appData → local)
        if (!fs.existsSync(sfxSrc) && fs.existsSync(sfxDest)) {
          operationPerformed = true;
          const progressWindow = createProgressWindow();
          await delay(300);
          try {
            await copyFolderWithProgress(sfxDest, sfxSrc, progressWindow, "restore-progress");
          } finally {
            if (!progressWindow.isDestroyed()) progressWindow.close();
            console.log("✅ SFX folder restored from appData to local project folder.");
            createWindows();
            resolve(); // ✅ finish signal
          }
        }

        if (!operationPerformed) createWindows(); resolve(); // ✅ finish signal; // nothing to copy
      });
    }

    await handleSfxSync();

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
      console.log('Previous Track blocked — no remainWindowds in matcha mode.');
    });

    globalShortcut.register('CommandOrControl+R', () => {
      console.log('Prevented.')
    });

    globalShortcut.register('CommandOrControl+Shift+R', () => { });

    function createTray() {
      const contextMenu = Menu.buildFromTemplate([
        { label: 'VJDY FM Sound Effects Studio', enabled: false },
        {
          label: 'Options',
          submenu: [
            {
              label: 'Always on Top',
              type: 'checkbox',
              checked: mainWindow.isAlwaysOnTop(),
              click: (menuItem) => {
                mainWindow.setAlwaysOnTop(menuItem.checked);
              }
            },
            {
              label: 'Exit App',
              icon: icon_option1,
              role: 'quit'
            },
            {
              label: 'Restart App',
              icon: icon_option2,
              click: () => restartApp()
            },
            // ✅ Add this spread here
            ...(!app.isPackaged ? [
              { type: 'separator' }, // ← This adds the divider line
              {
                label: 'Debug',
                icon: icon_option3,
                click: () => mainWindow.webContents.openDevTools()
              },
              {
                label: 'Debug Visualizer',
                icon: icon_option3,
                click: () => visualizerWindow.webContents.openDevTools()
              },
              {
                label: 'Debug VU Meter',
                icon: icon_option3,
                click: () => vumeter.webContents.openDevTools()
              }
            ] : [])
          ]
        },
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
      ]);

      tray.setContextMenu(contextMenu);
      tray.on('click', () => {
        if (!mainWindow) return;

        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus(); // sets focus
      });
    }

    function restartApp() {
      // Keep your app path (argv[1]) but clear files
      const appPath = process.argv[1]; // usually your main app entry
      app.relaunch({ args: [appPath] }); // relaunch without files
      app.exit(0);
    }

    function getIconForTheme(isDark) {
      return path.join(__dirname, isDark ? 'images/tray/icon-dark.png' : 'images/tray/icon-light.png');
    }

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
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    });

    setInterval(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        const isMaximized = mainWindow.isMaximized();
        const isFullscreen = mainWindow.isFullScreen();
        if (isFullscreen) {
          mainWindow.webContents.send('fullscr-state', { isFullscreen });
        } else {
          mainWindow.webContents.send('mainWindow-state', { isMaximized });
        }
      }
    }, 0);

    ipcMain.on('window-action', (event, action) => {
      if (action === 'minimize') {
        mainWindow.minimize();
      } else if (action === 'full-scr') {
        mainWindow.setFullScreen(true);
      } else if (action === 'maximize') {
        if (mainWindow.isFullScreen()) {
          mainWindow.setFullScreen(false);
        } else if (mainWindow.isMaximized()) {
          mainWindow.unmaximize(); // restore down
        } else {
          mainWindow.maximize(); // maximize
        }
      } else if (action === 'restart') {
        restartApp();
      } else if (action === 'close-permanent') {
        app.exit(0);
      } else if (action === 'openMain') {
        console.log('true');
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

    mainWindow.webContents.once("did-finish-load", async () => {
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
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.close();
          mainWindow.show();
        }
        setTimeout(() => {
          const file = firstFile.find(arg =>
            typeof arg === "string" &&
            (arg.endsWith(".b64i") || arg.endsWith(".subw") || arg.endsWith(".srs"))
          );

          if (file) {
            handleFile(file);
          }
        }, 500);
        mainWindow.webContents.send('fadeIn');
      });

      mainWindow.webContents.send('hwtoggle', hwvalue);
      mainWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);

      const gpuInfo = await app.getGPUInfo('basic');
      const hasGPU = gpuInfo && gpuInfo.auxAttributes && gpuInfo.auxAttributes.glRenderer;

      // Send status to renderer
      mainWindow.webContents.send('gpu-acceleration-support', !!hasGPU);
    });

    mainWindow.on('close', (e) => {
      e.preventDefault(); // Prevent the default close action
      mainWindow.webContents.send('dialog-close');
    });

    function createVisualizerWindow() {
      visualizerWindow = new BrowserWindow({
        width: 640,
        height: 480,
        minWidth: 640,
        minHeight: 480,
        useContentSize: true,
        backgroundColor: bgColor,
        icon: path.join(__dirname, "icon_visualizer.png"),
        show: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        closable: false,

        frame: true,          // ✅ Required for custom title bars
        titleBarStyle: 'hiddenInset', // Optional: gives macOS-style hidden title
        trafficLightPosition: { x: 15, y: 15 }, // optional macOS
        autoHideMenuBar: true, // 🪄 This hides the menu bar!

        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: true,
        }
      });

      // Disable close button (prevent mainWindow from closing)
      visualizerWindow.on('close', (e) => {
        e.preventDefault(); // Prevent close
        // Optionally, you can show a message or do nothing
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      visualizerWindow.loadFile('visualizer.html');
    }

    createVisualizerWindow();

    function createVUMeterWindow() {
      vumeter = new BrowserWindow({
        width: 300,
        minWidth: 300,
        maxWidth: 300,
        height: 480,
        minHeight: 480,
        maxHeight: 480,
        x: 0,
        y: 0,
        icon: path.join(__dirname, "icon_vumeter.png"),
        backgroundColor: colorset,
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",

        show: false,
        alwaysOnTop: false,
        resizable: true,     // ✅ can resize
        maximizable: false,  // 🚫 no maximize button
        skipTaskbar: false,
        closable: false,

        autoHideMenuBar: true, // 🪄 This hides the menu bar!

        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: !app.isPackaged,
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

    function createclockWindow() {
      clockWindow = new BrowserWindow({
        width: 380,
        height: 200,
        minWidth: 380,
        maxWidth: 380,
        minHeight: 200,
        maxHeight: 200,
        x: 0,
        y: 0,
        icon: path.join(__dirname, "icon_clock.png"),
        backgroundColor: colorset,
        backgroundMaterial: isWin11 ? "mica" : "none", // ✅ use mica on Win11
        visualEffectState: isWin11 ? "active" : "inactive",

        show: false,
        alwaysOnTop: false,
        resizable: true,     // ✅ can resize
        maximizable: false,  // 🚫 no maximize button

        skipTaskbar: false,
        closable: false,

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

    updateWindowColor();

    ipcMain.on('powershell_rundownload', (event) => {
      const scriptPath = path.join(__dirname, 'downloadsfx.ps1');

      if (fs.existsSync(sfxDest)) {
        fs.rmSync(sfxDest, { recursive: true, force: true });
      }

      const ps = spawn('powershell.exe', [
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Start-Process powershell.exe -ArgumentList '-ExecutionPolicy Bypass -File "${scriptPath}"'`
      ], { mainWindowsHide: false });

      ps.stdout.on('data', (data) => console.log(`stdout: ${data}`));
      ps.stderr.on('data', (data) => console.error(`stderr: ${data}`));

      ps.on('exit', (code) => {
        app.exit(0);
      });
    });

    ipcMain.on('show-notification', (event) => {
      closeifWarnPermanently();
      const choice = dialog.showMessageBoxSync(mainWindow, {
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

    ipcMain.on('set-hw-acceleration', (event, enabled) => {
      settings.hardwareAcceleration = enabled;
      saveSettings(settings);
      event.reply('hw-acceleration-updated', enabled);
    });

    ipcMain.on('UserGuideExecute', (event) => {
      if (userGuideWindow) {
        userGuideWindow.focus();
        return;
      }

      userGuideWindow = new BrowserWindow({
        width: 540,
        minWidth: 540,
        height: 600,
        title: 'User Guide',
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: true,
          devTools: false
        }
      });

      userGuideWindow.loadFile('user-manual.html');

      // Cleanup reference when closed
      userGuideWindow.on('closed', () => {
        userGuideWindow = null;
      });
    });

    ipcMain.on("announce-batterylow", (event, text, title) => {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Sound Effects Studio Battery Alarm System',
          message: title,
          detail: text,
          buttons: ['OK']
        });
      }
    });

    ipcMain.on("open-devtools", () => {
      if (mainWindow) {
        mainWindow.webContents.openDevTools();
      }
    });

    ipcMain.on('sendcolor', (event, firstColor, secondColor) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('sendcolor', firstColor, secondColor);
      }
    });

    ipcMain.on('caption-settings-updated', (event, data) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('caption-settings-updated', data);
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

    ipcMain.on('show-text', (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('show-textoverlay', message);
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

    ipcMain.on('sendtoVUMeter', (event, text) => {
      if (vumeter && !vumeter.isDestroyed()) {
        vumeter.webContents.send('text', text);
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

    ipcMain.on("notify", (event, data) => {
      const notification = new Notification({
        title: data.title,
        body: data.body,
        silent: data.silent ?? true // default silent
      });

      notification.show();
    });

    ipcMain.on("trigger-alert", async (event, data) => {
      const { msg, title } = data;

      // system beep
      shell.beep();

      await dialog.showMessageBox({
        type: "warning",
        title: "Alert",
        message: title,
        detail: msg,
        buttons: ["OK"],
        noLink: true,          // avoids special styling
        modal: false           // don't block main window
      });
    });

    ipcMain.on('send-visualizer-data', (event, dataArray) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed() && visualizerWindow.isVisible()) {
        visualizerWindow.webContents.send('visualizer-update', dataArray);
      }
    });

    ipcMain.on('send-level-data', (event, dataL, dataR) => {
      if (vumeter && !vumeter.isDestroyed() && vumeter.isVisible()) {
        vumeter.webContents.send('vumeter-update', dataL, dataR);
      }
    });

    ipcMain.on('video-src', (event, src) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('video-src', src);
      }
    });

    ipcMain.on('video-status', (event, status) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('video-status', status);
      }
    });

    ipcMain.on('video-playsrc', (event, data) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('video-playsrc', data);
      }
    });

    ipcMain.on('video-hidden', (event, bool) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('video-hidden', bool);
      }
    });

    ipcMain.on('video-reconnect', (event, bool) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('video-reconnect', bool);
      }
    });

    ipcMain.on('set-subtitle', (event, src, value) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('set-subtitle', src, value);
      }
    });

    ipcMain.on('changingDeck', (event, deckAppend) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('changingDeck', deckAppend);
      }
    });

    ipcMain.on("changeNativeTheme", (event, mode) => {
      nativeTheme.themeSource = mode;
    });

    ipcMain.on("perform-import-media", (event, filePath, assignedDeck) => {
      mainWindow.webContents.send("perform-import-media", filePath, assignedDeck);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}