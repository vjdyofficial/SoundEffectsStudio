const jsmediatags = require("jsmediatags");

/**
 * Reads metadata from an audio file URL or path.
 * @param {string} fileUrl - The file URL or local path of the audio file.
 * @returns {Promise<{TITLE: string, ARTIST: string, ALBUM: string}>}
 */
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
                    TITLE: tag.tags.title || fileUrl.name || "Unknown Title",
                    ARTIST: tag.tags.artist || "",
                    ALBUM: tag.tags.album || "",
                    COVER: cover || ""
                };
                resolve(meta);
            },
            onError: (error) => {
                reject(error);
            }
        });
    });
}