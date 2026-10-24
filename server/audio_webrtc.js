const http = require("http");
const WebSocket = require("ws");
const fs = require("fs");
const os = require("os");
const path = require("path");


var PORT = 3146;

function getLocalIPv4() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(interfaces)) {
        for (const info of interfaces[name] || []) {
            if (
                info.family === "IPv4" &&
                !info.internal
            ) {
                candidates.push({
                    name,
                    address: info.address
                });
            }
        }
    }

    // --------------------------------------------------------
    // Prefer normal LAN adapters
    // --------------------------------------------------------

    const preferred =
        candidates.find(
            item =>
                /^192\.168\./.test(item.address)
        );


    if (preferred) {

        return preferred.address;

    }


    const private10 =
        candidates.find(
            item =>
                /^10\./.test(item.address)
        );


    if (private10) {

        return private10.address;

    }


    const private172 =
        candidates.find(
            item =>
                /^172\.(1[6-9]|2[0-9]|3[0-1])\./
                    .test(item.address)
        );


    if (private172) {

        return private172.address;

    }


    if (candidates.length > 0) {

        return candidates[0].address;

    }


    return "127.0.0.1";

}


var localIP =
    getLocalIPv4();


// ============================================================
// HTTP SERVER
// ============================================================

const httpServer =
    http.createServer(
        (req, res) => {

            console.log(
                "[HTTP]",
                req.method,
                req.url
            );


            // ------------------------------------------------
            // EDGE RECEIVER
            // ------------------------------------------------

            if (
                req.url === "/" ||
                req.url === "/index.html"
            ) {

                const filePath =
                    path.join(
                        __dirname,
                        "edge.html"
                    );


                fs.readFile(
                    filePath,
                    (error, data) => {

                        if (error) {

                            console.error(
                                "[HTTP] Failed to load edge.html:",
                                error
                            );


                            res.writeHead(
                                500,
                                {
                                    "Content-Type":
                                        "text/plain"
                                }
                            );


                            res.end(
                                "Could not load edge.html"
                            );

                            return;

                        }


                        res.writeHead(
                            200,
                            {
                                "Content-Type":
                                    "text/html; charset=utf-8"
                            }
                        );


                        res.end(data);

                    }
                );

                return;

            }


            // ------------------------------------------------
            // STATIC FILES USED BY THE EDGE RECEIVER
            // ------------------------------------------------

            let requestedFile;

            try {

                requestedFile = decodeURIComponent(
                    new URL(
                        req.url,
                        `http://${req.headers.host || "localhost"}`
                    ).pathname
                );

            }

            catch (error) {

                res.writeHead(400, { "Content-Type": "text/plain" });
                res.end("Invalid request path");
                return;

            }


            const rootDirectory = path.resolve(__dirname);
            const assetPath = path.resolve(
                rootDirectory,
                `.${requestedFile}`
            );

            const isInsideRoot =
                assetPath === rootDirectory ||
                assetPath.startsWith(`${rootDirectory}${path.sep}`);


            if (isInsideRoot && assetPath !== rootDirectory) {

                const contentTypes = {
                    ".css": "text/css; charset=utf-8",
                    ".js": "application/javascript; charset=utf-8",
                    ".json": "application/json; charset=utf-8",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".gif": "image/gif",
                    ".svg": "image/svg+xml",
                    ".webp": "image/webp",
                    ".ico": "image/x-icon",
                    ".woff": "font/woff",
                    ".woff2": "font/woff2",
                    ".ttf": "font/ttf",
                    ".otf": "font/otf"
                };

                fs.stat(assetPath, (error, stats) => {
                    if (error || !stats.isFile()) {
                        res.writeHead(404, { "Content-Type": "text/plain" });
                        res.end("Not found");
                        return;
                    }

                    res.writeHead(200, {
                        "Content-Type":
                            contentTypes[path.extname(assetPath).toLowerCase()] ||
                            "application/octet-stream"
                    });

                    fs.createReadStream(assetPath).pipe(res);
                });

                return;

            }


            // ------------------------------------------------
            // 404
            // ------------------------------------------------

            res.writeHead(
                404,
                {
                    "Content-Type":
                        "text/plain"
                }
            );


            res.end(
                "Not found"
            );

        }
    );


// ============================================================
// WEBSOCKET SERVER
// ============================================================

const wss = new WebSocket.Server({ server: httpServer });
const clients = new Map();
let nextClientId = 1;


function generateClientId() { return `client_${nextClientId++}`; }


// ============================================================
// SEND JSON
// ============================================================

function sendJSON(
    socket,
    data
) {

    if (
        socket &&
        socket.readyState ===
        WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );

    }

}


// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

wss.on(
    "connection",
    socket => {

        const clientId =
            generateClientId();


        clients.set(
            clientId,
            {
                socket,
                role: "unknown"
            }
        );


        console.log(
            `[SIGNALING] Client connected: ${clientId}`
        );


        // ----------------------------------------------------
        // Tell client its ID
        // ----------------------------------------------------

        sendJSON(
            socket,
            {
                type:
                    "assigned-id",

                id:
                    clientId
            }
        );


        // ----------------------------------------------------
        // MESSAGE
        // ----------------------------------------------------

        socket.on(
            "message",
            message => {

                let data;


                try {

                    data =
                        JSON.parse(
                            message.toString()
                        );

                }

                catch (error) {

                    console.error(
                        "[SIGNALING] Invalid JSON"
                    );

                    return;

                }


                console.log(
                    `[SIGNALING] ${clientId}:`,
                    data.type
                );


                // =================================================
                // REGISTER ROLE
                // =================================================

                if (
                    data.type ===
                    "register"
                ) {

                    const client =
                        clients.get(
                            clientId
                        );


                    if (!client) {

                        return;

                    }


                    client.role =
                        data.role ||
                        "unknown";


                    console.log(
                        `[SIGNALING] ${clientId} registered as ${client.role}`
                    );


                    // ---------------------------------------------
                    // RECEIVER JOINED
                    // ---------------------------------------------

                    if (
                        client.role ===
                        "receiver"
                    ) {

                        const sender =
                            [...clients.entries()]
                                .find(
                                    ([id, item]) =>
                                        item.role ===
                                        "sender"
                                );


                        if (sender) {

                            sendJSON(
                                sender[1].socket,
                                {
                                    type:
                                        "receiver-joined",

                                    receiverId:
                                        clientId
                                }
                            );

                        }

                    }


                    return;

                }


                // =================================================
                // SIGNALING MESSAGE
                // =================================================

                if (
                    data.target
                ) {

                    const target =
                        clients.get(
                            data.target
                        );


                    if (!target) {

                        console.warn(
                            `[SIGNALING] Target not found: ${data.target}`
                        );

                        return;

                    }


                    sendJSON(
                        target.socket,
                        {
                            ...data,

                            sender:
                                clientId
                        }
                    );


                    return;

                }


                console.warn(
                    "[SIGNALING] Message has no target:",
                    data
                );

            }
        );


        // ----------------------------------------------------
        // DISCONNECT
        // ----------------------------------------------------

        socket.on(
            "close",
            () => {

                const client =
                    clients.get(
                        clientId
                    );


                console.log(
                    `[SIGNALING] Client disconnected: ${clientId}`
                );


                // ---------------------------------------------
                // Tell sender receiver disappeared
                // ---------------------------------------------

                if (
                    client &&
                    client.role ===
                    "receiver"
                ) {

                    const sender =
                        [...clients.entries()]
                            .find(
                                ([id, item]) =>
                                    item.role ===
                                    "sender"
                            );


                    if (sender) {

                        sendJSON(
                            sender[1].socket,
                            {
                                type:
                                    "receiver-left",

                                receiverId:
                                    clientId
                            }
                        );

                    }

                }


                clients.delete(
                    clientId
                );

            }
        );


        // ----------------------------------------------------
        // ERROR
        // ----------------------------------------------------

        socket.on(
            "error",
            error => {

                console.error(
                    `[SIGNALING] ${clientId} error:`,
                    error
                );

            }
        );

    }
);


// ============================================================
// START SERVER
// ============================================================

let httpServerListening = false;

function startHTTPServer() {
    localIP = getLocalIPv4();

    if (httpServerListening) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const onError = error => {
            httpServer.removeListener("listening", onListening);
            reject(error);
        };

        const onListening = () => {
            httpServer.removeListener("error", onError);
            httpServerListening = true;

            window.SFXSTUDIO_TEXTBOX[0].value = `http://localhost:${PORT}`
            window.SFXSTUDIO_TEXTBOX[1].value = `http://${localIP}:${PORT}`
            window.SFXSTUDIO_BROADCAST_BUTTON.title = `Stop Broadcast On-Air`;
            resolve();
        };

        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(PORT, "0.0.0.0");
    });
}

function stopHTTPServer() {
    if (!httpServerListening) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        httpServer.close(error => {
            if (error) {
                reject(error);
                return;
            }

            httpServerListening = false;
            window.SFXSTUDIO_TEXTBOX[0].value = ``
            window.SFXSTUDIO_TEXTBOX[1].value = ``
            window.SFXSTUDIO_BROADCAST_BUTTON.title = "Broadcast On-Air";
            resolve();
        });
    });
}

// ============================================================
// VJDY FM SFXSTUDIO
// WEBRTC MASTER AUDIO BROADCAST
// MULTI-RECEIVER SENDER
// ============================================================


// ------------------------------------------------------------
// WEBRTC VARIABLES
// ------------------------------------------------------------

let webrtcSocket = null;
let webrtcMasterDestination = null;
let webrtcMasterStream = null;
let webrtcMasterTrack = null;
let webrtcBluetoothDelay = null;

// Bluetooth audio commonly adds roughly 150–200 ms of latency. Delaying the
// WebRTC path keeps it aligned with locally monitored Bluetooth audio.
const BLUETOOTH_COMPENSATION_MS = 200;

const webrtcPeers =
    new Map();

async function startWebRTCMasterBroadcast() {
    console.log("[WebRTC] Starting master broadcast...");

    if (!audioCtx) {
        console.error(
            "[WebRTC] audioCtx does not exist!"
        );
        return;
    }

    if (!ONAIR_GAIN) {
        console.error(
            "[WebRTC] ONAIR_GAIN does not exist!"
        );
        return;
    }

    if (webrtcSocket) {
        console.warn(
            "[WebRTC] Broadcast already running."
        );
        return;
    }

    if (
        audioCtx.state ===
        "suspended"
    ) {
        try {
            await audioCtx.resume();
        }
        catch (error) {
            console.error(
                "[WebRTC] Failed to resume AudioContext:",
                error
            );
        }
    }

    webrtcMasterDestination = audioCtx.createMediaStreamDestination();
    webrtcMasterDestination.channelCount = 2;
    webrtcMasterDestination.channelCountMode = "explicit";
    webrtcMasterDestination.channelInterpretation = "speakers";

    ONAIR_GAIN.connect(webrtcMasterDestination);
    console.log(
        `[WebRTC] ONAIR_GAIN connected to WebRTC with ${BLUETOOTH_COMPENSATION_MS} ms Bluetooth compensation`
    );

    webrtcMasterStream = webrtcMasterDestination.stream;
    webrtcMasterTrack = webrtcMasterStream.getAudioTracks()[0];


    if (!webrtcMasterTrack) {
        console.error(
            "[WebRTC] No master audio track found!"
        );
        return;
    }

    webrtcSocket = new WebSocket(`ws://localhost:${PORT}`);

    webrtcSocket.onopen = () => {
        webrtcSocket.send(
            JSON.stringify({
                type:
                    "register",
                role:
                    "sender"
            })
        );

        console.log(
            "[WebRTC] Registered as sender"
        );
    };


    webrtcSocket.onmessage =
        async event => {
            try {

                const message =
                    JSON.parse(
                        event.data
                    );


                console.log(
                    "[WebRTC] Received:",
                    message.type
                );


                // =================================================
                // ASSIGNED ID
                // =================================================

                if (
                    message.type ===
                    "assigned-id"
                ) {

                    console.log(
                        "[WebRTC] Sender ID:",
                        message.id
                    );

                    return;

                }


                // =================================================
                // NEW RECEIVER
                // =================================================

                if (
                    message.type ===
                    "receiver-joined"
                ) {

                    await createPeerForReceiver(
                        message.receiverId
                    );

                    return;

                }


                // =================================================
                // ANSWER
                // =================================================

                if (
                    message.type ===
                    "answer"
                ) {

                    const peer =
                        webrtcPeers.get(
                            message.sender
                        );


                    if (!peer) {

                        console.warn(
                            "[WebRTC] Peer not found for answer:",
                            message.sender
                        );

                        return;

                    }


                    await peer.setRemoteDescription(
                        message.answer
                    );


                    console.log(
                        "[WebRTC] Answer applied:",
                        message.sender
                    );


                    return;

                }


                // =================================================
                // ICE CANDIDATE
                // =================================================

                if (
                    message.type ===
                    "candidate"
                ) {

                    const peer =
                        webrtcPeers.get(
                            message.sender
                        );


                    if (!peer) {

                        console.warn(
                            "[WebRTC] Peer not found for candidate:",
                            message.sender
                        );

                        return;

                    }


                    try {

                        await peer.addIceCandidate(
                            message.candidate
                        );

                    }

                    catch (error) {

                        console.error(
                            "[WebRTC] ICE candidate error:",
                            error
                        );

                    }


                    return;

                }


                // =================================================
                // RECEIVER LEFT
                // =================================================

                if (
                    message.type ===
                    "receiver-left"
                ) {

                    removePeer(
                        message.receiverId
                    );

                    return;

                }

            }

            catch (error) {

                console.error(
                    "[WebRTC] Signaling error:",
                    error
                );

            }

        };

    webrtcSocket.onclose = () => {
        console.log(
            "[WebRTC] Signaling socket closed"
        );


        webrtcSocket =
            null;
    };


    // ========================================================
    // SOCKET ERROR
    // ========================================================

    webrtcSocket.onerror =
        error => {
            console.error(
                "[WebRTC] Signaling socket error:",
                error
            );
        };


    console.log(
        "[WebRTC] Multi-receiver broadcast ready"
    );

    window.SFXSTUDIO_BROADCASTING_STYLE("active");
    window.SFXSTUDIO_BROADCASTING_BOOLEAN = true
}


// ============================================================
// CREATE PEER FOR RECEIVER
// ============================================================

async function createPeerForReceiver(
    receiverId
) {

    console.log(
        "[WebRTC] Creating peer for:",
        receiverId
    );


    // --------------------------------------------------------
    // Prevent duplicate
    // --------------------------------------------------------

    if (
        webrtcPeers.has(
            receiverId
        )
    ) {

        console.warn(
            "[WebRTC] Peer already exists:",
            receiverId
        );

        return;

    }


    // ========================================================
    // CREATE PEER
    // ========================================================

    const peer =
        new RTCPeerConnection({

            iceServers: []

        });


    // ========================================================
    // SAVE PEER
    // ========================================================

    webrtcPeers.set(
        receiverId,
        peer
    );


    // ========================================================
    // ADD MASTER AUDIO
    // ========================================================

    peer.addTrack(
        webrtcMasterTrack,
        webrtcMasterStream
    );


    console.log(
        "[WebRTC] Master track added:",
        receiverId
    );


    // ========================================================
    // ICE
    // ========================================================

    peer.onicecandidate =
        event => {

            if (
                !event.candidate
            ) {

                return;

            }


            if (
                !webrtcSocket ||
                webrtcSocket.readyState !==
                WebSocket.OPEN
            ) {

                return;

            }


            webrtcSocket.send(
                JSON.stringify({

                    type:
                        "candidate",

                    target:
                        receiverId,

                    candidate:
                        event.candidate

                })
            );

        };


    // ========================================================
    // CONNECTION STATE
    // ========================================================

    peer.onconnectionstatechange =
        () => {

            console.log(
                `[WebRTC] ${receiverId}:`,
                peer.connectionState
            );


            if (
                peer.connectionState ===
                "connected"
            ) {

                console.log(
                    `[WebRTC] 🎧 Receiver connected: ${receiverId}`
                );

            }


            if (
                peer.connectionState ===
                "failed"
            ) {

                console.error(
                    `[WebRTC] Connection failed: ${receiverId}`
                );


                removePeer(
                    receiverId
                );

            }


            if (
                peer.connectionState ===
                "closed"
            ) {

                removePeer(
                    receiverId
                );

            }

        };


    // ========================================================
    // CREATE OFFER
    // ========================================================

    const offer =
        await peer.createOffer();


    await peer.setLocalDescription(
        offer
    );


    // ========================================================
    // SEND OFFER
    // ========================================================

    webrtcSocket.send(
        JSON.stringify({

            type:
                "offer",

            target:
                receiverId,

            offer:
                peer.localDescription

        })
    );


    console.log(
        "[WebRTC] Offer sent to:",
        receiverId
    );

}


// ============================================================
// REMOVE PEER
// ============================================================

function removePeer(
    receiverId
) {

    const peer =
        webrtcPeers.get(
            receiverId
        );


    if (peer) {

        try {

            peer.close();

        }

        catch (error) {

            console.warn(
                "[WebRTC] Peer close warning:",
                error
            );

        }

    }


    webrtcPeers.delete(
        receiverId
    );


    console.log(
        "[WebRTC] Removed receiver:",
        receiverId
    );

}


// ============================================================
// STOP BROADCAST
// ============================================================

function stopWebRTCMasterBroadcast() {

    console.log(
        "[WebRTC] Stopping master broadcast..."
    );


    // ========================================================
    // CLOSE ALL PEERS
    // ========================================================

    for (
        const [
            receiverId,
            peer
        ]
        of webrtcPeers
    ) {

        console.log(
            "[WebRTC] Closing:",
            receiverId
        );


        try {

            peer.close();

        }

        catch (error) {

            console.warn(
                "[WebRTC] Peer close warning:",
                error
            );

        }

    }


    webrtcPeers.clear();


    // ========================================================
    // CLOSE SIGNALING
    // ========================================================

    if (webrtcSocket) {

        try {

            webrtcSocket.close();

        }

        catch (error) {

            console.warn(
                "[WebRTC] Socket close warning:",
                error
            );

        }

        webrtcSocket =
            null;

    }


    // ========================================================
    // DISCONNECT MASTER
    // ========================================================

    if (
        webrtcMasterDestination &&
        ONAIR_GAIN
    ) {

        try {

            ONAIR_GAIN.disconnect();

        }

        catch (error) {

            console.warn(
                "[WebRTC] Destination disconnect warning:",
                error
            );

        }

    }

    // ========================================================
    // STOP TRACK
    // ========================================================

    if (
        webrtcMasterTrack
    ) {

        try {

            webrtcMasterTrack.stop();

        }

        catch (error) {

            console.warn(
                "[WebRTC] Track stop warning:",
                error
            );

        }

    }


    // ========================================================
    // CLEAR
    // ========================================================

    webrtcMasterTrack =
        null;

    webrtcMasterStream =
        null;

    webrtcMasterDestination =
        null;


    console.log(
        "[WebRTC] Master broadcast stopped"
    );

    window.SFXSTUDIO_BROADCASTING_STYLE("inactive");
    window.SFXSTUDIO_BROADCASTING_BOOLEAN = false;
}


// ============================================================
// STREAM AUDIO VIA HOST CONTROLS
// ============================================================

let streamIPAddress = localIP;

function setIPAddress(address) {
    if (typeof address !== "string" || !address.trim()) {
        throw new TypeError("A valid IP address is required.");
    }

    streamIPAddress = address.trim();
    return streamIPAddress;
}


function closeIPAddress() {

    streamIPAddress = null;

    return streamIPAddress;

}


async function startStream() {
    if (!streamIPAddress) {

        setIPAddress(localIP);

    }

    await startHTTPServer();
    return startWebRTCMasterBroadcast();
}


async function stopStream() {
    stopWebRTCMasterBroadcast();
    closeIPAddress();
    await stopHTTPServer();
}


module.exports = {
    setIPAddress,
    closeIPAddress,
    startStream,
    stopStream,
    startWebRTCMasterBroadcast,
    stopWebRTCMasterBroadcast
};