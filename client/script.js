const ICON_CAM_ON = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
const ICON_CAM_OFF = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"></path></svg>`;
const ICON_MIC_ON = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
const ICON_MIC_OFF = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
const ICON_SCREEN_ON = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
const ICON_SCREEN_OFF = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

// Ask for a real HD-ish capture instead of the browser's low-res default
// (often 640x480), which otherwise gets visibly blurry once upscaled to fill
// the video tile - especially noticeable behind a sharp background image.
// "ideal" lets the browser fall back gracefully on weaker cameras.
const VIDEO_CONSTRAINTS = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 }
};

// WebRTC's default bitrate is deliberately conservative and will otherwise
// keep the actual sent video looking soft/blocky even when captured at
// 720p - bump the encoder's ceiling so it can actually use that resolution.
const OUTGOING_VIDEO_MAX_BITRATE = 2_500_000; // ~2.5 Mbps, good for 720p30
const OUTGOING_SCREEN_SHARE_MAX_BITRATE = 4_000_000; // text/detail needs more headroom

async function configureVideoSenderQuality(sender, maxBitrate = OUTGOING_VIDEO_MAX_BITRATE) {
    if (!sender) return;

    try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = maxBitrate;
        await sender.setParameters(params);
    } catch (error) {
        console.warn("Unable to raise outgoing video bitrate:", error);
    }
}

const BACKEND_URL = (() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
        return "";
    }
    return "https://meet-yeet-1.onrender.com";
})();
if (typeof io !== "function") {
    alert("Unable to load real-time meeting service. Please refresh the page.");
    throw new Error("Socket.IO client is not available");
}

const socket = io(BACKEND_URL, {
    withCredentials: false,
    transports: ["websocket", "polling"]
});

const pathParts = window.location.pathname.split("/").filter(Boolean);
const roomId = pathParts[0] === "room" && pathParts[1] ? pathParts[1] : "meeting1";

const video = document.getElementById("localVideo");

const videoBtn = document.getElementById("videoBtn");
const micBtn = document.getElementById("micBtn");
const screenBtn = document.getElementById("screenBtn");

const chatBox = document.getElementById("chatBox");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const participantsList = document.getElementById("participantsList");
const participantsCount = document.getElementById("participantsCount");

const videoIcon = document.getElementById("camIcon") || document.getElementById("videoIcon");
const micIcon = document.getElementById("micIcon");
const screenIcon = document.getElementById("screenIcon");

/* ACCOUNT ELEMENTS */
const accountPanel = document.getElementById("accountPanel");
const userNameDisplay = document.getElementById("userName");
const nameInput = document.getElementById("nameInput");

const participantsById = new Map();

function getLoggedInName(){
    try{
        const storedUser = JSON.parse(localStorage.getItem("user") || "null");
        if (storedUser && storedUser.name) return storedUser.name;
        return storedUser && storedUser.email ? storedUser.email : "";
    }catch(error){
        return "";
    }
}

function getDisplayName(){
    const savedName = localStorage.getItem("username");
    const loggedInName = getLoggedInName();

    if (savedName && savedName.trim()) {
        return savedName.trim();
    }

    if (loggedInName) {
        return loggedInName;
    }

    return "Guest";
}

function renderParticipants(){
    if (!participantsList || !participantsCount) {
        return;
    }

    participantsList.innerHTML = "";

    const names = Array.from(participantsById.values()).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    names.forEach((name) => {
        const li = document.createElement("li");
        li.innerText = name;
        participantsList.appendChild(li);
    });

    participantsCount.innerText = "(" + names.length + ")";
}

function appendSystemMessage(message){
    const div = document.createElement("div");
    div.innerText = message;
    div.style.color = "#9ea3a8";
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

let localStream = null;
let screenStream;

let videoEnabled = true;
let micEnabled = true;
let screenSharing = false;

/* ---------------- BACKGROUND EFFECTS (blur + virtual backgrounds) ---------------- */

let backgroundMode = "none"; // "none" | "blur" | one of BACKGROUND_GRADIENTS' keys
let backgroundModeBeforeShare = "none";
let cameraWasOnBeforeShare = true;
let selfieSegmentation = null;
let segmentationActive = false;
let hiddenSourceVideo = null;
let bgCanvas = null;
let bgCanvasCtx = null;
let blurredStream = null;

const BACKGROUND_GRADIENTS = {
    studio: ["#3A3A46", "#101015"],
    ocean: ["#38BDF8", "#0C4A6E"],
    sunset: ["#FB923C", "#7C3AED"],
    forest: ["#4ADE80", "#064E3B"]
};

const CUSTOM_BG_STORAGE_KEY = "meetyeet_custom_background";
const CUSTOM_BG_MAX_DIMENSION = 1280;
const CUSTOM_BG_MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

let customBackgroundImage = null;

function drawImageCover(ctx, img, w, h) {
    const imgRatio = img.width / img.height;
    const targetRatio = w / h;
    let sx, sy, sw, sh;

    if (imgRatio > targetRatio) {
        sh = img.height;
        sw = sh * targetRatio;
        sx = (img.width - sw) / 2;
        sy = 0;
    } else {
        sw = img.width;
        sh = sw / targetRatio;
        sx = 0;
        sy = (img.height - sh) / 2;
    }

    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function ensureHiddenSourceVideo() {
    if (hiddenSourceVideo) return hiddenSourceVideo;

    hiddenSourceVideo = document.createElement("video");
    hiddenSourceVideo.autoplay = true;
    hiddenSourceVideo.muted = true;
    hiddenSourceVideo.playsInline = true;
    hiddenSourceVideo.style.position = "absolute";
    hiddenSourceVideo.style.width = "1px";
    hiddenSourceVideo.style.height = "1px";
    hiddenSourceVideo.style.opacity = "0";
    hiddenSourceVideo.style.pointerEvents = "none";
    document.body.appendChild(hiddenSourceVideo);
    return hiddenSourceVideo;
}

async function ensureSegmentation() {
    if (selfieSegmentation) return selfieSegmentation;

    if (typeof SelfieSegmentation !== "function") {
        throw new Error("Background blur library failed to load");
    }

    const instance = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });

    instance.setOptions({ modelSelection: 1 });
    instance.onResults(onSegmentationResults);
    await instance.initialize();

    selfieSegmentation = instance;
    return selfieSegmentation;
}

function onSegmentationResults(results) {
    if (!bgCanvasCtx) return;

    bgCanvasCtx.save();
    bgCanvasCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

    // Keep only the person pixels from the mask...
    bgCanvasCtx.drawImage(results.segmentationMask, 0, 0, bgCanvas.width, bgCanvas.height);
    bgCanvasCtx.globalCompositeOperation = "source-in";
    bgCanvasCtx.drawImage(results.image, 0, 0, bgCanvas.width, bgCanvas.height);

    // ...then fill everything else in behind them.
    bgCanvasCtx.globalCompositeOperation = "destination-over";

    if (backgroundMode === "blur") {
        bgCanvasCtx.filter = "blur(12px)";
        bgCanvasCtx.drawImage(results.image, 0, 0, bgCanvas.width, bgCanvas.height);
        bgCanvasCtx.filter = "none";
    } else if (backgroundMode === "custom" && customBackgroundImage) {
        drawImageCover(bgCanvasCtx, customBackgroundImage, bgCanvas.width, bgCanvas.height);
    } else {
        const stops = BACKGROUND_GRADIENTS[backgroundMode];
        if (stops) {
            const gradient = bgCanvasCtx.createLinearGradient(0, 0, bgCanvas.width, bgCanvas.height);
            gradient.addColorStop(0, stops[0]);
            gradient.addColorStop(1, stops[1]);
            bgCanvasCtx.fillStyle = gradient;
            bgCanvasCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        }
    }

    bgCanvasCtx.restore();
}

async function segmentationLoop() {
    if (!segmentationActive) return;

    if (hiddenSourceVideo && hiddenSourceVideo.readyState >= 2) {
        try {
            await selfieSegmentation.send({ image: hiddenSourceVideo });
        } catch (error) {
            console.error("Segmentation frame error:", error);
        }
    }

    if (segmentationActive) {
        requestAnimationFrame(segmentationLoop);
    }
}

// Finds the video sender on a peer connection reliably, even when its
// current track is null (e.g. camera stopped/released) - looking at
// getSenders() alone loses track (pun intended) of "kind" once the sender's
// track is null, since kind lives on the track, not the sender. The
// transceiver's receiver track kind stays stable for the connection's
// lifetime, so it's used as a fallback identifier.
function getVideoSender(pc) {
    const transceiver = pc.getTransceivers().find((t) =>
        (t.sender && t.sender.track && t.sender.track.kind === "video") ||
        (t.receiver && t.receiver.track && t.receiver.track.kind === "video")
    );
    return transceiver ? transceiver.sender : null;
}

function applyOutgoingVideoTrack(track) {
    refreshLocalPreview();

    if (!screenSharing) {
        for (const id in peers) {
            const sender = getVideoSender(peers[id]);
            if (sender) {
                sender.replaceTrack(track);
                if (track) configureVideoSenderQuality(sender);
            }
        }
    }
}

function refreshLocalPreview() {
    if (backgroundMode !== "none" && blurredStream) {
        video.srcObject = blurredStream;
    } else if (localStream) {
        video.srcObject = localStream;
    }
}

async function enableVirtualBackground(mode) {
    if (!localStream || !videoEnabled) {
        alert("Turn on your camera first to use background effects.");
        return;
    }

    try {
        await ensureSegmentation();
    } catch (error) {
        console.error("Background effect init error:", error);
        alert("Unable to load background effects. Please check your connection and try again.");
        return;
    }

    const sourceVideo = ensureHiddenSourceVideo();
    sourceVideo.srcObject = new MediaStream(localStream.getVideoTracks());

    if (sourceVideo.readyState < 2) {
        await new Promise((resolve) => {
            sourceVideo.onloadedmetadata = () => resolve();
        });
    }

    if (!bgCanvas) {
        bgCanvas = document.createElement("canvas");
        bgCanvasCtx = bgCanvas.getContext("2d");
    }
    bgCanvas.width = sourceVideo.videoWidth || 640;
    bgCanvas.height = sourceVideo.videoHeight || 480;

    backgroundMode = mode;

    if (!segmentationActive) {
        segmentationActive = true;
        requestAnimationFrame(segmentationLoop);
    }

    if (!blurredStream) {
        blurredStream = bgCanvas.captureStream(30);
    }

    applyOutgoingVideoTrack(blurredStream.getVideoTracks()[0]);
}

function disableVirtualBackground() {
    segmentationActive = false;
    backgroundMode = "none";

    if (blurredStream) {
        blurredStream.getTracks().forEach(track => track.stop());
        blurredStream = null;
    }

    const rawTrack = localStream ? localStream.getVideoTracks()[0] : null;
    applyOutgoingVideoTrack(rawTrack);
}

function markActiveBackgroundSwatch(mode) {
    document.querySelectorAll(".bg-swatch").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.bg === mode);
    });
}

async function changeBackground(mode) {
    if (screenSharing) {
        alert("Background effects aren't available while screen sharing.");
        return;
    }

    if (mode === "custom" && !customBackgroundImage) {
        triggerCustomBackgroundUpload();
        return;
    }

    if (mode === "none") {
        disableVirtualBackground();
    } else {
        await enableVirtualBackground(mode);
    }

    markActiveBackgroundSwatch(backgroundMode);
}

/* ---------------- CUSTOM BACKGROUND UPLOAD ---------------- */

function ensureCustomBackgroundSwatch() {
    const grid = document.getElementById("bgSwatchGrid");
    const uploadBtn = document.getElementById("customBgUploadBtn");
    if (!grid || !uploadBtn) return null;

    let tile = document.getElementById("customBgSwatch");
    if (!tile) {
        tile = document.createElement("button");
        tile.id = "customBgSwatch";
        tile.className = "bg-swatch";
        tile.dataset.bg = "custom";
        tile.type = "button";
        tile.setAttribute("aria-label", "Your uploaded background");
        tile.innerHTML =
            '<span class="bg-swatch-preview" id="customBgSwatchPreview"></span>' +
            '<span class="bg-swatch-label">Custom</span>';
        tile.onclick = () => changeBackground("custom");
        grid.insertBefore(tile, uploadBtn);
    }

    return tile;
}

function updateCustomBackgroundThumbnail(dataUrl) {
    const tile = ensureCustomBackgroundSwatch();
    const preview = tile && tile.querySelector("#customBgSwatchPreview");
    if (preview) {
        preview.style.backgroundImage = `url("${dataUrl}")`;
        preview.style.backgroundSize = "cover";
        preview.style.backgroundPosition = "center";
    }
}

function setCustomBackgroundFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            customBackgroundImage = img;
            updateCustomBackgroundThumbnail(dataUrl);
            resolve();
        };
        img.onerror = () => reject(new Error("Unable to decode image"));
        img.src = dataUrl;
    });
}

async function processCustomBackgroundFile(file) {
    if (!file || !file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
    }

    if (file.size > CUSTOM_BG_MAX_UPLOAD_BYTES) {
        alert("That image is too large. Please choose one under 15MB.");
        return;
    }

    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (error) {
        console.error("Unable to decode uploaded image:", error);
        alert("Unable to read that image. Please try a different file.");
        return;
    }

    // Optimize: cap the resolution so per-frame canvas compositing stays
    // cheap, and re-encode as JPEG so it fits comfortably in localStorage
    // regardless of the original file's format/size.
    const scale = Math.min(1, CUSTOM_BG_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const optimizeCanvas = document.createElement("canvas");
    optimizeCanvas.width = targetWidth;
    optimizeCanvas.height = targetHeight;
    optimizeCanvas.getContext("2d").drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    if (typeof bitmap.close === "function") {
        bitmap.close();
    }

    const dataUrl = optimizeCanvas.toDataURL("image/jpeg", 0.82);

    try {
        await setCustomBackgroundFromDataUrl(dataUrl);
    } catch (error) {
        console.error("Unable to apply custom background:", error);
        alert("Unable to use that image. Please try another.");
        return;
    }

    try {
        localStorage.setItem(CUSTOM_BG_STORAGE_KEY, dataUrl);
    } catch (error) {
        console.warn("Custom background won't be remembered next time (storage full).", error);
    }

    await changeBackground("custom");
}

function triggerCustomBackgroundUpload() {
    if (screenSharing) {
        alert("Background effects aren't available while screen sharing.");
        return;
    }

    const input = document.getElementById("customBgInput");
    if (input) {
        input.click();
    }
}

const customBgInput = document.getElementById("customBgInput");
if (customBgInput) {
    customBgInput.addEventListener("change", (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = ""; // allow re-selecting the same file later
        if (file) {
            processCustomBackgroundFile(file);
        }
    });
}

// Restore a previously uploaded custom background (if any) so it's ready to
// pick again without re-uploading; it isn't auto-applied on join.
(function restoreCustomBackground() {
    try {
        const saved = localStorage.getItem(CUSTOM_BG_STORAGE_KEY);
        if (saved) {
            setCustomBackgroundFromDataUrl(saved).catch((error) => {
                console.warn("Unable to restore saved custom background:", error);
            });
        }
    } catch (error) {
        console.warn("Unable to read saved custom background:", error);
    }
})();

/* ---------------- START MEDIA ---------------- */

async function startMedia(){
    try{
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera and microphone are not supported in this browser.");
            return;
        }

        localStream = await navigator.mediaDevices.getUserMedia({
            video: VIDEO_CONSTRAINTS,
            audio:true
        });

        video.srcObject = localStream;
        videoEnabled = localStream.getVideoTracks().some(track => track.enabled);
        micEnabled = localStream.getAudioTracks().some(track => track.enabled);

        // Add to existing peer connections if any were formed while waiting for permission
        if (typeof peers !== 'undefined') {
            for (let id in peers) {
                localStream.getTracks().forEach(track => {
                    // Check if not already added
                    const senders = peers[id].getSenders();
                    if (!senders.find(s => s.track && s.track.kind === track.kind)) {
                        const sender = peers[id].addTrack(track, localStream);
                        if (track.kind === "video") configureVideoSenderQuality(sender);
                    }
                });
            }
        }
    }catch(error){
        console.error("Media permission error:", error);
        alert("Please allow camera and microphone permissions to use meeting controls.");
        localStream = new MediaStream();
        video.srcObject = localStream;
        videoEnabled = false;
        micEnabled = false;
        if(videoIcon) videoIcon.innerHTML = ICON_CAM_OFF;
        if(micIcon) micIcon.innerHTML = ICON_MIC_OFF;
    }
}

startMedia();

/* ---------------- JOIN ROOM ---------------- */

const userName = getDisplayName();
userNameDisplay.innerText = userName;

socket.emit("join-room", {
    roomId: roomId,
    userName: userName
});

/* ---------------- CAMERA ---------------- */

let backgroundModeBeforeCameraOff = "none";

async function startCamera(){
    try{
        if (!localStream) {
            localStream = new MediaStream();
        }

        const existingTrack = localStream.getVideoTracks()[0];

        if (!existingTrack) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS });
            const track = stream.getVideoTracks()[0];
            localStream.addTrack(track);

            if (typeof peers !== 'undefined') {
                for (let id in peers) {
                    const sender = getVideoSender(peers[id]);
                    if (sender) {
                        sender.replaceTrack(track);
                        configureVideoSenderQuality(sender);
                    } else {
                        const newSender = peers[id].addTrack(track, localStream);
                        configureVideoSenderQuality(newSender);
                    }
                }
            }
        }

        videoEnabled = true;
        videoIcon.innerHTML = ICON_CAM_ON;

        if (backgroundModeBeforeCameraOff !== "none") {
            const restoreMode = backgroundModeBeforeCameraOff;
            backgroundModeBeforeCameraOff = "none";
            await enableVirtualBackground(restoreMode);
            markActiveBackgroundSwatch(restoreMode);
        } else {
            refreshLocalPreview();
        }
    }catch(error){
        console.error("startCamera error:", error);
        alert("Unable to start camera. Check browser permissions.");
    }
}

function stopCamera(){
    if (!localStream) return;

    backgroundModeBeforeCameraOff = backgroundMode;
    if (backgroundMode !== "none") {
        disableVirtualBackground();
    }

    // Actually release the camera (stop the hardware/turn off its light)
    // instead of just muting the track - "enabled = false" keeps the device
    // held open and sending black frames, which isn't really "off".
    const tracks = localStream.getVideoTracks();
    tracks.forEach(track => {
        track.stop();
        localStream.removeTrack(track);
    });

    if (typeof peers !== 'undefined') {
        for (const id in peers) {
            const sender = getVideoSender(peers[id]);
            if (sender) sender.replaceTrack(null);
        }
    }

    videoEnabled = false;
    videoIcon.innerHTML = ICON_CAM_OFF;
    refreshLocalPreview();
}

function toggleVideo() {
    if (screenSharing) {
        alert("Camera disabled while screen sharing.");
        return;
    }
    videoEnabled ? stopCamera() : startCamera();
}

/* ---------------- MIC ---------------- */

function stopMic(){
    if (!localStream) return;
    localStream.getAudioTracks().forEach(track=>{
        track.enabled = false;
    });
    micEnabled = false;
    micIcon.innerHTML = ICON_MIC_OFF;
}

async function startMic(){
    try{
        if (!localStream) {
            localStream = new MediaStream();
        }

        const existingTrack = localStream.getAudioTracks()[0];

        if (existingTrack) {
            existingTrack.enabled = true;
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
            const track = stream.getAudioTracks()[0];
            localStream.addTrack(track);
            // Add track to all peers
            if (typeof peers !== 'undefined') {
                for (let id in peers) {
                    peers[id].addTrack(track, localStream);
                }
            }
        }

        micEnabled = true;
        micIcon.innerHTML = ICON_MIC_ON;
    }catch(error){
        console.error("startMic error:", error);
        alert("Unable to start microphone. Check browser permissions.");
    }
}

micBtn.onclick = ()=>{
    micEnabled ? stopMic() : startMic();
};

/* ---------------- SCREEN SHARE ---------------- */

screenBtn.onclick = async ()=>{

    if(!screenSharing){

        screenStream = await navigator.mediaDevices.getDisplayMedia({ video:true });

        // Capture/clear the background mode before stopCamera() runs - it
        // does its own save/restore around the camera, and would otherwise
        // stomp on backgroundModeBeforeShare below.
        backgroundModeBeforeShare = backgroundMode;
        if (backgroundMode !== "none") {
            disableVirtualBackground();
        }

        cameraWasOnBeforeShare = videoEnabled;
        if (videoEnabled) {
            stopCamera();
        }

        video.srcObject = screenStream;

        screenSharing = true;
        screenIcon.innerHTML = ICON_SCREEN_OFF;
        document.getElementById("videoContainer").classList.add("sharing");
        video.style.objectFit = "contain";
        video.classList.add("no-mirror");

        const screenTrack = screenStream.getVideoTracks()[0];
        if (typeof peers !== 'undefined') {
            for (let id in peers) {
                const pc = peers[id];
                const sender = getVideoSender(pc);
                if (sender) {
                    sender.replaceTrack(screenTrack);
                    configureVideoSenderQuality(sender, OUTGOING_SCREEN_SHARE_MAX_BITRATE);
                }
            }
        }

        screenTrack.onended = stopShare;

    }else{
        await stopShare();
    }

};

async function stopShare(){
    if (!screenStream) {
        return;
    }

    screenStream.getTracks().forEach(track=>track.stop());

    screenSharing = false;
    screenIcon.innerHTML = ICON_SCREEN_ON;
    document.getElementById("videoContainer").classList.remove("sharing");
    video.style.objectFit = "cover";
    video.classList.remove("no-mirror");

    // startCamera() always re-acquires the device now (stopCamera() fully
    // releases it rather than just muting it), so it must be awaited before
    // anything below assumes the camera/videoEnabled is back up.
    if (cameraWasOnBeforeShare && !videoEnabled) {
        await startCamera();
    }

    if (backgroundModeBeforeShare !== "none") {
        await enableVirtualBackground(backgroundModeBeforeShare);
        markActiveBackgroundSwatch(backgroundMode);
    } else {
        video.srcObject = localStream;

        if (localStream && typeof peers !== 'undefined') {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                for (let id in peers) {
                    const pc = peers[id];
                    const sender = getVideoSender(pc);
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                        configureVideoSenderQuality(sender);
                    }
                }
            }
        }
    }
}

/* ---------------- END MEETING ---------------- */
const endMeetingBtn = document.getElementById("endMeetingBtn");
if (endMeetingBtn) {
    endMeetingBtn.onclick = () => {
        if (confirm("Are you sure you want to end the meeting for everyone?")) {
            socket.emit("end-meeting");
        }
    };
}

/* ---------------- CHAT ---------------- */

sendBtn.onclick = ()=>{
    const msg = chatInput.value.trim();
    if(!msg) return;

    socket.emit("chat-message",{ room:roomId, message:msg });

    chatInput.value="";
};

chatInput.addEventListener("keydown",e=>{
    if(e.key==="Enter"){
        e.preventDefault();
        sendBtn.click();
    }
});

socket.on("chat-message",(data)=>{
    const div=document.createElement("div");
    const nameSpan = document.createElement("strong");
    nameSpan.innerText = (data.user || "Guest");
    div.appendChild(nameSpan);
    div.appendChild(document.createTextNode(": " + data.message));
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on("chat-history",(messages)=>{
    chatBox.innerHTML = "";

    messages.forEach((item)=>{
        const div=document.createElement("div");
        const nameSpan = document.createElement("strong");
        nameSpan.innerText = (item.user || "Guest");
        div.appendChild(nameSpan);
        div.appendChild(document.createTextNode(": " + item.message));
        chatBox.appendChild(div);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on("participants-snapshot", (participants)=>{
    participantsById.clear();

    (participants || []).forEach((participant)=>{
        if (participant && participant.id) {
            participantsById.set(participant.id, participant.name || "Guest");
        }
    });

    renderParticipants();
});

socket.on("user-connected", (participant)=>{
    if (participant && participant.id) {
        participantsById.set(participant.id, participant.name || "Guest");
        renderParticipants();

        appendSystemMessage((participant.name || "Guest") + " joined the meeting");
    }
});

socket.on("user-disconnected", (participant)=>{
    if (!participant) {
        return;
    }

    const participantId = typeof participant === "string" ? participant : participant.id;
    const participantName = typeof participant === "string"
        ? (participantsById.get(participantId) || "Guest")
        : (participant.name || participantsById.get(participantId) || "Guest");

    if (participantId) {
        participantsById.delete(participantId);
    }

    renderParticipants();
    appendSystemMessage(participantName + " left the meeting");
});

socket.on("user-renamed", (payload)=>{
    if (!payload || !payload.id) {
        return;
    }

    const oldName = payload.oldName || participantsById.get(payload.id) || "Guest";
    const nextName = payload.name || "Guest";

    participantsById.set(payload.id, nextName);
    renderParticipants();

    if (oldName !== nextName) {
        appendSystemMessage(oldName + " is now known as " + nextName);
    }
});

/* ---------------- MEETING END ---------------- */

socket.on("meeting-ended",(data)=>{
    alert((data && data.message) ? data.message : "Meeting has ended.");
    window.location.href="/";
});

socket.on("meeting-not-started",(data)=>{
    const when = new Date(data.scheduledTime).toLocaleString();
    alert("This meeting is scheduled for " + when + ". Please join at the scheduled time.");
    window.location.href = "/";
});

socket.on("meeting-not-found",()=>{
    alert("Meeting not found.");
    window.location.href = "/";
});

socket.on("server-error",(payload)=>{
    alert(payload?.message || "Unable to join meeting right now.");
    window.location.href = "/";
});

/* ---------------- ACCOUNT ---------------- */

function toggleAccount(){
    accountPanel.style.display =
        accountPanel.style.display==="block" ? "none":"block";
}

function saveName(){
    const name = nameInput.value;
    if(!name.trim()) return;

    const sanitizedName = name.trim();

    localStorage.setItem("username", sanitizedName);
    userNameDisplay.innerText = sanitizedName;
    nameInput.value="";

    if (socket.connected) {
        socket.emit("update-user-name", {
            roomId: roomId,
            name: sanitizedName
        });
    }
}

function logout(){
    localStorage.removeItem("username");
    userNameDisplay.innerText = "Guest";
}

/* LOAD NAME */

window.addEventListener("load",()=>{
    userNameDisplay.innerText = getDisplayName();
});
/* ---------------- WEBRTC PEER CONNECTIONS ---------------- */

const peers = {};

function createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    if (localStream) {
        localStream.getTracks().forEach(track => {
            const sender = pc.addTrack(track, localStream);
            if (track.kind === "video") configureVideoSenderQuality(sender);
        });
    }

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("webrtc-ice-candidate", {
                to: peerId,
                candidate: event.candidate
            });
        }
    };

    pc.ontrack = (event) => {
        let videoArea = document.getElementById("videoStage");
        let existingContainer = document.getElementById("container_" + peerId);
        let existingVideo = document.getElementById("video_" + peerId);

        if (!existingContainer) {
            existingContainer = document.createElement("div");
            existingContainer.id = "container_" + peerId;
            existingContainer.className = "remoteVideoContainer";

            existingVideo = document.createElement("video");
            existingVideo.id = "video_" + peerId;
            existingVideo.autoplay = true;
            existingVideo.playsInline = true;

            existingContainer.appendChild(existingVideo);
            videoArea.appendChild(existingContainer);
        }

        existingVideo.srcObject = event.streams[0];
    };

    pc.onnegotiationneeded = async () => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("webrtc-offer", {
                to: peerId,
                offer: pc.localDescription
            });
        } catch (err) {
            console.error(err);
        }
    };

    return pc;
}

function removeRemoteVideo(peerId) {
    const container = document.getElementById("container_" + peerId);
    if (container) {
        container.remove();
    }
}

socket.on("user-connected", (participant) => {
    if (participant && participant.id) {
        const peerId = participant.id;
        if (!peers[peerId]) {
            peers[peerId] = createPeerConnection(peerId);
        }
    }
});

socket.on("user-disconnected", (participant) => {
    const peerId = typeof participant === "string" ? participant : participant?.id;
    if (peerId) {
        if (peers[peerId]) {
            peers[peerId].close();
            delete peers[peerId];
        }
        removeRemoteVideo(peerId);
    }
});

socket.on("webrtc-offer", async (data) => {
    const peerId = data.from;
    let pc = peers[peerId];
    
    if (!pc) {
        pc = createPeerConnection(peerId);
        peers[peerId] = pc;
    }
    
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc-answer", {
            to: peerId,
            answer: pc.localDescription
        });
    } catch (err) {
        console.error(err);
    }
});

socket.on("webrtc-answer", async (data) => {
    const peerId = data.from;
    const pc = peers[peerId];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
            console.error(err);
        }
    }
});

socket.on("webrtc-ice-candidate", async (data) => {
    const peerId = data.from;
    const pc = peers[peerId];
    if (pc && data.candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error(err);
        }
    }
});

window.toggleCameraOptions = function(event) { 
    if(event) event.stopPropagation();
    document.getElementById('camOptions').classList.toggle('show'); 
}

// Close camera options when clicking outside
document.addEventListener('click', (event) => {
    const camOptions = document.getElementById('camOptions');
    const videoBtn = document.getElementById('videoBtn');
    
    if (camOptions && camOptions.classList.contains('show')) {
        // If click is outside both the button and the options menu
        const camBtn = document.getElementById('camOptionsBtn');
        if (!camOptions.contains(event.target) && (!videoBtn || !videoBtn.contains(event.target)) && (!camBtn || !camBtn.contains(event.target))) {
            camOptions.classList.remove('show');
        }
    }
});
