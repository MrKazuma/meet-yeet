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

const videoIcon = document.getElementById("videoIcon");
const micIcon = document.getElementById("micIcon");
const screenIcon = document.getElementById("screenIcon");

/* ACCOUNT ELEMENTS */
const accountPanel = document.getElementById("accountPanel");
const userNameDisplay = document.getElementById("userName");
const nameInput = document.getElementById("nameInput");

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

const userName = localStorage.getItem("username") || "Guest";

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

/* ---------------- BACKGROUND ---------------- */

function changeBackground(type){

    const bg = document.getElementById("backgroundLayer");

    if(type==="none") bg.style.backgroundImage="none";
    if(type==="bg1") bg.style.backgroundImage="url('backgrounds/office.jpeg')";
    if(type==="bg2") bg.style.backgroundImage="url('backgrounds/nature.jpg')";
    if(type==="bg3") bg.style.backgroundImage="url('backgrounds/abstract.jpg')";
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
    div.innerText = data.user + " : " + data.message;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
});

socket.on("chat-history",(messages)=>{
    chatBox.innerHTML = "";

    messages.forEach((item)=>{
        const div=document.createElement("div");
        div.innerText = item.user + " : " + item.message;
        chatBox.appendChild(div);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
});

/* ---------------- MEETING END ---------------- */

socket.on("meeting-ended",()=>{
    alert("Meeting time has ended");
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

    localStorage.setItem("username", name);
    userNameDisplay.innerText = name;
    nameInput.value="";
}

function logout(){
    localStorage.removeItem("username");
    userNameDisplay.innerText = "Guest";
}

/* LOAD NAME */

window.addEventListener("load",()=>{
    const saved = localStorage.getItem("username");
    if(saved) userNameDisplay.innerText = saved;
});