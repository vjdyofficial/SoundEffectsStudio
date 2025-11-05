const mediaElements = ["mediaA", "mediaB", "mediaC", "mediaD", "MediaExtDeck_1", "MediaExtDeck_2"];

mediaElements.forEach(id => {
    const media = document.getElementById(id);
    const pulse = document.getElementById(`${id}_pulse`);
    if (!media || !pulse) return;

    const setQueue = () => pulse.setAttribute("aria-details", "onQueue");
    const setEmpty = () => pulse.setAttribute("aria-details", "");

    media.addEventListener("play", () => {
        pulse.setAttribute("aria-details", "onPlaying");
    });

    media.addEventListener("pause", setQueue);
    media.addEventListener("ended", setQueue);

    // when a source gets loaded
    media.addEventListener("loadeddata", setQueue);

    // when src is removed externally
    const observer = new MutationObserver(() => {
        if (!media.src) setEmpty();
    });

    observer.observe(media, { attributes: true, attributeFilter: ["src"] });

    // initial state
    if (!media.src) setEmpty();
});
