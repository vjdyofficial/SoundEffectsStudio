const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeTheme,
  nativeImage,
  Notification,
  dialog,
  shell,
  desktopCapturer,
  screen,
  session
} = require('electron');

let isCrashed = false;

const { fileURLToPath } = require("url");
const os = require('os');
const fs = require('./modules/safe-fs');
const fsp = require('./modules/safe-fspromises');
const exec = require('child_process').exec;
const path = require('path');
const { https } = require("follow-redirects");
const { getFonts2 } = require("font-list");
const crypto = require("crypto");
const { Worker } = require('worker_threads');

app.setAppUserModelId("app.vjdyofficial.andromeda");
app.commandLine.appendSwitch('disable-crash-reporter');

process.on('uncaughtException', (error) => {
  console.error(error.stack || error.message);
});

process.on('unhandledRejection', (reason) => {
  console.warn(reason?.stack || 'Unknown Message');
});

// Animate from current size to target size in duration ms
function animateResize(win, startW, startH, endW, endH, duration) {
  win.webContents.send("isolate_component", true);
  const fps = 60;
  const steps = (duration / 1000) * fps;
  let currentStep = 0;

  // Easing function: easeOutQuad
  // t = current step, b = start value, c = change in value, d = total steps
  const easeOutQuad = (t, b, c, d) => -c * (t /= d) * (t - 2) + b;

  const changeW = endW - startW;
  const changeH = endH - startH;

  const interval = setInterval(() => {
    if (currentStep >= steps) {
      clearInterval(interval);
      win.setBounds({ width: endW, height: endH });
      win.webContents.send("isolate_component", false);
      return;
    }

    const width = Math.round(easeOutQuad(currentStep, startW, changeW, steps));
    const height = Math.round(easeOutQuad(currentStep, startH, changeH, steps));

    win.setBounds({ width, height });

    currentStep++;
  }, 1000 / fps);
}

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

ipcMain.on('show-notification', (event, options) => {
  // Use destructuring with defaults
  const {
    title = 'Default Title',
    body = '',
    icon,       // optional
    silent = false, // optional
    actions,    // optional, for buttons
    closeButtonText // optional
  } = options || {}

  const notification = new Notification({
    title,
    body,
    icon,
    silent,
    actions,
    closeButtonText
  })

  notification.show()
})

ipcMain.handle("get-sfx-list", () => {
  const jsonPath = path.join(
    app.getPath("appData"),
    "VJDY FM Sound Effects Studio",
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
    "VJDY FM Sound Effects Studio",
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

ipcMain.handle('save-pcm-chunks', async (event, chunks) => {
  const { canceled, filePath } = await dialog.showSaveDialog(
    mainWindow || null,
    {
      title: 'Save Recorded Audio',
      defaultPath: 'audio',
      filters: [
        { name: 'PCM S16 LE - WAV', extensions: ['wav'] },
      ]
    });

  if (canceled || !filePath) return null;

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);

    for (const chunk of chunks) {
      stream.write(Buffer.from(chunk));
    }

    stream.end(() => {
      console.log('PCM saved to', filePath);
      resolve(filePath); // ✅ return saved path
    });

    stream.on('error', reject);
  });
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
  const sfxFolder = path.join(appData, "VJDY FM Sound Effects Studio", "assets", "sfx");
  const sfxBackup = path.join(appData, "VJDY FM Sound Effects Studio", "assets", "sfx_bak");

  const downloadCache = path.join(appData, "VJDY FM Sound Effects Studio", "downloadcache");
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

  const sfxPath = path.join(app.getPath("appData"), "VJDY FM Sound Effects Studio", "assets", "sfx");
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

const ffmpegExec = require('fluent-ffmpeg')
const ffmpegBin = require('ffmpeg-static');
const { exit } = require('process');

function bufferToTempFile(buffer, originalName = 'audio.wav') {
  return new Promise(async (resolve, reject) => {
    try {
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      const cacheDir = path.join(app.getPath('appData'), 'VJDY FM Sound Effects Studio', 'temporary_file');
      fs.mkdirSync(cacheDir, { recursive: true });
      const tempPath = path.join(app.getPath('appData'), 'VJDY FM Sound Effects Studio', 'temporary_file', `${hash}${path.extname(originalName)}`);

      if (!fs.existsSync(tempPath)) {
        try {
          await fs.promises.writeFile(tempPath, buffer);
          resolve(tempPath);
        } catch (err) {
          reject(err);
        }
      } else {
        resolve(tempPath);
      }
    } catch (err) {
      reject(err);
    }
  });
}

const appDataPath = path.join(app.getAppPath()); // adjust MyApp
if (!fs.existsSync(appDataPath)) fs.mkdirSync(appDataPath, { recursive: true });
const jsonFilePath = path.join(appDataPath, "bpm.json");

function generateWaveformWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(__dirname, 'worker', 'ffmpeg_create.js'),
      { workerData: data }
    );

    worker.on('message', (msg) => {
      if (msg.success) resolve();
      else reject(new Error(msg.error));
    });

    worker.on('error', reject);

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

const SUPPORTED_FORMATS = [
  { name: 'Microsoft Wave Files', extensions: ['wav'] },
  { name: 'MP3 Audio Files', extensions: ['mp3'] },
  { name: 'Ogg Vorbis Audio Files', extensions: ['ogg'] },
  { name: 'FLAC Audio Files', extensions: ['flac'] },
  { name: 'Opus Audio Files', extensions: ['opus'] },
  { name: 'MPEG-4 Audio Files', extensions: ['m4a'] },
  { name: 'Matroska Audio Files', extensions: ['mka'] },
  { name: 'MPEG-4 Video Files', extensions: ['mp4'] },
  { name: '3GP Video Files', extensions: ['3gp'] },
  { name: 'QuickTime Movie Files', extensions: ['mov'] },
  { name: 'Matroska Video Files', extensions: ['mkv'] },
  { name: 'WebM Video Files', extensions: ['webm'] },
  { name: 'SubRip Subtitle Source File', extensions: ['srt'] },
  { name: 'WebVTT Source File', extensions: ['vtt'] },
];

ipcMain.handle('open-supported-file', async (event) => {
  const filters = SUPPORTED_FORMATS.map(f => ({
    name: f.name,
    extensions: f.extensions
  }));

  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select a media file',
    buttonLabel: 'Open',
    properties: ['openFile'],
    filters
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  // Convert to file:// URL
  const filePath = result.filePaths[0];
  const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
  return filePath;
});

ipcMain.handle('generate-waveform', async (event, filePath, fileName, canvasWidth, canvasHeight, canvasWidth2, canvasHeight2, sha256) => {
  try {
    // Use fs.createReadStream instead of arrayBuffer
    const tempAudioPath = filePath;

    // Cache directory
    const cacheDir = path.join(app.getPath('appData'), 'VJDY FM Sound Effects Studio', 'waveform_cache_ffmpeg', 'waveform');
    const cacheDir2 = path.join(app.getPath('appData'), 'VJDY FM Sound Effects Studio', 'waveform_cache_ffmpeg', 'spectrogram');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.mkdirSync(cacheDir2, { recursive: true });

    // Hash based on file content
    const hash = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(filePath);
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
    const cachePath = path.join(cacheDir, `${hash}_waveform.png`);
    const cachePath2 = path.join(cacheDir2, `${hash}_spectrogram.png`);

    if (fs.existsSync(cachePath) && fs.existsSync(cachePath2)) {
      return [cachePath, cachePath2, sha256];
    }

    // Generate waveform
    await generateWaveformWorker({
      tempAudioPath,
      ffmpegBin,
      canvasWidth,
      canvasHeight,
      canvasWidth2,
      canvasHeight2,
      cachePath,
      cachePath2
    });

    return [cachePath, cachePath2, sha256];
  } catch (err) {
    console.error('Error generating waveform:', err);
    throw err;
  }
});

let currentBBCodeFilePath = null

ipcMain.handle('open-bbcode-file', async () => {
  const win = BrowserWindow.getFocusedWindow()

  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: 'Open',
    filters: [
      { name: 'BBCode Teleprompt Format', extensions: ['bbcx'] },
      { name: 'Text Document', extensions: ['txt'] }
    ],
    properties: ['openFile']
  })

  if (canceled || !filePaths.length) return null

  try {
    const filePath = filePaths[0]
    const content = fs.readFileSync(filePath, 'utf8')

    // ✅ remember path
    currentBBCodeFilePath = filePath

    return content
  } catch (err) {
    console.error('Error opening file:', err)
    return null
  }
})

ipcMain.handle('save-bbcode-file', async (event, content) => {
  // If we already have a file path, overwrite it
  if (currentBBCodeFilePath) {
    try {
      fs.writeFileSync(currentBBCodeFilePath, content, 'utf8')
      return { saved: true, path: currentBBCodeFilePath }
    } catch (err) {
      console.error('Error saving file:', err)
      return { saved: false, error: err.message }
    }
  }

  // Otherwise fallback to Save As
  return await saveBBCodeAs(event, content)
})

ipcMain.handle('save-bbcode-as', async (event, content) => {
  return await saveBBCodeAs(event, content)
})

async function saveBBCodeAs(event, content) {
  const win = BrowserWindow.getFocusedWindow()

  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: 'Save BBCode Teleprompt Format',
    defaultPath: 'New BBCode Document.bbcx',
    filters: [
      { name: 'BBCode Teleprompt Format', extensions: ['bbcx'] }
    ]
  })

  if (canceled || !filePath) {
    return { saved: false }
  }

  try {
    fs.writeFileSync(filePath, content, 'utf8')

    // ✅ update active path
    currentBBCodeFilePath = filePath

    return { saved: true, path: filePath }
  } catch (err) {
    console.error('Error saving file:', err)
    return { saved: false, error: err.message }
  }
}

ipcMain.handle('clear-bbcode-file', () => {
  currentBBCodeFilePath = null
  return true
})

ipcMain.handle("save-surround-preset", async (event, preset) => {
  const win = BrowserWindow.getFocusedWindow();
  const { filePath } = await dialog.showSaveDialog(win, {
    title: "Save Stereo Enhancer Preset",
    defaultPath: "preset.srs",
    filters: [
      { name: "SFXStudio Stereo Enhancer Preset", extensions: ["srs"] }
    ]
  });

  if (!filePath) return;

  const json = JSON.stringify(preset);

  // Base64 encode
  const encoded = Buffer.from(json).toString("base64");

  fs.writeFileSync(filePath, encoded);
});

ipcMain.handle("load-surround-preset", async () => {
  const win = BrowserWindow.getFocusedWindow();
  const { filePaths } = await dialog.showOpenDialog(win, {
    title: "Load Stereo Enhancer Preset",
    filters: [
      { name: "SFXStudio Stereo Enhancer Preset", extensions: ["srs"] }
    ],
    properties: ["openFile"]
  });

  if (!filePaths || filePaths.length === 0) return null;

  const encoded = fs.readFileSync(filePaths[0], "utf8");

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const preset = JSON.parse(decoded);

    // Validation
    const requiredKeys = ["mix", "center", "side", "rear", "front"];

    for (const key of requiredKeys) {
      if (!(key in preset)) {
        throw new Error("Invalid preset file");
      }
    }

    return preset;

  } catch (err) {
    dialog.showErrorBox("Preset Error", "Invalid or corrupted preset file.");
    return null;
  }
});

let tray = null;
let splashWindow;
let vumeter;
let srs;
let mapWindow;
let clockWindow;
let presenterwindow;
let lyricswindow;
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

const SUPPORTED_AUDIO = [".mp3", ".m4a", ".ogg", ".mp4", ".webm", ".3gp", ".opus", ".wav", ".mkv", ".flac", ".mov", ".aac", ".aiff", ".alac", ".amr", ".ape", ".au", ".dsd", ".eac3", ".mka", ".tta", ".wv"];
const SUPPORTED_SUBTITLE = [".srt", ".vtt"]

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
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send("importsubw", filePath);
    }
  } else if (filePath.endsWith('.bbcx')) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      currentBBCodeFilePath = filePath;
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
  } else if (filePath.endsWith('.srs')) {
    const encoded = fs.readFileSync(filePath, "utf8");

    try {
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const preset = JSON.parse(decoded);

      // Validation
      const requiredKeys = ["mix", "center", "side", "rear", "front"];

      for (const key of requiredKeys) {
        if (!(key in preset)) {
          dialog.showMessageBoxSync(
            mainWindow || null,
            {
              type: 'error',
              title: 'VJDY FM Sound Effects Studio',
              message: 'Import Error!',
              detail: 'An error occured while opening the file because each key required is missing. Please try importing again.',
              buttons: ['OK']
            }
          );
        }
      }

      mainWindow.webContents.send('send_stereoenhancerpreset', preset);

      dialog.showMessageBoxSync(
        mainWindow || null,
        {
          type: 'info',
          title: 'VJDY FM Sound Effects Studio',
          message: 'Import Success!',
          detail: 'The preset has been succesfully imported!',
          buttons: ['OK']
        }
      );
    } catch (err) {
      dialog.showErrorBox("Preset Error", "Invalid or corrupted preset file.");
      return null;
    }
  } else if (SUPPORTED_AUDIO.some(ext => filePath.toLowerCase().endsWith(ext))) {
    mainWindow.webContents.send("importmedia", filePath);
  } else if (SUPPORTED_SUBTITLE.some(ext => filePath.toLowerCase().endsWith(ext))) {
    mainWindow.webContents.send("importmedia", filePath);
  }
}

app.setAsDefaultProtocolClient('subw');
app.setAsDefaultProtocolClient('b64i');
app.setAsDefaultProtocolClient('bbcx');

app.commandLine.appendSwitch('enable-direct-write', '1');
app.commandLine.appendSwitch('disable-lcd-text', '1');

function detectFileSupport(arg) {
  return (arg.toLowerCase().endsWith(".b64i") ||
    arg.toLowerCase().endsWith(".subw") ||
    arg.toLowerCase().endsWith(".bbcx") ||
    arg.toLowerCase().endsWith(".srs") ||
    SUPPORTED_AUDIO.some(ext => arg.toLowerCase().endsWith(ext)))
}

function fileExecute(listArg) {
  const file = listArg.find(arg =>
    typeof arg === "string" && detectFileSupport(arg)
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

  const settingsPath = path.join(app.getPath('appData'), 'VJDY FM Sound Effects Studio', 'settings.json');
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
  const scale = settings.forceScale ?? 1;

  app.commandLine.appendSwitch(
    'force-device-scale-factor',
    String(scale)
  );

  // For font hinting or subpixel rendering

  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
  const electronVersion = process.versions.electron
  const electronBuilderVersion = packageJson.devDependencies?.['electron-builder'] || 'Not found';
  const buildID = 2601251556 // YYMMDDHHMM format
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
      ? "rgba(20,20,20,0.65)"
      : "rgba(237,237,237,0.65)";

    function colorset() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#141414" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      bgColoronAcrylic = nativeTheme.shouldUseDarkColors
        ? "rgba(14, 14,14, 0.7)"
        : "rgba(237,237,237,0.7)";

      return nativeTheme.shouldUseHighContrastColors ? bgColor : materialSet ? "#00000000" : "#00000000";
    };

    function colorsetInit() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#000000" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      return bgColor;
    };

    function colorsetonmodals() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#141414" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      bgColoronAcrylic = nativeTheme.shouldUseDarkColors
        ? "rgba(20,20,20,0.8)"
        : "rgba(237,237,237,0.6)";

      return nativeTheme.shouldUseHighContrastColors ? bgColor : materialSet ? "#00000000" : "#00000000";
    };

    function colorSymbol() {
      const baseColor = isDarkMode ? '#FFFFFF' : '#000000';
      return baseColor;
    }

    function colorSymbolInactive() {
      const baseColor = isDarkMode ? '#FFFFFF80' : '#00000080';
      return baseColor;
    }

    function addListenerWindow(window) {
      window.on('blur', () => {
        window.setTitleBarOverlay({
          color: "#00000000",
          symbolColor: colorSymbolInactive(),
          height: 32
        });
        if (!isCrashed) window.webContents.send('window_state', 'inactive');
      });

      window.on('focus', () => {
        window.setTitleBarOverlay({
          color: "#00000000",
          symbolColor: colorSymbol(),
          height: 32
        });
        if (!isCrashed) window.webContents.send('window_state', 'active');
      });

      // Update on theme change
      nativeTheme.on('updated', () => {
        if (window.isFocused()) {
          window.setTitleBarOverlay({
            color: "#00000000",
            symbolColor: colorSymbol(),
            height: 32
          });
        } else {
          window.setTitleBarOverlay({
            color: "#00000000",
            symbolColor: colorSymbolInactive(),
            height: 32
          });
        }
        // optional: skip sending if crashed
        if (!isCrashed) {
          const state = window.isFocused() ? 'active' : 'inactive';
          window.webContents.send('window_state', state);
        }
      });
    }

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
      }

      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.setBackgroundColor(colorset());
        consoleWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      }

      if (presenterwindow && !presenterwindow.isDestroyed()) {
        presenterwindow.setBackgroundColor(colorset());
        presenterwindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      }

      if (lyricswindow && !lyricswindow.isDestroyed()) {
        lyricswindow.setBackgroundColor(colorset());
        lyricswindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      }

      if (vumeter && !vumeter.isDestroyed()) {
        vumeter.setBackgroundColor(colorset());
        vumeter.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      }

      if (clockWindow && !clockWindow.isDestroyed()) {
        clockWindow.setBackgroundColor(colorset());
        clockWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
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
        splashWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: colorSymbol(), height: 46 });
      }

      if (WelcomeWindow && !WelcomeWindow.isDestroyed()) {
        WelcomeWindow.setTitleBarOverlay({ color: "#00000000", symbolColor: colorSymbol(), height: 46 });
      }

      icon_option1 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/close_16dp_F.png' : 'images/tray/close_16dp_0.png');
      icon_option2 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/restart_alt_16dp_F.png' : 'images/tray/restart_alt_16dp_0.png');
      icon_option3 = path.join(__dirname, nativeTheme.shouldUseDarkColors ? 'images/tray/bug_report_16dp_F.png' : 'images/tray/bug_report_16dp_0.png');

      createTray();
    }

    nativeTheme.on('updated', () => {
      updateWindowColor();
    });

    function createPresenterView() {
      return new Promise((resolve) => {
        presenterwindow = new BrowserWindow({
          title: 'Transcript Viewer',
          minWidth: 400,
          minHeight: 500,
          width: 500,
          height: 700,
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
          icon: path.join(__dirname, "icon.png"),
          resizable: true,
          show: false,
          autoHideMenuBar: true,
          skipTaskbar: false,
          titleBarStyle: 'hidden', // optional, for macOS
          titleBarOverlay: { color: "#00000000", symbolColor: '#FFFFFF', height: 32 },
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            nodeIntegration: true,
          }
        });
        presenterwindow.loadFile('teleprompter.html');

        presenterwindow.on('close', (e) => {
          e.preventDefault();
          presenterwindow.hide();
        });

        presenterwindow.webContents.once('did-finish-load', () => {
          console.log('Teleprompt Transcript Viewer window created.')
          resolve(); // ← THIS is what await waits for
        });
      })
    }

    function createLyricView() {
      return new Promise((resolve) => {
        lyricswindow = new BrowserWindow({
          title: 'Lyrics Viewer',
          minWidth: 400,
          minHeight: 500,
          width: 500,
          height: 700,
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
          icon: path.join(__dirname, "icon.png"),
          resizable: true,
          show: false,
          autoHideMenuBar: true,
          skipTaskbar: false,
          titleBarStyle: 'hidden', // optional, for macOS
          titleBarOverlay: { color: "#00000000", symbolColor: '#FFFFFF', height: 32 },
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            nodeIntegration: true
          }
        });
        lyricswindow.loadFile('lyricsviewer.html');
        lyricswindow.on('close', (e) => {
          e.preventDefault();
          lyricswindow.hide();
        });

        lyricswindow.webContents.once('did-finish-load', () => {
          console.log('Lyrics Transcript Viewer window created.')
          resolve(); // ← THIS is what await waits for
        });
      })
    }

    function createWelcome() {
      WelcomeWindow = new BrowserWindow({
        title: 'Welcome',
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
        titleBarOverlay: { color: "#00000000", symbolColor: colorSymbol(), height: 46 },
        autoHideMenuBar: true,
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
        if (WelcomeWindow && !WelcomeWindow.isDestroyed()) {
          WelcomeWindow.destroy();
          mainWindow.webContents.send('start-spotlight-tutorial');
        }
      });
    }

    function createMain() {
      mainWindow = new BrowserWindow({
        title: 'Main Studio',
        width: 1280,
        height: 800,
        minWidth: 1280,
        minHeight: 600,
        useContentSize: true,
        icon: path.join(__dirname, "icon.png"),
        backgroundColor: colorsetInit(),
        backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
        show: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        frame: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: "#00000000", symbolColor: colorSymbol(), height: 32 },
        hasShadow: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          backgroundThrottling: false,
          contextIsolation: false,
          nodeIntegration: true,
          subpixelFontScaling: true,
          devTools: !app.isPackaged,
          webviewTag: true
        }
      });

      mainWindow.on('responsive', () => {
        console.log('✅ mainWindow is responsive again.');
      });

      mainWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('⚠️ Renderer process gone!', details);
        const soundPath = path.join(__dirname, 'audio', 'render_crash.wav'); // your file
        exec(`powershell -c (New-Object Media.SoundPlayer '${soundPath}').PlaySync();`, { shell: 'cmd.exe' });

        isCrashed = true;
        const killed = details.reason === 'killed';

        setInterval(() => {
          app.exit(302);
        }, 120000)

        dialog.showMessageBox(mainWindow, {
          icon: path.join(__dirname, "icons", "messagebox", "sad-face.png"),
          title: 'Guru Meditation',
          message: 'Sound Effects Studio detected an unexpected renderer crash in Main Studio. The app will now be restarted. We apologize for the inconvenience.',
          detail: `${killed ? 'Process was killed by the system.' : `Reason: ${details.reason}`}
            If you still encountering these issues, You can send a issue by visiting 
            Sound Effects Studio GitHub Page. The app will automatically closed after 
            2 minutes of inactivity.`,
          buttons: ['Restart', 'Close'],
        }).then(result => {
          if (result.response === 0) {
            restartApp();
          } else {
            app.exit(302);
          }
        });
      });

      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // 🟢 FILE LINK
        if (url.startsWith("file://")) {
          const filePath = fileURLToPath(url);
          handleFile(filePath); // sync trigger is OK
          return { action: "deny" };
        }

        // 🟡 HTTP / HTTPS LINK
        if (url.startsWith("http://") || url.startsWith("https://")) {
          // Run async logic AFTER denying the popup
          setImmediate(async () => {
            const result = await dialog.showMessageBox(mainWindow, {
              type: "warning",
              buttons: ["Cancel", "Open Link"],
              defaultId: 1,
              cancelId: 0,
              title: "Open External Link",
              message: "You are about to open an external link. Are you sure you want to open it in external browser?",
              detail: url,
              noLink: true
            });

            if (result.response === 1) {
              shell.openExternal(url);
            }
          });

          return { action: "deny" };
        }

        return { action: "deny" };
      });

      mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!mainWindow.isDestroyed && url !== mainWindow.webContents.getURL()) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      addListenerWindow(mainWindow);

      const template = [];

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    function createVisualizerWindow() {
      return new Promise((resolve) => {
        visualizerWindow = new BrowserWindow({
          title: 'External Visualizer',
          width: 480,
          height: 480,
          minWidth: 480,
          minHeight: 480,
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
          hasShadow: false,
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
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

        // Track aspect ratio manually since getAspectRatio is not available
        let currentAspectRatio = 16 / 9; // default

        // Add context menu for aspect ratio selection
        visualizerWindow.webContents.on('context-menu', () => {
          const aspectMenu = Menu.buildFromTemplate([
            { label: 'Set Aspect Ratio', enabled: false },
            { type: 'separator' },
            {
              label: '16:9 (Widescreen)',
              type: 'radio',
              checked: currentAspectRatio === 16 / 9,
              click: () => {
                visualizerWindow.setAspectRatio(16 / 9);
                currentAspectRatio = 16 / 9;
              }
            },
            {
              label: '4:3 (Standard)',
              type: 'radio',
              checked: currentAspectRatio === 4 / 3,
              click: () => {
                visualizerWindow.setAspectRatio(4 / 3);
                currentAspectRatio = 4 / 3;
              }
            },
            {
              label: '1:1 (Square)',
              type: 'radio',
              checked: currentAspectRatio === 1,
              click: () => {
                visualizerWindow.setAspectRatio(1);
                currentAspectRatio = 1;
              }
            },
            {
              label: '21:9 (UltraWide)',
              type: 'radio',
              checked: currentAspectRatio === 21 / 9,
              click: () => {
                visualizerWindow.setAspectRatio(21 / 9);
                currentAspectRatio = 21 / 9;
              }
            },
            {
              label: 'Unset Aspect Ratio',
              type: 'radio',
              checked: currentAspectRatio === 0,
              click: () => {
                visualizerWindow.setAspectRatio(0);
                currentAspectRatio = 0;
              }
            }
          ]);
          aspectMenu.popup({ window: visualizerWindow });
        });
        visualizerWindow.webContents.once('did-finish-load', () => {
          console.log('External Visualizer widget created.')
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createFontWindow() {
      return new Promise((resolve) => {
        fontWindow = new BrowserWindow({
          title: 'Dialogs - Font',
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
            preload: path.join(__dirname, "preload.js"),
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
        fontWindow.loadFile('fontselection.html');

        ipcMain.on('allfontsloaded', (event) => {
          resolve();
        })
      });
    }

    function createColorWindow() {
      return new Promise((resolve) => {
        colorWindow = new BrowserWindow({
          title: 'Dialogs - Color Picker',
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
            preload: path.join(__dirname, "preload.js"),
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
        colorWindow.loadFile('colorpicker.html');
        colorWindow.webContents.once('did-finish-load', () => {
          console.log('Clock window created.')
          resolve();
        });
      });
    }

    function createVUMeterWindow() {
      return new Promise((resolve) => {
        vumeter = new BrowserWindow({
          title: 'VU Meter Widget',
          width: 300,
          minWidth: 300,
          maxWidth: 620,
          height: 450,
          minHeight: 450,
          maxHeight: 470,
          x: 0,
          y: 0,
          icon: path.join(__dirname, "icon.png"),
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
          useContentSize: true,
          show: false,
          frame: true,
          alwaysOnTop: false,
          resizable: false,     // ✅ can resize
          maximizable: false,  // 🚫 no maximize button
          minimizable: false,
          skipTaskbar: false,
          titleBarStyle: 'hidden', // optional, for macOS
          titleBarOverlay: { color: "#00000000", symbolColor: colorSymbol(), height: 32 },
          autoHideMenuBar: true, // 🪄 This hides the menu bar!
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            backgroundThrottling: false,
            nodeIntegration: true,
            contextIsolation: false,
            devTools: !app.isPackaged,
          }
        });
        vumeter.on('close', (e) => {
          e.preventDefault();
          mainWindow.webContents.send('system-close-clicked-vumeter');
        });

        // vumeter.webContents.openDevTools({});

        addListenerWindow(vumeter);
        vumeter.loadFile('vumeter.html');
        vumeter.webContents.once('did-finish-load', () => {
          console.log('VU Meter widget created.')
          resolve(); // ← THIS is what await waits for
        });

        ipcMain.on('advanced-vumenter', (event, boolean) => {
          const win = BrowserWindow.fromWebContents(event.sender); // gets the current window
          if (!win) return;
          // Get current bounds
          const { width: startW, height: startH } = win.getBounds();
          // Target size (example: full enlarge)
          const endW = boolean ? 620 : 300;  // target width
          const endH = boolean ? 630 : 450;
          const duration = 200; // ms
          animateResize(win, startW, startH, endW, endH, duration);
        });
      });
    }

    function createSurroundWindow() {
      return new Promise((resolve) => {
        srs = new BrowserWindow({
          title: 'Surround Spectator Widget',
          width: 475,
          minWidth: 475,
          maxWidth: 475,
          height: (475 + 32),
          minHeight: (475 + 32),
          maxHeight: (475 + 32),
          x: 0,
          y: 0,
          icon: path.join(__dirname, "icon.png"),
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
          useContentSize: true,
          show: false,
          frame: true,
          alwaysOnTop: false,
          resizable: false,     // ✅ can resize
          maximizable: false,  // 🚫 no maximize button
          minimizable: false,
          skipTaskbar: false,
          titleBarStyle: 'hidden', // optional, for macOS
          titleBarOverlay: { color: "#00000000", symbolColor: '#FFFFFF', height: 32 },
          autoHideMenuBar: true, // 🪄 This hides the menu bar!
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            backgroundThrottling: false,
            nodeIntegration: true,
            contextIsolation: false,
          }
        });
        srs.on('close', (e) => {
          e.preventDefault();
          mainWindow.webContents.send('system-close-clicked-srs');
        });
        srs.loadFile('surround.html');

        // srs.webContents.openDevTools({ mode: 'detach' });
        srs.webContents.once('did-finish-load', () => {
          console.log('Surround widget created.')
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createClockWindow() {
      return new Promise((resolve) => {
        clockWindow = new BrowserWindow({
          title: 'Clock Widget',
          width: 430,
          minWidth: 430,
          maxWidth: 430,
          height: 240,
          minHeight: 240,
          maxHeight: 240,
          x: 0,
          y: 0,
          icon: path.join(__dirname, "icon.png"),
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
          useContentSize: true,
          show: false,
          frame: true,
          alwaysOnTop: false,
          resizable: false,     // ✅ can resize
          maximizable: false,  // 🚫 no maximize button
          minimizable: false,
          skipTaskbar: false,
          titleBarStyle: 'hidden', // optional, for macOS
          titleBarOverlay: { color: "#00000000", symbolColor: colorSymbol(), height: 32 },
          autoHideMenuBar: true, // 🪄 This hides the menu bar!
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            backgroundThrottling: false,
            nodeIntegration: true,
            contextIsolation: false,
            devTools: false,
          }
        });
        clockWindow.on('close', (e) => {
          e.preventDefault();
          mainWindow.webContents.send('system-close-clicked-clock');
        });
        addListenerWindow(clockWindow);
        clockWindow.loadFile('clock.html');
        clockWindow.webContents.once('did-finish-load', () => {
          console.log('Clock widget created.')
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createConsole() {
      return new Promise((resolve) => {
        consoleWindow = new BrowserWindow({
          title: 'Developer Console',
          width: 1280,
          height: 800,
          minWidth: 1280,
          minHeight: 600,
          useContentSize: true,
          icon: path.join(__dirname, "icon.png"),
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
          show: false,
          alwaysOnTop: false,
          skipTaskbar: false,
          resizable: true,
          frame: true,
          titleBarStyle: 'hidden',
          titleBarOverlay: { color: "#00000000", symbolColor: colorSymbol(), height: 32 },
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
        addListenerWindow(consoleWindow);
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

        consoleWindow.webContents.once('did-finish-load', () => {
          console.log('Console window created. loading workspace...')
          resolve(); // ← THIS is what await waits for
        });
      })
    }

    createMain();

    async function createWindows() {
      await delay(1000);
      splashWindow.webContents.send('onload', 'Fetching all fonts...');
      await createFontWindow();
      splashWindow.webContents.send('onload', 'Loading widgets...');
      await createColorWindow();
      await createVisualizerWindow();
      await createVUMeterWindow();
      await createSurroundWindow();
      await createClockWindow();
      splashWindow.webContents.send('onload', 'Loading workspace...');
      await createPresenterView();
      await createLyricView();
      await createConsole();
      mainWindow.loadFile('workspace.html');
      setTimeout(() => { mainWindow.show() }, 800);
    }

    function createSplash() {
      console.log('Initiating App... Please wait...')
      return new Promise((resolve) => {
        splashWindow = new BrowserWindow({
          title: 'APLoading Screen',
          width: 800,
          height: 600,
          backgroundColor: "#00000000",
          icon: path.join(__dirname, "icon.png"),
          minimizable: false,
          parent: mainWindow,
          modal: true, // start non-modal
          resizable: false,
          show: false,
          titleBarStyle: 'hidden',
          titleBarOverlay: { color: "#00000000", symbolColor: isDarkMode ? '#FFFFFF' : '#000000', height: 46 },
          autoHideMenuBar: true,
          alwaysOnTop: true,
          skipTaskbar: false,
          transparent: true,
          hasShadow: false,
          webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            devTools: false,
            preload: path.join(__dirname, "preload.js"),
          }
        });
        splashWindow.loadFile('splash.html');

        splashWindow.on('close', (e) => {
          e.preventDefault();
          if (!splashWindowClose) {
            app.exit(0)
          }
        });

        splashWindow.webContents.once('did-finish-load', () => {
          splashWindow.show();
          createWindows();
          console.log('Initiated.')
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    await createSplash();

    // Disable Play/Pause
    // Register global media keys here
    globalShortcut.register('MediaPlayPause', () => { });
    globalShortcut.register('MediaNextTrack', () => { });
    globalShortcut.register('MediaPreviousTrack', () => { });
    globalShortcut.register('CommandOrControl+Shift+R', () => { });

    function notification(data) {
      const notification = new Notification({
        title: data.title,
        body: data.body,
        silent: data.silent ?? false // default silent
      });

      notification.show();
    }

    function createTray() {
      const contextMenu = Menu.buildFromTemplate([
        { label: 'VJDY FM Sound Effects Studio', enabled: false },
        {
          label: 'Show/Hide App',
          icon: icon_option2,
          click: () => {
            if (!splashWindowClose) { return }
            else if (mainWindow && !mainWindow.isDestroyed()) {
              if (mainWindow.isVisible()) {
                mainWindow.hide();
                notification({
                  title: "Main Studio has been hidden",
                  body: "Press or Right Click the Tray Icon to show the main studio.",
                })
              } else {
                mainWindow.show();
              }
            }
          }
        },
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
                click: () => {
                  mainWindow.webContents.openDevTools()
                }
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

    async function ForceCloseMainStudio() {
      console.log('⚠️ mainWindow is unresponsive!');
      const soundPath = path.join(__dirname, 'audio', 'render_crash.wav'); // your file
      exec(`powershell -c (New-Object Media.SoundPlayer '${soundPath}').PlaySync();`, { shell: 'cmd.exe' });


      // Destroy the window immediately
      if (!mainWindow.isDestroyed()) { mainWindow.destroy(); }
      // Show a notification instead of dialog
      const notification = new Notification({
        title: 'Main Studio has stopped responding!',
        body: 'Sound Effects Studio detected an unexpected renderer crash in Main Studio. The app will now be restarted. We apologize for the inconvenience.',
        icon: path.join(__dirname, "icons", "messagebox", "sad-face.png")
      });

      notification.show();
      restartApp();
    }

    function getIconForTheme(isDark) {
      return path.join(__dirname, isDark ? 'images/tray/icon-dark.png' : 'images/tray/icon-light.png');
    }

    const sfxPath = path.join(app.getPath("appData"), "VJDY FM Sound Effects Studio", "assets", "sfx");
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
      } else if (action === 'reset-app') {
        fs.rmSync(settingsPath, { force: true });
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
        exec('start ms-settings:sound', { shell: 'cmd.exe' });
      } else if (action === 'windows-openvolumemixer') {
        exec('start ms-settings:apps-volume', { shell: 'cmd.exe' });
      } else if (action === 'windows-legacy-soundsettings') {
        exec('control mmsys.cpl', { shell: 'cmd.exe' });
      } else if (action === 'windows-legacy-openvolumemixer') {
        exec('sndvol.exe', { shell: 'cmd.exe' });
      }
    });

    mainWindow.webContents.once("did-finish-load", async () => {
      createTray();
      splashWindowClose = true;

      mainWindow.webContents.send('hwtoggle', hwvalue);
      mainWindow.webContents.send('acrylictoggle', forceAcrylicWindow);
      mainWindow.webContents.send("high-contrast-state", nativeTheme.shouldUseHighContrastColors);
      mainWindow.webContents.send("win11-state", isWindows11);
      mainWindow.webContents.send('scale-updated', scale);

      setTimeout(() => {
        splashWindow.destroy();

        const file = firstFile.find(arg =>
          typeof arg === "string" && detectFileSupport(arg));

        if (file) {
          handleFile(file);
        }

        if (settings.firsttime) {
          createWelcome();
        }
      }, 3500);

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

    ipcMain.on('openfontpicker', (event) => {
      fontWindow.show();
    })

    let skipFrames = 0;
    let frameCounter = 0;
    let RATESKIP = 1; // default FPS

    function shouldSendFrame() {
      const effectiveSkip = skipFrames === 0 ? RATESKIP : skipFrames;
      frameCounter++;
      return frameCounter % effectiveSkip === 0;
    }

    ipcMain.on('frames', (event, skips) => {
      skipFrames = skips;
    })

    ipcMain.on('welcome', (event) => {
      createWelcome();
    })

    ipcMain.on('font-selected', (event, fontFamily) => {
      console.log("User selected font:", fontFamily);
      fontWindow.hide();
      // For example, send the font to your main window
      mainWindow.webContents.send('apply-font', fontFamily);
    });

    updateWindowColor();

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

    function createMap() {
      mapWindow = new BrowserWindow({
        title: 'Dialogs - Map Selector',
        width: 1280,
        height: 800,
        minWidth: 1280,
        minHeight: 800,
        backgroundColor: colorset(),
        backgroundMaterial: !isWindows11 ? undefined : materialSet ? "mica" : "tabbed",
        useContentSize: true,
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          devTools: !app.isPackaged
        }
      });

      // mapWindow.webContents.openDevTools({});

      mapWindow.loadFile('map.html');

      mapWindow.on('closed', (event) => {
        mapWindow = null;
      });

      const template = [
        {
          label: 'Reload',
          click: () => mapWindow.webContents.reload()
        },
      ];

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    ipcMain.on('map', (event) => {
      createMap();
    });

    // Listen to coordinates from map window
    ipcMain.on('map-click', (event, coords) => {
      dialog.showMessageBox(mapWindow, {
        type: 'info',
        title: 'Coordinates',
        message: 'Coordinates Selected',
        detail: `Latitude: ${coords.lat}\nLongitude: ${coords.lng}`,
        buttons: ['Cancel', 'OK'],
        defaultId: 1,
        cancelId: 0
      }).then(result => {
        if (result.response === 1) {
          mainWindow.webContents.send('update-coords', coords);
          mapWindow.close();
        }
      });
    });

    ipcMain.on('UserGuideExecute', (event) => {
      if (userGuideWindow) {
        userGuideWindow.focus();
        return;
      }

      userGuideWindow = new BrowserWindow({
        width: 650,
        minWidth: 650,
        height: 600,
        minHeight: 600,
        title: 'User Guide',
        icon: path.join(__dirname, "icon.png"),
        parent: mainWindow,       // Make it a child of mainWindow
        modal: true,              // This blocks interaction with mainWindow
        maximizable: true,  // 🚫 no maximize button
        minimizable: false,
        skipTaskbar: false,
        closable: true,
        show: false,
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
        autoHideMenuBar: true,
        backgroundColor: colorsetonmodals(),
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: true,
          // devTools: !app.isPackaged
        }
      });

      // aboutWindow.webContents.openDevTools();

      aboutWindow.loadFile('about.html');

      // Cleanup reference when closed
      aboutWindow.on('closed', () => {
        aboutWindow = null;
      });

      // aboutWindow.webContents.openDevTools({});

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

    ipcMain.on("open-devtools", (event) => {
      mainWindow.webContents.openDevTools();
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

    ipcMain.on('sendWaveformType', (event, index) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('sendWaveformType', index);
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
      mainWindow.webContents.send('show-osd', message);
    });

    ipcMain.on('show-lyrics-mediaA', (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('show-lyricsA', message);
      }
    });

    ipcMain.on('show-lyrics-mediaB', (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('show-lyricsB', message);
      }
    });

    ipcMain.on('show-lyrics-mediaC', (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('show-lyricsC', message);
      }
    });

    ipcMain.on('show-lyrics-mediaD', (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('show-lyricsD', message);
      }
    });

    ipcMain.on('toggle-lyrics', (event, bool) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send('toggle-lyrics', bool);
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

    ipcMain.on('toggle-clock', (event, letVUMeter) => {
      if (clockWindow && !clockWindow.isDestroyed()) {
        if (clockWindow.isVisible()) {
          clockWindow.hide();
        } else {
          clockWindow.show();
        }
      }
    });

    ipcMain.on('toggle-surround', (event, letVUMeter) => {
      if (srs && !srs.isDestroyed()) {
        if (srs.isVisible()) {
          srs.hide();
        } else {
          srs.show();
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
        type: "info",
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

    ipcMain.on('send-peakscale', (event, dataL, dataR) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed() && visualizerWindow.isVisible()) {
        visualizerWindow.webContents.send('vumeter-update', dataL, dataR);
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

    let teleprompterLines = []

    ipcMain.on('teleprompter:lines:set', (event, lines) => {
      teleprompterLines = lines

      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        presenterwindow.webContents.send('teleprompter:lines:updated', teleprompterLines)
      }
    })

    ipcMain.on('teleprompter:lines:remove', (event) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        presenterwindow.webContents.send('teleprompter:lines:remove')
      }
    })

    ipcMain.on('teleprompter:goto', (event, lineId) => {
      mainWindow.webContents.send('teleprompter:jump', lineId)
    })

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

    ipcMain.on('open_teleprompter', (event) => {
      if (!presenterwindow) return;

      if (presenterwindow.isVisible()) {
        presenterwindow.hide();
      } else {
        presenterwindow.show();
        presenterwindow.focus(); // optional, bring to front
      }
    });

    ipcMain.on('open_lyrics', (event, deckId) => {
      if (!lyricswindow) return;

      lyricswindow.webContents.send('showlyrics-bydeck', deckId);
      if (!lyricswindow.isVisible()) {
        lyricswindow.show();
      }
      lyricswindow.focus(); // optional, bring to front
    });

    ipcMain.on('sendlyrics', (event, deckId, text) => {
      if (!lyricswindow) return;
      lyricswindow.webContents.send('sendlyrics-bydeck', deckId, text);
    });

    ipcMain.on('removelyrics', (event, deckId) => {
      if (!lyricswindow) return;
      lyricswindow.webContents.send('removelyrics-bydeck', deckId);
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
      clockWindow?.webContents.send('colorsavestate');
    })

    ipcMain.on("video-frame-A", (e, frame) => {
      if (!visualizerWindow || visualizerWindow.isDestroyed()) return;
      visualizerWindow.webContents.send("visualizer:frame", frame);
    });

    ipcMain.on("video-frame-B", (e, frame) => {
      if (!visualizerWindow || visualizerWindow.isDestroyed()) return;
      visualizerWindow.webContents.send("visualizer:frame", frame);
    });

    ipcMain.on('close-this-window', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.close(); // triggers normal close events
    });

    ipcMain.on('alert', (_, msg = 'No message provided', title = 'No message provided', needsrestart = false, needsexit = false, hideOKButton = false) => {
      // Build the buttons array dynamically
      const buttons = [];
      if (!hideOKButton) buttons.push('OK');
      if (needsrestart) buttons.push('Restart');
      if (needsexit) buttons.push('Exit');

      dialog.showMessageBox(
        mainWindow || null,
        {
          type: 'warning',
          title: 'VJDY FM Sound Effects Studio',
          message: title,
          detail: String(msg),
          buttons
        }
      ).then(({ response }) => {
        if (response === buttons.indexOf('Restart')) {
          restartApp();
        } else if (response === buttons.indexOf('Exit')) {
          app.exit(0);
        }
      });
    });

    ipcMain.handle('choice-dialog', async (event, options) => {
      const result = await dialog.showMessageBox(mainWindow || null, {
        type: 'question',
        buttons: ['Cancel', 'Yes'],
        defaultId: 1,
        cancelId: 0,
        title: 'VJDY FM Sound Effects Studio',
        message: options.title,
        detail: options.message
      });

      return result.response === 1; // true if Confirm
    });

    ipcMain.handle('delete-cache', async (event) => {
      const cacheDirs = [
        path.join(app.getPath('appData'), 'VJDY FM Sound Effects Studio', 'spectrogram_cache_ffmpeg'),
        path.join(app.getPath('appData'), 'VJDY FM Sound Effects Studio', 'waveform_cache_ffmpeg')
      ];

      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Delete Cache',
        message: 'Are you sure you want to delete all waveform and spectrogram cache?',
        detail: 'This will permanently remove all generated waveform and spectrogram images from cache. This action cannot be undone.',
        buttons: ['Cancel', 'Delete'],
        defaultId: 1,
        cancelId: 0
      });

      if (response !== 1) return { deleted: false };

      let deleted = [];
      let errors = [];

      for (const dir of cacheDirs) {
        try {
          if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
            deleted.push(dir);
          }
        } catch (err) {
          errors.push({ dir, error: err.message });
        }
      }

      // Show dialogs only once after processing all directories
      if (deleted.length > 0) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Confirmation',
          message: 'Confirmation',
          detail: 'The cache has been deleted successfully.',
          buttons: ['OK'],
          defaultId: 0,
          cancelId: 0
        });
      }
      if (errors.length > 0) {
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Error',
          message: 'Delete Cache Error!',
          detail: errors.map(e => `${e.dir}: ${e.error}`).join('\n'),
          buttons: ['OK'],
          defaultId: 0,
          cancelId: 0
        });
      }

      return { deleted, errors };
    });

    // --- Classic “Page Unresponsive” handler ---
    mainWindow.webContents.on('unresponsive', () => {
      ForceCloseMainStudio();
    });

    mainWindow.webContents.on('responsive', () => {
      console.log('Renderer recovered from freeze.');
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}