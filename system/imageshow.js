// ======================================================
// IMAGE SHOW CONFIGURATION
// ======================================================

const IMAGE_SHOW_STORAGE_KEY = "vjdyfm_imageshow";
const IMAGE_SHOW_CHANNEL = "vjdyfm-imageshow";

const IMAGE_SHOW_THUMBNAIL_SIZE = 256;
const IMAGE_SHOW_FIT_MODES = ["fill", "cover", "contain"];

const IMAGE_SHOW = {
  images: [],
  selected: null,
  fitIndex: 0,
  visible: true,
};

// ======================================================
// ELEMENTS
// ======================================================

const IMAGE_SHOW_ELEMENTS = {
  load: document.getElementById("IMAGESHOW_LOAD"),
  eject: document.getElementById("IMAGESHOW_EJECT"),
  fit: document.getElementById("IMAGESHOW_FIT"),
  visible: document.getElementById("IMAGESHOW_VISIBLE"),
  gallery: document.getElementById("IMAGESHOW_GALLERY"),
  viewport: document.getElementById("IMAGESHOW_VIEWPORT"),
};

const imageShowChannel = new BroadcastChannel(IMAGE_SHOW_CHANNEL);

// ======================================================
// UTILITIES
// ======================================================

function imageShowURL(filePath) {
  return pathToFileURL(filePath).href;
}

function imageShowCreateID() {
  return crypto.randomUUID();
}

function imageShowGetSelectedURL() {
  return IMAGE_SHOW.selected ? imageShowURL(IMAGE_SHOW.selected.path) : "";
}

// ======================================================
// STATIC THUMBNAIL GENERATOR
// ======================================================

async function imageShowCreateThumbnail(filePath) {
  return new Promise(async (resolve, reject) => {
    try {
      const image = new Image();

      image.onload = () => {
        try {
          const size = IMAGE_SHOW_THUMBNAIL_SIZE;

          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;

          const context = canvas.getContext("2d", {
            alpha: true,
          });

          if (!context) {
            throw new Error("Unable to create thumbnail canvas.");
          }

          // Center-crop the image into a square.
          const sourceWidth = image.naturalWidth;
          const sourceHeight = image.naturalHeight;

          const cropSize = Math.min(sourceWidth, sourceHeight);

          const sourceX = (sourceWidth - cropSize) / 2;
          const sourceY = (sourceHeight - cropSize) / 2;

          context.clearRect(0, 0, size, size);

          context.drawImage(
            image,
            sourceX,
            sourceY,
            cropSize,
            cropSize,
            0,
            0,
            size,
            size,
          );

          // WebP is generally smaller than PNG.
          // PNG is used as a fallback.
          let thumbnail = canvas.toDataURL("image/webp", 0.82);

          if (!thumbnail.startsWith("data:image/webp")) {
            thumbnail = canvas.toDataURL("image/png");
          }

          canvas.width = 0;
          canvas.height = 0;

          resolve(thumbnail);
        } catch (error) {
          reject(error);
        }
      };

      image.onerror = () => {
        reject(new Error(`Unable to load image: ${path.basename(filePath)}`));
      };

      image.src = imageShowURL(filePath);

      // Wait until the image is decoded.
      if (image.decode) {
        try {
          await image.decode();
        } catch {
          // The onload/onerror handlers handle the result.
        }
      }
    } catch (error) {
      reject(error);
    }
  });
}

// ======================================================
// LOCAL STORAGE
// ======================================================

function imageShowSave() {
  try {
    const data = {
      images: IMAGE_SHOW.images,
      selected: IMAGE_SHOW.selected ? IMAGE_SHOW.selected.id : null,
      fitIndex: IMAGE_SHOW.fitIndex,
      visible: IMAGE_SHOW.visible,
    };

    localStorage.setItem(IMAGE_SHOW_STORAGE_KEY, JSON.stringify(data));

    return true;
  } catch (error) {
    console.error("[ImageShow] Unable to save gallery:", error);

    return false;
  }
}

function imageShowLoad() {
  try {
    const saved = JSON.parse(localStorage.getItem(IMAGE_SHOW_STORAGE_KEY));

    if (!saved || typeof saved !== "object") {
      return;
    }

    IMAGE_SHOW.images = Array.isArray(saved.images)
      ? saved.images.filter((image) => {
          try {
            return (
              image &&
              typeof image.id === "string" &&
              typeof image.path === "string" &&
              typeof image.name === "string" &&
              fs.existsSync(image.path) &&
              fs.statSync(image.path).isFile()
            );
          } catch {
            return false;
          }
        })
      : [];

    IMAGE_SHOW.selected =
      IMAGE_SHOW.images.find((image) => image.id === saved.selected) || null;

    IMAGE_SHOW.fitIndex =
      Number.isInteger(saved.fitIndex) &&
      saved.fitIndex >= 0 &&
      saved.fitIndex < IMAGE_SHOW_FIT_MODES.length
        ? saved.fitIndex
        : 0;

    IMAGE_SHOW.visible =
      typeof saved.visible === "boolean" ? saved.visible : true;
  } catch (error) {
    console.error("[ImageShow] Unable to restore gallery:", error);
  }
}

// ======================================================
// BROADCAST CHANNEL
// ======================================================

function imageShowGetState() {
  return {
    action: "update",
    src: imageShowGetSelectedURL(),
    fit: IMAGE_SHOW_FIT_MODES[IMAGE_SHOW.fitIndex],
    visible: IMAGE_SHOW.visible,
  };
}

function imageShowBroadcast(action = "update") {
  imageShowChannel.postMessage({
    ...imageShowGetState(),
    action,
  });
}

// ======================================================
// LOCAL VIEWPORT
// ======================================================

function imageShowUpdateViewport() {
  const viewport = IMAGE_SHOW_ELEMENTS.viewport;

  if (!viewport) return;

  viewport.style.objectFit = IMAGE_SHOW_FIT_MODES[IMAGE_SHOW.fitIndex];

  if (IMAGE_SHOW.selected?.thumbnail) {
    // Keep the local preview static; the original URL is broadcast for animation.
    viewport.src = IMAGE_SHOW.selected.thumbnail;
  } else {
    viewport.removeAttribute("src");
  }
}

// ======================================================
// SELECT IMAGE
// ======================================================

function imageShowSelect(image) {
  if (!image) return;

  IMAGE_SHOW.selected = image;

  imageShowUpdateViewport();
  imageShowSave();
  imageShowBroadcast("update");
  imageShowRenderGallery();
}

// ======================================================
// REMOVE IMAGE
// ======================================================

function imageShowRemove(id) {
  IMAGE_SHOW.images = IMAGE_SHOW.images.filter((image) => image.id !== id);

  if (IMAGE_SHOW.selected?.id === id) {
    IMAGE_SHOW.selected = null;

    imageShowUpdateViewport();
    imageShowBroadcast("eject");
  }

  imageShowSave();
  imageShowRenderGallery();
}

// ======================================================
// GALLERY RENDERER
// ======================================================

function imageShowRenderGallery() {
  const gallery = IMAGE_SHOW_ELEMENTS.gallery;

  if (!gallery) return;

  gallery.replaceChildren();

  IMAGE_SHOW.images.forEach((image) => {
    const item = document.createElement("div");

    item.className = "imageshow-item";
    item.dataset.id = image.id;

    // Static Base64 thumbnail.
    const thumbnail = document.createElement("img");

    thumbnail.src = image.thumbnail || "";
    thumbnail.alt = image.name;
    thumbnail.width = IMAGE_SHOW_THUMBNAIL_SIZE;
    thumbnail.height = IMAGE_SHOW_THUMBNAIL_SIZE;
    thumbnail.draggable = false;

    // Image filename.
    const label = document.createElement("span");

    label.className = "imageshow-item-name";
    label.textContent = image.name;
    label.title = image.name;

    // Remove button.
    const close = document.createElement("button");

    close.type = "button";
    close.className = "imageshow-item-close";
    close.textContent = "×";
    close.title = "Remove image";

    close.addEventListener("click", (event) => {
      event.stopPropagation();
      choice({
        title: "Security Warning",
        message: "Are you sure you want to remove the image?",
        onConfirm: () => {
          imageShowRemove(image.id);
        },
      });
    });

    item.addEventListener("click", () => {
      imageShowSelect(image);
    });

    item.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      ipcRenderer.send("open-image-viewer", { src: imageShowURL(image.path) });
    });

    item.classList.toggle("selected", IMAGE_SHOW.selected?.id === image.id);

    item.append(thumbnail, label, close);

    gallery.appendChild(item);
  });
}

// ======================================================
// IMPORT IMAGES
// ======================================================

window.IMPORTIMAGE = async (filePaths) => {
  if (!Array.isArray(filePaths) || !filePaths.length) {
    return 0;
  }

  const existingPaths = new Set(
    IMAGE_SHOW.images.map((image) => path.resolve(image.path)),
  );

  let imported = 0;

  for (const filePath of filePaths) {
    try {
      if (
        typeof filePath !== "string" ||
        !fs.existsSync(filePath) ||
        !fs.statSync(filePath).isFile()
      ) {
        continue;
      }

      const normalizedPath = path.resolve(filePath);

      if (existingPaths.has(normalizedPath)) {
        continue;
      }

      const thumbnail = await imageShowCreateThumbnail(normalizedPath);

      IMAGE_SHOW.images.push({
        id: imageShowCreateID(),
        path: normalizedPath,
        name: path.basename(normalizedPath),
        thumbnail,
      });

      existingPaths.add(normalizedPath);
      imported++;
    } catch (error) {
      console.error("[ImageShow] Import failed:", filePath, error);
    }
  }

  if (imported > 0) {
    imageShowSave();
    imageShowRenderGallery();
  }

  console.log(`[ImageShow] Imported ${imported} image(s).`);

  return imported;
};

IMAGE_SHOW_ELEMENTS.load?.addEventListener("click", async () => {
  try {
    const filePaths = await ipcRenderer.invoke("imageshow:import");

    if (!Array.isArray(filePaths) || !filePaths.length) return;

    await window.IMPORTIMAGE(filePaths);
  } catch (error) {
    console.error("[ImageShow] Import error:", error);
  }
});

// ======================================================
// EJECT CURRENT IMAGE
// ======================================================

IMAGE_SHOW_ELEMENTS.eject?.addEventListener("click", () => {
  IMAGE_SHOW.selected = null;

  imageShowUpdateViewport();
  imageShowRenderGallery();
  imageShowSave();
  imageShowBroadcast("eject");
});

// ======================================================
// CHANGE IMAGE FIT
// ======================================================

IMAGE_SHOW_ELEMENTS.fit?.addEventListener("click", () => {
  IMAGE_SHOW.fitIndex = (IMAGE_SHOW.fitIndex + 1) % IMAGE_SHOW_FIT_MODES.length;

  const fit = IMAGE_SHOW_FIT_MODES[IMAGE_SHOW.fitIndex];

  imageShowUpdateViewport();

  IMAGE_SHOW_ELEMENTS.fit.title = `Image Fit: ${fit.toUpperCase()}`;

  IMAGE_SHOW_ELEMENTS.fit.querySelector("span").textContent = fit.toUpperCase();

  imageShowSave();
  imageShowBroadcast("adjust");
});

// ======================================================
// EXTERNAL OUTPUT VISIBILITY
// ======================================================

IMAGE_SHOW_ELEMENTS.visible?.addEventListener("click", () => {
  IMAGE_SHOW.visible = !IMAGE_SHOW.visible;

  IMAGE_SHOW_ELEMENTS.visible.classList.toggle("active", IMAGE_SHOW.visible);

  IMAGE_SHOW_ELEMENTS.visible.title = IMAGE_SHOW.visible
    ? "External Image Visible"
    : "External Image Hidden";

  IMAGE_SHOW_ELEMENTS.visible.querySelector("span").textContent =
    IMAGE_SHOW.visible ? "VISIBLE" : "HIDDEN";

  IMAGE_SHOW_ELEMENTS.visible.querySelector("img").src =
    "icons/monosource/" +
    (IMAGE_SHOW.visible ? "visibility.svg" : "visibility_off.svg");

  imageShowSave();
  imageShowBroadcast("visibility");
});

// ======================================================
// RECEIVE EXTERNAL OUTPUT REQUESTS
// ======================================================

imageShowChannel.addEventListener("message", (event) => {
  const data = event.data;

  if (!data || typeof data !== "object") return;

  if (data.action === "request-state") {
    imageShowBroadcast("update");
  }
});

// ======================================================
// RESTORE MISSING THUMBNAILS
// ======================================================

async function imageShowRestoreThumbnails() {
  let changed = false;

  for (const image of IMAGE_SHOW.images) {
    if (
      typeof image.thumbnail === "string" &&
      image.thumbnail.startsWith("data:image/")
    ) {
      continue;
    }

    try {
      image.thumbnail = await imageShowCreateThumbnail(image.path);

      changed = true;
    } catch (error) {
      console.warn(
        "[ImageShow] Thumbnail restoration failed:",
        image.name,
        error,
      );
    }
  }

  if (changed) {
    imageShowSave();
    imageShowRenderGallery();
    imageShowUpdateViewport();
  }
}

// ======================================================
// INITIALIZE
// ======================================================

async function initializeImageShow() {
  imageShowLoad();

  imageShowRenderGallery();
  imageShowUpdateViewport();

  if (IMAGE_SHOW_ELEMENTS.fit) {
    IMAGE_SHOW_ELEMENTS.fit.title = `Image Fit: ${IMAGE_SHOW_FIT_MODES[
      IMAGE_SHOW.fitIndex
    ].toUpperCase()}`;

    IMAGE_SHOW_ELEMENTS.fit.querySelector("span").textContent =
      IMAGE_SHOW_FIT_MODES[IMAGE_SHOW.fitIndex].toUpperCase();
  }

  if (IMAGE_SHOW_ELEMENTS.visible) {
    IMAGE_SHOW_ELEMENTS.visible.classList.toggle("active", IMAGE_SHOW.visible);

    IMAGE_SHOW_ELEMENTS.visible.title = IMAGE_SHOW.visible
      ? "External Image Visible"
      : "External Image Hidden";

    IMAGE_SHOW_ELEMENTS.visible.querySelector("span").textContent =
      IMAGE_SHOW.visible ? "VISIBLE" : "HIDDEN";

    IMAGE_SHOW_ELEMENTS.visible.querySelector("img").src =
      "icons/monosource/" +
      (IMAGE_SHOW.visible ? "visibility.svg" : "visibility_off.svg");
  }

  // Generate thumbnails for older saved gallery entries.
  await imageShowRestoreThumbnails();

  imageShowBroadcast("update");

  console.log("[ImageShow] Initialized successfully.");
}

initializeImageShow();
