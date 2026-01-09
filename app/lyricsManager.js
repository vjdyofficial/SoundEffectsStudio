// lyricsManager.js
const mm = require("music-metadata");

function lrcTimeToMs(timeStr) {
  const [min, rest] = timeStr.split(":");
  const [sec, frac = "0"] = rest.split(".");
  const minutes = parseInt(min, 10);
  const seconds = parseInt(sec, 10);
  let ms = frac.length === 3
    ? parseInt(frac, 10)
    : frac.length === 2
      ? parseInt(frac, 10) * 10
      : frac.length === 1
        ? parseInt(frac, 10) * 100
        : 0;
  return minutes * 60000 + seconds * 1000 + ms;
}

function parseLrcFromText(lyricsText) {
  if (!lyricsText) return [];

  const lines = lyricsText.split("\n");
  const entries = [];

  // Match:
  // [mm:ss(.xx)] OR mm:ss(.xx) at start of line
  const timeRegex = /(?:^\s*(\d+:\d+(?:\.\d+)?)|\[(\d+:\d+(?:\.\d+)?)\])/g;

  for (const line of lines) {
    const times = [...line.matchAll(timeRegex)];

    // remove only matched timestamps, not normal text
    const text = line.replace(timeRegex, "").trim();

    for (const match of times) {
      const timeStr = match[1] || match[2];
      entries.push({
        time: lrcTimeToMs(timeStr),
        text
      });
    }
  }

  return entries.sort((a, b) => a.time - b.time);
}

function lyricsArrayToText(lyrics = []) {
  return lyrics
    .map(entry => {
      if (typeof entry === "string") return entry;
      if (entry?.text) return entry.text;
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .replace(/\u0000/g, "")
    .trim();
}

// -------------------------
// Multi-deck manager
// -------------------------
class LyricsManager {
  constructor() {
    this.decks = {}; // { deckId: { entries: [], text: '' } }
  }

  loadDeckLyrics(deckId, lyricsText) {
    const entries = parseLrcFromText(lyricsText);
    this.decks[deckId] = {
      entries,
      text: lyricsText
    };
  }

  getCurrentLine(deckId, currentTimeSeconds) {
    const deck = this.decks[deckId];
    if (!deck || !deck.entries.length) return null;

    const currentMs = currentTimeSeconds * 1000;
    // iterate from end for efficiency
    for (let i = deck.entries.length - 1; i >= 0; i--) {
      if (deck.entries[i].time <= currentMs) return deck.entries[i];
    }
    return null;
  }

  getLyricsText(deckId) {
    const deck = this.decks[deckId];
    if (!deck) return "";
    return lyricsArrayToText(deck.text);
  }

  clearDeck(deckId) {
    delete this.decks[deckId];
  }
}

// Export as a singleton or class
module.exports = LyricsManager;