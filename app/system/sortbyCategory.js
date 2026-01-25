function checkInlineBlockButtons() {
  const audioList = document.getElementById('audio-list');
  if (!audioList) {
    console.warn('No #audio-list element found.');
    return;
  }

  const contentCheck = document.getElementById("contentCheck");
  contentCheck.style.visibility = 'hidden';
  const buttons = audioList.querySelectorAll('button');
  // document.getElementById('preloadSamples_Value').textContent = `${buttons.length}`;

  let hasVisibleButton = false;

  // Define the categories you care about
  const categories = [
    "category_und",
    "category_bycontributes",
    "category_speech",
    "category_default",
    "category_fm",
    "category_score",
    "category_musicscore",
    "category_announcement",
    "category_orchhit"
  ];

  // Initialize counters
  const counts = Object.fromEntries(categories.map(c => [c, 0]));

  // Get all buttons

  // Count based on classList
  buttons.forEach(btn => {
    categories.forEach(cat => {
      if (btn.classList.contains(cat)) {
        counts[cat]++;
      }
    });
  });

  // Example: show the total for "category_score" in the HTML tag
  // document.getElementById("preloadSamples_Value1").textContent = counts["category_und"];
  // document.getElementById("preloadSamples_Value2").textContent = counts["category_bycontributes"];
  // document.getElementById("preloadSamples_Value3").textContent = counts["category_speech"];
  // document.getElementById("preloadSamples_Value4").textContent = counts["category_default"];
  // document.getElementById("preloadSamples_Value5").textContent = counts["category_fm"];
  // document.getElementById("preloadSamples_Value6").textContent = counts["category_score"];
  // document.getElementById("preloadSamples_Value7").textContent = counts["category_musicscore"];
  // document.getElementById("preloadSamples_Value8").textContent = counts["category_announcement"];
  // document.getElementById("preloadSamples_Value9").textContent = counts["category_orchhit"];

  buttons.forEach(btn => {
    const displayStyle = window.getComputedStyle(btn).display;

    if (displayStyle === 'block') {
      hasVisibleButton = true;
    }
  });

  if (!contentCheck) {
    console.warn('No #contentCheck element found.');
    return;
  }

  contentCheck.style.visibility = hasVisibleButton ? 'collapse' : 'visible';
  audioList.style.visibility = hasVisibleButton ? 'visible' : 'collapse';
}

function filterAudioButtons() {
  const selected = document.getElementById('categoryDropdown').value;
  const audioList = document.getElementById('audio-list');
  const buttons = audioList.querySelectorAll('button');
  const isExplicit = document.getElementById("hideExplicit").checked;

  buttons.forEach(btn => {
    if (btn.classList.contains("blinkingoutline")) {
      btn.style.display = 'inline-block';
    } else if (isExplicit && btn.classList.contains("explicit")) {
      btn.style.display = 'none';
    } else {
      const matchesCategory = selected === 'all' || btn.classList.contains(selected);
      btn.style.display = matchesCategory ? 'inline-block' : 'none';
    }
  });
}

hideExplicit.addEventListener("change", () => {
  filterAudioButtons();
  checkInlineBlockButtons();
});

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    filterAudioButtons();
    checkInlineBlockButtons();
  }, 150);

  const targetNode = document.getElementById("storedata");
  if (!targetNode) return;

  const observerList = new MutationObserver(() => {
    filterAudioButtons();
    checkInlineBlockButtons();
  });

  observerList.observe(targetNode, {
    attributes: true,
    childList: true,
    subtree: true
  });
});

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

function expandExclusive(deckId, expanded = 8, collapsed = 1) {
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
