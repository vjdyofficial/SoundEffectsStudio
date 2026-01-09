const mm = require("music-metadata");

/**
 * Extract embedded lyrics (plain + synced) from audio
 * @param {string|Buffer|File|Blob} input - audio file
 * @returns {Promise<{ lyricsArray: Array, lyricsText: string, synced: Array }>}
 */
async function getEmbeddedLyrics(input) {
  let metadata;

  // Browser File / Blob
  if (typeof File !== "undefined" && input instanceof File ||
      typeof Blob !== "undefined" && input instanceof Blob) {

    const arrayBuffer = await input.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    metadata = await mm.parseBuffer(buffer, {
      mimeType: input.type || undefined
    });

  // Node Buffer
  } else if (Buffer.isBuffer(input)) {
    metadata = await mm.parseBuffer(input);

  // File path
  } else if (typeof input === "string") {
    metadata = await mm.parseFile(input);

  } else {
    throw new TypeError("Unsupported input type");
  }

  // normalize lyrics entries
  const lyricsArrayRaw = metadata.common.lyrics || [];
  const lyricsArray = lyricsArrayRaw.map(l => typeof l === "string" ? l : l?.text || "");
  const lyricsText = lyricsArray.filter(Boolean).join("\n\n").replace(/\u0000/g, "").trim();

  const synced = metadata.common.syncedLyrics || [];

  return { lyricsArray, lyricsText, synced };
}

module.exports = { getEmbeddedLyrics };
