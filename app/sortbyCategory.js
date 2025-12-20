function checkInlineBlockButtons() {
    const audioList = document.getElementById('audio-list');
    if (!audioList) {
        console.warn('No #audio-list element found.');
        return;
    }

    const contentCheck = document.getElementById("contentCheck");
    contentCheck.style.visibility = 'hidden';
    const buttons = audioList.querySelectorAll('button');
    document.getElementById('preloadSamples_Value').textContent = `${buttons.length}`;

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
    document.getElementById("preloadSamples_Value1").textContent = counts["category_und"];
    document.getElementById("preloadSamples_Value2").textContent = counts["category_bycontributes"];
    document.getElementById("preloadSamples_Value3").textContent = counts["category_speech"];
    document.getElementById("preloadSamples_Value4").textContent = counts["category_default"];
    document.getElementById("preloadSamples_Value5").textContent = counts["category_fm"];
    document.getElementById("preloadSamples_Value6").textContent = counts["category_score"];
    document.getElementById("preloadSamples_Value7").textContent = counts["category_musicscore"];
    document.getElementById("preloadSamples_Value8").textContent = counts["category_announcement"];
    document.getElementById("preloadSamples_Value9").textContent = counts["category_orchhit"];

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

    contentCheck.style.visibility = hasVisibleButton ? 'hidden' : 'visible';
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

// Run every 2 seconds
setInterval(filterAudioButtons, 1000);
setInterval(checkInlineBlockButtons, 1000);

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