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
  session,
  ipcRenderer,
} = require("electron");

app.setAppUserModelId("app.vjdyofficial.andromeda");

let isCrashed = false;

const { fileURLToPath } = require("url");
const os = require("os");
const fs = require("fs");
const fsp = require("fs/promises");
const exec = require("child_process").exec;
const { spawn } = require("child_process");
const path = require("path");
const { https } = require("follow-redirects");
const { getFonts2 } = require("font-list");
const crypto = require("crypto");
const { Worker } = require("worker_threads");
const Formats = require("./modules/common/formats");

const sfxRoot = path.join(
  os.homedir(),
  "Documents",
  "VJDY FM Sound Effects Studio",
  "Sound Effects",
);

const looperRoot = path.join(
  os.homedir(),
  "Documents",
  "VJDY FM Sound Effects Studio",
  "Loops",
);

async function checkSystemRequirements() {
  const totalRAM = os.totalmem();
  const totalGB = totalRAM / 1024 ** 3;

  // An 8 GB system may report less usable RAM because hardware reserves some.
  if (totalGB < 6.5) {
    const result = await dialog.showMessageBox({
      type: "error",
      title: "Insufficient Memory",
      message: `SFXStudio requires an 8GB system (at least 6.5GB usable RAM).\nDetected: ${totalGB.toFixed(2)}GB usable`,
      buttons: ["Exit"],
      defaultId: 0,
      cancelId: 0,
    });

    if (result.response === 0) {
      app.exit(100);
    }

    return false;
  }

  return true;
}

process.on("uncaughtException", (error) => {
  console.error(error.stack || error.message);
});

process.on("unhandledRejection", (reason) => {
  console.warn(reason?.stack || "Unknown Message");
});

ipcMain.handle("options-dialog", async (event, options = {}, title) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { response: 0, checkboxChecked: false };
  }

  const buttons = [...(options.buttons || [])];
  if (!buttons.includes("Cancel")) {
    buttons.push("Cancel");
  }

  return dialog.showMessageBox(mainWindow, {
    ...options,
    title: "Option Picker",
    message: title || "Choose Options",
    buttons,
    cancelId: buttons.indexOf("Cancel"),
  });
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
    requiredKeys.forEach((key) => {
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

ipcMain.on("show-notification", (event, options) => {
  // Use destructuring with defaults
  const {
    title = "Default Title",
    body = "",
    icon, // optional
    silent = false, // optional
    actions, // optional, for buttons
    closeButtonText, // optional
  } = options || {};

  const notification = new Notification({
    title,
    body,
    icon,
    silent,
    actions,
    closeButtonText,
  });

  notification.show();
});

let timeWindow = null;
let timeResolve = null;

function createTimeWindow(options = {}) {
  if (timeWindow && !timeWindow.isDestroyed()) {
    timeWindow.focus();
    return;
  }

  timeWindow = new BrowserWindow({
    width: 560,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    modal: true,
    parent: mainWindow,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false,
    },
  });

  timeWindow.loadFile(path.join(__dirname, "time-picker.html"));

  timeWindow.webContents.once("did-finish-load", () => {
    timeWindow.show();
    timeWindow.webContents.send("time-picker-init", {
      value: options.value || "12:00",
      format: options.format || "24h",
    });
  });

  timeWindow.on("closed", () => {
    timeWindow = null;
    if (timeResolve) {
      timeResolve(null);
      timeResolve = null;
    }
  });
}

ipcMain.handle("open-time-picker", async (event, options = {}) => {
  return new Promise((resolve) => {
    timeResolve = resolve;
    createTimeWindow(options);
  });
});

ipcMain.handle("time-picker-submit", (event, result) => {
  console.log("[TimePicker] Selected:", result);

  const resolve = timeResolve;
  timeResolve = null;
  destroyTimeWindow();
  if (resolve) {
    resolve(result);
  }
  return result;
});

function destroyTimeWindow() {
  if (timeWindow && !timeWindow.isDestroyed()) {
    timeWindow.destroy();
  }
  timeWindow = null;
}

let dateWindow = null;
let dateResolve = null;

function createDateWindow(options = {}) {
  if (dateWindow && !dateWindow.isDestroyed()) {
    dateWindow.focus();
    return;
  }

  dateWindow = new BrowserWindow({
    width: 560,
    height: 560,
    resizable: false,
    minimizable: false,
    maximizable: false,
    modal: true,
    parent: mainWindow,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: false,
    },
  });

  dateWindow.loadFile(path.join(__dirname, "date-picker.html"));

  dateWindow.webContents.once("did-finish-load", () => {
    dateWindow.show();
    dateWindow.webContents.send("date-picker-init", {
      value: options.value || "",
      format: options.format || "",
    });
  });

  dateWindow.on("closed", () => {
    dateWindow = null;
    if (dateResolve) {
      dateResolve(null);
      dateResolve = null;
    }
  });
}

ipcMain.handle("open-date-picker", async (event, options = {}) => {
  return new Promise((resolve) => {
    dateResolve = resolve;
    createDateWindow(options);
  });
});

ipcMain.handle("date-picker-submit", (event, result) => {
  console.log("[DatePicker] Selected:", result);

  const resolve = dateResolve;
  dateResolve = null;
  destroyDateWindow();
  if (resolve) {
    resolve(result);
  }
  return result;
});

function destroyDateWindow() {
  if (dateWindow && !dateWindow.isDestroyed()) {
    dateWindow.destroy();
  }
  dateWindow = null;
}

ipcMain.handle("sfxstudio-select-media-library", async () => {
  const result = await dialog.showOpenDialog(MediaBrowserWindow, {
    title: "Select Media Library",
    properties: ["openDirectory", "multiSelections"],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths;
});

function getNetworkAdapters() {
  const interfaces = os.networkInterfaces();
  const adapters = [];

  for (const [name, entries] of Object.entries(interfaces)) {
    for (const info of entries || []) {
      if ((info.family === "IPv4" || info.family === 4) && !info.internal) {
        adapters.push({
          name,
          address: info.address,
        });
      }
    }
  }

  return adapters;
}

ipcMain.handle("SFXSTUDIO_SELECT_NETWORK", async () => {
  const adapters = getNetworkAdapters();

  if (!adapters.length) {
    return null;
  }

  const buttons = adapters.map(
    (adapter) => `${adapter.name} (${adapter.address})`,
  );

  buttons.push("Cancel");

  const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
    type: "question",
    title: "Network Interface Picker",
    message: "Select Network Interface",
    detail: "Choose the network interface for SFXStudio broadcasting.",
    buttons,
    cancelId: buttons.length - 1,
    defaultId: 0,
    noLink: true,
  });

  if (result.response < 0 || result.response >= adapters.length) {
    return null;
  }

  return adapters[result.response];
});

ipcMain.handle("SFXSTUDIO_SAVE_DATA", async (event, binary) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: "Export user data",
    defaultPath: "sfxstudiodat",
    filters: [{ name: "SFXStudio User Data", extensions: ["sfxstudiodat"] }],
  });

  if (canceled || !filePath) return false;

  try {
    fs.writeFileSync(filePath, Buffer.from(binary));
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
});

ipcMain.handle("SFXSTUDIO_LOAD_DATA", async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: "Import user data",
    properties: ["openFile"],
    filters: [{ name: "SFXStudio User Data", extensions: ["sfxstudiodat"] }],
  });

  if (canceled || !filePaths.length) return null;

  try {
    return fs.readFileSync(filePaths[0]);
  } catch (error) {
    console.error(error);
    return null;
  }
});

ipcMain.handle("get-sfx-list", () => {
  const jsonPath = path.join(
    app.getPath("appData"),
    "VJDY FM Sound Effects Studio",
    "assets",
    "sfx",
    "list.json",
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
    "credits.txt",
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

let fontPickerProcess = null;
let fontPickerPending = null;
let fontPickerQueue = Promise.resolve();

function startFontPicker(hwnd) {
    if (fontPickerProcess && !fontPickerProcess.killed) {
        return fontPickerProcess;
    }

    const script = path.join(
        __dirname,
        "modules",
        "powershell",
        "font-picker.ps1"
    );

    fontPickerProcess = spawn("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy", "Bypass",
        "-File", script,
        "-OwnerHandle", hwnd
    ], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
    });

    let buffer = "";

    fontPickerProcess.stdout.on("data", data => {

        buffer += data.toString();

        let newline;

        while ((newline = buffer.indexOf("\n")) !== -1) {

            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);

            if (!line) continue;

            try {
                const result = JSON.parse(line);

                if (fontPickerPending) {
                    fontPickerPending.resolve(result);
                    fontPickerPending = null;
                }

            } catch (error) {
                console.error("[FONT PICKER] Invalid response:", line);
            }
        }
    });

    fontPickerProcess.stderr.on("data", data => {
        console.error("[FONT PICKER PS]", data.toString());
    });

    fontPickerProcess.on("error", error => {
        console.error("[FONT PICKER] Process error:", error);

        if (fontPickerPending) {
            fontPickerPending.reject(error);
            fontPickerPending = null;
        }

        fontPickerProcess = null;
    });

    fontPickerProcess.on("close", code => {
        console.log("[FONT PICKER] PowerShell exited:", code);

        if (fontPickerPending) {
            fontPickerPending.reject(
                new Error("Font picker process exited.")
            );
            fontPickerPending = null;
        }
        fontPickerProcess = null;
    });

    return fontPickerProcess;
}

function sendFontPickerRequest(options) {
    return new Promise((resolve, reject) => {

        if (!fontPickerProcess || fontPickerProcess.killed) {
            return reject(new Error("Font picker process is not running."));
        }

        fontPickerPending = { resolve, reject };

        const request = JSON.stringify(options) + "\n";

        fontPickerProcess.stdin.write(request, error => {

            if (error && fontPickerPending) {
                fontPickerPending.reject(error);
                fontPickerPending = null;
            }
        });
    });
}

ipcMain.handle("FONT_PICKER_OPEN", (event, options = {}) => {

    // Serialize requests to avoid opening two dialogs at once
    fontPickerQueue = fontPickerQueue.then(async () => {

        if (!mainWindow || mainWindow.isDestroyed()) {
            return [];
        }

        const minSize = Number(options.minSize ?? 8);
        const maxSize = Number(options.maxSize ?? 24);

        if (
            !Number.isInteger(minSize) ||
            !Number.isInteger(maxSize) ||
            minSize < 1 ||
            maxSize < minSize ||
            maxSize > 1000
        ) {
            throw new Error("Invalid font size range.");
        }

        const handleBuffer = mainWindow.getNativeWindowHandle();

        const hwnd = handleBuffer.length >= 8
            ? handleBuffer.readBigUInt64LE(0).toString()
            : handleBuffer.readUInt32LE(0).toString();

        startFontPicker(hwnd);

        return await sendFontPickerRequest({
            minSize,
            maxSize
        });

    });

    return fontPickerQueue;
});

ipcMain.handle("save-pcm-chunks", async (event, chunks) => {
  const { canceled, filePath } = await dialog.showSaveDialog(
    mainWindow || null,
    {
      title: "Save Recorded Audio",
      defaultPath: "audio",
      filters: [{ name: "PCM S16 LE - WAV", extensions: ["wav"] }],
    },
  );

  if (canceled || !filePath) return null;

  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);

    for (const chunk of chunks) {
      stream.write(Buffer.from(chunk));
    }

    stream.end(() => {
      console.log("PCM saved to", filePath);
      resolve(filePath); // ✅ return saved path
    });

    stream.on("error", reject);
  });
});

ipcMain.handle("get-appdata-path", () => {
  return app.getPath("appData"); // returns string
});

ipcMain.handle("get-regular-fonts", async () => {
  try {
    const detailed = await getFonts2({ disableQuoting: true });
    const regularFamilies = new Set();

    detailed.forEach((font) => {
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
const { get } = require("http");

const contentdownload = [
  { item: "sfx.zip", directory: sfxRoot },
  { item: "loopers.zip", directory: looperRoot },
];

ipcMain.handle("download-update-pack", async (event, content) => {
  const appData = app.getPath("appData");
  const sfxFolder = contentdownload[content].directory;
  const sfxBackup = path.join(
    appData,
    "VJDY FM Sound Effects Studio",
    "assets",
    "sfx_bak",
  );

  const downloadCache = path.join(
    appData,
    "VJDY FM Sound Effects Studio",
    "downloadcache",
  );
  const downloaddest = path.join(downloadCache, contentdownload[0].item);

  const sfxZipUrl =
    "https://github.com/vjdyofficial/SoundEffectsStudioSFXPack/releases/latest/download/" +
    contentdownload[content].item;

  if (!fs.existsSync(downloadCache))
    fs.mkdirSync(downloadCache, { recursive: true });

  // Step 1: Backup
  if (fs.existsSync(sfxFolder)) {
    if (fs.existsSync(sfxBackup))
      fs.rmSync(sfxBackup, { recursive: true, force: true });
    fs.renameSync(sfxFolder, sfxBackup);
  }

  await new Promise((res) => setTimeout(res, 1500)); // 5s relax

  // Helper: download with progress using follow-redirects
  async function downloadFile(url, dest, retries = 5) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const file = fs.createWriteStream(dest);
          https
            .get(url, (res) => {
              if (res.statusCode !== 200)
                return reject(new Error(`HTTP ${res.statusCode}`));

              const total = parseInt(res.headers["content-length"], 10) || 0;
              let downloaded = 0;

              res.on("data", (chunk) => {
                downloaded += chunk.length;
                const percent = total
                  ? ((downloaded / total) * 100).toFixed(2)
                  : 0;
                event.sender.send("download-progress", {
                  stage: "download",
                  percent,
                  downloaded,
                  total,
                });
              });

              res.pipe(file);
              file.on("finish", () => file.close(resolve));
              file.on("error", reject);
            })
            .on("error", reject);
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
            event.sender.send("download-progress", {
              stage: "extract",
              percent: simulatedPercent,
            });
          }, 200);

          const sevenZipPath = path.join(__dirname, "7zG.exe");
          execFile(
            sevenZipPath,
            ["x", zipPath, `-o${extractTo}`, "-y"],
            { windowsHide: true }, // <--- hide 7-Zip window
            (error) => {
              clearInterval(interval);
              event.sender.send("download-progress", {
                stage: "extract",
                percent: 100,
              });
              if (error) return reject(error);
              resolve();
            },
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
  if (fs.existsSync(sfxBackup))
    fs.rmSync(sfxBackup, { recursive: true, force: true });
  await new Promise((res) => setTimeout(res, 1500)); // 5s relax

  loadSFXMenu();
  return { success: true, message: "SFX pack updated successfully!" };
});

const appDataPath = path.join(app.getAppPath()); // adjust MyApp
if (!fs.existsSync(appDataPath)) fs.mkdirSync(appDataPath, { recursive: true });

const SUPPORTED_FORMATS = [
  { name: "Microsoft Wave Files", extensions: ["wav"] },
  { name: "MIDI Sequence", extensions: ["mid"] },
  { name: "Karaoke Sequence", extensions: ["kar"] },
  { name: "MP3 Audio Files", extensions: ["mp3"] },
  { name: "Ogg Vorbis Audio Files", extensions: ["ogg"] },
  { name: "FLAC Audio Files", extensions: ["flac"] },
  { name: "Opus Audio Files", extensions: ["opus"] },
  { name: "MPEG-4 Audio Files", extensions: ["m4a"] },
  { name: "Matroska Audio Files", extensions: ["mka"] },
  { name: "MPEG-4 Video Files", extensions: ["mp4"] },
  { name: "3GP Video Files", extensions: ["3gp"] },
  { name: "QuickTime Movie Files", extensions: ["mov"] },
  { name: "Matroska Video Files", extensions: ["mkv"] },
  { name: "WebM Video Files", extensions: ["webm"] },
  { name: "SubRip Subtitle Source File", extensions: ["srt"] },
  { name: "WebVTT Source File", extensions: ["vtt"] },
];

ipcMain.handle("open-supported-file", async (event) => {
  const filters = SUPPORTED_FORMATS.map((f) => ({
    name: f.name,
    extensions: f.extensions,
  }));

  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select a media file",
    buttonLabel: "Open",
    properties: ["openFile"],
    filters,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  // Convert to file:// URL
  const filePath = result.filePaths[0];
  const fileUrl = `file://${filePath.replace(/\\/g, "/")}`;
  return filePath;
});

ipcMain.handle("pick-subtitle-file", async () => {
  const result = await dialog.showOpenDialog(mainWindow || null, {
    title: "Select Subtitle File",
    properties: ["openFile"],
    filters: [{ name: "Subtitles", extensions: ["srt", "vtt"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = fs.readFileSync(filePath, "utf-8");

  return {
    path: filePath,
    name: filePath.split(/[/\\]/).pop(),
    content,
  };
});

ipcMain.handle("save-media", async (_, { src, name }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(
    mainWindow || null,
    {
      title: "Save Image File",
      defaultPath: name + "_" + Formats.getTimestamp() + ".png",
      filters: [{ name: "Portable Network Graphics", extensions: ["png"] }],
    },
  );

  if (canceled || !filePath) return { success: false };

  // -------------------------
  // BASE64
  // -------------------------
  if (src.startsWith("data:")) {
    const base64 = src.split(",")[1];

    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

    return { success: true, path: filePath };
  }

  // -------------------------
  // FILE PATH
  // -------------------------
  if (src.startsWith("file://")) {
    fs.copyFileSync(fileURLToPath(src), filePath);

    return { success: true, path: filePath };
  }

  return { success: false };
});

let currentBBCodeFilePath = null;

let sfxMenu = null;

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac"];

function buildFolderMenu(folder) {
  const items = [];
  let count = 0;

  if (!fs.existsSync(folder)) return { items, count };

  const entries = fs.readdirSync(folder, {
    withFileTypes: true,
  });

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    const fullPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      const result = buildFolderMenu(fullPath);
      if (result.items.length) {
        items.push({
          label: entry.name,
          submenu: result.items,
        });
        count += result.count;
      }
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.includes(ext)) continue;
    count++;

    items.push({
      label: path.parse(entry.name).name,
      click() {
        console.log("Selected:", fullPath);
        // Send to renderer if needed
        mainWindow.webContents.send("sfx-selected", fullPath);
      },
    });
  }
  return { items, count };
}

function loadSFXMenu() {
  const result = buildFolderMenu(sfxRoot);
  sfxMenu = Menu.buildFromTemplate(result.items);
}

ipcMain.handle("open-bbcode-file", async () => {
  const win = BrowserWindow.getFocusedWindow();

  const { filePaths, canceled } = await dialog.showOpenDialog(win, {
    title: "Open",
    filters: [
      { name: "BBCode Teleprompt Format", extensions: ["bbcx"] },
      { name: "Text Document", extensions: ["txt"] },
    ],
    properties: ["openFile"],
  });

  if (canceled || !filePaths.length) return null;

  try {
    const filePath = filePaths[0];
    const content = fs.readFileSync(filePath, "utf8");

    // ✅ remember path
    currentBBCodeFilePath = filePath;

    return content;
  } catch (err) {
    console.error("Error opening file:", err);
    return null;
  }
});

ipcMain.handle("save-bbcode-file", async (event, content) => {
  // If we already have a file path, overwrite it
  if (currentBBCodeFilePath) {
    try {
      fs.writeFileSync(currentBBCodeFilePath, content, "utf8");
      return { saved: true, path: currentBBCodeFilePath };
    } catch (err) {
      console.error("Error saving file:", err);
      return { saved: false, error: err.message };
    }
  }

  // Otherwise fallback to Save As
  return await saveBBCodeAs(event, content);
});

ipcMain.handle("save-bbcode-as", async (event, content) => {
  return await saveBBCodeAs(event, content);
});

ipcMain.handle("sampler:openFile", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(
    mainWindow || null,
    {
      title: "Open Audio File",
      properties: ["openFile"],
      filters: [
        {
          name: "Audio Files",
          extensions: ["mp3", "m4a", "wav", "flac", "webm"],
        },
      ],
    },
  );

  if (canceled || filePaths.length === 0) return null;

  return filePaths[0].replace(/\\/g, "/");
});

async function saveBBCodeAs(event, content) {
  const win = BrowserWindow.getFocusedWindow();

  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    title: "Save BBCode Teleprompt Format",
    defaultPath: "New BBCode Document.bbcx",
    filters: [{ name: "BBCode Teleprompt Format", extensions: ["bbcx"] }],
  });

  if (canceled || !filePath) {
    return { saved: false };
  }

  try {
    fs.writeFileSync(filePath, content, "utf8");

    // ✅ update active path
    currentBBCodeFilePath = filePath;

    return { saved: true, path: filePath };
  } catch (err) {
    console.error("Error saving file:", err);
    return { saved: false, error: err.message };
  }
}

ipcMain.handle("clear-bbcode-file", () => {
  currentBBCodeFilePath = null;
  return true;
});

ipcMain.handle("save-surround-preset", async (event, preset) => {
  const win = BrowserWindow.getFocusedWindow();
  const { filePath } = await dialog.showSaveDialog(win, {
    title: "Save Stereo Enhancer Preset",
    defaultPath: "preset.srs",
    filters: [
      { name: "SFXStudio Stereo Enhancer Preset", extensions: ["srs"] },
    ],
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
      { name: "SFXStudio Stereo Enhancer Preset", extensions: ["srs"] },
    ],
    properties: ["openFile"],
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
let mapWindow;
let presenterwindow;
let lyricswindow;
let fontWindow;
let colorWindow;
let visualizerWindow;
let WelcomeWindow;
let mainWindow;
let consoleWindow;
let MediaBrowserWindow;
let systemRenderer;
let aboutWindow = [];
let firstFile;
let hwvalue = true;

nativeTheme.themeSource = "system"; // or "light" or "system"

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SUPPORTED_AUDIO = [
  ".mp3",
  ".m4a",
  ".weba",
  ".ogg",
  ".mp4",
  ".webm",
  ".3gp",
  ".opus",
  ".wav",
  ".mkv",
  ".flac",
  ".mov",
  ".aac",
  ".aiff",
  ".alac",
  ".amr",
  ".ape",
  ".au",
  ".dsd",
  ".ac3",
  ".mka",
  ".tta",
  ".wv",
];

const SUPPORTED_SUBTITLE = [".srt", ".vtt"];

const SUPPORTED_IMAGES = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".webp",
  ".apng",
];

function handleFile(filePath) {
  if (!filePath) return;

  // Only handle .b64i files
  if (filePath.endsWith(".b64i")) {
    try {
      // Read the base64 text from the .b64i file
      const b64data = fs.readFileSync(filePath, "utf8");

      // Send buffer to renderer for later usage (e.g., as src)
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send("openbase64_image", b64data);
      }
    } catch (err) {
      console.error("Error reading .b64i file:", err);
    }
  } else if (filePath.endsWith(".bbcx")) {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      currentBBCodeFilePath = filePath;
      mainWindow.webContents.send("importbbcx", content);
    } catch (err) {
      console.error("Error opening file:", err);
      const errordialog = dialog.showMessageBoxSync(mainWindow || null, {
        type: "warn",
        title: "Import Error!",
        message: "Import Error!",
        detail:
          "An error occured while opening the file. Please try importing again.",
        buttons: ["OK"],
      });
    }
  } else if (
    SUPPORTED_AUDIO.some((ext) => filePath.toLowerCase().endsWith(ext))
  ) {
    mainWindow.webContents.send("importmedia", filePath);
  } else if (
    SUPPORTED_SUBTITLE.some((ext) => filePath.toLowerCase().endsWith(ext))
  ) {
    mainWindow.webContents.send("importmedia", filePath);
  } else if (
    SUPPORTED_IMAGES.some((ext) => filePath.toLowerCase().endsWith(ext))
  ) {
    mainWindow.webContents.send("importmedia", filePath);
  }
}

app.setAsDefaultProtocolClient("subw");
app.setAsDefaultProtocolClient("b64i");
app.setAsDefaultProtocolClient("bbcx");

app.commandLine.appendSwitch("enable-direct-write", "1");
app.commandLine.appendSwitch("disable-lcd-text", "1");

ipcMain.handle("WEATHER_GET_METNORWAY", async (event, lat, lon) => {
  try {
    lat = Number(lat);
    lon = Number(lon);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      throw new Error("Invalid coordinates");
    }

    const url = new URL(
      "https://api.met.no/weatherapi/locationforecast/2.0/compact",
    );

    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);

    const response = await fetch(url, {
      headers: {
        "User-Agent": `VJDY-FM-Sound-Effects-Studio/26.6.10 https://vjdyofficial.github.io/`,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`MET Norway HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[MET Norway]", error);
    throw error;
  }
});

const IMAGE_SHOW_EXTENSIONS = [
  "jpg",
  "jpeg",
  "jfif",
  "png",
  "apng",
  "gif",
  "bmp",
  "webp",
];

ipcMain.handle("imageshow:import", async (event) => {
  const parent = BrowserWindow.fromWebContents(event.sender);

  const result = await dialog.showOpenDialog(parent, {
    title: "Import Images",
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Supported Images",
        extensions: IMAGE_SHOW_EXTENSIONS,
      },
    ],
  });

  if (result.canceled) return [];

  return result.filePaths;
});

function detectFileSupport(arg) {
  return (
    arg.toLowerCase().endsWith(".b64i") ||
    arg.toLowerCase().endsWith(".subw") ||
    arg.toLowerCase().endsWith(".bbcx") ||
    arg.toLowerCase().endsWith(".srs") ||
    SUPPORTED_AUDIO.some((ext) => arg.toLowerCase().endsWith(ext))
  );
}

function fileExecute(listArg) {
  const file = listArg.find(
    (arg) => typeof arg === "string" && detectFileSupport(arg),
  );
  if (file) {
    handleFile(file);
  }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit(); // Another instance is already running
} else {
  app.on("second-instance", (event, argv, workingDirectory) => {
    const listArg = Array.isArray(argv) ? argv.slice(1) : [argv];
    fileExecute(listArg);

    if (!mainWindow) return;

    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus(); // sets focus
  });

  app.on("ready", () => {
    // First instance
    const listArg = process.argv.slice(1); // argv for first instance
    console.log(listArg);
    firstFile = listArg;
  });

  const settingsPath = path.join(
    app.getPath("appData"),
    "VJDY FM Sound Effects Studio",
    "settings.json",
  );
  let forceAcrylicWindow = false;

  // ✅ Load settings
  function loadSettings() {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      return {
        hardwareAcceleration: true,
        forceAcrylic: false,
        firsttime: true,
      }; // default
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

  app.commandLine.appendSwitch("high-dpi-support", "1");
  const scale = settings.forceScale ?? 1;

  app.commandLine.appendSwitch("force-device-scale-factor", String(scale));

  // For font hinting or subpixel rendering

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json")),
  );
  const electronVersion = process.versions.electron;
  const electronBuilderVersion =
    packageJson.devDependencies?.["electron-builder"] || "Not found";
  const buildID = 2601251556; // YYMMDDHHMM format
  const appVersion = app.getVersion();
  const chromiumVersion = process.versions.chrome;
  const nodeVersion = process.versions.node;
  let splashWindowClose = false;

  const buildNumber = parseInt(os.release().split(".")[2]);

  const backgroundMaterial = {
    false: "mica",
    true: "tabbed",
    acrylic: "acrylic",
    solid: "none",
    transparent: "none",
  };

  const backgroundColorDark = {
    false: "#00000000",
    true: "#00000000",
    acrylic: "rgba(14, 14,14, 0.56)",
    solid: "#141414",
    transparent: "rgba(14, 14,14, 0.92)",
  };

  const backgroundColorLight = {
    false: "#00000000",
    true: "#00000000",
    acrylic: "rgba(236, 236, 236, 0.48)",
    solid: "#f8f8f8",
    transparent: "rgba(236, 236, 236, 0.92)",
  };

  const isWindows11 = process.platform === "win32" && buildNumber >= 22000;
  const materialSet = backgroundMaterial[forceAcrylicWindow];

  app.whenReady().then(async () => {
    const ok = await checkSystemRequirements();
    if (!ok) {
      console.error("System requirements for RAM not met. Exiting.");
      return;
    }

    console.log(
      "System requirements for RAM met. Continuing with app initialization.",
    );

    let isDarkMode = nativeTheme.shouldUseDarkColors;
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea; // excludes taskbar area'

    function BackgroundColor() {
      return isDarkMode
        ? backgroundColorDark[forceAcrylicWindow]
        : backgroundColorLight[forceAcrylicWindow];
    }

    // keep originals
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
      debug: console.debug,
      clear: console.clear,
    };

    function sendToConsoleWindow(type, args) {
      if (!consoleWindow || consoleWindow.isDestroyed()) return;

      consoleWindow.webContents.send("main-log", {
        event: type,
        msg: args
          .map((a) =>
            typeof a === "object" ? JSON.stringify(a, null, 2) : String(a),
          )
          .join(" "),
        time: new Date().toISOString(),
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

    console.debug = (...args) => {
      originalConsole.debug(...args);
      sendToConsoleWindow("debug", args);
    };

    console.clear = (...args) => {
      originalConsole.clear(...args);
      sendToConsoleWindow("clear", args);
    };

    function createConsole() {
      return new Promise((resolve) => {
        consoleWindow = new BrowserWindow({
          title: "Developer Console",
          width: 1000,
          height: 800,
          minWidth: 600,
          minHeight: 400,
          useContentSize: true,
          icon: path.join(__dirname, "icon.png"),
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11
            ? undefined
            : materialSet
              ? "mica"
              : "tabbed",
          show: false,
          alwaysOnTop: false,
          skipTaskbar: false,
          resizable: true,
          frame: true,
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: colorSymbol(),
            height: 32,
          },
          hasShadow: true,
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            nodeIntegration: true,
            subpixelFontScaling: true,
            devTools: !app.isPackaged,
            defaultFontFamily: {
              standard: "Segoe UI",
              sansSerif: "Roboto",
              serif: "Noto Serif",
              monospace: "Roboto Mono",
            },
          },
        });
        consoleWindow.loadFile("console.html");
        addListenerWindow(consoleWindow);
        consoleWindow.webContents.setWindowOpenHandler(({ url }) => {
          shell.openExternal(url); // Open in default browser
          return { action: "deny" }; // Prevent Electron from opening it internally
        });
        consoleWindow.webContents.on("will-navigate", (event, url) => {
          if (
            !consoleWindow.isDestroyed &&
            url !== consoleWindow.webContents.getURL()
          ) {
            event.preventDefault();
            shell.openExternal(url);
          }
        });
        consoleWindow.webContents.on("did-start-navigation", (e) => {
          e.preventDefault();
          restartApp();
        });
        consoleWindow.on("close", (e) => {
          e.preventDefault();
          consoleWindow.hide();
        });

        const template = [];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);

        consoleWindow.webContents.once("did-finish-load", () => {
          console.log("Console window created. loading workspace...");
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createSystemRenderer() {
      return new Promise((resolve) => {
        systemRenderer = new BrowserWindow({
          title: "Audio System Renderer",
          width: 400,
          height: 525,
          minWidth: 400,
          minHeight: 525,
          useContentSize: true,
          icon: path.join(__dirname, "icon.png"),
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11
            ? undefined
            : materialSet
              ? "mica"
              : "tabbed",
          show: false,
          alwaysOnTop: false,
          skipTaskbar: false,
          resizable: false,
          frame: true,
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: colorSymbol(),
            height: 32,
          },
          hasShadow: true,
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            nodeIntegration: true,
            subpixelFontScaling: true,
            devTools: !app.isPackaged,
            defaultFontFamily: {
              standard: "Segoe UI",
              sansSerif: "Roboto",
              serif: "Noto Serif",
              monospace: "Roboto Mono",
            },
          },
        });
        systemRenderer.loadFile("systemRenderer.html");
        addListenerWindow(systemRenderer);
        systemRenderer.webContents.setWindowOpenHandler(({ url }) => {
          shell.openExternal(url); // Open in default browser
          return { action: "deny" }; // Prevent Electron from opening it internally
        });
        systemRenderer.webContents.on("will-navigate", (event, url) => {
          if (
            !systemRenderer.isDestroyed &&
            url !== systemRenderer.webContents.getURL()
          ) {
            event.preventDefault();
            shell.openExternal(url);
          }
        });
        systemRenderer.webContents.on("did-start-navigation", (e) => {
          e.preventDefault();
          restartApp();
        });
        systemRenderer.on("close", (e) => {
          e.preventDefault();
          systemRenderer.hide();
        });

        const template = [];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);

        systemRenderer.webContents.once("did-finish-load", () => {
          console.log("System Renderer window created. loading workspace...");
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createMediaBrowser() {
      return new Promise((resolve) => {
        MediaBrowserWindow = new BrowserWindow({
          title: "Media Browser",
          width: 1000,
          height: 800,
          minWidth: 600,
          minHeight: 400,
          useContentSize: true,
          icon: path.join(__dirname, "icon.png"),
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11
            ? undefined
            : materialSet
              ? "mica"
              : "tabbed",
          show: true,
          alwaysOnTop: false,
          skipTaskbar: false,
          resizable: true,
          frame: true,
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: colorSymbol(),
            height: 48,
          },
          hasShadow: true,
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            nodeIntegration: true,
            subpixelFontScaling: true,
            devTools: !app.isPackaged,
            defaultFontFamily: {
              standard: "Segoe UI",
              sansSerif: "Roboto",
              serif: "Noto Serif",
              monospace: "Roboto Mono",
            },
          },
        });
        MediaBrowserWindow.loadFile("mediabrowser.html");
        addListenerWindow(MediaBrowserWindow);
        MediaBrowserWindow.webContents.setWindowOpenHandler(({ url }) => {
          shell.openExternal(url); // Open in default browser
          return { action: "deny" }; // Prevent Electron from opening it internally
        });
        MediaBrowserWindow.webContents.on("will-navigate", (event, url) => {
          if (
            !MediaBrowserWindow.isDestroyed &&
            url !== MediaBrowserWindow.webContents.getURL()
          ) {
            event.preventDefault();
            shell.openExternal(url);
          }
        });

        MediaBrowserWindow.on("close", (e) => {
          e.preventDefault();
          MediaBrowserWindow.destroy(); // Destroy the window instead of hiding it
          MediaBrowserWindow = null; // Clear the reference to the window
        });

        MediaBrowserWindow.webContents.on(
          "render-process-gone",
          (event, details) => {
            if (details.reason === "crashed") {
              console.error("Media Browser renderer process crashed.");
            }
          },
        );

        const template = [];

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);

        MediaBrowserWindow.webContents.once("did-finish-load", () => {
          console.log("Console window created. loading workspace...");
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    const minWin10Build = 17763; // Windows 10 1903
    if (process.platform === "win32" && buildNumber < minWin10Build) {
      await dialog.showMessageBox({
        type: "error",
        title: "Unsupported Windows Version",
        message: "You are using the old version of Windows",
        detail:
          `Your current Windows version is not supported. The app requires Windows 10 version 1809 or later.` +
          `and be sure to use 64-bit architure. Please update your system to continue. If you are using Compatibility Feature, ` +
          `please ensure that you disable that feature to avoid confusions.`,
        buttons: ["OK"],
      });
      app.exit(1);
      return;
    }

    const iconPathforExternalVisualizer = isDarkMode
      ? __dirname + "/icons/visualiser.png"
      : __dirname + "/icons/visualiser-light.png";

    const iconPathforVUMeter = isDarkMode
      ? __dirname + "/icons/vumeter.png"
      : __dirname + "/icons/vumeter-light.png";

    let bgColor = nativeTheme.shouldUseDarkColors
      ? "#141414" // fully transparent black for dark mode
      : "#f8f8f8"; // fully transparent white for light mode

    function colorset() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#141414" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      return nativeTheme.shouldUseHighContrastColors
        ? bgColor
        : BackgroundColor();
    }

    function colorsetInit() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#000000" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      return bgColor;
    }

    function colorsetonmodals() {
      bgColor = nativeTheme.shouldUseDarkColors
        ? "#141414" // fully transparent black for dark mode
        : "#f8f8f8"; // fully transparent white for light mode

      return nativeTheme.shouldUseHighContrastColors
        ? bgColor
        : BackgroundColor();
    }

    function colorSymbol() {
      const baseColor = isDarkMode ? "#FFFFFF" : "#000000";
      return baseColor;
    }

    function colorSymbolInactive() {
      const baseColor = isDarkMode ? "#FFFFFF80" : "#00000080";
      return baseColor;
    }

    function addListenerWindow(window) {
      window.on("blur", () => {
        window.setTitleBarOverlay({
          color: "#00000000",
          symbolColor: colorSymbolInactive(),
          height: 32,
        });
        if (!isCrashed) window.webContents.send("window_state", "inactive");
      });

      window.on("focus", () => {
        window.setTitleBarOverlay({
          color: "#00000000",
          symbolColor: colorSymbol(),
          height: 32,
        });
        if (!isCrashed) window.webContents.send("window_state", "active");
      });

      // Update on theme change
      nativeTheme.on("updated", () => {
        if (window.isFocused()) {
          window.setTitleBarOverlay({
            color: "#00000000",
            symbolColor: colorSymbol(),
            height: 32,
          });
        } else {
          window.setTitleBarOverlay({
            color: "#00000000",
            symbolColor: colorSymbolInactive(),
            height: 32,
          });
        }
        // optional: skip sending if crashed
        if (!isCrashed) {
          const state = window.isFocused() ? "active" : "inactive";
          window.webContents.send("window_state", state);
        }
      });
    }

    let icon_option1;
    let icon_option2;
    let icon_option3;
    let iconPath = path.join(__dirname, "icon.png");
    tray = new Tray(iconPath);
    tray.setToolTip("VJDY FM Sound Effect Studio");

    function updateWindowColor() {
      isDarkMode = nativeTheme.shouldUseDarkColors;

      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.setBackgroundColor(bgColor);
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setBackgroundColor(colorset());
        mainWindow.webContents.send(
          "high-contrast-state",
          nativeTheme.shouldUseHighContrastColors,
        );
      }

      if (presenterwindow && !presenterwindow.isDestroyed()) {
        presenterwindow.setBackgroundColor(colorset());
        presenterwindow.webContents.send(
          "high-contrast-state",
          nativeTheme.shouldUseHighContrastColors,
        );
      }

      if (lyricswindow && !lyricswindow.isDestroyed()) {
        lyricswindow.setBackgroundColor(colorset());
        lyricswindow.webContents.send(
          "high-contrast-state",
          nativeTheme.shouldUseHighContrastColors,
        );
      }

      if (fontWindow && !fontWindow.isDestroyed()) {
        fontWindow.setBackgroundColor(colorsetonmodals());
        fontWindow.webContents.send(
          "high-contrast-state",
          nativeTheme.shouldUseHighContrastColors,
        );
      }

      if (colorWindow && !colorWindow.isDestroyed()) {
        colorWindow.setBackgroundColor(colorsetonmodals());
        colorWindow.webContents.send(
          "high-contrast-state",
          nativeTheme.shouldUseHighContrastColors,
        );
      }

      icon_option1 = path.join(
        __dirname,
        nativeTheme.shouldUseDarkColors
          ? "images/tray/close_16dp_F.png"
          : "images/tray/close_16dp_0.png",
      );
      icon_option2 = path.join(
        __dirname,
        nativeTheme.shouldUseDarkColors
          ? "images/tray/restart_alt_16dp_F.png"
          : "images/tray/restart_alt_16dp_0.png",
      );
      icon_option3 = path.join(
        __dirname,
        nativeTheme.shouldUseDarkColors
          ? "images/tray/bug_report_16dp_F.png"
          : "images/tray/bug_report_16dp_0.png",
      );

      createTray();
    }

    nativeTheme.on("updated", () => {
      updateWindowColor();
    });

    function createPresenterView() {
      return new Promise((resolve) => {
        presenterwindow = new BrowserWindow({
          title: "Transcript Viewer",
          minWidth: 400,
          minHeight: 500,
          width: 500,
          height: 700,
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? "none" : materialSet,
          icon: path.join(__dirname, "icon.png"),
          resizable: true,
          show: false,
          autoHideMenuBar: true,
          skipTaskbar: false,
          titleBarStyle: "hidden", // optional, for macOS
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#FFFFFF",
            height: 32,
          },
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            nodeIntegration: true,
          },
        });
        presenterwindow.loadFile("teleprompter.html");

        presenterwindow.on("close", (e) => {
          e.preventDefault();
          presenterwindow.hide();
        });

        presenterwindow.webContents.once("did-finish-load", () => {
          console.log("Teleprompt Transcript Viewer window created.");
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createLyricView() {
      return new Promise((resolve) => {
        lyricswindow = new BrowserWindow({
          title: "Lyrics Viewer",
          minWidth: 400,
          minHeight: 500,
          width: 500,
          height: 700,
          backgroundColor: colorset(),
          backgroundMaterial: !isWindows11 ? "none" : materialSet,
          icon: path.join(__dirname, "icon.png"),
          resizable: true,
          show: false,
          autoHideMenuBar: true,
          skipTaskbar: false,
          titleBarStyle: "hidden", // optional, for macOS
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#FFFFFF",
            height: 32,
          },
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: false,
            nodeIntegration: true,
          },
        });
        lyricswindow.loadFile("lyricsviewer.html");
        lyricswindow.on("close", (e) => {
          e.preventDefault();
          lyricswindow.hide();
        });

        lyricswindow.webContents.on("render-process-gone", (event, details) => {
          console.error("⚠️ Renderer process gone!", details);
          lyricswindow.destroy(); // Destroy the main window to prevent further issues
          lyricswindow = null;
          createLyricView().then(() => {
            console.log("Lyric Viewer window recreated after crash.");
          });
        });

        lyricswindow.webContents.once("did-finish-load", () => {
          console.log("Lyrics Transcript Viewer window created.");
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createWelcome() {
      WelcomeWindow = new BrowserWindow({
        title: "Welcome",
        useContentSize: true,
        width: 800,
        height: 600,
        backgroundColor: "#00000000",
        icon: path.join(__dirname, "icon.png"),
        parent: mainWindow, // Make it a child of mainWindow
        modal: true, // This blocks interaction with mainWindow
        resizable: false,
        show: false,
        maximizable: false, // 🚫 no maximize button
        minimizable: false,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#00000000",
          symbolColor: "#ffffff",
          height: 46,
        },
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: true,
          devTools: false,
        },
      });

      WelcomeWindow.loadFile("welcome.html");

      WelcomeWindow.webContents.on("did-finish-load", () => {
        WelcomeWindow.show();
      });

      WelcomeWindow.on("closed", () => {
        settings.firsttime = false;
        saveSettings(settings); // your existing JSON save function
        WelcomeWindow = null;
      });

      ipcMain.on("action_dff9", (event) => {
        if (WelcomeWindow && !WelcomeWindow.isDestroyed()) {
          WelcomeWindow.destroy();
          mainWindow.webContents.send("start-spotlight-tutorial");
        }
      });
    }

    function createMain() {
      mainWindow = new BrowserWindow({
        title: "Main Studio",
        width: 1350,
        height: 860,
        minWidth: 1350,
        minHeight: 800,
        useContentSize: true,
        icon: path.join(__dirname, "icon.png"),
        backgroundColor: colorsetInit(),
        backgroundMaterial: !isWindows11 ? "none" : materialSet,
        show: false,
        alwaysOnTop: false,
        skipTaskbar: false,
        resizable: true,
        frame: true,
        titleBarStyle: "hidden",
        titleBarOverlay: {
          color: "#00000000",
          symbolColor: colorSymbol(),
          height: 32,
        },
        hasShadow: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: false,
          nodeIntegration: true,
          nodeIntegrationInSubFrames: true,
          subpixelFontScaling: true,
          devTools: true,
          defaultFontFamily: {
            standard: "Segoe UI",
            sansSerif: "Roboto",
            serif: "Noto Serif",
            monospace: "Roboto Mono",
          },
        },
      });

      mainWindow.on("responsive", () => {
        console.log("✅ mainWindow is responsive again.");
      });

      mainWindow.webContents.on("devtools-opened", () => {
        mainWindow.webContents.send("devtools", true);
      });

      mainWindow.webContents.on("devtools-closed", () => {
        mainWindow.webContents.send("devtools", false);
      });

      mainWindow.on("minimize", () => {
        mainWindow.webContents.send("change_frametype", "interval");
        mainWindow.webContents.send("change_frametype_visual", "interval");
      });

      mainWindow.on("restore", () => {
        mainWindow.webContents.send("change_frametype", "raf");
        mainWindow.webContents.send("change_frametype_visual", "raf");
      });

      loadSFXMenu();

      ipcMain.on("select-soundeffect", () => {
        if (sfxMenu)
          sfxMenu.popup({
            window: mainWindow,
          });
      });

      ipcMain.on("open_devtools", () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;

        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          // Electron has no API to hide the dock-side menu, but DevTools can be
          // opened detached from the application window.
          mainWindow.webContents.openDevTools({ mode: "undocked" });
        }
      });

      ipcMain.on("open_devconsole", (event) => {
        if (!consoleWindow) return;

        if (consoleWindow.isVisible()) {
          consoleWindow.hide();
        } else {
          consoleWindow.show();
          consoleWindow.focus(); // optional, bring to front
        }
      });

      ipcMain.on("open_mediabrowser", (event) => {
        if (!MediaBrowserWindow) {
          createMediaBrowser().then(() => {
            console.log("Media Browser window created.");
          });
        } else {
          MediaBrowserWindow.focus();
        }
      });

      ipcMain.on("open_systemRenderer", (event) => {
        if (!systemRenderer) return;

        if (systemRenderer.isVisible()) {
          systemRenderer.hide();
        } else {
          systemRenderer.show();
          systemRenderer.focus(); // optional, bring to front
        }
      });

      mainWindow.webContents.on("render-process-gone", (event, details) => {
        if (isCrashed) return;
        isCrashed = true;

        console.error("[CRASH]", details);

        const script = path.join(
          __dirname,
          "modules",
          "powershell",
          "crash.ps1",
        );

        if (!fs.existsSync(script)) {
          console.error("[CRASH] PowerShell script not found:", script);
          app.exit(1);
          return;
        }

        const reason = details.reason || "unknown";
        const exitCode = details.exitCode ?? -1;

        if (!mainWindow.isDestroyed()) {
          mainWindow.destroy();
        }

        console.log("[CRASH] Starting PowerShell...");
        console.log("[CRASH] Reason:", reason);
        console.log("[CRASH] Exit code:", exitCode);

        const ps = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            script,
            "-Reason",
            String(reason),
            "-ExitCode",
            String(exitCode),
          ],
          {
            detached: false,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: false,
          },
        );

        ps.stdout.on("data", (data) => {
          console.log("[POWERSHELL]", data.toString());
        });

        ps.stderr.on("data", (data) => {
          console.error("[POWERSHELL ERROR]", data.toString());
        });

        ps.on("spawn", () => {
          console.log("[CRASH] PowerShell process started!");
        });

        ps.on("error", (error) => {
          console.error("[CRASH] Failed to start PowerShell:", error);
          app.exit(1);
        });

        ps.on("close", (code, signal) => {
          console.log("[CRASH] PowerShell exited:", code, signal);
          app.exit(details.exitCode ?? 1);
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
            shell.openExternal(url);
          });
          return { action: "deny" };
        }

        return { action: "deny" };
      });

      mainWindow.webContents.on("will-navigate", (event, url) => {
        if (
          !mainWindow.isDestroyed &&
          url !== mainWindow.webContents.getURL()
        ) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      addListenerWindow(mainWindow);

      const template = [];

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    function setVisualizerAspectRatio(aspectRatio) {
      const ratio = aspectRatio[0] / aspectRatio[1];
      const bool = aspectRatio[0] == 0 ? false : true;
      const windowBounds = visualizerWindow.getBounds();
      const contentBounds = visualizerWindow.getContentBounds();
      const titleBarSize = [0, windowBounds.height - contentBounds.height];
      visualizerWindow.setAspectRatio(ratio, { extraSize: titleBarSize });
      visualizerWindow.webContents.send(
        "aspect-ratio-changed",
        aspectRatio,
        bool,
      );
      currentAspectRatio = ratio;
    }

    function createVisualizerWindow() {
      return new Promise((resolve) => {
        visualizerWindow = new BrowserWindow({
          title: "External Visualizer",
          width: 480,
          height: 480,
          minWidth: 480,
          minHeight: 480,
          useContentSize: true,
          backgroundColor: bgColor,
          icon: path.join(__dirname, "icon_visualizer.png"),
          show: false,
          alwaysOnTop: false,
          minimizable: false,
          resizable: true,
          closable: true,
          frame: true, // ✅ Required for custom title bars
          autoHideMenuBar: true, // 🪄 This hides the menu bar!
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#000000",
            symbolColor: "#ffffff",
            height: 46,
          },
          hasShadow: false,
          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: true,
            backgroundThrottling: false,
            defaultFontFamily: {
              standard: "Segoe UI",
              sansSerif: "Roboto",
              serif: "Noto Serif",
              monospace: "Roboto Mono",
            },
          },
        });

        // Disable close button (prevent mainWindow from closing)
        visualizerWindow.on("close", (e) => {
          e.preventDefault();
          mainWindow.webContents.send("system-close-clicked");
        });

        // Allow minimize and maximize/restore down as normal
        // No extra code needed; those actions are not blocked

        visualizerWindow.loadFile("visualizer.html");
        setVisualizerAspectRatio([16, 9]);

        // Track aspect ratio manually since getAspectRatio is not available
        let currentAspectRatio = 16 / 9; // default

        // Add context menu for aspect ratio selection
        visualizerWindow.webContents.on("context-menu", () => {
          const aspectMenu = Menu.buildFromTemplate([
            { label: "Set Aspect Ratio", enabled: false },
            { type: "separator" },
            {
              label: "Fullscreen",
              type: "checkbox",
              checked: visualizerWindow.isFullScreen(),
              click: () => {
                visualizerWindow.setFullScreen(
                  !visualizerWindow.isFullScreen(),
                );
              },
            },
            {
              label: "Always on Top",
              type: "checkbox",
              checked: visualizerWindow.isAlwaysOnTop(),
              click: () => {
                visualizerWindow.setAlwaysOnTop(
                  !visualizerWindow.isAlwaysOnTop(),
                );
              },
            },
            { type: "separator" },
            {
              label: "16:9 (Widescreen)",
              type: "radio",
              checked: currentAspectRatio === 16 / 9,
              click: () => {
                setVisualizerAspectRatio([16, 9]);
                currentAspectRatio = 16 / 9;
              },
            },
            {
              label: "4:3 (Standard)",
              type: "radio",
              checked: currentAspectRatio === 4 / 3,
              click: () => {
                setVisualizerAspectRatio([4, 3]);
                currentAspectRatio = 4 / 3;
              },
            },
            {
              label: "1:1 (Square)",
              type: "radio",
              checked: currentAspectRatio === 1,
              click: () => {
                setVisualizerAspectRatio([1, 1]);
                currentAspectRatio = 1;
              },
            },
            {
              label: "21:9 (UltraWide)",
              type: "radio",
              checked: currentAspectRatio === 21 / 9,
              click: () => {
                setVisualizerAspectRatio([21, 9]);
                currentAspectRatio = 21 / 9;
              },
            },
            {
              label: "Unset Aspect Ratio",
              type: "radio",
              checked: currentAspectRatio === 0,
              click: () => {
                setVisualizerAspectRatio([0, 0]);
                currentAspectRatio = 0;
              },
            },
          ]);
          aspectMenu.popup({ window: visualizerWindow });
        });
        visualizerWindow.webContents.once("did-finish-load", () => {
          console.log("External Visualizer widget created.");
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    function createFontWindow() {
      return new Promise((resolve) => {
        fontWindow = new BrowserWindow({
          title: "Dialogs - Font",
          width: 400,
          minWidth: 400,
          maxWidth: 400,
          height: 480,
          minHeight: 480,
          maxHeight: 640,
          backgroundColor: bgColor,
          show: false,
          alwaysOnTop: false,
          resizable: true, // ✅ can resize
          parent: mainWindow, // Make it a child of mainWindow
          modal: true, // This blocks interaction with mainWindow
          maximizable: false, // 🚫 no maximize button
          minimizable: false,
          skipTaskbar: false,
          closable: true,
          icon: path.join(__dirname, "icon.png"),
          skipTaskbar: true,
          autoHideMenuBar: true, // 🪄 This hides the menu bar!

          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: !app.isPackaged,
          },
        });

        ["maximize"].forEach((evt) => {
          fontWindow.on(evt, (e) => {
            e.preventDefault();
          });
        });

        fontWindow.on("close", (e) => {
          fontWindow.destroy();
          fontWindow = null;
          e.preventDefault();
        });
        fontWindow.loadFile("fontselection.html");

        fontWindow.webContents.on("render-process-gone", (event, details) => {
          console.error("⚠️ Renderer process gone!", details);
          fontWindow.destroy(); // Destroy the main window to prevent further issues
          fontWindow = null;
        });

        ipcMain.on("allfontsloaded", (event) => {
          fontWindow.show();
          resolve();
        });
      });
    }

    function createColorWindow() {
      return new Promise((resolve) => {
        colorWindow = new BrowserWindow({
          title: "Dialogs - Color Picker",
          width: 640,
          minWidth: 640,
          maxWidth: 640,
          height: 480,
          minHeight: 480,
          maxHeight: 480,
          parent: mainWindow, // Make it a child of mainWindow
          modal: true, // This blocks interaction with mainWindow
          backgroundColor: bgColor,

          show: false,
          alwaysOnTop: false,
          resizable: true, // ✅ can resize
          maximizable: false, // 🚫 no maximize button
          minimizable: false,
          skipTaskbar: false,
          closable: true,
          icon: path.join(__dirname, "icon.png"),
          skipTaskbar: true,
          autoHideMenuBar: true, // 🪄 This hides the menu bar!

          webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            nodeIntegration: true,
            contextIsolation: false,
            devTools: !app.isPackaged,
          },
        });
        ["maximize"].forEach((evt) => {
          colorWindow.on(evt, (e) => {
            e.preventDefault();
          });
        });

        colorWindow.webContents.on("render-process-gone", (event, details) => {
          console.error("⚠️ Renderer process gone!", details);
          colorWindow.destroy(); // Destroy the main window to prevent further issues
          colorWindow = null;
        });

        colorWindow.on("close", (e) => {
          colorWindow.destroy(); // Destroy the main window to prevent further issues
          colorWindow = null;
          e.preventDefault();
        });

        colorWindow.loadFile("colorpicker.html");
        colorWindow.webContents.once("did-finish-load", () => {
          colorWindow.show();
          resolve();
        });
      });
    }

    function loadWindowBounds() {
      // Load window bounds from settings if available
      if (settings.windowBounds) {
        mainWindow.setBounds(settings.windowBounds);
      }

      if (settings.windowMaximized) {
        mainWindow.maximize();
      } else {
        mainWindow.show();
      }

      function saveWindowBounds() {
        if (!mainWindow.isMaximized()) {
          settings.windowBounds = mainWindow.getBounds();
          saveSettings(settings);
        }
      }

      mainWindow.on("moved", saveWindowBounds);
      mainWindow.on("resized", saveWindowBounds);

      mainWindow.on("maximize", () => {
        settings.windowMaximized = true;
        saveSettings(settings);
      });

      mainWindow.on("unmaximize", () => {
        settings.windowMaximized = false;
        settings.windowBounds = mainWindow.getBounds();
        saveSettings(settings);
      });
    }

    createMain();

    async function getRegularFonts() {
      try {
        const detailed = await getFonts2({ disableQuoting: true });
        const regularFamilies = new Set();

        detailed.forEach((font) => {
          const style = (font.style || "").toLowerCase();
          const weight = (font.weight || "").toLowerCase();

          const isBold = style.includes("bold") || weight.includes("bold");

          const isItalic =
            style.includes("italic") || weight.includes("italic");

          if (!isBold && !isItalic) {
            regularFamilies.add(font.familyName);
          }
        });

        return Array.from(regularFamilies).sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: "base" }),
        );
      } catch (err) {
        console.error("Font access error:", err);
        return [];
      }
    }

    async function createWindows() {
      await delay(1000);
      splashWindow.webContents.send("onload", "Loading fonts...");
      splashWindow.webContents.send("onload", "Loading widgets...");
      await createConsole();
      await createSystemRenderer();
      await createPresenterView();
      await createLyricView();
      await createVisualizerWindow();
      splashWindow.webContents.send("onload", "Loading workspace...");
      mainWindow.loadFile("workspace.html");
      loadWindowBounds();
    }

    function createSplash() {
      console.log("Initiating App... Please wait...");
      return new Promise((resolve) => {
        splashWindow = new BrowserWindow({
          title: "APLoading Screen",
          width: 800,
          height: 400,
          backgroundColor: "#00000000",
          icon: path.join(__dirname, "icon.png"),
          minimizable: false,
          parent: mainWindow,
          modal: true, // start non-modal
          resizable: false,
          show: false,
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#00000000",
            symbolColor: "#ffffff",
            height: 46,
          },
          autoHideMenuBar: true,
          skipTaskbar: false,
          webPreferences: {
            backgroundThrottling: false,
            contextIsolation: false,
            nodeIntegration: true,
            devTools: false,
            preload: path.join(__dirname, "preload.js"),
          },
        });
        splashWindow.loadFile("splash.html");

        splashWindow.on("close", (e) => {
          e.preventDefault();
          if (!splashWindowClose) {
            app.exit(0);
          }
        });

        splashWindow.webContents.once("did-finish-load", () => {
          splashWindow.show();
          createWindows();
          console.log("Initiated.");
          resolve(); // ← THIS is what await waits for
        });
      });
    }

    await createSplash();

    // Disable Play/Pause
    // Register global media keys here
    globalShortcut.register("MediaPlayPause", () => {});
    globalShortcut.register("MediaNextTrack", () => {});
    globalShortcut.register("MediaPreviousTrack", () => {});
    globalShortcut.register("CommandOrControl+Shift+R", () => {});

    function notification(data) {
      const notification = new Notification({
        title: data.title,
        body: data.body,
        silent: data.silent ?? false, // default silent
      });

      notification.show();
    }

    function createTray() {
      const contextMenu = Menu.buildFromTemplate([
        { label: "VJDY FM Sound Effects Studio", enabled: false },
        {
          label: "Options",
          submenu: [
            {
              label: "Exit App",
              icon: icon_option1,
              click: () => app.exit(0),
            },
            {
              label: "Restart App",
              icon: icon_option2,
              click: () => restartApp(),
            },
            ...(!app.isPackaged
              ? [
                  { type: "separator" }, // ← This adds the divider line
                  {
                    label: "Debug",
                    icon: icon_option3,
                    click: () => {
                      mainWindow.webContents.openDevTools();
                    },
                  },
                  {
                    label: "Debug Visualizer",
                    icon: icon_option3,
                    click: () => visualizerWindow.webContents.openDevTools(),
                  },
                  {
                    label: "Debug Console",
                    icon: icon_option3,
                    click: () => consoleWindow.webContents.openDevTools(),
                  },
                  {
                    label: "Debug Media Browser",
                    icon: icon_option3,
                    click: () => MediaBrowserWindow.webContents.openDevTools(),
                  },
                ]
              : []),
          ],
        },
      ]);

      tray.setContextMenu(contextMenu);
      tray.on("click", () => {
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
      console.log("⚠️ mainWindow is unresponsive!");
      const soundPath = path.join(__dirname, "audio", "render_crash.wav"); // your file
      exec(
        `powershell -c (New-Object Media.SoundPlayer '${soundPath}').PlaySync();`,
        { shell: "cmd.exe" },
      );

      // Destroy the window immediately
      if (!mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
      // Show a notification instead of dialog
      const notification = new Notification({
        title: "Main Studio has stopped responding!",
        body: "Sound Effects Studio detected an unexpected renderer crash in Main Studio. The app will now be restarted. We apologize for the inconvenience.",
        icon: path.join(__dirname, "icons", "messagebox", "sad-face.png"),
      });

      notification.show();
      restartApp();
    }

    function getIconForTheme(isDark) {
      return path.join(
        __dirname,
        isDark ? "images/tray/icon-dark.png" : "images/tray/icon-light.png",
      );
    }

    const sfxPath = path.join(
      app.getPath("appData"),
      "VJDY FM Sound Effects Studio",
      "assets",
      "sfx",
    );
    if (fs.existsSync(sfxPath)) {
      // Send message to renderer
      mainWindow.webContents.on("did-finish-load", () => {
        mainWindow.webContents.send("sfx-status", { text: "Update Pack" });
      });
    } else {
      mainWindow.webContents.on("did-finish-load", () => {
        mainWindow.webContents.send("sfx-status", { text: "Install Pack" });
      });
    }

    ipcMain.on("toggle-maximize", () => {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    });

    ipcMain.on("window-action", (event, action, type) => {
      if (action === "minimize") {
        mainWindow.minimize();
      } else if (action === "full-scr") {
        mainWindow.setFullScreen(true);
      } else if (action === "maximize") {
        if (mainWindow.isFullScreen()) {
          mainWindow.setFullScreen(false);
        } else if (mainWindow.isMaximized()) {
          mainWindow.unmaximize(); // restore down
        } else {
          mainWindow.maximize(); // maximize
        }
      } else if (action === "reset-app") {
        fs.rmSync(settingsPath, { force: true });
        restartApp();
      } else if (action === "close-permanent") {
        if (type == "RESTART_APP") {
          restartApp();
        } else if (type == "RESTART") {
          app.exit(0);
          exec("shutdown -r -f -t 0");
        } else if (type == "SHUTDOWN") {
          app.exit(0);
          exec("shutdown -s -f -t 0");
        } else if (type == "HIBERNATE") {
          app.exit(0);
          exec("shutdown -h");
        } else if (type == "LOGOFF") {
          app.exit(0);
          exec("shutdown -l");
        } else {
          app.exit(0);
        }
      } else if (action === "openMain") {
        console.log("true");
      } else if (action === "initSound") {
        if (splashWindow && !splashWindow.isDestroyed()) {
          splashWindow.webContents.send("playInitSound");
        }
      } else if (action === "windows-soundsettings") {
        exec("start ms-settings:sound", { shell: "cmd.exe" });
      } else if (action === "windows-openvolumemixer") {
        exec("start ms-settings:apps-volume", { shell: "cmd.exe" });
      } else if (action === "windows-legacy-soundsettings") {
        exec("control mmsys.cpl", { shell: "cmd.exe" });
      } else if (action === "windows-legacy-openvolumemixer") {
        exec("sndvol.exe", { shell: "cmd.exe" });
      }
    });

    mainWindow.webContents.once("did-finish-load", async () => {
      createTray();
      splashWindowClose = true;

      mainWindow.webContents.send("hwtoggle", hwvalue);
      mainWindow.webContents.send("acrylictoggle", forceAcrylicWindow);
      mainWindow.webContents.send(
        "high-contrast-state",
        nativeTheme.shouldUseHighContrastColors,
      );
      mainWindow.webContents.send("win11-state", isWindows11);
      mainWindow.webContents.send("scale-updated", scale);

      setTimeout(() => {
        splashWindow.destroy();

        const file = firstFile.find(
          (arg) => typeof arg === "string" && detectFileSupport(arg),
        );

        if (file) {
          handleFile(file);
        }

        if (settings.firsttime) {
          createWelcome();
        }
      }, 3500);

      const gpuInfo = await app.getGPUInfo("basic");
      const hasGPU =
        gpuInfo && gpuInfo.auxAttributes && gpuInfo.auxAttributes.glRenderer;

      // Send status to renderer
      mainWindow.webContents.send("gpu-acceleration-support", !!hasGPU);
    });

    ipcMain.on("readynow", (event) => {
      mainWindow.webContents.send("fadeIn");
    });

    mainWindow.on("close", (e) => {
      e.preventDefault(); // Prevent the default close action
      mainWindow.webContents.send("dialog-close");
    });

    let skipFrames = 0;
    let frameCounter = 0;
    let RATESKIP = 1; // default FPS

    function shouldSendFrame() {
      const effectiveSkip = skipFrames === 0 ? RATESKIP : skipFrames;
      frameCounter++;
      return frameCounter % effectiveSkip === 0;
    }

    ipcMain.on("frames", (event, skips) => {
      skipFrames = skips;
    });

    ipcMain.on("welcome", (event) => {
      createWelcome();
    });

    ipcMain.on("font-selected", (event, fontFamily) => {
      console.log("User selected font:", fontFamily);
      fontWindow.destroy();
      fontWindow = null;
      mainWindow.webContents.send("apply-font", fontFamily);
    });

    updateWindowColor();

    ipcMain.on("set-hw-acceleration", (event, enabled) => {
      settings.hardwareAcceleration = enabled;
      saveSettings(settings);
      event.reply("hw-acceleration-updated", enabled);
    });

    ipcMain.on("set-force-acrylic", (event, enabled) => {
      // 1️⃣ Save in settings JSON
      settings.forceAcrylic = enabled;
      saveSettings(settings); // your existing JSON save function
      event.reply("force-acrylic-updated", enabled);
    });

    ipcMain.on("set-force-scale", (event, scale) => {
      // 1️⃣ Clamp scale
      let clamped = scale;

      // 2️⃣ Save in settings JSON
      settings.forceScale = clamped;
      saveSettings(settings);

      // 3️⃣ Notify renderer
      event.reply("force-scale-updated", clamped);
    });

    function createMap() {
      mapWindow = new BrowserWindow({
        title: "Dialogs - Map Selector",
        width: 1280,
        height: 800,
        minWidth: 1280,
        minHeight: 800,
        backgroundColor: colorset(),
        useContentSize: true,
        parent: mainWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          devTools: !app.isPackaged,
        },
      });

      // mapWindow.webContents.openDevTools({});

      mapWindow.loadFile("map.html");

      mapWindow.on("closed", (event) => {
        mapWindow = null;
      });

      const template = [
        {
          label: "Reload",
          click: () => mapWindow.webContents.reload(),
        },
      ];

      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }

    ipcMain.on("map", (event) => {
      createMap();
    });

    // Listen to coordinates from map window
    ipcMain.on("map-click", (event, coords) => {
      dialog
        .showMessageBox(mapWindow, {
          type: "info",
          title: "Coordinates",
          message: "Coordinates Selected",
          detail: `Latitude: ${coords.lat}\nLongitude: ${coords.lng}`,
          buttons: ["Cancel", "OK"],
          defaultId: 1,
          cancelId: 0,
        })
        .then((result) => {
          if (result.response === 1) {
            mainWindow.webContents.send("update-coords", coords);
            mapWindow.close();
          }
        });
    });

    ipcMain.on("AboutExecute", (event) => {
      if (aboutWindow[0]) {
        return;
      }
      // Center the aboutWindow[0] based on mainWindow's position and size
      const mainBounds = mainWindow.getBounds();
      const aboutWidth = 800;
      const aboutHeight = 700;
      const x = mainBounds.x + Math.round((mainBounds.width - aboutWidth) / 2);
      const y =
        mainBounds.y + Math.round((mainBounds.height - aboutHeight) / 2);

      aboutWindow[0] = new BrowserWindow({
        width: aboutWidth,
        minWidth: aboutWidth,
        maxWidth: aboutWidth,
        height: aboutHeight,
        minHeight: aboutHeight,
        maxHeight: 700,
        x,
        y,
        title: "About",
        icon: path.join(__dirname, "icon.png"),
        parent: mainWindow, // Make it a child of mainWindow
        modal: true, // This blocks interaction with mainWindow
        maximizable: false, // 🚫 no maximize button
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
        },
      });

      // aboutWindow[0].webContents.openDevTools();

      aboutWindow[0].loadFile("about.html");

      // Cleanup reference when closed
      aboutWindow[0].on("closed", () => {
        aboutWindow[0] = null;
      });

      // aboutWindow[0].webContents.openDevTools({});

      // 🧠 Intercept any attempt to open a new window (target="_blank", etc.)
      aboutWindow[0].webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); // Open in default browser
        return { action: "deny" }; // Prevent Electron from opening it internally
      });

      // 🚫 Prevent navigation to external sites inside the same window
      aboutWindow[0].webContents.on("will-navigate", (event, url) => {
        if (url !== mainWindow.webContents.getURL()) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      aboutWindow[0].webContents.on("before-input-event", (event, input) => {
        if (input.key === "Escape") {
          aboutWindow[0].close();
        }
      });

      aboutWindow[0].webContents.on("did-finish-load", (e) => {
        aboutWindow[0].webContents.send(
          "sendInfo",
          electronBuilderVersion,
          appVersion,
          chromiumVersion,
          electronVersion,
          nodeVersion,
          buildID,
        );
        aboutWindow[0].show();
      });
    });

    ipcMain.on("AboutElectron", (event) => {
      if (aboutWindow[1]) {
        return;
      }
      // Center the aboutWindow[1] based on mainWindow's position and size
      const mainBounds = mainWindow.getBounds();
      const aboutWidth = 800;
      const aboutHeight = 700;
      const x = mainBounds.x + Math.round((mainBounds.width - aboutWidth) / 2);
      const y =
        mainBounds.y + Math.round((mainBounds.height - aboutHeight) / 2);

      aboutWindow[1] = new BrowserWindow({
        width: aboutWidth,
        minWidth: aboutWidth,
        maxWidth: aboutWidth,
        height: aboutHeight,
        minHeight: aboutHeight,
        maxHeight: 700,
        x,
        y,
        title: "About",
        icon: path.join(__dirname, "icon.png"),
        parent: mainWindow, // Make it a child of mainWindow
        modal: true, // This blocks interaction with mainWindow
        maximizable: false, // 🚫 no maximize button
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
        },
      });

      // aboutWindow[1].webContents.openDevTools();

      aboutWindow[1].loadFile("aboutelectron.html");

      // Cleanup reference when closed
      aboutWindow[1].on("closed", () => {
        aboutWindow[1] = null;
      });

      // aboutWindow[1].webContents.openDevTools({});

      // 🧠 Intercept any attempt to open a new window (target="_blank", etc.)
      aboutWindow[1].webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url); // Open in default browser
        return { action: "deny" }; // Prevent Electron from opening it internally
      });

      // 🚫 Prevent navigation to external sites inside the same window
      aboutWindow[1].webContents.on("will-navigate", (event, url) => {
        if (url !== mainWindow.webContents.getURL()) {
          event.preventDefault();
          shell.openExternal(url);
        }
      });

      aboutWindow[1].webContents.on("before-input-event", (event, input) => {
        if (input.key === "Escape") {
          aboutWindow[1].close();
        }
      });

      aboutWindow[1].webContents.on("did-finish-load", (e) => {
        aboutWindow[1].webContents.send(
          "sendInfo",
          electronBuilderVersion,
          appVersion,
          chromiumVersion,
          electronVersion,
          nodeVersion,
          buildID,
        );
        aboutWindow[1].show();
      });
    });

    ipcMain.on("announce-batterylow", (event, text, title) => {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: "warning",
          title: "Sound Effects Studio Battery Alarm System",
          message: title,
          detail: text,
          buttons: ["OK"],
        });
      }
    });

    ipcMain.on("open-devtools", (event) => {
      mainWindow.webContents.openDevTools();
    });

    ipcMain.on("sendcolor", (event, firstColor, secondColor) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("sendcolor", firstColor, secondColor);
      }
    });

    ipcMain.on("video-adjustment-settings", (event, adjustmentSettings) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send(
          "update-video-settings",
          adjustmentSettings,
        );
      }
    });

    ipcMain.on("caption-settings-updated", (event, data) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("caption-settings-updated", data);
      }
    });

    ipcMain.on("sendbgcolor", (event, bgColor) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("sendbgcolor", bgColor);
      }
    });

    ipcMain.on("sendWaveformAlignment", (event, setAlignment) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send(
          "sendWaveformAlignment",
          setAlignment,
        );
      }
    });

    ipcMain.on("sendWaveformType", (event, index) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("sendWaveformType", index);
      }
    });

    ipcMain.on(
      "sendFilter",
      (
        event,
        brightnessValue,
        grayscaleValue,
        sepiaValue,
        backdropblurValue,
        blurMultiplier,
        angleValue,
      ) => {
        if (visualizerWindow && !visualizerWindow.isDestroyed()) {
          visualizerWindow.webContents.send(
            "sendFilter",
            brightnessValue,
            grayscaleValue,
            sepiaValue,
            backdropblurValue,
            blurMultiplier,
            angleValue,
          );
        }
      },
    );

    ipcMain.on("show-text", (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("show-textoverlay", message);
      }
      mainWindow.webContents.send("show-osd", message);
    });

    ipcMain.on("show-lyrics-mediaA", (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("show-lyricsA", message);
      }
    });

    ipcMain.on("show-lyrics-mediaB", (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("show-lyricsB", message);
      }
    });

    ipcMain.on("show-lyrics-mediaC", (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("show-lyricsC", message);
      }
    });

    ipcMain.on("show-lyrics-mediaD", (event, message) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("show-lyricsD", message);
      }
    });

    ipcMain.on("toggle-lyrics", (event, bool) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("toggle-lyrics", bool);
      }
    });

    ipcMain.on("toggle-visualiser", (event, letVisualser) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        if (letVisualser) {
          visualizerWindow.show();
        } else {
          visualizerWindow.hide();
        }
      }
    });

    ipcMain.on("set-fullscreen", (event, fullscreen) => {
      const visualizerWindow = BrowserWindow.fromWebContents(event.sender);
      visualizerWindow.setFullScreen(fullscreen);
    });

    ipcMain.on("set-pinwindow", (event, bool) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      window.setAlwaysOnTop(bool);
      window.webContents.send("icon-pinwindow", bool);
    });

    ipcMain.on("set-zoom", (event, dpi) => {
      let scale = dpi;

      if (dpi > 1.5) scale = 1.5;
      if (dpi < 1) scale = 1;

      app.commandLine.appendSwitch("force-device-scale-factor", String(scale));
    });

    ipcMain.on("set-fullscreenmain", (event, fullscreen) => {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      mainWindow.setFullScreen(fullscreen);
    });

    ipcMain.on("notify", (event, data) => {
      const notification = new Notification({
        title: data.title,
        body: data.body,
        silent: data.silent ?? true, // default silent
      });

      notification.show();
    });

    ipcMain.on("teleprompt_output", (event, htmlLine) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("teleprompt_output", htmlLine);
      }
    });

    ipcMain.on("font-teleprompt", (event, result) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("font-teleprompt", result);
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
        noLink: true, // avoids special styling
        modal: false, // don't block main window
      });
    });

    ipcMain.on("send-visualizer-data", (event, dataArray) => {
      if (
        visualizerWindow &&
        !visualizerWindow.isDestroyed() &&
        visualizerWindow.isVisible()
      ) {
        visualizerWindow.webContents.send("visualizer-update", dataArray);
      }
    });

    ipcMain.on("send-level-data", (event, dataL, dataR) => {
      if (vumeter && !vumeter.isDestroyed() && vumeter.isVisible()) {
        vumeter.webContents.send("vumeter-update", dataL, dataR);
      }
    });

    ipcMain.on("send-peakscale", (event, dataL, dataR) => {
      if (
        visualizerWindow &&
        !visualizerWindow.isDestroyed() &&
        visualizerWindow.isVisible()
      ) {
        visualizerWindow.webContents.send("vumeter-update", dataL, dataR);
      }
    });

    ipcMain.on("video-src", (event, src) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("video-src", src);
      }
    });

    ipcMain.on("video-status", (event, status) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("video-status", status);
      }
    });

    ipcMain.on("video-playsrc", (event, data) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("video-playsrc", data);
      }
    });

    ipcMain.on("video-hidden", (event, bool) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("video-hidden", bool);
      }
    });

    ipcMain.on("video-reconnect", (event, bool) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("video-reconnect", bool);
      }
    });

    ipcMain.on("set-subtitle", (event, src, value) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("set-subtitle", src, value);
      }
    });

    ipcMain.on("changingDeck", (event, deckAppend) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("changingDeck", deckAppend);
      }
    });

    ipcMain.on("changeNativeTheme", (event, mode) => {
      nativeTheme.themeSource = mode;
    });

    ipcMain.on("perform-import-media", (event, filePath, assignedDeck) => {
      mainWindow.webContents.send(
        "perform-import-media",
        filePath,
        assignedDeck,
      );
    });

    ipcMain.on("open-color-dialog", async (event, currentColor) => {
      await createColorWindow();
      colorWindow.webContents.send("current-color", currentColor);
    });

    ipcMain.on("color-selected", (event, color) => {
      colorWindow.destroy();
      colorWindow = null;
      mainWindow.webContents.send("apply-color", color);
    });

    ipcMain.on("colorpicker-close", (event) => {
      colorWindow.destroy();
      colorWindow = null;
    });

    let teleprompterLines = [];

    ipcMain.on("teleprompter:lines:set", (event, lines) => {
      teleprompterLines = lines;

      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        presenterwindow.webContents.send(
          "teleprompter:lines:updated",
          teleprompterLines,
        );
      }
    });

    ipcMain.on("teleprompter:lines:remove", (event) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        presenterwindow.webContents.send("teleprompter:lines:remove");
      }
    });

    ipcMain.on("teleprompter:goto", (event, lineId) => {
      mainWindow.webContents.send("teleprompter:jump", lineId);
    });

    ipcMain.on("open_teleprompter", (event) => {
      if (!presenterwindow) return;

      if (presenterwindow.isVisible()) {
        presenterwindow.hide();
      } else {
        presenterwindow.show();
        presenterwindow.focus(); // optional, bring to front
      }
    });

    ipcMain.on("telepromptbg", (event, id, value) => {
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("telepromptbg", id, value);
      }
    });

    ipcMain.on("open_lyrics", (event, deckId) => {
      if (!lyricswindow) return;

      lyricswindow.webContents.send("showlyrics-bydeck", deckId);
      if (!lyricswindow.isVisible()) {
        lyricswindow.show();
      }
      lyricswindow.focus(); // optional, bring to front
    });

    ipcMain.on("sendlyrics", (event, deckId, text) => {
      if (!lyricswindow) return;
      lyricswindow.webContents.send("sendlyrics-bydeck", deckId, text);
    });

    ipcMain.on("removelyrics", (event, deckId) => {
      if (!lyricswindow) return;
      lyricswindow.webContents.send("removelyrics-bydeck", deckId);
    });

    ipcMain.on("image-rendering-change", (event, value) => {
      console.log("Image Rendering changed:", value);
      if (visualizerWindow && !visualizerWindow.isDestroyed()) {
        visualizerWindow.webContents.send("image-rendering-change", value);
      }
    });

    ipcMain.on("colorsavestate", (e) => {
      colorWindow?.webContents.send("colorsavestate");
      fontWindow?.webContents.send("colorsavestate");
      consoleWindow?.webContents.send("colorsavestate");
    });

    ipcMain.on("renderer-log", (event, payload) => {
      if (consoleWindow && !consoleWindow.isDestroyed()) {
        consoleWindow.webContents.send("renderer-log", payload);
      }

      if (payload.event == "clear") {
        console.clear();
      }
    });

    // Main process
    ipcMain.on("open-image-viewer", (event, data) => {
      const imageWindow = new BrowserWindow({
        width: 600,
        height: 600,
        resizable: true,
        maximizable: true,
        minimizable: false,
        skipTaskbar: false,
        autoHideMenuBar: true,
        modal: true,
        parent: mainWindow,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
        },
      });

      imageWindow.loadFile("imageview.html", {
        query: {
          src: data.src,
        },
      });
    });

    ipcMain.on("video-frame-A", (e, frame) => {
      if (!visualizerWindow || visualizerWindow.isDestroyed()) return;
      visualizerWindow.webContents.send("visualizer:frame", frame);
    });

    ipcMain.on("video-frame-B", (e, frame) => {
      if (!visualizerWindow || visualizerWindow.isDestroyed()) return;
      visualizerWindow.webContents.send("visualizer:frame", frame);
    });

    ipcMain.on("close-this-window", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.close(); // triggers normal close events
    });

    ipcMain.on("description", (event, { title, message }) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      dialog.showMessageBox(win, {
        type: "info",
        title: "Effect Information",
        message: title,
        detail: message,
        buttons: ["Close"],
      });
    });

    ipcMain.on(
      "alert",
      (
        _,
        msg = "No message provided",
        title = "No message provided",
        needsrestart = false,
        needsexit = false,
        hideOKButton = false,
      ) => {
        // Build the buttons array dynamically
        const buttons = [];
        if (!hideOKButton) buttons.push("OK");
        if (needsrestart) buttons.push("Restart");
        if (needsexit) buttons.push("Exit");

        dialog
          .showMessageBox(mainWindow || null, {
            type: "warning",
            title: "VJDY FM Sound Effects Studio",
            message: title,
            detail: String(msg),
            buttons,
          })
          .then(({ response }) => {
            if (response === buttons.indexOf("Restart")) {
              restartApp();
            } else if (response === buttons.indexOf("Exit")) {
              app.exit(0);
            }
          });
      },
    );

    ipcMain.handle("choice-dialog", async (event, options) => {
      const result = await dialog.showMessageBox(mainWindow || null, {
        type: "question",
        buttons: ["Cancel", "Yes"],
        defaultId: 1,
        cancelId: 0,
        title: "VJDY FM Sound Effects Studio",
        message: options.title,
        detail: options.message,
      });

      return result.response === 1; // true if Confirm
    });

    // --- Classic “Page Unresponsive” handler ---
    mainWindow.webContents.on("unresponsive", () => {
      ForceCloseMainStudio();
    });

    mainWindow.webContents.on("responsive", () => {
      console.log("Renderer recovered from freeze.");
    });

    ipcMain.on("custom-print", (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);

      win.webContents.print({
        silent: false,
        printBackground: true,
        color: true,
      });
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
