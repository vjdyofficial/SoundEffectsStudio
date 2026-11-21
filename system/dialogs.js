const message = document.getElementById("message");
const settings = document.querySelector(`.ANDROMEDA_APP_CONTAINER[data-screen="ANDROMEDA_SETTINGS"]`);
const workbench = document.querySelector(`.ANDROMEDA_APP_CONTAINER[data-screen="ANDROMEDA_WORKBENCH"]`);
const opensettings = document.getElementById('opensettings');
const closesettings = document.getElementById('closesettings');
const resetdialog = document.getElementById('resetDialog');

let targetID;

let isVolumeUIOpened = false;

function preventDialogfromOpening() {
  const dialogs = document.querySelectorAll('dialog');
  let length = 0
  dialogs.forEach((dialog, index) => {
    if (dialog.open) {
      length = length + 1
    }
  });
  return length
}

function closeAllDialogs() {
  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach((dialog, index) => {
    // Skip volumeDialog—it has its own animation ritual
    if (dialog.id === 'testspkDialog' ||
      dialog.id === 'downloadDialog' ||
      dialog.id === "imagePreviewDialog" ||
      dialog.id === "alertMessage" ||
      dialog.id === "saveButtonIndexDialog") {
      return;
    }

    const dialogOnInit = dialog;
    CloseAnimationInit(dialogOnInit);
  });
}

function closeAllDialogsExceptOne(id) {
  const dialogs = document.querySelectorAll('dialog');
  dialogs.forEach((dialog, index) => {
    // Skip volumeDialog—it has its own animation ritual
    if (dialog.id === 'testspkDialog' ||
      dialog.id === 'downloadDialog' ||
      dialog.id === "imagePreviewDialog" ||
      dialog.id === "alertMessage" ||
      dialog.id === id) {
      return;
    }

    const dialogOnInit = dialog;
    CloseAnimationInit(dialogOnInit);
  });
}

function CloseAnimationInit(dialogOnInit) {
  dialogOnInit.classList.add('onCloseDialog');
  setTimeout(() => {
    dialogOnInit.close();
    dialogOnInit.classList.remove("onCloseDialog"); // Reset for next time
  }, 200);
}

function isElectron() {
  return typeof navigator === 'object' &&
    typeof navigator.userAgent === 'string' &&
    navigator.userAgent.toLowerCase().includes('electron');
}

opensettings.addEventListener('click', () => {
  settings.hidden = false;
  workbench.hidden = true;
  dropdownClose();
});

closesettings.addEventListener('click', () => {
  settings.hidden = true;
  workbench.hidden = false;
  dropdownClose();
});

function closeImportDialog(isImportGoing) {
  const dialogOnInit = document.getElementById('ImportDialog');
  CloseAnimationInit(dialogOnInit);

  if (isImportGoing) {
    // Auto-scroll after 500ms
    setTimeout(() => {
      const target = document.getElementById(targetID);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);

    function addOutline(id) {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('focustoDeck')

        // Remove outline after 500ms
        setTimeout(() => {
          el.classList.remove('focustoDeck')
        }, 1250);
      }
    }

    addOutline(targetID);
  }
}

function updateBackdropVisibility() {
  const dialogElements = document.querySelectorAll('dialog');
  const backdrop = document.getElementById('backdropDialog');
  let anyOpen = false;

  dialogElements.forEach(dialog => {
    if (dialog.open) {
      anyOpen = true;
    }
  });
  if (backdrop) {
    if (anyOpen) {
      backdrop.classList.add('onOpenDialog');
      backdrop.classList.remove('onCloseDialog');
      backdrop.onclick = null;
    } else {
      backdrop.classList.remove('onOpenDialog');
      backdrop.classList.add('onCloseDialog');
      backdrop.onclick = null;
    }
  }
}

// Initial check
updateBackdropVisibility();

function initDialogStacking(
  backdropId = "backdropDialog",
  backdropBase = 500,
  dialogBase = 501
) {
  const backdrop = document.getElementById(backdropId);
  if (!backdrop) return;

  let dialogStack = [];

  const updateIndexes = () => {
    // Backdrop always below dialogs
    backdrop.style.setProperty(
      "--index",
      backdropBase + dialogStack.length,
      "important"
    );

    dialogStack.forEach((dialog, i) => {
      dialog.style.setProperty(
        "--index",
        dialogBase + i,
        "important"
      );
    });
  };

  const bringToFront = (dialog) => {
    dialogStack = dialogStack.filter(d => d !== dialog);
    dialogStack.push(dialog);
    updateIndexes();
  };

  const syncDialogs = () => {
    const openDialogs = Array.from(document.querySelectorAll("dialog[open]"));

    // Add newly opened dialogs
    openDialogs.forEach(d => {
      if (!dialogStack.includes(d)) {
        dialogStack.push(d);
      }
    });

    // Remove closed dialogs
    dialogStack = dialogStack.filter(d => d.hasAttribute("open"));

    // Reset closed dialogs
    document.querySelectorAll("dialog:not([open])").forEach(d => {
      d.style.removeProperty("--index");
    });

    updateIndexes();
    // Initial check
    updateBackdropVisibility();
  };

  // Observe open / close
  const observer = new MutationObserver(syncDialogs);
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"]
  });

  // Click / focus brings dialog to front
  document.addEventListener("mousedown", (e) => {
    const dialog = e.target.closest("dialog[open]");
    if (dialog) bringToFront(dialog);
  });

  // Initial sync
  syncDialogs();

  return {
    observer,
    bringToFront
  };
}

// Usage
const dialogStackObserver = initDialogStacking();