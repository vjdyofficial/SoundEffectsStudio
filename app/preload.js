const { ipcRenderer } = require("electron");

(() => {
  try {
    const proto = Object.getPrototypeOf(window.location);

    if (!proto) {
      console.warn("Location prototype not found");
      return;
    }

    Object.defineProperty(proto, "reload", {
      configurable: true,
      writable: true,
      value() {
        console.warn("[Blocked] window.location.reload()");
        ipcRenderer.send("app:reload-detected");
      }
    });

    console.log("location.reload successfully overridden");
  } catch (err) {
    console.error("Failed to override location.reload", err);
  }
})();
