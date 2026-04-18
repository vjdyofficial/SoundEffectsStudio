ipcRenderer.on('update-coords', (event, coords) => {
    latInput.value = coords.lat;
    lonInput.value = coords.lng;
    latInput.dispatchEvent(new Event("input", { bubbles: true }))
    lonInput.dispatchEvent(new Event("input", { bubbles: true }))
});