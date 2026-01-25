const https = require("https");

/**
 * Send a message to Kustom app
 * @param {string[]} tokens - Array of tokens from Kustom settings
 * @param {object} data - Data payload to send (e.g., { tweet: "Hello!" })
 * @returns {Promise<string>} - Resolves with API response
 */
function sendMsg(tokens, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      tokens,  // must be an array
      data
    });

    const options = {
      hostname: "api.kustom.rocks",
      port: 443,
      path: "/msg",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => (body += chunk));
      res.on("end", () => resolve(body));
    });

    req.on("error", (err) => reject(err));

    req.write(payload);
    req.end();
  });
}

module.exports = { sendMsg };
