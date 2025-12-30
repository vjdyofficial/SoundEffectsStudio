const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeTheme, nativeImage, Notification, dialog } = require('electron');
const { shell } = require('electron');
const os = require('os');
const fs = require('fs');
const exec = require('child_process').exec;
const { spawn } = require('child_process');
const { execSync } = require("child_process");
const path = require('path');
const { https } = require("follow-redirects");
const { screen } = require('electron');
const { exit, argv0, execArgv } = require('process');
const WinReg = require("winreg");
const { getFonts2 } = require("font-list");
const { session } = require('electron');
const crypto = require("crypto");

process.on('uncaughtException', (error) => {
  const choice = dialog.showMessageBoxSync(
    BrowserWindow.getFocusedWindow() || null,
    {
      type: 'error',
      title: 'Guru Meditation',
      message:
        'An error occurred while running the client application due to unstable functionality.',
      detail: error.stack || error.message,
      buttons: ['OK', 'Exit App'],
      defaultId: 0,
      cancelId: 0,
    }
  );

  if (choice === 1) {
    app.exit(1); // non-zero = crash exit code
  }
});

process.on('unhandledRejection', (reason) => {
  const choice = dialog.showMessageBoxSync(
    BrowserWindow.getFocusedWindow() || null,
    {
      type: 'error',
      title: 'Guru Meditation',
      message:
        'An error occurred while running the client application due to an unhandled rejection.',
      detail: reason?.stack || String(reason),
      buttons: ['OK', 'Exit App'],
      defaultId: 0,
      cancelId: 0,
    }
  );

  if (choice === 1) {
    app.exit(1); // non-zero = crash exit code
  }
});

function loadSFXList(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`JSON file not found: ${jsonPath}`);
  }

  const raw = fs.readFileSync(jsonPath, "utf8");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON format: ${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("SFX JSON must be an array.");
  }

  const requiredKeys = ["file", "name", "class", "loop", "isOffensive"];

  parsed.forEach((item, index) => {
    // required keys
    requiredKeys.forEach(key => {
      if (!(key in item)) {
        throw new Error(`Missing key "${key}" at index ${index}`);
      }
    });

    // boolean validation
    if (typeof item.loop !== "boolean") {
      throw new Error(`"loop" must be boolean at index ${index}`);
    }

    if (typeof item.isOffensive !== "boolean") {
      throw new Error(`"isOffensive" must be boolean at index ${index}`);
    }
  });

  return parsed;
}

ipcMain.handle("get-sfx-list", () => {
  const jsonPath = path.join(
    app.getPath("appData"),
    "vjdyfm-sfxstudio",
    "assets",
    "sfx",
    "list.json"
  );

  try {
    return loadSFXList(jsonPath);
  } catch (err) {
    return { error: err.message }; // safely return error
  }
});

ipcMain.handle("get-credits-text", () => {
  const creditsPath = path.join(
    app.getPath("appData"),
    "vjdyfm-sfxstudio",
    "assets",
    "sfx",
    "credits.txt"
  );

  try {
    if (!fs.existsSync(creditsPath)) {
      return { error: `credits.txt not found at ${creditsPath}` };
    }

    const rawText = fs.readFileSync(creditsPath, "utf8");
    return rawText; // raw text with HTML allowed
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("get-appdata-path", () => {
  return app.getPath("appData"); // returns string
});

ipcMain.handle("get-regular-fonts", async () => {
  try {
    const detailed = await getFonts2({ disableQuoting: true });
    const regularFamilies = new Set();

    detailed.forEach(font => {
      const style = (font.style || "").toLowerCase();
      const weight = (font.weight || "").toLowerCase();

      // --- Exclude ONLY bold or italic styles
      const isBold = style.includes("bold") || weight.includes("bold");
      const isItalic = style.includes("italic") || weight.includes("italic");

      if (!isBold && !isItalic) {
        // Condensed fonts ALSO included here because we didn't block them
        regularFamilies.add(font.familyName);
      }
    });

    return Array.from(regularFamilies).sort();
  } catch (err) {
    console.error("Font access error:", err);
    return [];
  }
});

const { execFile } = require("child_process");
const { get } = require('http');

ipcMain.handle("download-update-pack", async (event) => {
  const appData = app.getPath("appData");
  const sfxFolder = path.join(appData, "vjdyfm-sfxstudio", "assets", "sfx");
  const sfxBackup = path.join(appData, "vjdyfm-sfxstudio", "assets", "sfx_bak");

  const downloadCache = path.join(appData, "vjdyfm-sfxstudio", "downloadcache");
  const downloaddest = path.join(downloadCache, "sfx.zip");

  const sfxZipUrl = "https://github.com/vjdyofficial/SoundEffectsStudioSFXPack/releases/latest/download/sfx.zip";

  if (!fs.existsSync(downloadCache)) fs.mkdirSync(downloadCache, { recursive: true });

  // Step 1: Backup
  if (fs.existsSync(sfxFolder)) {
    if (fs.existsSync(sfxBackup)) fs.rmSync(sfxBackup, { recursive: true, force: true });
    fs.renameSync(sfxFolder, sfxBackup);
  }

  await new Promise(res => setTimeout(res, 5000)); // 5s relax

  // Helper: download with progress using follow-redirects
  async function downloadFile(url, dest, retries = 5) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(dest);
          https.get(url, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));

            const total = parseInt(res.headers['content-length'], 10) || 0;
            let downloaded = 0;

            res.on("data", chunk => {
              downloaded += chunk.length;
              const percent = total ? ((downloaded / total) * 100).toFixed(2) : 0;
              event.sender.send("download-progress", { stage: "download", percent, downloaded, total });
            });

            res.pipe(file);
            file.on("finish", () => file.close(resolve));
            file.on("error", reject);
          }).on("error", reject);
        });
        return; // success
      } catch (err) {
        console.log(`Download attempt ${attempt} failed: ${err.message}`);
        if (attempt === retries) throw err;
      }
    }
  }

  // Helper: extract with progress (approximate)
  async function extractZip(zipPath, extractTo, retries = 5) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          let simulatedPercent = 0;
          const interval = setInterval(() => {
            simulatedPercent = Math.min(simulatedPercent + 5, 95);
            event.sender.send("download-progress", { stage: "extract", percent: simulatedPercent });
          }, 200);

          const sevenZipPath = path.join(__dirname, "7zG.exe");
          execFile(
            sevenZipPath,
            ["x", zipPath, `-o${extractTo}`, "-y"],
            { windowsHide: true }, // <--- hide 7-Zip window
            (error) => {
              clearInterval(interval);
              event.sender.send("download-progress", { stage: "extract", percent: 100 });
              if (error) return reject(error);
              resolve();
            }
          );
        });
        return;
      } catch (err) {
        console.log(`Extraction attempt ${attempt} failed: ${err.message}`);
        if (attempt === retries) throw err;
      }
    }
  }


  // Step 2: Download
  try {
    await downloadFile(sfxZipUrl, downloaddest);
  } catch (err) {
    if (fs.existsSync(sfxBackup)) fs.renameSync(sfxBackup, sfxFolder);
    return { success: false, error: `Download failed: ${err.message}` };
  }

  // Step 3: Extract
  try {
    await extractZip(downloaddest, sfxFolder);
  } catch (err) {
    if (fs.existsSync(sfxBackup)) fs.renameSync(sfxBackup, sfxFolder);
    return { success: false, error: `Extraction failed: ${err.message}` };
  }

  // Step 4: Cleanup
  if (fs.existsSync(sfxBackup)) fs.rmSync(sfxBackup, { recursive: true, force: true });
  await new Promise(res => setTimeout(res, 5000)); // 5s relax

  const sfxPath = path.join(app.getPath("appData"), "vjdyfm-sfxstudio", "assets", "sfx");
  if (fs.existsSync(sfxPath)) {
    // Send message to renderer
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('sfx-status', 'Update Pack');
    });
  } else {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('sfx-status', 'Install Pack');
    });
  }
  return { success: true, message: "SFX pack updated successfully!" };
});

ipcMain.handle('save-bbcode-file', async (event, content) => {
  const win = BrowserWindow.getFocusedWindow();

  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Save BBCode Teleprompt Format',
    defaultPath: 'New BBCode Document.bbcx',
    filters: [
      { name: 'BBCode Teleprompt Format', extensions: ['bbcx'] }
    ]
  });

  if (!canceled && filePath) {
    fs.writeFile(filePath, content, (err) => {
      if (err) {
        console.error('Error saving file:', err);
      } else {
        console.log('File saved:', filePath);
      }
    });
  }
});

ipcMain.handle('open-bbcode-file', async () => {
  const win = BrowserWindow.getFocusedWindow();

  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Open BBCode Teleprompt Format',
    filters: [
      { name: 'BBCode Teleprompt Format', extensions: ['bbcx'] }
    ],
    properties: ['openFile']
  });

  if (canceled || !filePaths.length) return null;

  try {
    const content = fs.readFileSync(filePaths[0], 'utf8');
    return content;
  } catch (err) {
    console.error('Error opening file:', err);
    return null;
  }
});

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
let splashWindow;
let vumeter;
let fontWindow;
let colorWindow;
let visualizerWindow;
let WelcomeWindow;
let mainWindow;
let userGuideWindow;
let aboutWindow;
let firstFile;
let hwvalue = true;

nativeTheme.themeSource = "system"; // or "light" or "system"

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function handleFile(filePath) {
  console.log('File: ' + filePath)
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
        buttons: ['Revoke', 'Import Preset'],
      }
    );

    if (choice === 1) {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("importsubw", filePath);
      }
    }
  } else if (filePath.endsWith('.bbcx')) {
    const choice = dialog.showMessageBoxSync(
      mainWindow || null,
      {
        type: 'info',
        title: 'Import',
        message: 'BBCode Teleprompter Format file Detected',
        detail: 'The app has detected a BBCode Teleprompter Format file to import. \n' +
          'After import, the app will open up BBCode Designer for editing.',
        buttons: ['Revoke', 'Import and Edit', 'Import and Present'],
      }
    );

    if (choice === 1) {
      if (mainWindow && mainWindow.webContents) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          mainWindow.webContents.send("importbbcx", content);
        } catch (err) {
          console.error('Error opening file:', err);
          const errordialog = dialog.showMessageBoxSync(
            mainWindow || null,
            {
              type: 'warn',
              title: 'Import Error!',
              message: 'Import Error!',
              detail: 'An error occured while opening the file. Please try importing again.',
              buttons: ['OK']
            }
          );
        }
      }
    } else if (choice === 2) {
      if (mainWindow && mainWindow.webContents) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          mainWindow.webContents.send("import_presentbbcx", content);
        } catch (err) {
          console.error('Error opening file:', err);
          const errordialog = dialog.showMessageBoxSync(
            mainWindow || null,
            {
              type: 'warn',
              title: 'Import Error!',
              message: 'Import Error!',
              detail: 'An error occured while opening the file. Please try importing again.',
              buttons: ['OK']
            }
          );
        }
      }
    }
  }
}

app.setAsDefaultProtocolClient('subw');
app.setAsDefaultProtocolClient('b64i');
app.setAsDefaultProtocolClient('bbcx');

function fileExecute(listArg) {
  const file = listArg.find(arg =>
    typeof arg === "string" &&
    (arg.endsWith(".b64i") || arg.endsWith(".subw") || arg.endsWith(".bbcx"))
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

  const settingsPath = path.join(app.getPath('appData'), 'vjdyfm-sfxstudio', 'settings.json');
  let forceAcrylicWindow = false;

  // ✅ Load settings
  function loadSettings() {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch {
      return { hardwareAcceleration: true, forceAcrylic: false, firsttime: true }; // default
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

  forceAcrylicWindow = settings.forceAcrylic || false;

  app.commandLine.appendSwitch('high-dpi-support', '1');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.commandLine.appendSwitch('disable-direct-write', '1'); // Use legacy GDI font rendering
  app.commandLine.appendSwitch('enable-font-antialiasing', '1');
  app.commandLine.appendSwitch('enable-smooth-scrolling', '1');
  const scale = settings.forceScale ?? 1;

  app.commandLine.appendSwitch(
    'force-device-scale-factor',
    String(scale)
  );

  // For font hinting or subpixel rendering
  app.commandLine.appendSwitch('font-render-hinting', 'full');  // Options: none | slight | medium | full
  app.commandLine.appendSwitch('enable-lcd-text', '1');         // Force LCD subpixel AA

  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
  const electronVersion = process.versions.electron
  const electronBuilderVersion = packageJson.devDependencies?.['electron-builder'] || 'Not found';
  const buildID = 2512301903 // YYMMDDHHMM format
  const appVersion = app.getVersion();
  const chromiumVersion = process.versions.chrome;
  const nodeVersion = process.versions.node;
  let splashWindowClose = false;

  const buildNumber = parseInt(os.release().split(".")[2]);

  const isWindows11 = process.platform === "win32" && buildNumber >= 22000
  const materialSet = forceAcrylicWindow ? false : isWindows11;

  app.whenReady().then(async () => {
    let isDarkMode = nativeTheme.shouldUseDarkColors;
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea; // excludes taskbar area'

    let consoleWindow = null;

    // keep originals
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };

    function sendToConsoleWindow(type, args) {
      if (!consoleWindow || consoleWindow.isDestroyed()) return;

      consoleWindow.webContents.send("main-log", {
        event: type,
        msg: args.map(a =>
          typeof a === "object"
            ? JSON.stringify(a, null, 2)
            : String(a)
        ).join(" "),
        time: new Date().toISOString()
      });
    }

    console.log = (...args) => {
      originalConsole.log(...args);
      sendToConsoleWindow("log", args);
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      sendToConsoleWindow("warn", args);
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      sendToConsoleWindow("error", args);
    };

    console.info = (...args) => {
      originalConsole.info(...args);
      sendToConsoleWindow("info", args);
    };

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

    let bgColor = nativeTheme.shouldUseDarkColors
      ? "#141414" // fully transparent black for dark mode
      : "#f8f8f8"; // fully transparent white for light mode

    let bgColoronAcrylic = nativeTheme.shouldUseDarkColors
      ? "rgba(20,20,20,0.8)"
      : "rgba(237,237,237,0.6)";

    function colorset() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#141414" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      bgColoronAcrylic = nativeTheme.shouldUseDarkColors
        ? "rgba(20,20,20,0.8)"
        : "rgba(237,237,237,0.6)";

      return nativeTheme.shouldUseHighContrastColors ? bgColor : materialSet ? "#00000000" : bgColoronAcrylic;
    };

    function colorsetonmodals() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#141414" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      bgColoronAcrylic = nativeTheme.shouldUseDarkColors
        ? "rgba(20,20,20,0.8)"
        : "rgba(237,237,237,0.6)";

      return nativeTheme.shouldUseHighContrastColors ? bgColor : materialSet ? "#00000000" : bgColor;
    };

    let icon_option1;
    let icon_option2;
    let icon_option3;
    let iconPath = path.join(__dirname, "icon.png");
    tray = new Tray(iconPath);
    tray.setToolTip('VJDY FM Sound Effect Studio');

    function updateWindowColor() {
      isDarkMode = nativeTheme.shouldUseDarkColors;

      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.setBackgroundColor(bgColor);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBackgroundColor(colorset());
        mainWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
        mainWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 32 });
      }

      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.setBackgroundColor(colorset());
        consoleWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
        consoleWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 32 });
      }

      if (vumeter && !vumeter.isDestroyed()) {
        vumeter.setBackgroundColor(colorset());
        vumeter.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
        vumeter.setTitleBarOverlay({ color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 32 });
      }

      if (fontWindow && !fontWindow.isDestroyed()) {
        fontWindow.setBackgroundColor(colorsetonmodals());
        fontWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      }

      if (colorWindow && !colorWindow.isDestroyed()) {
        colorWindow.setBackgroundColor(colorsetonmodals());
        colorWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      }

      if (aboutWindow && !aboutWindow.isDestroyed()) {
        aboutWindow.setBackgroundColor(colorsetonmodals());
      }

      if (userGuideWindow && !userGuideWindow.isDestroyed()) {
        userGuideWindow.setBackgroundColor(colorsetonmodals());
      }

      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 46 });
      }

      if (WelcomeWindow && !WelcomeWindow.isDestroyed()) {
        WelcomeWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 46 });
      }

      icon_option1 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/close_16dp_F.png' : 'images/tray/close_16dp_0.png');
      icon_option2 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/restart_alt_16dp_F.png' : 'images/tray/restart_alt_16dp_0.png');
      icon_option3 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/bug_report_16dp_F.png' : 'images/tray/bug_report_16dp_0.png');

      createTray();
    }

    nativeTheme.on('updated', () => {
      updateWindowColor();
    });

    function createSplash() {
      splashWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: "#00000000",
        icon: path.join(__dirname, "icon.png"),
        minimizable: true,
        resizable: false,
        show: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 46 },
        autoHideMenuBar: true,
        skipTaskbar: false,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: true,
          devTools: false
        }
      });
      splashWindow.loadFile('splash.html');

      splashWindow.on('closed', (e) => {
        e.preventDefault();
        if (!splashWindowClose) {
          app.exit(0)
        }
      });
    }

    function createWelcome() {
      WelcomeWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: "#00000000",
        icon: path.join(__dirname, "icon.png"),
        parent: mainWindow,       // Make it a child of mainWindow
        modal: true,              // This blocks interaction with mainWindow
        resizable: false,
        show: false,
        maximizable: false,  // 🚫 no maximize button
        minimizable: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 46 },
        autoHideMenuBar: true,
        skipTaskbar: false,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: true,
          devTools: false
        }
      });

      WelcomeWindow.loadFile('welcome.html');

      WelcomeWindow.webContents.on('did-finish-load', () => {
        WelcomeWindow.show();
      });

      WelcomeWindow.on('closed', () => {
        settings.firsttime = false;
        saveSettings(settings); // your existing JSON save function
        WelcomeWindow = null;
      });

      ipcMain.on('action_dff9', event => {
        WelcomeWindow.close();
      });
    }

    function createMain() {
      mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1280,
        minHeight: 600,
        useContentSize: true,
        icon: path.join(__dirname, "icon.png"),
        backgroundColor: colorset(),
        backgroundMaterial: !isWindows11 ? "tabbed" : materialSet ? "mica" : "acrylic",
        show: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        frame: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 32 },
        hasShadow: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          backgroundThrottling: false,
          contextIsolation: false,
          nodeIntegration: true,
          subpixelFontScaling: true,
          devTools: !app.isPackaged,
          enableBlinkFeatures: 'Geolocation',
          additionalArguments: ['--disable-features=UseGoogleLocationService']
        }
      });

      mainWindow.loadFile('main.html');

      const { shell, dialog } = require("electron");

      mainWindow.webContents.setWindowOpenHandler(async ({ url }) => {
        // Show warning dialog
        const result = await dialog.showMessageBox(mainWindow, {
          type: "warning",
          buttons: ["Cancel", "Open Link"],
          defaultId: 1,      // default "Open Link"
          cancelId: 0,       // "Cancel" button
          title: "Open External Link",
          message: "You are about to open an external link:",
          detail: url,
          noLink: true
        });

        // result.response === button index
        if (result.response === 1) {
          shell.openExternal(url);
        }

        // Prevent Electron from opening it internally
        return { action: "deny" };
      });

      mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!mainWindow.isDestroyed && url !== mainWindow.webContents.getURL()) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      mainWindow.webContents.on("did-start-navigation", (e) => {
        e.preventDefault();
        restartApp();
      });

      const template = [];

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    function createConsole() {
      consoleWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 450,
        minHeight: 600,
        useContentSize: true,
        icon: path.join(__dirname, "icon.png"),
        backgroundColor: colorset(),
        backgroundMaterial: !isWindows11 ? "tabbed" : materialSet ? "mica" : "acrylic",
        show: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        frame: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 32 },
        hasShadow: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          backgroundThrottling: false,
          contextIsolation: false,
          nodeIntegration: true,
          subpixelFontScaling: true,
          devTools: !app.isPackaged,
        }
      });

      consoleWindow.loadFile('console.html');

      consoleWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); // Open in default browser
        return { action: 'deny' }; // Prevent Electron from opening it internally
      });

      consoleWindow.webContents.on('will-navigate', (event, url) => {
        if (!consoleWindow.isDestroyed && url !== consoleWindow.webContents.getURL()) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      consoleWindow.webContents.on("did-start-navigation", (e) => {
        e.preventDefault();
        restartApp();
      });

      consoleWindow.on('close', (e) => {
        e.preventDefault();
        consoleWindow.hide();
      });

      const template = [];

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    function createWindows() {
      createMain();
      createConsole();
    }

    async function handleSfxSync() {
      createSplash();

      // Wait until the splashWindow DOM is fully ready
      await splashWindow.webContents.executeJavaScript(`
        new Promise(resolve => {
          if (document.readyState === 'complete' || document.readyState === 'interactive') {
            resolve();
          } else {
            document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
          }
        });
      `);
      splashWindow.webContents.send('onload', `Loading settings and contents...`);
      splashWindow.show();
      await delay(2500);
      createWindows();
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
              label: 'Exit App',
              icon: icon_option1,
              click: () => app.exit(0)
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
                label: 'Debug Console',
                icon: icon_option3,
                click: () => consoleWindow.webContents.openDevTools()
              }
            ] : [])
          ]
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

    const sfxPath = path.join(app.getPath("appData"), "vjdyfm-sfxstudio", "assets", "sfx");
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
      splashWindowClose = true;
      getBestUserProfilePic(pic => {
        const username = os.userInfo().username;
        mainWindow.webContents.send("username", username);
        if (pic) {
          mainWindow.webContents.send("profile-picture", pic);
          console.log("✅ Profile picture sent!");
        } else {
          const svgFallback = `images/system/fallback_profile.svg`
          mainWindow.webContents.send("profile-picture", svgFallback);
        }
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.destroy();
          mainWindow.show();
        }
        mainWindow.webContents.send('fadeIn');
        setTimeout(() => {
          const file = firstFile.find(arg =>
            typeof arg === "string" &&
            (arg.endsWith(".b64i") || arg.endsWith(".subw") || arg.endsWith(".bbcx"))
          );

          if (file) {
            handleFile(file);
          }
        }, 500);

        if (settings.firsttime) {
          createWelcome();
        }
      });

      mainWindow.webContents.send('hwtoggle', hwvalue);
      mainWindow.webContents.send('acrylictoggle', forceAcrylicWindow);
      mainWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      mainWindow.webContents.send("win11-state", isWindows11);
      mainWindow.webContents.send('scale-updated', scale);

      const gpuInfo = await app.getGPUInfo('basic');
      const hasGPU = gpuInfo && gpuInfo.auxAttributes && gpuInfo.auxAttributes.glRenderer;

      // Send status to renderer
      mainWindow.webContents.send('gpu-acceleration-support', !!hasGPU);
    });

    ipcMain.on('readynow', (event) => {
      mainWindow.webContents.send('fadeIn');
    });

    mainWindow.on('close', (e) => {
      e.preventDefault(); // Prevent the default close action
      mainWindow.webContents.send('dialog-close');
    });

    function createVisualizerWindow() {
      visualizerWindow = new BrowserWindow({
        width: 640,
        height: 480,
        minWidth: 320,
        minHeight: 240,
        useContentSize: true,
        backgroundColor: bgColor,
        icon: path.join(__dirname, "icon_visualizer.png"),
        show: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        minimizable: false,
        closable: true,

        frame: true,          // ✅ Required for custom title bars
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: "#00000000", symbolColor: '#FFFFFF', height: 32 },
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
        e.preventDefault();
        mainWindow.webContents.send('system-close-clicked');
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      visualizerWindow.loadFile('visualizer.html');
      visualizerWindow.setAspectRatio(16 / 9);
    }

    createVisualizerWindow();

    function createFontWindow() {
      fontWindow = new BrowserWindow({
        width: 400,
        minWidth: 400,
        maxWidth: 400,
        height: 480,
        minHeight: 480,
        maxHeight: 640,
        backgroundColor: bgColor,
        show: false,
        alwaysOnTop: false,
        resizable: true,     // ✅ can resize
        parent: mainWindow,       // Make it a child of mainWindow
        modal: true,              // This blocks interaction with mainWindow
        maximizable: false,  // 🚫 no maximize button
        minimizable: false,
        skipTaskbar: false,
        closable: true,
        icon: path.join(__dirname, "icon.png"),
        skipTaskbar: true,
        autoHideMenuBar: true, // 🪄 This hides the menu bar!

        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: !app.isPackaged,
        }
      });

      ["maximize"].forEach(evt => {
        fontWindow.on(evt, (e) => {
          e.preventDefault();
        });
      });

      fontWindow.on("close", (e) => {
        fontWindow.hide();
        e.preventDefault();
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      fontWindow.loadFile('fontselection.html');
    }

    createFontWindow();

    function createColorWindow() {
      colorWindow = new BrowserWindow({
        width: 640,
        minWidth: 640,
        maxWidth: 640,
        height: 480,
        minHeight: 480,
        maxHeight: 480,
        parent: mainWindow,       // Make it a child of mainWindow
        modal: true,              // This blocks interaction with mainWindow
        backgroundColor: bgColor,

        show: false,
        alwaysOnTop: false,
        resizable: true,     // ✅ can resize
        maximizable: false,  // 🚫 no maximize button
        minimizable: false,
        skipTaskbar: false,
        closable: true,
        icon: path.join(__dirname, "icon.png"),
        skipTaskbar: true,
        autoHideMenuBar: true, // 🪄 This hides the menu bar!

        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: !app.isPackaged,
        }
      });

      ["maximize"].forEach(evt => {
        colorWindow.on(evt, (e) => {
          e.preventDefault();
        });
      });

      colorWindow.on("close", (e) => {
        colorWindow.hide();
        e.preventDefault();
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      colorWindow.loadFile('colorpicker.html');
    }

    createColorWindow();

    function createVUMeterWindow() {
      vumeter = new BrowserWindow({
        width: 300,
        minWidth: 300,
        maxWidth: 300,
        height: 450,
        minHeight: 450,
        maxHeight: 450,
        x: 0,
        y: 0,
        icon: path.join(__dirname, "icon.png"),
        backgroundColor: colorset(),
        backgroundMaterial: !isWindows11 ? "tabbed" : materialSet ? "mica" : "acrylic",
        useContentSize: true,
        show: false,
        frame: true,
        alwaysOnTop: false,
        resizable: false,     // ✅ can resize
        maximizable: false,  // 🚫 no maximize button
        minimizable: false,
        skipTaskbar: false,
        titleBarStyle: 'hidden', // optional, for macOS
        titleBarOverlay: { color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 32 },
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        webPreferences: {
          backgroundThrottling: false,
          nodeIntegration: true,
          contextIsolation: false,
          devTools: false,
        }


      });

      vumeter.on('close', (e) => {
        e.preventDefault();
        mainWindow.webContents.send('system-close-clicked-vumeter');
      });

      // Allow minimize and maximize/restore down as normal
      // No extra code needed; those actions are not blocked

      vumeter.loadFile('vumeter.html');
    }

    createVUMeterWindow();

    ipcMain.on('openfontpicker', (event) => {
      fontWindow.show();
    })

    ipcMain.on('font-selected', (event, fontFamily) => {
      console.log("User selected font:", fontFamily);
      fontWindow.hide();
      // For example, send the font to your main window
      mainWindow.webContents.send('apply-font', fontFamily);
    });

    createTray();

    updateWindowColor();

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

    ipcMain.on('set-force-acrylic', (event, enabled) => {
      // 1️⃣ Save in settings JSON
      settings.forceAcrylic = enabled;
      saveSettings(settings); // your existing JSON save function
      event.reply('force-acrylic-updated', enabled);
    });

    ipcMain.on('set-force-scale', (event, scale) => {
      // 1️⃣ Clamp scale
      let clamped = scale;

      // 2️⃣ Save in settings JSON
      settings.forceScale = clamped;
      saveSettings(settings);

      // 3️⃣ Notify renderer
      event.reply('force-scale-updated', clamped);
    });

    ipcMain.on('UserGuideExecute', (event) => {
      if (userGuideWindow) {
        userGuideWindow.focus();
        return;
      }

      userGuideWindow = new BrowserWindow({
        width: 540,
        minWidth: 540,
        maxWidth: 540,
        height: 600,
        minHeight: 600,
        maxHeight: 700,
        title: 'User Guide',
        icon: path.join(__dirname, "icon.png"),
        parent: mainWindow,       // Make it a child of mainWindow
        modal: true,              // This blocks interaction with mainWindow
        maximizable: false,  // 🚫 no maximize button
        minimizable: false,
        skipTaskbar: false,
        closable: true,
        show: false,
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        backgroundColor: colorsetonmodals(),
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

      userGuideWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
          userGuideWindow.close();
        }
      });

      userGuideWindow.webContents.on('did-finish-load', (e) => {
        userGuideWindow.show();
      })
    });

    ipcMain.on('AboutExecute', (event) => {
      if (aboutWindow) { return; }
      // Center the aboutWindow based on mainWindow's position and size
      const mainBounds = mainWindow.getBounds();
      const aboutWidth = 540;
      const aboutHeight = 600;
      const x = mainBounds.x + Math.round((mainBounds.width - aboutWidth) / 2);
      const y = mainBounds.y + Math.round((mainBounds.height - aboutHeight) / 2);

      aboutWindow = new BrowserWindow({
        width: aboutWidth,
        minWidth: aboutWidth,
        maxWidth: aboutWidth,
        height: aboutHeight,
        minHeight: aboutHeight,
        maxHeight: 700,
        x,
        y,
        title: 'About',
        icon: path.join(__dirname, "icon.png"),
        parent: mainWindow,       // Make it a child of mainWindow
        modal: true,              // This blocks interaction with mainWindow
        maximizable: false,  // 🚫 no maximize button
        minimizable: false,
        skipTaskbar: false,
        closable: true,
        show: false,
        autoHideMenuBar: true, // 🪄 This hides the menu bar!
        backgroundColor: colorsetonmodals(),
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: true,
          devTools: false
        }
      });

      aboutWindow.loadFile('about.html');

      // Cleanup reference when closed
      aboutWindow.on('closed', () => {
        aboutWindow = null;
      });

      // 🧠 Intercept any attempt to open a new window (target="_blank", etc.)
      aboutWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); // Open in default browser
        return { action: 'deny' }; // Prevent Electron from opening it internally
      });

      // 🚫 Prevent navigation to external sites inside the same window
      aboutWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== mainWindow.webContents.getURL()) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      aboutWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape') {
          aboutWindow.close();
        }
      });

      aboutWindow.webContents.on('did-finish-load', (e) => {
        aboutWindow.webContents.send("sendInfo", electronBuilderVersion, appVersion, chromiumVersion, electronVersion, nodeVersion, buildID);
        aboutWindow.show();
      })
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

    ipcMain.on('video-adjustment-settings', (event, adjustmentSettings) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('update-video-settings', adjustmentSettings);
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

    ipcMain.on('toggle-vumeter', (event, letVUMeter) => {
      if (vumeter && !vumeter.isDestroyed()) {
        if (vumeter.isVisible()) {
          vumeter.hide();
        } else {
          vumeter.show();
        }
      }
    });

    ipcMain.on('set-fullscreen', (event, fullscreen) => {
      const visualizerWindow = BrowserWindow.fromWebContents(event.sender);
      visualizerWindow.setFullScreen(fullscreen);
    });

    ipcMain.on('set-pinwindow', (event, bool) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window.setAlwaysOnTop(bool);
      window.webContents.send('icon-pinwindow', bool)
    });

    ipcMain.on('set-zoom', (event, dpi) => {
      let scale = dpi;

      if (dpi > 1.5) scale = 1.5;
      if (dpi < 1) scale = 1;

      app.commandLine.appendSwitch(
        'force-device-scale-factor',
        String(scale)
      );
    });

    ipcMain.on('set-fullscreenmain', (event, fullscreen) => {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      mainWindow.setFullScreen(fullscreen);
    });

    ipcMain.on("notify", (event, data) => {
      const notification = new Notification({
        title: data.title,
        body: data.body,
        silent: data.silent ?? true // default silent
      });

      notification.show();
    });

    ipcMain.on("teleprompt_output", (event, htmlLine) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('teleprompt_output', htmlLine);
      }
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

    ipcMain.on('open-color-dialog', async (event, currentColor) => {
      colorWindow.show();
      colorWindow.webContents.send('current-color', currentColor);
    });

    ipcMain.on('color-selected', (event, color) => {
      console.log("User selected color:", color);
      colorWindow.hide();
      mainWindow.webContents.send('apply-color', color);
    });

    ipcMain.on('colorpicker-close', (event) => {
      colorWindow.hide();
    });

    ipcMain.on("renderer-log", (event, payload) => {
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.webContents.send("renderer-log", payload);
      }
    });

    ipcMain.on('open_devconsole', (event) => {
      if (!consoleWindow) return;

      if (consoleWindow.isVisible()) {
        consoleWindow.hide();
      } else {
        consoleWindow.show();
        consoleWindow.focus(); // optional, bring to front
      }
    });

    ipcMain.on('memory-update', (event, { windowName, memory }) => {
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.webContents.send('memory-update', { windowName, memory });
      }
    });

    ipcMain.on('video-frame-info', (event, videoInfo) => {
      // Instead of console.log, send to consoleWindow
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.webContents.send('video-info-update', videoInfo);
      }
    });

    ipcMain.on('audio-frame-info', (event, audioInfo) => {
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.webContents.send('audio-info-update', audioInfo);
      }
    });

    ipcMain.on("force-interlace-changed", (event, enabled) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("force-interlace-update", enabled);
      }
    });

    const v8 = require('v8');

    let memoryInterval = null;

    function startNodeMemoryMonitor(consoleWindow) {
      if (memoryInterval) return;

      memoryInterval = setInterval(async () => {
        if (!consoleWindow || consoleWindow.isDestroyed()) return;

        // 1️⃣ Main Node.js memory
        const nodeMem = process.memoryUsage();
        const osMem = await process.getProcessMemoryInfo();

        const mainMemory = {
          rss: nodeMem.rss,
          residentSet: osMem.residentSet * 1024,
          private: osMem.private * 1024,
          shared: osMem.shared * 1024,
          heapUsed: nodeMem.heapUsed,
          heapTotal: nodeMem.heapTotal,
          pid: process.pid
        };

        // 2️⃣ Rough per-module memory
        const modules = Object.values(require.cache).map(mod => {
          let memoryBytes = 0;
          try {
            const json = JSON.stringify(mod.exports);
            memoryBytes = Buffer.byteLength(json, 'utf8');
          } catch {
            memoryBytes = 0; // ignore modules that can't serialize
          }
          return {
            id: mod.id,
            memoryBytes
          };
        });

        if (!consoleWindow.isDestroyed()) {
          consoleWindow.webContents.send('memory-update-component', {
            windowName: 'node-main',
            memory: mainMemory,
            modules
          });
        }
      }, 1000);
    }

    // Stop the interval safely
    function stopNodeMemoryMonitor() {
      if (memoryInterval) {
        clearInterval(memoryInterval);
        memoryInterval = null;
      }
    }

    // Hook to devconsole lifecycle
    ipcMain.on('devconsole-ready', (e) => {
      const consoleWindow = BrowserWindow.fromWebContents(e.sender);
      startNodeMemoryMonitor(consoleWindow);

      consoleWindow.on('closed', () => stopNodeMemoryMonitor());
    });

    ipcMain.on('colorsavestate', (e) => {
      consoleWindow?.webContents.send('colorsavestate');
      colorWindow?.webContents.send('colorsavestate');
      fontWindow?.webContents.send('colorsavestate');
    })
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}