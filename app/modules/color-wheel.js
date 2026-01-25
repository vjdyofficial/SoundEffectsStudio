// ---------- helpers ----------
function hexToHsl(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const num = parseInt(hex, 16);

  let r = ((num >> 16) & 255) / 255;
  let g = ((num >> 8) & 255) / 255;
  let b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }

  return { h, s, l };
}

function hslToRgb({ h, s, l }) {
  h = (h % 360 + 360) % 360;

  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;

  let r1, g1, b1;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255
  };
}

function rgbToHex({ r, g, b }) {
  return (
    "#" +
    [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("")
  );
}

// ---------- core wheel logic ----------
function generateFromHsl(h, s, l) {
  return rgbToHex(hslToRgb({ h, s, l }));
}

/**
 * Generate color wheel from a base HEX
 * @param {string} baseHex - base color
 * @param {number} steps - number of hues around the wheel
 */
function generateHexWheel(baseHex, steps = 12) {
  const hsl = hexToHsl(baseHex);
  const wheel = [];

  for (let i = 0; i < steps; i++) {
    const hueOffset = (360 / steps) * i;

    const primary = generateFromHsl(hsl.h + hueOffset, hsl.s, hsl.l);
    const secondary = generateFromHsl(hsl.h + hueOffset + 5, hsl.s * 0.5, hsl.l);
    const tertiary = generateFromHsl(hsl.h + hueOffset + 60, hsl.s, hsl.l);

    wheel.push({
      primary,
      secondary,
      tertiary
    });
  }

  return wheel;
}

module.exports = { generateHexWheel };
