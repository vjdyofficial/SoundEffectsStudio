function hexToRgb(hex) {
  hex = hex.replace("#", "");
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getTextColor({ r, g, b }) {
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6
    ? { r: 0, g: 0, b: 0 }
    : { r: 255, g: 255, b: 255 };
}

function logColor(label, hex) {
  const bg = hexToRgb(hex);
  const fg = getTextColor(bg);

  const bgCode = `\x1b[48;2;${bg.r};${bg.g};${bg.b}m`;
  const fgCode = `\x1b[38;2;${fg.r};${fg.g};${fg.b}m`;
  const reset = "\x1b[0m";

  console.log(
    `${bgCode}${fgCode}  ${label.padEnd(10)} ${hex}  ${reset}`
  );
}

function logPalette(palette) {
  logColor("PRIMARY", palette.primary);
  logColor("SECONDARY", palette.secondary);
  logColor("TERTIARY", palette.tertiary);
}

module.exports = { logPalette };
