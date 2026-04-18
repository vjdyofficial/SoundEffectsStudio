"use strict";

/* =========================================================
 * soundback-pitch-map
 * Non-linear musical pitch ↔ slider mapping
 * CommonJS version
 * ========================================================= */

/* ---------------------------------------------------------
 * Reference curve (Android-style pitch response)
 * --------------------------------------------------------- */
const PITCH_TABLE = Object.freeze({
  "-12": -1.00,
  "-11": -0.94,
  "-10": -0.88,
  "-9": -0.80,
  "-8": -0.74,
  "-7": -0.66,
  "-6": -0.58,
  "-5": -0.50,
  "-4": -0.40,
  "-3": -0.30,
  "-2": -0.20,
  "-1": -0.10,
  "0": 0.00,
  "1": 0.06,
  "2": 0.11,
  "3": 0.16,
  "4": 0.24,
  "5": 0.30,
  "6": 0.38,
  "7": 0.50,
  "8": 0.60,
  "9": 0.70,
  "10": 0.80,
  "11": 0.90,
  "12": 1.00
});

/* ---------------------------------------------------------
 * Internal sorted entries
 * --------------------------------------------------------- */
const ENTRIES_BY_ST = Object.entries(PITCH_TABLE)
  .map(([st, v]) => ({ st: Number(st), v }))
  .sort((a, b) => a.st - b.st);

const ENTRIES_BY_V = [...ENTRIES_BY_ST]
  .sort((a, b) => a.v - b.v);

/* ---------------------------------------------------------
 * Utils
 * --------------------------------------------------------- */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/* =========================================================
 * 🎹 Semitone → Slider Value
 * ========================================================= */
function semitoneToValue(semitone, precision = 2) {
  semitone = clamp(semitone, -12, 12);

  const lo = Math.floor(semitone);
  const hi = Math.ceil(semitone);

  if (lo === hi) {
    return +PITCH_TABLE[lo].toFixed(precision);
  }

  const v1 = PITCH_TABLE[lo];
  const v2 = PITCH_TABLE[hi];
  const t = semitone - lo;

  return +lerp(v1, v2, t).toFixed(precision);
}

/* =========================================================
 * 🎚️ Slider Value → Semitone
 * ========================================================= */
function valueToSemitone(value, precision = 1) {
  value = clamp(value, -1, 1);

  // Exact match
  for (const e of ENTRIES_BY_V) {
    if (Math.abs(e.v - value) < 1e-6) {
      return +e.st.toFixed(precision);
    }
  }

  // Interpolated range
  for (let i = 0; i < ENTRIES_BY_V.length - 1; i++) {
    const a = ENTRIES_BY_V[i];
    const b = ENTRIES_BY_V[i + 1];

    if (value >= a.v && value <= b.v) {
      const t = (value - a.v) / (b.v - a.v);
      return +lerp(a.st, b.st, t).toFixed(precision);
    }
  }

  return value < 0 ? -12 : 12;
}

/* =========================================================
 * 🧲 Snap helpers
 * ========================================================= */
function snapSemitone(st) {
  return Math.round(clamp(st, -12, 12));
}

function snapValue(value) {
  const st = snapSemitone(valueToSemitone(value, 0));
  return semitoneToValue(st, 2);
}

/* =========================================================
 * 🧾 Display helper
 * ========================================================= */
function formatSemitone(st, precision = 1) {
  const v = +st.toFixed(precision);
  return v > 0 ? `+${v}` : `${v}`;
}

/* =========================================================
 * Exports
 * ========================================================= */
module.exports = {
  PITCH_TABLE,
  semitoneToValue,
  valueToSemitone,
  snapSemitone,
  snapValue,
  formatSemitone
};
