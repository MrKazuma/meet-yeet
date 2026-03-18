const socket = io();

const roomId = window.location.pathname.substring(1) || "meeting1";

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
    localStream = await navigator.mediaDevices.getUserMedia({
        video:true,
        audio:true
    });
    video.srcObject = localStream;
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
    const stream = await navigator.mediaDevices.getUserMedia({ video:true });
    const track = stream.getVideoTracks()[0];

    localStream.addTrack(track);
    video.srcObject = localStream;

    videoEnabled = true;
    videoIcon.src = "icons/camera-on.jpg";
}

function stopCamera(){
    const tracks = localStream.getVideoTracks();

    tracks.forEach(track=>{
        track.stop();
        localStream.removeTrack(track);
    });

    videoEnabled = false;
    videoIcon.src = "icons/camera-off.jpg";
}

videoBtn.onclick = ()=>{
    videoEnabled ? stopCamera() : startCamera();
};

/* ---------------- MIC ---------------- */

function stopMic(){
    localStream.getAudioTracks().forEach(track=>track.stop());
    micEnabled = false;
    micIcon.src = "icons/mic-off.jpg";
}

async function startMic(){
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const track = stream.getAudioTracks()[0];

    localStream.addTrack(track);

    micEnabled = true;
    micIcon.src = "icons/mic-on.jpg";
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
        screenIcon.src = "icons/screen-off.png";

        screenStream.getVideoTracks()[0].onended = stopShare;

    }else{
        stopShare();
    }

};

function stopShare(){
    screenStream.getTracks().forEach(track=>track.stop());
    video.srcObject = localStream;

    screenSharing = false;
    screenIcon.src = "icons/screen-on.png";
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

/* ---------------- MEETING END ---------------- */

socket.on("meeting-ended",()=>{
    alert("Meeting time has ended");
    window.location.href="/";
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