// ===============================
// HCT-based Material-style colors
// ===============================

// ---------- RGB <-> HEX ----------
function hexToRgb(hex) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");

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

// ---------- sRGB <-> Linear ----------
function srgbToLinear(v) {
  v /= 255;
  return v <= 0.04045
    ? v / 12.92
    : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(v) {
  return v <= 0.0031308
    ? 12.92 * v * 255
    : (1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
}

// ---------- RGB -> XYZ ----------
function rgbToXyz({ r, g, b }) {
  r = srgbToLinear(r);
  g = srgbToLinear(g);
  b = srgbToLinear(b);

  return {
    x: r * 0.4124 + g * 0.3576 + b * 0.1805,
    y: r * 0.2126 + g * 0.7152 + b * 0.0722,
    z: r * 0.0193 + g * 0.1192 + b * 0.9505
  };
}

// ---------- XYZ -> Lab ----------
function xyzToLab({ x, y, z }) {
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;

  x /= refX;
  y /= refY;
  z /= refZ;

  const f = t =>
    t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    L: 116 * fy - 16,         // Tone
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

// ---------- Lab -> XYZ ----------
function labToXyz({ L, a, b }) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const fInv = t =>
    t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787;

  return {
    x: fInv(fx) * 0.95047,
    y: fInv(fy),
    z: fInv(fz) * 1.08883
  };
}

// ---------- XYZ -> RGB ----------
function xyzToRgb({ x, y, z }) {
  let r =  3.2406 * x - 1.5372 * y - 0.4986 * z;
  let g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
  let b =  0.0557 * x - 0.2040 * y + 1.0570 * z;

  return {
    r: Math.min(255, Math.max(0, linearToSrgb(r))),
    g: Math.min(255, Math.max(0, linearToSrgb(g))),
    b: Math.min(255, Math.max(0, linearToSrgb(b)))
  };
}

// ---------- RGB -> HCT ----------
function rgbToHct(rgb) {
  const lab = xyzToLab(rgbToXyz(rgb));

  const h = (Math.atan2(lab.b, lab.a) * 180 / Math.PI + 360) % 360;
  const c = Math.sqrt(lab.a ** 2 + lab.b ** 2);
  const t = lab.L;

  return { h, c, t };
}

// ---------- HCT -> RGB ----------
function hctToRgb({ h, c, t }) {
  const a = Math.cos(h * Math.PI / 180) * c;
  const b = Math.sin(h * Math.PI / 180) * c;

  return xyzToRgb(
    labToXyz({ L: t, a, b })
  );
}

// ===============================
// Material-style derivation logic
// ===============================
function deriveHct(baseHct, { hueOffset = 0, chromaScale = 1 }) {
  return {
    h: (baseHct.h + hueOffset + 360) % 360,
    c: baseHct.c * chromaScale,
    t: baseHct.t
  };
}

// ---------- public API ----------
function generatePalette(primaryHex) {
  const baseRgb = hexToRgb(primaryHex);
  const baseHct = rgbToHct(baseRgb);

  const primary = baseHct;

  const secondary = deriveHct(baseHct, {
    hueOffset: 0,
    chromaScale: 0.6
  });

  const tertiary = deriveHct(baseHct, {
    hueOffset: 60,
    chromaScale: 1
  });

  return {
    primary: primaryHex,
    secondary: rgbToHex(hctToRgb(secondary)),
    tertiary: rgbToHex(hctToRgb(tertiary))
  };
}

module.exports = { generatePalette };
