function IdentEffects(audioCtx, outputNode) {
  const BASE = "core/idents/"; // relative to the html file
  const FILES = [
    "jingle.mp3",           // 0
    "letsgotothemusic.mp3", // 1
    "nowopen.m4a",          // 2
    "startingevent.mp3",    // 3
    "urlistening.mp3",      // 4
    "vjdyfm.mp3",           // 5
    "vjdyfm2.mp3",          // 6
    "vjdyfm-speech.mp3",    // 7
    "vjdyfmtaper.mp3"       // 8
  ];

  const gain = audioCtx.createGain();
  gain.connect(outputNode);

  const audioBuffers = new Array(FILES.length).fill(null);
  const sources = new Array(FILES.length).fill(null);

  const api = {
    loaded: false,
    missing: [],
    onState: null, // onState(index, isPlaying)

    // Resolves true if all 9 loaded, false if any is missing or fails to decode
    async load() {
      api.loaded = false;
      api.missing = [];

      await Promise.all(FILES.map(async (name, i) => {
        try {
          const res = await fetch(BASE + name);
          if (!res.ok) throw new Error(res.status);
          const data = await res.arrayBuffer();
          audioBuffers[i] = await audioCtx.decodeAudioData(data);
        } catch (e) {
          api.missing.push(name);
        }
      }));

      if (api.missing.length) {
        audioBuffers.fill(null);
        console.warn("IdentEffects not loaded, missing:", api.missing);
        return false;
      }

      api.loaded = true;
      return true;
    },

    play(i) {
      if (!api.loaded || !audioBuffers[i]) return;
      api.stop(i); // restart if already playing

      const src = audioCtx.createBufferSource();
      src.buffer = audioBuffers[i];
      src.connect(gain);
      src.onended = () => {
        if (sources[i] === src) {
          sources[i] = null;
          src.disconnect();
          if (api.onState) api.onState(i, false);
        }
      };

      sources[i] = src;
      src.start();
      if (api.onState) api.onState(i, true);
    },

    stop(i) {
      const src = sources[i];
      if (!src) return;
      sources[i] = null;
      src.onended = null;
      try { src.stop(); } catch (e) {}
      src.disconnect();
      if (api.onState) api.onState(i, false);
    },

    stopAll() {
      for (let i = 0; i < FILES.length; i++) api.stop(i);
    },

    isPlaying(i) {
      return !!sources[i];
    },

    // volume() returns the current value, volume(0.5) sets it (0 to 1+)
    volume(value, smooth = 0.02) {
      if (value === undefined) return gain.gain.value;
      const t = audioCtx.currentTime;
      gain.gain.cancelScheduledValues(t);
      if (smooth > 0) gain.gain.setTargetAtTime(value, t, smooth / 3);
      else gain.gain.value = value;
    },

    destroy() {
      api.stopAll();
      gain.disconnect();
    }
  };

  return api;
}