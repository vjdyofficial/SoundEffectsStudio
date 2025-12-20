async function convertToInlineSVG(imgId, color = "#00aaff", newId = "svgIcon") {
  const img = document.getElementById(imgId);
  if (!img) {
    console.warn(`Image with ID "${imgId}" not found.`);
    return null;
  }

  if (img.tagName !== "IMG") {
    console.warn(`Element with ID "${imgId}" is not an <img> tag.`);
    return null;
  }

  try {
    const response = await fetch(img.src);
    const svgText = await response.text();

    // Remove inline fills to make tinting work universally
    const cleaned = svgText.replace(/fill="[^"]*"/g, "");

    // Parse SVG into DOM element
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(cleaned, "image/svg+xml");
    const svgElement = svgDoc.documentElement;

    // Copy basic size attributes
    svgElement.setAttribute("width", img.width || 64);
    svgElement.setAttribute("height", img.height || 64);
    svgElement.setAttribute("fill", color);
    svgElement.id = newId; // give it an ID

    // Replace the <img> with <svg>
    img.replaceWith(svgElement);

    console.log(`Converted #${imgId} → #${newId}`);
    return svgElement;

  } catch (err) {
    console.error("Failed to convert image to inline SVG:", err);
    return null;
  }
}

async function setupSVGIcon() {
  const icons = [
    { id: 'toSVGIcon', colormode: 'svgicon' },
    { id: 'svg_backbutton', colormode: 'svgicon-monochrome' },
    { id: 'FFmpeg_icon', colormode: 'svgicon' },
    { id: 'WarningSVG', colormode: 'svgicon' },
    { id: 'panicIcon', colormode: 'svgicon-monochrome' }
  ];

  for (const icon of icons) {
    // Here, passing null for color so it'll use CSS variables
    await convertToInlineSVG(icon.id, null, icon.colormode);
  }
}

// Run it when DOM is ready
document.addEventListener("DOMContentLoaded", setupSVGIcon);
