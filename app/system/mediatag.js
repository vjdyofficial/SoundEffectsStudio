const jsmediatags = require("jsmediatags");

/**
 * Reads metadata from an audio file URL or path.
 * @param {string} fileUrl - The file URL or local path of the audio file.
 * @returns {Promise<{TITLE: string, ARTIST: string, ALBUM: string}>}
 */

async function resizeImageTo512(base64) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement("canvas");
            const size = 512;

            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, size, size);

            resolve(canvas.toDataURL("image/png"));
        };
        img.src = base64;
    });
}

function getAudioMetadata(fileUrl) {
    return new Promise((resolve, reject) => {
        if (!fileUrl) {
            reject(new Error("No file URL provided"));
            return;
        }

        jsmediatags.read(fileUrl, {
            onSuccess: (tag) => {
                let cover = null;

                if (tag.tags.picture) {
                    const { data, format } = tag.tags.picture;
                    let base64String = "";
                    for (let i = 0; i < data.length; i++) {
                        base64String += String.fromCharCode(data[i]);
                    }
                    cover = `data:${format};base64,${btoa(base64String)}`;
                }

                const meta = {
                    TITLE: tag.tags.title || fileUrl.split(/[\\/]/).pop() || "Unknown Title",
                    ARTIST: tag.tags.artist || "Unknown Artist",
                    ALBUMARTIST: tag.tags.albumartist || "Unknown Artist",
                    ALBUM: tag.tags.album || "Unknown Album",
                    COVER: cover || "images/albumart-default.svg",
                    TRACK: tag.tags.track || "Unknown",
                    YEAR: tag.tags.year || "Unknown",
                    DATE: tag.tags.date || "Unknown",
                    DISC: tag.tags.disc || "Unknown",
                    GENRE: tag.tags.genre || "Unknown",
                    COMPOSER: tag.tags.composer || "Unknown",
                    LYRICIST: tag.tags.lyricist || "Unknown",
                    PUBLISHER: tag.tags.publisher || "Unknown",
                    LABEL: tag.tags.label || "Unknown",
                    COPYRIGHT: tag.tags.copyright || "Unknown"
                };
                resolve(meta);
            },
            onError: (error) => {
                reject(error);
            }
        });
    });
}