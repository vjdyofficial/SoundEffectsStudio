const themeSelect = document.getElementById("themeSelect");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function updateTheme(mode) {
  document.documentElement.removeAttribute("data-theme");

  if (mode === "dark" || mode === "light") {
    document.documentElement.setAttribute("data-theme", mode);
  } else {
    // "system" mode → no data-theme → let prefers-color-scheme decide
    document.documentElement.removeAttribute("data-theme");
  }

  localStorage.setItem("themeMode", mode);
  ipcRenderer.send('changeNativeTheme', mode)
}


const savedTheme = localStorage.getItem("themeMode") || "system";
themeSelect.value = savedTheme;
updateTheme(savedTheme);

// System theme listener
prefersDark.addEventListener("change", () => {
  if (localStorage.getItem("themeMode") === "system") {
    updateTheme("system");
  }
});

themeSelect.addEventListener("change", () => {
  updateTheme(themeSelect.value);
});
