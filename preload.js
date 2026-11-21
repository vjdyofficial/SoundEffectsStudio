/* SFXSTUDIO PRELOAD SCRIPT                   */
/* This is a script to use in every system    */
/* for VJDY FM Sound Effects Studio App.      */

const { ipcRenderer, app } = require("electron");

const beforeUnloadHandler = (e) => {
  if (window.location.origin.startsWith("file://")) {
    e.preventDefault();
    console.warn(
      "%cNavigation has been blocked.%c" +
        "Sound Effects Studio causes unstable functionality and things might not work after reload. " +
        "So, This warning will show to avoid causing bugs and unstable to its functionality. " +
        "To reload. You must restart the app. \n\n" +
        "This applies to all windows including " +
        "The Main Studio, Widgets, Viewers, and Developer Console.",
      "font-weight: bold; font-size: 24px;",
      "font-weight: normal; font-size: 12px;",
    );
  }
};

navigation.navigate = (...args) => {
  console.warn(
    "Sound Effects Studio is not allowed to navigate to other websites " +
      "since this is a standalone application. I know it was built on " +
      "Chromium but we blocked it to prevent accessing the remote content " +
      "especially Node Modules was enabled and loaded on this application.",
  );
};

window.addEventListener("beforeunload", beforeUnloadHandler);

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

document.addEventListener("click", async (event) => {
  const input = event.target.closest('input[type="time"]');

  if (!input) {
    return;
  }

  event.preventDefault();

  const result = await ipcRenderer.invoke("open-time-picker", {
    value: input.value || "12:00",
    format: "24h",
  });

  if (!result) {
    return;
  }

  if (result === "revoke") {
    input.value = "";
  }

  if (result.format === "12h") {
    const match = result.value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (match) {
      let hour = Number(match[1]);

      const minute = match[2];

      const period = match[3].toUpperCase();

      if (period === "AM") {
        if (hour === 12) {
          hour = 0;
        }
      } else {
        if (hour !== 12) {
          hour += 12;
        }
      }

      input.value = `${String(hour).padStart(2, "0")}:${minute}`;
    }
  } else {
    input.value = result.value;
  }

  input.dispatchEvent(
    new Event("change", {
      bubbles: true,
    }),
  );
});

document.addEventListener("click", async (event) => {
  const input = event.target.closest('input[type="date"]');

  if (!input) {
    return;
  }

  event.preventDefault();

  const result = await ipcRenderer.invoke("open-date-picker", {
    value: input.value,
  });

  if (!result) {
    return;
  }

  input.value = result.value;

  input.dispatchEvent(
    new Event("change", {
      bubbles: true,
    }),
  );
});
