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

// overwrite window.print
window.print = () => {
  console.warn(
    '%cPrinting to this app has been blocked.%c' +
    'Sound Effects Studio will not allowed to print the app. instead, Use screenshot to send feedback.',
    "font-weight: bold; font-size: 24px;",
    "font-weight: normal; font-size: 12px;"
  );
};

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