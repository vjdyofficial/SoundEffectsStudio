const { ipcRenderer } = require('electron');

class MediaDecks {
  constructor(deckIds = []) {
    // Grab audio elements
    this.decks = deckIds.map(id => document.getElementById(id));
    this.activeDeckIndex = 0;

    // Events
    this.onAllPlayingCallback = null;
    this.onAnyStoppedCallback = null;

    this._initDeckEvents();
    this._initIPC();
  }

  getActiveDeck() {
    return this.decks[this.activeDeckIndex];
  }

  // Switch deck by delta: +1 next, -1 previous
  switchDeck(delta) {
    this.activeDeckIndex = (this.activeDeckIndex + delta + this.decks.length) % this.decks.length;
    const deck = this.getActiveDeck();
    deck.currentTime = 0;
    deck.play();
    this.updateMediaSession(deck);
  }

  // Play/pause active deck
  playPause() {
    const deck = this.getActiveDeck();
    if (deck.paused) deck.play();
    else deck.pause();
    this.updateMediaSession(deck);
  }

  // Update Media Session metadata
  updateMediaSession(deck) {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: deck.dataset.title || 'Unknown Track',
        artist: deck.dataset.artist || 'Unknown Artist',
        album: deck.dataset.album || '',
        artwork: [{ src: deck.dataset.cover || '', sizes: '512x512', type: 'image/jpeg' }]
      });

      navigator.mediaSession.setActionHandler('play', () => deck.play());
      navigator.mediaSession.setActionHandler('pause', () => deck.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.switchDeck(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => this.switchDeck(1));
    }
  }

  // Callbacks
  onAllPlaying(callback) {
    this.onAllPlayingCallback = callback;
  }

  onAnyStopped(callback) {
    this.onAnyStoppedCallback = callback;
  }

  // Check if all decks are playing
  areAllPlaying() {
    return this.decks.every(deck => !deck.paused);
  }

  // Internal: attach events to decks
  _initDeckEvents() {
    this.decks.forEach(deck => {
      deck.addEventListener('play', () => {
        this.updateMediaSession(deck);
        if (this.areAllPlaying() && this.onAllPlayingCallback) {
          this.onAllPlayingCallback();
        }
      });

      deck.addEventListener('pause', () => {
        if (this.onAnyStoppedCallback) {
          this.onAnyStoppedCallback(deck);
        }
      });

      deck.addEventListener('ended', () => {
        if (this.onAnyStoppedCallback) {
          this.onAnyStoppedCallback(deck);
        }
      });
    });
  }

  // Internal: hook IPC global shortcuts
  _initIPC() {
    ipcRenderer.on('media-play-pause', () => this.playPause());
    ipcRenderer.on('media-next-track', () => this.switchDeck(1));
    ipcRenderer.on('media-previous-track', () => this.switchDeck(-1));
  }
}

module.exports = MediaDecks;
