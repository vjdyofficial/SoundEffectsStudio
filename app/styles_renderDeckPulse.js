// =========================
// Deck Counters
// =========================
let audioDeckCount = "0/4";
let videoDeckCount = "0/2";

function updateAudioDeckCount() {
    const audioDecks = ["mediaA", "mediaB", "mediaC", "mediaD"];

    const active = audioDecks.filter(id => {
        const el = document.getElementById(id);
        return el && !el.paused && !el.ended;
    });

    audioDeckCount = `${active.length}/4`;
    document.getElementById('activeAudioDecksInfo').textContent = audioDeckCount;
}

function updateVideoDeckCount() {
    const videoDecks = ["MediaExtDeck_1", "MediaExtDeck_2"];

    const active = videoDecks.filter(id => {
        const el = document.getElementById(id);
        return el && !el.paused && !el.ended;
    });

    videoDeckCount = `${active.length}/2`;
    document.getElementById('activeVideoDecksInfo').textContent = videoDeckCount;
}

// =========================
// Media Elements Logic
// =========================
const mediaElements = [
    "mediaA", "mediaB", "mediaC", "mediaD",
    "MediaExtDeck_1", "MediaExtDeck_2"
];

mediaElements.forEach(id => {
    const media = document.getElementById(id);
    const pulse = document.getElementById(`${id}_pulse`);
    if (!media || !pulse) return;

    const setQueue = () => pulse.setAttribute("aria-details", "onQueue");
    const setEmpty = () => pulse.setAttribute("aria-details", "");

    // --- PLAY ---
    media.addEventListener("play", () => {
        pulse.setAttribute("aria-details", "onPlaying");
        if (id.startsWith("media")) updateAudioDeckCount();
        else updateVideoDeckCount();
    });

    // --- PAUSE ---
    media.addEventListener("pause", () => {
        setQueue();
        if (id.startsWith("media")) updateAudioDeckCount();
        else updateVideoDeckCount();
    });

    // --- ENDED ---
    media.addEventListener("ended", () => {
        setQueue();
        if (id.startsWith("media")) updateAudioDeckCount();
        else updateVideoDeckCount();
    });

    // --- LOADED (When new src is loaded) ---
    media.addEventListener("loadeddata", () => {
        setQueue();
        if (id.startsWith("media")) updateAudioDeckCount();
        else updateVideoDeckCount();
    });

    // --- Detect src removal ---
    const observer = new MutationObserver(() => {
        if (!media.src) setEmpty(); updateAudioDeckCount(); updateVideoDeckCount();
    });

    observer.observe(media, { attributes: true, attributeFilter: ["src"] });

    // --- Initial state ---
    if (!media.src) setEmpty(); updateAudioDeckCount(); updateVideoDeckCount();
});

// Initial count update
updateAudioDeckCount();
updateVideoDeckCount();

setInterval(() => {
    const count = document.querySelectorAll('#storedata audio').length
    document.getElementById('activeSamplesDecksInfo').textContent = count
}, 1000);