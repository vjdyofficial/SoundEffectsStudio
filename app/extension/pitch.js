function disablePitch(video) {
  video.preservesPitch = false;
  video.mozPreservesPitch = false;
  video.webkitPreservesPitch = false;
}

// initial videos
document.querySelectorAll("video").forEach(disablePitch);

// watch for new videos added later
const observer = new MutationObserver(mutations => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.tagName === "VIDEO") {
        disablePitch(node);
      }
      if (node.querySelectorAll) {
        node.querySelectorAll("video").forEach(disablePitch);
      }
    });
  });
});

observer.observe(document.body, { childList: true, subtree: true });
