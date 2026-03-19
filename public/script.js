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

const videoIcon = document.getElementById("videoIcon");
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
    }catch(error){
        console.error("Media permission error:", error);
        alert("Please allow camera and microphone permissions to use meeting controls.");
        localStream = new MediaStream();
        video.srcObject = localStream;
        videoEnabled = false;
        micEnabled = false;
        videoIcon.src = "/icons/camera-off.jpg";
        micIcon.src = "/icons/mic-off.jpg";
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
        }

        video.srcObject = localStream;
        videoEnabled = true;
        videoIcon.src = "/icons/camera-on.jpg";
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
    videoIcon.src = "/icons/camera-off.jpg";
}

videoBtn.onclick = ()=>{
    videoEnabled ? stopCamera() : startCamera();
};

/* ---------------- MIC ---------------- */

function stopMic(){
    if (!localStream) return;
    localStream.getAudioTracks().forEach(track=>{
        track.enabled = false;
    });
    micEnabled = false;
    micIcon.src = "/icons/mic-off.jpg";
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
        }

        micEnabled = true;
        micIcon.src = "/icons/mic-on.jpg";
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

        video.srcObject = screenStream;

        screenSharing = true;
        screenIcon.src = "/icons/screen-off.png";

        screenStream.getVideoTracks()[0].onended = stopShare;

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
    screenIcon.src = "/icons/screen-on.png";
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

    if(type==="none") bg.style.backgroundImage="none";
    if(type==="bg1") bg.style.backgroundImage="url('/backgrounds/office.jpeg')";
    if(type==="bg2") bg.style.backgroundImage="url('/backgrounds/nature.jpg')";
    if(type==="bg3") bg.style.backgroundImage="url('/backgrounds/abstract.jpg')";
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

/* ---------------- PAYMENT ---------------- */

document.getElementById("upgradeBtn").onclick = async ()=>{

    const response = await fetch("/create-order",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ plan:"pro" })
    });

    const order = await response.json();

    const options = {
        key: "YOUR_KEY_ID",
        amount: order.amount,
        currency: order.currency,
        order_id: order.id,
        name: "VClust",
        description: "Pro Plan",
        handler: function (){
            alert("Payment Successful!");
            socket.emit("upgrade-plan","pro");
        }
    };

    new Razorpay(options).open();
};

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