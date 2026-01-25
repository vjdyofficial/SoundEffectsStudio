// ---------- helpers ----------
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map(c => c + c).join("");
  }

  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function rgbToHex({ r, g, b }) {
  return (
    "#" +
    [r, g, b]
      .map(v => Math.round(v).toString(16).padStart(2, "0"))
      .join("")
  );
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
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

// ---------- color logic ----------
function mixGrayscale(hsl, amount = 0.5) {
  return {
    h: hsl.h,
    s: hsl.s * (1 - amount),
    l: hsl.l
  };
}

function derive(hex, { hueOffset = 0, gray = 0 }) {
  const hsl = rgbToHsl(hexToRgb(hex));

  let result = {
    h: hsl.h + hueOffset,
    s: hsl.s,
    l: hsl.l
  };

  if (gray > 0) {
    result = mixGrayscale(result, gray);
  }

  return rgbToHex(hslToRgb(result));
}

// ---------- public API ----------
function generatePalette(primaryHex) {
  return {
    primary: primaryHex,

    secondary: derive(primaryHex, {
      hueOffset: 5,
      gray: 0.5
    }),

    tertiary: derive(primaryHex, {
      hueOffset: 60
    })
  };
}

module.exports = { generatePalette };
