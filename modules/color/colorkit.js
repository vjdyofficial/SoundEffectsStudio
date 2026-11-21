// colorkit.js

// ===== Helpers =====
function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
    const num = parseInt(hex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex({ r, g, b }) {
    return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// ===== SRGB ↔ Linear =====
function srgbToLinear(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055)/1.055, 2.4); }
function linearToSrgb(v) { return v <= 0.0031308 ? 12.92*v*255 : (1.055*Math.pow(v,1/2.4)-0.055)*255; }

// ===== RGB ↔ XYZ =====
function rgbToXyz({ r, g, b }) {
    r = srgbToLinear(r); g = srgbToLinear(g); b = srgbToLinear(b);
    return {
        x: r*0.4124 + g*0.3576 + b*0.1805,
        y: r*0.2126 + g*0.7152 + b*0.0722,
        z: r*0.0193 + g*0.1192 + b*0.9505
    };
}

function xyzToRgb({ x, y, z }) {
    let r =  3.2406*x -1.5372*y -0.4986*z;
    let g = -0.9689*x +1.8758*y +0.0415*z;
    let b =  0.0557*x -0.2040*y +1.0570*z;
    return { r: Math.round(Math.min(255, Math.max(0, linearToSrgb(r)))),
             g: Math.round(Math.min(255, Math.max(0, linearToSrgb(g)))),
             b: Math.round(Math.min(255, Math.max(0, linearToSrgb(b)))) };
}

// ===== XYZ ↔ Lab =====
function labF(t){ return t>0.008856 ? Math.cbrt(t) : 7.787*t + 16/116; }
function labInv(t){ let t3 = t*t*t; return t3>0.008856 ? t3 : (t-16/116)/7.787; }

function xyzToLab({ x, y, z }) {
    const fx = labF(x/0.95047);
    const fy = labF(y/1.00000);
    const fz = labF(z/1.08883);
    return { L: 116*fy-16, a: 500*(fx-fy), b: 200*(fy-fz) };
}

function labToXyz({ L, a, b }) {
    const fy = (L+16)/116;
    const fx = fy + a/500;
    const fz = fy - b/200;
    return { x: labInv(fx)*0.95047, y: labInv(fy)*1.00000, z: labInv(fz)*1.08883 };
}

// ===== RGB ↔ HCT =====
function rgbToHct(rgb) {
    const lab = xyzToLab(rgbToXyz(rgb));
    const h = (Math.atan2(lab.b, lab.a)*180/Math.PI + 360) % 360;
    const c = Math.sqrt(lab.a*lab.a + lab.b*lab.b);
    return { h, c, t: lab.L };
}

function hctToRgb({ h, c, t }) {
    const a = Math.cos(h*Math.PI/180)*c;
    const b = Math.sin(h*Math.PI/180)*c;
    return xyzToRgb(labToXyz({ L: t, a, b }));
}

// ===== Derive HCT =====
function deriveHct(base, hueOffset=0, chromaScale=1, toneOverride=null){
    const h = (base.h + hueOffset + 360) % 360;
    const c = base.c * chromaScale;
    const t = toneOverride!==null ? toneOverride : base.t;
    return { h, c, t };
}

// ===== Mix Colors =====
function mixColors(rgb1, rgb2, ratio=0.1){
    return {
        r: Math.round(rgb1.r*(1-ratio)+rgb2.r*ratio),
        g: Math.round(rgb1.g*(1-ratio)+rgb2.g*ratio),
        b: Math.round(rgb1.b*(1-ratio)+rgb2.b*ratio)
    };
}

// ===== Tonal Palette =====
function generateTonalPalette(baseRgb){
    const baseHct = rgbToHct(baseRgb);
    const palette = {};
    for(let i=0;i<12;i++){
        const tone = i/11*100;
        const rgb = hctToRgb({...baseHct, t: tone});
        palette[tone] = rgbToHex(rgb);
    }
    return palette;
}

// ===== Material 3 HCT Generator =====
function generateMaterial3Color(primaryHex){
    const primaryRgb = hexToRgb(primaryHex);
    const primaryHct = rgbToHct(primaryRgb);

    const secondaryHct = deriveHct(primaryHct, 5, 0.35);
    const tertiaryHct  = deriveHct(primaryHct, 60, 0.5);
    const neutral1Hct  = deriveHct(primaryHct, 0, 0.05, 90);
    const neutral2Hct  = deriveHct(primaryHct, 0, 0.02, 50);

    const neutral1Rgb = mixColors(hctToRgb(neutral1Hct), primaryRgb, 0.1);
    const neutral2Rgb = mixColors(hctToRgb(neutral2Hct), primaryRgb, 0.1);

    return {
        primary: primaryHex,
        secondary: rgbToHex(hctToRgb(secondaryHct)),
        tertiary: rgbToHex(hctToRgb(tertiaryHct)),
        neutral1: rgbToHex(neutral1Rgb),
        neutral2: rgbToHex(neutral2Rgb),
        tonal: {
            primary: generateTonalPalette(primaryRgb),
            secondary: generateTonalPalette(hctToRgb(secondaryHct)),
            tertiary: generateTonalPalette(hctToRgb(tertiaryHct)),
            neutral: generateTonalPalette(neutral1Rgb)
        }
    };
}

// ===== Color Wheel =====
function generateColorWheel(hex, steps=12){
    const baseHct = rgbToHct(hexToRgb(hex));
    const wheel = [];
    for(let i=0;i<steps;i++){
        const h = (baseHct.h + i*(360/steps))%360;
        const rgb = hctToRgb({h, c: baseHct.c, t: baseHct.t});
        wheel.push(rgbToHex(rgb));
    }
    return wheel;
}

// ===== Styled Log =====
function styledLog(hex,label=''){
    const rgb = hexToRgb(hex);
    const yiq = (rgb.r*299+rgb.g*587+rgb.b*114)/1000;
    const textColor = yiq>=128?'#000':'#FFF';
    console.log(`%c${label} ${hex}`,`background:${hex}; color:${textColor}; padding:2px 6px; border-radius:2px`);
}

function hexToEnglishColor(hex) {
  hex = hex.replace('#', '');

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  // Base color by hue
  let base;
  if (h < 15 || h >= 345) base = "red";
  else if (h < 40) base = "orange";
  else if (h < 70) base = "yellow";
  else if (h < 150) base = "green";
  else if (h < 190) base = "cyan";
  else if (h < 260) base = "blue";
  else if (h < 300) base = "purple";
  else base = "pink";

  // Lightness adjectives
  let lightness;
  if (l > 0.85) lightness = "very light";
  else if (l > 0.7) lightness = "light";
  else if (l < 0.25) lightness = "deep";
  else if (l < 0.4) lightness = "dark";
  else lightness = "";

  // Saturation adjectives
  let saturation;
  if (s < 0.15) saturation = "muted";
  else if (s < 0.35) saturation = "soft";
  else if (s > 0.8) saturation = "vivid";
  else saturation = "";

  return [lightness, saturation, base].filter(Boolean).join(" ");
}

// ===== Module Exports =====
module.exports = {
    generateMaterial3Color,
    generateColorWheel,
    styledLog,
    hexToEnglishColor
};
