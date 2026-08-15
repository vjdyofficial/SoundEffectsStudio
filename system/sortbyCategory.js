const settingsbuttons = document.querySelectorAll(".settingsbuttonTab");
const settingspages = ["A", "B", "C", "D", "F", "G"];

settingsbuttons.forEach(button => {
  button.addEventListener("click", () => {
    const selectedDeck = button.dataset.settingspage; // ✅ cleaner than getAttribute

    // Highlight active button
    settingsbuttons.forEach(btn => btn.setAttribute("aria-details", "onInactiveTab"));
    button.setAttribute("aria-details", "onActiveTab");
    document.getElementById("tabSettings").scrollTo({
      left: button.offsetLeft - 24,
      behavior: "smooth"
    });

    // Show only the selected deck controls
    settingspages.forEach(assign => {
      const tab = document.getElementById(`settings_page${assign}`);

      if (assign === selectedDeck) {
        tab.style.display = "block";
      } else {
        tab.style.display = "none";
      }
    });
  });
});

document.querySelector('.settingsbuttonTab[data-settingspage="G"]').click();

const tabSettings = document.getElementById("tabSettings");

tabSettings.addEventListener("wheel", (e) => {
  e.preventDefault();
  tabSettings.scrollBy({
    left: e.deltaY,
    behavior: "smooth"
  });
});

const editorbuttons = document.querySelectorAll('.deckbarbutton');
const editors = document.querySelectorAll('.editorscreen');
const editortools = document.querySelectorAll('.editortool');

editorbuttons.forEach(button => {
  button.addEventListener('click', () => {
    const editorId = button.dataset.editor;

    // Update button states
    editorbuttons.forEach(btn => {
      btn.dataset.state = 'inactive';
      btn.classList.remove('active');
    });

    button.dataset.state = 'active';
    button.classList.add('active');

    // Show / hide editors
    editors.forEach(editor => {
      editor.hidden = editor.dataset.editor !== editorId;
    });

    editortools.forEach(editor => {
      editor.hidden = editor.dataset.editor !== editorId;
    });
  });
});

const editorsSRS = document.querySelectorAll('.editorscreen_srs');
const editorbuttonsSRS = document.querySelectorAll('.deckbarbutton_srs');

editorbuttonsSRS.forEach(button => {
  button.addEventListener('click', () => {
    const editorId = button.dataset.editorsrs;

    // ✅ ONLY affect SRS buttons
    editorbuttonsSRS.forEach(btn => {
      btn.dataset.state = 'inactive';
      btn.classList.remove('active');
    });

    button.dataset.state = 'active';
    button.classList.add('active');

    // ✅ ONLY affect SRS editors
    editorsSRS.forEach(editor => {
      editor.hidden = editor.dataset.editorsrs !== editorId;
    });
  });
});

const deckOrder = ["1", "2", "A", "B", "C", "D"];

let rowState = {
  "1": 1,
  "2": 1,
  "A": 1,
  "B": 1,
  "C": 1,
  "D": 1,
};

let activeDeck = null;

function applyRowState() {
  const grid = document.getElementById("spectrogramGrid");

  grid.style.gridTemplateRows = deckOrder
    .map(deck => `${rowState[deck]}fr`)
    .join(" ");

  document.querySelectorAll(".monosource_spectrogram_range_parent")
    .forEach(el => {
      el.classList.toggle(
        "active",
        el.dataset.deck === activeDeck
      );
    });
}

function expandExclusive(deckId, expanded = 8, collapsed = 0.5) {
  deckOrder.forEach(deck => {
    rowState[deck] = deck === deckId ? expanded : collapsed;
  });
  activeDeck = deckId;
  applyRowState();
}

function resetLayout(size = 1) {
  deckOrder.forEach(deck => {
    rowState[deck] = size;
  });
  activeDeck = null;
  applyRowState();
}

document.addEventListener("click", e => {
  // Look for .monosource_spectrogram_range_text inside a parent
  const textEl = e.target.closest(".monosource_spectrogram_range_text");
  if (!textEl) return;

  const parent = textEl.closest(".monosource_spectrogram_range_parent");
  if (!parent) return;

  const deckId = parent.dataset.deck;

  // Click same deck → zoom out
  if (activeDeck === deckId) {
    resetLayout();
  } else {
    expandExclusive(deckId);
  }
});
