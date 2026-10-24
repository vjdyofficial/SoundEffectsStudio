const fs = require("fs");
const path = require("path");
const os = require("os");
const { ipcRenderer } = require("electron");

const mm = require("music-metadata");

const beforeUnloadHandler = (e) => {
  if (window.location.origin.startsWith("file://")) {
    e.preventDefault();
    console.warn(
      "%cNavigation has been blocked.%c" +
        "Sound Effects Studio causes unstable functionality and things might not work after reload. " +
        "So, This warning will show to avoid causing bugs and unstable to its functionality. " +
        "To reload. You must go to Settings > Advanced > Restart Media Browser in the main renderer. \n\n" +
        "Sound Effects Studio is not allowed to navigate to other websites " +
        "since this is a standalone application. I know it was built on " +
        "Chromium but we blocked it to prevent accessing the remote content " +
        "especially Node Modules was enabled and loaded on this application. \n\n" +
        "This applies to all windows including " +
        "The Main Studio, Widgets, Viewers, and Developer Console.",
      "font-weight: bold; font-size: 24px;",
      "font-weight: normal; font-size: 12px;",
    );
  }
};

window.addEventListener("beforeunload", beforeUnloadHandler);

// overwrite window.print
window.print = () => {
  console.warn(
    "%cPrinting to this app has been blocked.%c" +
      "Sound Effects Studio will not allowed to print the app. instead, Use screenshot to send feedback.",
    "font-weight: bold; font-size: 24px;",
    "font-weight: normal; font-size: 12px;",
  );
};

// override
window.close = () => {
  // 1️⃣ remove beforeunload listener so close is not blocked
  window.removeEventListener("beforeunload", beforeUnloadHandler);

  // 2️⃣ call original close or use IPC if you want main process control
  // originalClose(); // optional
  ipcRenderer.send("close-this-window");
};

window.confirm = () => {
  console.warn(
    "%cNative Confirm has been blocked.%c" +
      "Sound Effects Studio will not allowed to use the native confirm dialog. instead, use a custom dialog." +
      "font-weight: bold; font-size: 24px;",
    "font-weight: normal; font-size: 12px;",
  );
};

// ============================================================
// CONFIG
// ============================================================

var MEDIA_ROOT = "C:\\Users\\Vinscent Joshua\\Music\\VJDY FM - Radio Music";

const SUPPORTED_EXTENSIONS = new Set([
  ".mp3",
  ".flac",
  ".wav",
  ".m4a",
  ".ogg",
  ".opus",
  ".webm",
  ".mp4",
  ".3gp",
  ".mkv",
  ".mov",
]);

// ============================================================
// DOM
// ============================================================

const mediaSearch = document.getElementById("mediaSearch");

const mediaFilter = document.getElementById("mediaFilter");

const mediaRefresh = document.getElementById("mediaRefresh");

const mediaLocation = document.getElementById("mediaLocation");

const mediaTableBody = document.getElementById("mediaTableBody");

const mediaCount = document.getElementById("mediaCount");

const mediaStatus = document.getElementById("mediaStatus");

// ============================================================
// STATE
// ============================================================

let mediaFiles = [];

// ============================================================
// INITIALIZATION
// ============================================================

// ============================================================
// RECURSIVE DIRECTORY SCANNER
// ============================================================

function findMediaFiles(directory) {
  const results = [];

  let entries;

  try {
    entries = fs.readdirSync(directory, {
      withFileTypes: true,
    });
  } catch (error) {
    console.error(
      "[Media Browser] Failed to read directory:",
      directory,
      error,
    );

    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();

    if (SUPPORTED_EXTENSIONS.has(extension)) {
      results.push(fullPath);
    }
  }

  return results;
}

// ============================================================
// MEDIA SCANNER
// ============================================================

async function scanMedia() {
  mediaStatus.textContent = "Scanning...";
  mediaTableBody.innerHTML = "";
  mediaFiles = [];

  if (!fs.existsSync(MEDIA_ROOT)) {
    mediaStatus.textContent = "Folder not found";

    console.error("[Media Browser] Folder does not exist:", MEDIA_ROOT);

    return;
  }

  const files = findMediaFiles(MEDIA_ROOT);

  console.log("[Media Browser] Found files:", files.length);

  for (const filePath of files) {
    try {
      const metadata = await mm.parseFile(filePath);

      mediaFiles.push({
        path: filePath,

        name: path.basename(filePath),

        extension: path.extname(filePath).slice(1).toLowerCase(),

        title:
          metadata.common.title ||
          path.basename(filePath, path.extname(filePath)),

        artist: metadata.common.artist || "—",

        album: metadata.common.album || "—",

        duration: metadata.format.duration || 0,

        sampleRate: metadata.format.sampleRate || 0,

        channels: metadata.format.numberOfChannels || 0,
      });
    } catch (error) {
      console.warn("[Media Browser] Failed to read metadata:", filePath, error);

      /*
       * Still show the file even if
       * metadata extraction fails.
       */

      mediaFiles.push({
        path: filePath,

        name: path.basename(filePath),

        extension: path.extname(filePath).slice(1).toLowerCase(),

        title: path.basename(filePath, path.extname(filePath)),

        artist: "—",

        album: "—",

        duration: 0,

        sampleRate: 0,

        channels: 0,
      });
    }
  }

  renderMedia();

  mediaStatus.textContent = "Ready";
}

const mediaChannel = new BroadcastChannel("sfxstudio-media-browser");

// ============================================================
// RENDER MEDIA TABLE
// ============================================================

function renderMedia() {
  const search = mediaSearch.value.trim().toLowerCase();

  const filter = mediaFilter.value;

  mediaTableBody.innerHTML = "";

  const filtered = mediaFiles.filter((media) => {
    const matchesSearch =
      !search ||
      media.name.toLowerCase().includes(search) ||
      media.title.toLowerCase().includes(search) ||
      media.artist.toLowerCase().includes(search) ||
      media.album.toLowerCase().includes(search);

    const matchesFilter = filter === "all" || media.extension === filter;

    return matchesSearch && matchesFilter;
  });

  for (const media of filtered) {
    const row = document.createElement("tr");

    // ----------------------------------------------------
    // NAME
    // ----------------------------------------------------

    const nameCell = document.createElement("td");

    nameCell.textContent = media.name;

    row.title = media.name + "\n" + "Click to import.";

    // ----------------------------------------------------
    // ARTIST
    // ----------------------------------------------------

    const artistCell = document.createElement("td");

    artistCell.textContent = media.artist;

    // ----------------------------------------------------
    // ALBUM
    // ----------------------------------------------------

    const albumCell = document.createElement("td");

    albumCell.textContent = media.album;

    // ----------------------------------------------------
    // DURATION
    // ----------------------------------------------------

    const durationCell = document.createElement("td");

    durationCell.textContent = formatDuration(media.duration);

    // ----------------------------------------------------
    // FORMAT
    // ----------------------------------------------------

    const formatCell = document.createElement("td");

    formatCell.textContent = media.extension.toUpperCase();

    // ----------------------------------------------------
    // SAMPLE RATE
    // ----------------------------------------------------

    const sampleRateCell = document.createElement("td");

    sampleRateCell.textContent = media.sampleRate
      ? `${media.sampleRate} Hz`
      : "—";

    // ----------------------------------------------------
    // CHANNELS
    // ----------------------------------------------------

    const channelsCell = document.createElement("td");
    channelsCell.textContent = formatChannels(media.channels);

    // ----------------------------------------------------
    // ACTION
    // ----------------------------------------------------

    row.addEventListener("click", () => {
      sendMediaToMainRenderer(media);
    });

    // ----------------------------------------------------
    // ROW
    // ----------------------------------------------------

    row.appendChild(nameCell);
    row.appendChild(artistCell);
    row.appendChild(albumCell);
    row.appendChild(durationCell);
    row.appendChild(formatCell);
    row.appendChild(sampleRateCell);
    row.appendChild(channelsCell);

    mediaTableBody.appendChild(row);
  }

  mediaCount.textContent = `${filtered.length} media file${
    filtered.length === 1 ? "" : "s"
  }`;
}

// ============================================================
// SEND MEDIA TO MAIN RENDERER
// ============================================================

function sendMediaToMainRenderer(media) {
  const payload = {
    type: "MEDIA_SEND",

    path: media.path,

    name: media.name,

    title: media.title,

    artist: media.artist,

    album: media.album,

    extension: media.extension,

    duration: media.duration,

    sampleRate: media.sampleRate,

    channels: media.channels,
  };

  console.log("[Media Browser] Sending media:", payload);
  mediaChannel.postMessage(payload);
}

// ============================================================
// SEARCH
// ============================================================

mediaSearch.addEventListener("input", () => {
  renderMedia();
});

// ============================================================
// FILTER
// ============================================================

mediaFilter.addEventListener("change", () => {
  renderMedia();
});

// ============================================================
// REFRESH
// ============================================================

mediaRefresh.addEventListener("click", () => {
  scanMedia();
});

// ============================================================
// FORMAT DURATION
// ============================================================

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }

  const totalSeconds = Math.floor(seconds);

  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const secs = totalSeconds % 60;

  if (hours > 0) {
    return (
      `${hours}:` +
      `${String(minutes).padStart(2, "0")}:` +
      `${String(secs).padStart(2, "0")}`
    );
  }

  return (
    `${String(minutes).padStart(2, "0")}:` + `${String(secs).padStart(2, "0")}`
  );
}

// ============================================================
// FORMAT CHANNELS
// ============================================================

function formatChannels(channels) {
  if (!channels) {
    return "—";
  }

  if (channels === 1) {
    return "Mono";
  }

  if (channels === 2) {
    return "Stereo";
  }

  return `${channels} ch`;
}

const MEDIA_LIBRARY_STORAGE_KEY = "sfxstudio_media_library_directories";
const mediaLibraryContainer = document.querySelector(".directories");

// ============================================================
// GET SAVED LIBRARIES
// ============================================================

function getMediaLibraryDirectories() {
  try {
    const stored = localStorage.getItem(MEDIA_LIBRARY_STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const directories = JSON.parse(stored);

    if (!Array.isArray(directories)) {
      return [];
    }

    return directories;
  } catch (error) {
    console.error("[Media Library] Failed to read saved libraries:", error);

    return [];
  }
}

// ============================================================
// SAVE LIBRARIES
// ============================================================

function saveMediaLibraryDirectories(directories) {
  try {
    localStorage.setItem(
      MEDIA_LIBRARY_STORAGE_KEY,
      JSON.stringify(directories),
    );
  } catch (error) {
    console.error("[Media Library] Failed to save libraries:", error);
  }
}

// ============================================================
// GET FOLDER NAME
// ============================================================

function getDirectoryName(directoryPath) {
  if (!directoryPath) {
    return "Media Library";
  }

  const normalizedPath = directoryPath.replace(/[\\/]+$/, "");

  const parts = normalizedPath.split(/[\\/]/);

  return parts[parts.length - 1] || directoryPath;
}

const builtInMediaLibraries = [
  { id: "builtin-downloads", name: "Downloads", folder: "Downloads", icon: "downloads" },
  { id: "builtin-documents", name: "Documents", folder: "Documents", icon: "documents" },
  { id: "builtin-music", name: "Music", folder: "Music", icon: "music_2" },
  { id: "builtin-pictures", name: "Pictures", folder: "Pictures", icon: "image" },
  { id: "builtin-videos", name: "Videos", folder: "Videos", icon: "movie" },
].map((library) => ({
  ...library,
  path: path.join(os.homedir(), library.folder),
  builtIn: true,
}));

function saveMediaLibraryDirectoryOrder() {
  const directories = getMediaLibraryDirectories();
  const directoriesById = new Map(
    directories.map((directory) => [directory.id, directory]),
  );
  const orderedDirectories = Array.from(
    mediaLibraryContainer.querySelectorAll("[data-library-id]"),
  )
    .map((button) => directoriesById.get(button.dataset.libraryId))
    .filter(Boolean);
  const orderedIds = new Set(orderedDirectories.map((directory) => directory.id));

  orderedDirectories.push(
    ...directories.filter((directory) => !orderedIds.has(directory.id)),
  );
  saveMediaLibraryDirectories(orderedDirectories);
}

let mediaLibraryDropIndicator;

function showMediaLibraryDropIndicator(button, insertAfter) {
  if (!mediaLibraryDropIndicator) {
    mediaLibraryDropIndicator = document.createElement("div");
    Object.assign(mediaLibraryDropIndicator.style, {
      position: "fixed",
      zIndex: "99999",
      pointerEvents: "none",
      background: "#4da3ff",
      borderRadius: "2px",
      boxShadow: "0 0 5px rgba(77, 163, 255, 0.8)",
    });
    document.body.appendChild(mediaLibraryDropIndicator);
  }

  const bounds = button.getBoundingClientRect();
  const containerStyle = window.getComputedStyle(mediaLibraryContainer);
  const isHorizontal =
    containerStyle.flexDirection.startsWith("row") ||
    (containerStyle.display.includes("grid") && bounds.width >= bounds.height);

  if (isHorizontal) {
    Object.assign(mediaLibraryDropIndicator.style, {
      left: `${insertAfter ? bounds.right : bounds.left - 2}px`,
      top: `${bounds.top}px`,
      width: "3px",
      height: `${bounds.height}px`,
    });
  } else {
    Object.assign(mediaLibraryDropIndicator.style, {
      left: `${bounds.left}px`,
      top: `${insertAfter ? bounds.bottom : bounds.top - 2}px`,
      width: `${bounds.width}px`,
      height: "3px",
    });
  }
}

function hideMediaLibraryDropIndicator() {
  mediaLibraryDropIndicator?.remove();
  mediaLibraryDropIndicator = null;
}

// ============================================================
// CREATE LIBRARY BUTTON
// ============================================================

function appendMediaLibraryDirectory(directory) {
  if (!mediaLibraryContainer) {
    console.error("[Media Library] .deckbar.directorites was not found.");

    return;
  }

  // --------------------------------------------------------
  // Prevent duplicate elements
  // --------------------------------------------------------

  const existing = mediaLibraryContainer.querySelector(
    `[data-library-id="${directory.id}"]`,
  );

  if (existing) {
    return;
  }

  // --------------------------------------------------------
  // MAIN BUTTON
  // --------------------------------------------------------

  const button = document.createElement("button");

  button.className = "deckbarbutton";

  button.setAttribute("aria-details", "middle");

  button.setAttribute("data-state", "inactive");

  button.setAttribute("data-editor", "F");

  button.setAttribute("data-library-id", directory.id);

  button.setAttribute("data-path", directory.path);

  button.draggable = !directory.builtIn;

  button.title = directory.path;

  // --------------------------------------------------------
  // FOLDER ICON
  // --------------------------------------------------------

  const icon = document.createElement("img");

  if (directory.builtIn) {
    icon.src = "icons/monosource/" + directory.icon + ".svg";
    icon.alt = "Folder Icon";
    icon.width = 18;
    icon.height = 18;
  } else {
    icon.src = "icons/monosource/folder_open.svg";
    icon.alt = "Folder Icon";
    icon.width = 18;
    icon.height = 18;
  }

  // --------------------------------------------------------
  // LIBRARY NAME
  // --------------------------------------------------------

  const name = document.createElement("span");

  name.setAttribute("data-type", "deckbar");

  name.textContent = directory.name;

  // --------------------------------------------------------
  // CLOSE / REMOVE BUTTON
  // --------------------------------------------------------

  let removeButton;
  if (!directory.builtIn) {
    removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "media-library-remove";

    const closeicon = document.createElement("img");
    closeicon.src = "icons/monosource/close.svg";
    closeicon.alt = "";
    closeicon.width = 18;
    closeicon.height = 18;
    removeButton.append(closeicon);
    removeButton.title = "Remove Library";
    removeButton.setAttribute("aria-label", `Remove ${directory.name}`);
    removeButton.setAttribute("data-library-remove", directory.id);
    removeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeMediaLibraryDirectory(directory.id);
    });
  }

  // --------------------------------------------------------
  // BUILD BUTTON
  // --------------------------------------------------------

  button.appendChild(icon);

  button.appendChild(name);

  if (removeButton) {
    button.appendChild(removeButton);
  }

  // --------------------------------------------------------
  // LIBRARY CLICK
  // --------------------------------------------------------

  button.addEventListener("click", (event) => {
    if (button.dataset.justDragged === "true") {
      delete button.dataset.justDragged;
      return;
    }

    // Ignore clicks coming from remove button.
    if (event.target.closest("[data-library-remove]")) {
      return;
    }

    // ========================================================
    // SET ALL LIBRARIES TO INACTIVE
    // ========================================================

    const allLibraryButtons =
      mediaLibraryContainer.querySelectorAll("[data-library-id]");

    allLibraryButtons.forEach((libraryButton) => {
      libraryButton.dataset.state = "inactive";
    });

    // ========================================================
    // SET THIS LIBRARY TO ACTIVE
    // ========================================================

    button.dataset.state = "active";

    mediaLocation.textContent = directory.path;
    MEDIA_ROOT = directory.path;
    scanMedia();
  });

  button.addEventListener("dragstart", (event) => {
    if (event.target.closest("[data-library-remove]")) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", directory.id);
  });

  button.addEventListener("dragend", hideMediaLibraryDropIndicator);

  button.addEventListener("dragover", (event) => {
    const draggedId = event.dataTransfer.getData("text/plain");
    const draggedButton = mediaLibraryContainer.querySelector(
      `[data-library-id="${draggedId}"]`,
    );

    if (!draggedButton || draggedButton === button) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const bounds = button.getBoundingClientRect();
    const containerStyle = window.getComputedStyle(mediaLibraryContainer);
    const isHorizontal = containerStyle.flexDirection.startsWith("row");
    const insertAfter = isHorizontal
      ? event.clientX > bounds.left + bounds.width / 2
      : event.clientY > bounds.top + bounds.height / 2;
    showMediaLibraryDropIndicator(button, insertAfter);
    mediaLibraryContainer.insertBefore(
      draggedButton,
      insertAfter ? button.nextSibling : button,
    );
  });

  button.addEventListener("drop", (event) => {
    hideMediaLibraryDropIndicator();
    const draggedId = event.dataTransfer.getData("text/plain");
    const draggedButton = mediaLibraryContainer.querySelector(
      `[data-library-id="${draggedId}"]`,
    );

    if (!draggedButton || draggedButton === button) {
      return;
    }

    event.preventDefault();
    draggedButton.dataset.justDragged = "true";
    window.setTimeout(() => delete draggedButton.dataset.justDragged, 300);
    saveMediaLibraryDirectoryOrder();
  });

  // --------------------------------------------------------
  // APPEND TO DIRECTORY TREE
  // --------------------------------------------------------

  mediaLibraryContainer.appendChild(button);
}

// ============================================================
// REMOVE LIBRARY
// ============================================================

function removeMediaLibraryDirectory(libraryId) {
  const directories = getMediaLibraryDirectories();

  // --------------------------------------------------------
  // Find library
  // --------------------------------------------------------

  const directory = directories.find((item) => item.id === libraryId);

  if (!directory) {
    return;
  }

  console.log("[Media Library] Removing:", directory.name);

  // --------------------------------------------------------
  // Remove from JSON
  // --------------------------------------------------------

  const updatedDirectories = directories.filter(
    (item) => item.id !== libraryId,
  );

  saveMediaLibraryDirectories(updatedDirectories);

  // --------------------------------------------------------
  // Remove from DOM
  // --------------------------------------------------------

  const button = mediaLibraryContainer.querySelector(
    `[data-library-id="${libraryId}"]`,
  );

  if (button) {
    button.remove();
  }
}

// ============================================================
// ADD NEW MEDIA LIBRARY
// ============================================================

async function addMediaLibraryDirectory() {
  try {
    // ----------------------------------------------------
    // Open native Windows directory picker
    // ----------------------------------------------------

    // TODO(main.js): enable `multiSelections` in the native directory picker
    // so this IPC handler can return an array of selected paths.
    const selectedPath = await ipcRenderer.invoke(
      "sfxstudio-select-media-library",
    );

    // ----------------------------------------------------
    // User cancelled
    // ----------------------------------------------------

    if (
      !selectedPath ||
      (Array.isArray(selectedPath) && selectedPath.length === 0)
    ) {
      console.log("[Media Library] Selection cancelled.");

      return;
    }

    const selectedPaths = (Array.isArray(selectedPath)
      ? selectedPath
      : [selectedPath]
    ).filter((path) => typeof path === "string" && path.trim());

    if (selectedPaths.length === 0) {
      console.log("[Media Library] Selection cancelled.");

      return;
    }

    console.log("[Media Library] Selected:", selectedPaths);

    // ----------------------------------------------------
    // Get current libraries
    // ----------------------------------------------------

    const directories = getMediaLibraryDirectories();

    // ----------------------------------------------------
    // Prevent duplicate paths
    // ----------------------------------------------------

    const addedDirectories = [];

    selectedPaths.forEach((path, index) => {
      const alreadyExists = directories.some(
        (directory) => directory.path.toLowerCase() === path.toLowerCase(),
      );

      if (alreadyExists) {
        console.warn("[Media Library] Directory already exists:", path);
        return;
      }

      const directory = {
        id: `media-library-${Date.now()}-${index}`,
        name: getDirectoryName(path),
        path,
      };

      directories.push(directory);
      addedDirectories.push(directory);
    });

    if (addedDirectories.length === 0) {
      return;
    }

    saveMediaLibraryDirectories(directories);

    addedDirectories.forEach((directory) => {
      appendMediaLibraryDirectory(directory);
      console.log("[Media Library] Added:", directory);
    });
  } catch (error) {
    console.error("[Media Library] Failed to add library:", error);
  }
}

// ============================================================
// ADD LIBRARY BUTTON
// ============================================================
//
// This assumes your existing Add Library button has:
// data-action="add-media-library"
//
// Example:
// <button class="deckbarbutton"
//         data-action="add-media-library">
//     Add Library
// </button>
//

// ============================================================
// RESTORE SAVED LIBRARIES
// ============================================================

function restoreMediaLibraryDirectories() {
  const directories = getMediaLibraryDirectories();

  console.log("[Media Library] Restoring:", directories.length, "libraries");

  builtInMediaLibraries.forEach(appendMediaLibraryDirectory);

  directories.forEach((directory) => {
    // Basic validation
    if (!directory || !directory.id || !directory.path) {
      return;
    }

    // Rebuild missing name
    if (!directory.name) {
      directory.name = getDirectoryName(directory.path);
    }

    appendMediaLibraryDirectory(directory);
  });
}

// ============================================================
// STARTUP
// ============================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", restoreMediaLibraryDirectories);
} else {
  restoreMediaLibraryDirectories();
}

document
  .getElementById("SFXSTUDIO_DIRECTORY_ADD")
  .addEventListener("click", async () => {
    await addMediaLibraryDirectory();
  });

let pinwindow = false;

document.getElementById("pinbtn").addEventListener("click", (e) => {
  pinwindow = !pinwindow;
  ipcRenderer.send("set-pinwindow", pinwindow);
});

ipcRenderer.on("icon-pinwindow", (event, bool) => {
  document.getElementById("pinIcon").src = bool
    ? "icons/codicons/pinned.svg"
    : "icons/codicons/pin.svg";
});

