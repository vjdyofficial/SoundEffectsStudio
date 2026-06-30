// =========================
// Deck Counters
// =========================
let audioDeckCount = "0/6"; // total 6 decks (4 main + 2 external)
let metanamedata = document.documentElement.dataset.name;
const ua = navigator.userAgent;
const match = ua.match(/VJDYFMSoundEffectsStudio\/([^\s]+)/i);
const appVersion = match ? match[1] : "unknown";
const isBetaOrDev = /\b(beta|dev)\b/i.test(appVersion) || /\b(beta|dev)\b/i.test(ua);

metanamedata = isBetaOrDev ? 'VJDY FM Sound Effects Studio Beta' : 'VJDY FM Sound Effects Studio';
document.title = `${metanamedata}`

// Unified function for all audio decks
function updateAudioDeckCount() {
    const audioDecks = ["mediaA", "mediaB", "mediaC", "mediaD", "MediaExtDeck1", "MediaExtDeck2"];

    const active = audioDecks.filter(id => {
        const el = document.getElementById(id);
        return el && !el.paused && !el.ended;
    });

    const many = audioDecks.filter(id => {
        const el = document.getElementById(id);
        return el && el.src;
    });

    audioDeckCount = `${active.length}/${audioDecks.length}`;
    document.getElementById('activeAudioDecksInfo').textContent = audioDeckCount;

    const metaname = metanamedata;

    if (many.length >= 1) {
        document.title = `${active.length} out of ${many.length} Active Decks - ${metaname}`
    } else {
        document.title = `${metaname}`
    }
}

// =========================
// Media Elements Logic
// =========================
const mediaElements = ["mediaA", "mediaB", "mediaC", "mediaD", "MediaExtDeck1", "MediaExtDeck2"];

mediaElements.forEach(id => {
    const media = document.getElementById(id);
    const pulse = document.getElementById(`${id}_pulse`);
    if (!media || !pulse) return;

    const setQueue = () => pulse.setAttribute("aria-details", "onQueue");
    const setEmpty = () => pulse.setAttribute("aria-details", "");

    // --- PLAY ---
    media.addEventListener("play", () => {
        pulse.setAttribute("aria-details", "onPlaying");
        updateAudioDeckCount();
    });

    // --- PAUSE ---
    media.addEventListener("pause", () => {
        setQueue();
        updateAudioDeckCount();
    });

    // --- ENDED ---
    media.addEventListener("ended", () => {
        setQueue();
        updateAudioDeckCount();
    });

    // --- LOADED (When new src is loaded) ---
    media.addEventListener("loadeddata", () => {
        setQueue();
        updateAudioDeckCount();
    });

    // --- Detect src removal ---
    const observer = new MutationObserver(() => {
        if (!media.src) setEmpty();
        updateAudioDeckCount();
    });

    observer.observe(media, { attributes: true, attributeFilter: ["src"] });

    // --- Initial state ---
    if (!media.src) setEmpty();
    updateAudioDeckCount();
});

// Initial count update
updateAudioDeckCount();

// Active sample deck count (remains unchanged)
setInterval(() => {
    const count = document.querySelectorAll('#storedata audio').length;
    document.getElementById('activeSamplesDecksInfo').textContent = count;
}, 1000);

