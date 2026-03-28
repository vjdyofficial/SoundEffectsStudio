const { ipcRenderer } = require('electron');

const beforeUnloadHandler = (e) => {
  if (window.location.origin.startsWith('file://')) {
    e.preventDefault();
    console.warn(
      '%cReload Location has been blocked.%c' +
      'Sound Effects Studio causes unstable functionality and things might not work after reload. ' +
      'So, This warning will show to avoid causing bugs and unstable to its functionality. ' +
      'To reload. You must restart the app. \n\n' +
      'This applies to all windows including ' +
      'The Main Studio, Widgets, Viewers, and Developer Console.',
      "font-weight: bold; font-size: 24px;",
      "font-weight: normal; font-size: 12px;"
    );
  }
};

window.addEventListener("beforeunload", beforeUnloadHandler);

const ALLOWED_DOMAINS = [
  "github.com/vjdyofficial",
  "api.open-meteo.com",
  "open-meteo.com",
  "tile.openstreetmap.org",
  "nominatim.openstreetmap.org",
  "openstreetmap.org"
];

const originalFetch = window.fetch.bind(window);

window.fetch = async (...args) => {
  let url;

  if (typeof args[0] === "string") {
    url = args[0];
  } else if (args[0] instanceof Request) {
    url = args[0].url;
  } else {
    // Let non-string/Request args pass through
    return originalFetch(...args);
  }

  try {
    // Allow any non-HTTP(S) URL (file://, blob://, data:, etc.)
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return originalFetch(...args);
    }

    // Remote URLs → check whitelist
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    const allowed = ALLOWED_DOMAINS.some(domain => hostname.includes(domain));
    if (!allowed) {
      console.warn(`Blocked remote fetch: ${hostname}`);
      throw new Error(`Fetch blocked: remote domain not allowed (${hostname})`);
    }

    return originalFetch(...args);

  } catch (err) {
    console.error(err);
    return Promise.reject(err);
  }
};

// store original close in case you need it
const originalClose = window.close.bind(window);

// override
window.close = () => {
  // 1️⃣ remove beforeunload listener so close is not blocked
  window.removeEventListener('beforeunload', beforeUnloadHandler);

  // 2️⃣ call original close or use IPC if you want main process control
  // originalClose(); // optional
  ipcRenderer.send('close-this-window');
};

window.confirm = () => {
  console.warn(
    '%cNative Confirm has been blocked.%c' +
    'Sound Effects Studio will not allowed to use the native confirm dialog. instead, use a custom dialog.',
    "font-weight: bold; font-size: 24px;",
    "font-weight: normal; font-size: 12px;"
  );
}