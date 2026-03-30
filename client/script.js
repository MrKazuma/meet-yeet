const ICON_CAM_ON = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
const ICON_CAM_OFF = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"></path></svg>`;
const ICON_MIC_ON = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
const ICON_MIC_OFF = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`;
const ICON_SCREEN_ON = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
const ICON_SCREEN_OFF = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

const socket = io();

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

/* ---------------- START MEDIA ---------------- */

async function startMedia(){
    try{
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Camera and microphone are not supported in this browser.");
            return;
        }

        localStream = await navigator.mediaDevices.getUserMedia({
            video:true,
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
                        peers[id].addTrack(track, localStream);
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

async function startCamera(){
    try{
        if (!localStream) {
            localStream = new MediaStream();
        }

        const existingTrack = localStream.getVideoTracks()[0];

        if (existingTrack) {
            existingTrack.enabled = true;
        } else {
            const stream = await navigator.mediaDevices.getUserMedia({ video:true });
            const track = stream.getVideoTracks()[0];
            localStream.addTrack(track);
            // Add track to all peers
            if (typeof peers !== 'undefined') {
                for (let id in peers) {
                    peers[id].addTrack(track, localStream);
                }
            }
        }

        video.srcObject = localStream;
        videoEnabled = true;
        videoIcon.innerHTML = ICON_CAM_ON;
    }catch(error){
        console.error("startCamera error:", error);
        alert("Unable to start camera. Check browser permissions.");
    }
}

function stopCamera(){
    if (!localStream) return;
    const tracks = localStream.getVideoTracks();

    tracks.forEach(track=>{
        track.enabled = false;
    });

    videoEnabled = false;
    videoIcon.innerHTML = ICON_CAM_OFF;
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

        if (videoEnabled) {
            stopCamera();
        }

        video.srcObject = screenStream;

        screenSharing = true;
        screenIcon.innerHTML = ICON_SCREEN_OFF;
        document.getElementById("videoContainer").classList.add("sharing");
        video.style.objectFit = "contain";

        const screenTrack = screenStream.getVideoTracks()[0];
        if (typeof peers !== 'undefined') {
            for (let id in peers) {
                const pc = peers[id];
                const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
                if (sender) sender.replaceTrack(screenTrack);
            }
        }

        screenTrack.onended = stopShare;

    }else{
        stopShare();
    }

};

function stopShare(){
    if (!screenStream) {
        return;
    }

    screenStream.getTracks().forEach(track=>track.stop());
    video.srcObject = localStream;

    screenSharing = false;
    screenIcon.innerHTML = ICON_SCREEN_ON;
    document.getElementById("videoContainer").classList.remove("sharing");
    video.style.objectFit = "cover";

    if (localStream && typeof peers !== 'undefined') {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            for (let id in peers) {
                const pc = peers[id];
                const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
                if (sender) sender.replaceTrack(videoTrack);
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

/* ---------------- BACKGROUND ---------------- */

function changeBackground(type){

    const bg = document.getElementById("backgroundLayer");

    if(type==="none") {
        bg.style.backdropFilter = "none";
    }
    if(type==="blur") {
        bg.style.backdropFilter = "blur(10px)";
    }
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
            pc.addTrack(track, localStream);
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
