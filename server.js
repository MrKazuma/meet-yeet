require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const mongoose = require("mongoose");
const Razorpay = require("razorpay");

const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/vclust";

mongoose.connect(mongoUri, {
  serverSelectionTimeoutMS: 10000
}).catch((error) => {
  console.error("MongoDB initial connection failed:", error.message);
  console.error("Running with in-memory storage fallback.");
  console.error("Tip: Use Node.js LTS (20/22) and set MONGO_URI in environment for Atlas.");
});

mongoose.connection.on("connected", () => {
  console.log("MongoDB connected");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB connection error:", error.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected; using in-memory fallback for runtime data.");
});

const MeetingSchema = new mongoose.Schema({
  meetingId: String,
  title: String,
  scheduledFor: Date,
  createdAt: { type: Date, default: Date.now },
  ended: { type: Boolean, default: false }
});

const Meeting = mongoose.model("Meeting", MeetingSchema);

const ChatSchema = new mongoose.Schema({
  meetingId: { type: String, required: true, index: true },
  user: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Chat = mongoose.model("Chat", ChatSchema);

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" }
});
const User = mongoose.model("User", UserSchema);

const memoryMeetings = [];
const memoryChats = [];

function isDbAvailable() {
  return mongoose.connection.readyState === 1;
}

async function findMeetingById(meetingId) {
  if (isDbAvailable()) {
    return Meeting.findOne({ meetingId }).lean();
  }

  return memoryMeetings.find((meeting) => meeting.meetingId === meetingId) || null;
}

async function meetingIdExists(meetingId) {
  if (isDbAvailable()) {
    const found = await Meeting.findOne({ meetingId }).lean();
    return Boolean(found);
  }

  return memoryMeetings.some((meeting) => meeting.meetingId === meetingId);
}

async function createMeetingRecord(payload) {
  if (isDbAvailable()) {
    return Meeting.create(payload);
  }

  const record = {
    meetingId: payload.meetingId,
    title: payload.title || null,
    scheduledFor: payload.scheduledFor || null,
    createdAt: new Date(),
    ended: false
  };

  memoryMeetings.push(record);
  return record;
}

async function getRoomChats(roomId) {
  if (isDbAvailable()) {
    return Chat.find({ meetingId: roomId })
      .sort({ timestamp: 1 })
      .limit(200)
      .lean();
  }

  return memoryChats
    .filter((item) => item.meetingId === roomId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-200);
}

async function saveRoomChat(payload) {
  if (isDbAvailable()) {
    return Chat.create(payload);
  }

  memoryChats.push({
    ...payload,
    timestamp: new Date()
  });

  return null;
}

async function listScheduledMeetings() {
  if (isDbAvailable()) {
    return Meeting.find({ scheduledFor: { $ne: null }, ended: { $ne: true } })
      .sort({ scheduledFor: 1 })
      .lean();
  }

  return memoryMeetings
    .filter((item) => item.scheduledFor && !item.ended)
    .sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
}

async function startMeetingNow(meetingId) {
  if (isDbAvailable()) {
    const meeting = await Meeting.findOne({ meetingId });

    if (!meeting) {
      return null;
    }

    meeting.scheduledFor = new Date();
    await meeting.save();
    return meeting;
  }

  const meeting = memoryMeetings.find((item) => item.meetingId === meetingId);

  if (!meeting) {
    return null;
  }

  meeting.scheduledFor = new Date();
  return meeting;
}

async function markMeetingAsEnded(meetingId) {
  if (isDbAvailable()) {
    const meeting = await Meeting.findOne({ meetingId });
    if (meeting) {
      meeting.ended = true;
      await meeting.save();
    }
  } else {
    const meeting = memoryMeetings.find((item) => item.meetingId === meetingId);
    if (meeting) {
      meeting.ended = true;
    }
  }
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "fallback-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(express.static("public", { index: false }));

/* ------------------ IN-MEMORY DATA ------------------ */

const meetings = {};
const connectedUsers = {}; // socket.id -> { id, name, plan }
const roomParticipants = {}; // roomId -> { socketId: displayName }

/* ------------------ RAZORPAY SETUP ------------------ */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY || "YOUR_KEY_ID",
  key_secret: process.env.RAZORPAY_SECRET || "YOUR_KEY_SECRET"
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

/* ------------------ PLANS ------------------ */

const plans = {
  free: 30 * 60 * 1000,
  pro: 120 * 60 * 1000,
  business: Infinity
};

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    next();
    return;
  }

  if (req.method === "GET") {
    const nextPath = encodeURIComponent(req.originalUrl || "/");
    res.redirect(`/login.html?next=${nextPath}`);
    return;
  }

  res.status(401).json({
    success: false,
    message: "Please login first"
  });
}

function generateMeetingId() {
  return Math.random().toString(36).substring(2, 8);
}

async function generateUniqueMeetingId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const meetingId = generateMeetingId();
    const existingMeeting = await meetingIdExists(meetingId);

    if (!existingMeeting) {
      return meetingId;
    }
  }

  throw new Error("Unable to generate unique meeting ID");
}

/* ------------------ SOCKET CONNECTION ------------------ */

io.on("connection", socket => {

  let currentUser = {
    id: socket.id,
    name: "Guest",
    plan: "free"
  };

  connectedUsers[socket.id] = currentUser;

  /* -------- JOIN ROOM -------- */

  socket.on("join-room", async ({ roomId, userName }) => {

    if (!roomId) {
      socket.emit("meeting-not-found", { roomId });
      return;
    }

    if (userName) {
      currentUser.name = userName;
    }

    try {
      const meetingRecord = await findMeetingById(roomId);

      if (!meetingRecord) {
        socket.emit("meeting-not-found", { roomId });
        return;
      }

      if (meetingRecord.ended) {
        socket.emit("meeting-ended", { roomId });
        return;
      }

      // Restrict early joins for scheduled meetings.
      if (meetingRecord.scheduledFor) {
        const scheduledTime = new Date(meetingRecord.scheduledFor).getTime();

        if (!Number.isNaN(scheduledTime) && Date.now() < scheduledTime) {
          socket.emit("meeting-not-started", {
            roomId,
            scheduledTime
          });
          return;
        }
      }

      const oldChats = await getRoomChats(roomId);

      socket.emit("chat-history", oldChats);

      // Create in-memory meeting timer tracking when first participant joins.
      if (!meetings[roomId]) {
        meetings[roomId] = {
          startTime: Date.now(),
          duration: plans[currentUser.plan]
        };
      }

      socket.join(roomId);

      if (!roomParticipants[roomId]) {
        roomParticipants[roomId] = {};
      }

      roomParticipants[roomId][socket.id] = currentUser.name;

      const participants = Object.entries(roomParticipants[roomId]).map(([id, name]) => ({
        id,
        name
      }));

      socket.emit("participants-snapshot", participants);

      socket.to(roomId).emit("user-connected", {
        id: socket.id,
        name: currentUser.name
      });
    } catch (error) {
      console.error("join-room error:", error.message);
      socket.emit("server-error", {
        message: "Unable to join the meeting right now"
      });
      return;
    }

    /* -------- DISCONNECT -------- */

    socket.on("disconnect", () => {
      const participantName = roomParticipants[roomId]?.[socket.id] || currentUser.name || "Guest";

      if (roomParticipants[roomId]) {
        delete roomParticipants[roomId][socket.id];

        if (Object.keys(roomParticipants[roomId]).length === 0) {
          delete roomParticipants[roomId];
        }
      }

      socket.to(roomId).emit("user-disconnected", {
        id: socket.id,
        name: participantName
      });
      delete connectedUsers[socket.id];
    });

    /* -------- CHAT -------- */

    socket.on("chat-message", async data => {

      if (!data || !data.room || !data.message) {
        return;
      }

      try {
        await saveRoomChat({
          meetingId: data.room,
          user: currentUser.name || socket.id,
          message: data.message
        });
      } catch (error) {
        console.error("chat-message save error:", error.message);
      }

      io.to(data.room).emit("chat-message", {
        user: currentUser.name,
        message: data.message
      });

    });

    socket.on("update-user-name", (data) => {
      const nextName = String(data?.name || "").trim();

      if (!nextName || nextName.length > 80) {
        return;
      }

      const previousName = currentUser.name || "Guest";
      currentUser.name = nextName;

      if (connectedUsers[socket.id]) {
        connectedUsers[socket.id].name = nextName;
      }

      if (!roomParticipants[roomId]) {
        roomParticipants[roomId] = {};
      }

      roomParticipants[roomId][socket.id] = nextName;

      io.to(roomId).emit("user-renamed", {
        id: socket.id,
        oldName: previousName,
        name: nextName
      });
    });

    socket.on("end-meeting", async () => {
      await markMeetingAsEnded(roomId);
      io.to(roomId).emit("meeting-ended", { message: "The meeting has been ended." });

      // Clean up in-memory meeting timer
      if (meetings[roomId]) {
        delete meetings[roomId];
      }
    });

    /* -------- WEBRTC SIGNALING -------- */
    socket.on("webrtc-offer", (data) => {
      io.to(data.to).emit("webrtc-offer", {
        offer: data.offer,
        from: socket.id
      });
    });

    socket.on("webrtc-answer", (data) => {
      io.to(data.to).emit("webrtc-answer", {
        answer: data.answer,
        from: socket.id
      });
    });

    socket.on("webrtc-ice-candidate", (data) => {
      io.to(data.to).emit("webrtc-ice-candidate", {
        candidate: data.candidate,
        from: socket.id
      });
    });

  });

  /* -------- PLAN UPGRADE (AFTER PAYMENT) -------- */

  socket.on("upgrade-plan", (planType) => {

    if (plans[planType]) {
      currentUser.plan = planType;
      connectedUsers[socket.id].plan = planType;

      socket.emit("plan-updated", planType);
    }

  });

});

/* ------------------ MEETING TIMER ------------------ */

setInterval(() => {

  for (const roomId in meetings) {

    const meeting = meetings[roomId];
    const elapsed = Date.now() - meeting.startTime;

    if (elapsed > meeting.duration) {

      io.to(roomId).emit("meeting-ended");

      delete meetings[roomId];

    }

  }

}, 5000);

/* ------------------ CREATE PAYMENT ORDER ------------------ */

app.post("/create-order", async (req, res) => {

  try {

    const { plan } = req.body;

    let amount = 49900; // default PRO

    if (plan === "business") amount = 99900;

    const order = await razorpay.orders.create({
      amount: amount,
      currency: "INR",
      receipt: plan || "pro_plan"
    });

    res.json({ ...order, key: process.env.RAZORPAY_KEY || "YOUR_KEY_ID" });

  } catch (error) {
    res.status(500).json({ error: "Order creation failed" });
  }

});

app.post("/signup", async (req, res) => {

  const name = sanitizeName(req.body?.name);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "").trim();

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Name is required"
    });
  }

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email"
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters"
    });
  }

  try {
    let exists = false;
    if (isDbAvailable()) {
      const userInDb = await User.findOne({ email });
      exists = !!userInDb;
    }

    if (exists) {
      return res.status(409).json({
        success: false,
        message: "Email already registered"
      });
    }

    const newUser = {
      name,
      email,
      password,
      role: "user"
    };

    if (isDbAvailable()) {
      await User.create(newUser);
    } else {
      throw new Error("Database not available to save user");
    }

    req.session.user = {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role
    };

    return res.json({
      success: true,
      message: "Signup successful",
      user: req.session.user
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Unable to save user"
    });
  }

});

app.post("/login", async (req, res) => {

  const { email, password } = req.body;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "").trim();

  try {
    let user = null;
    if (isDbAvailable()) {
      user = await User.findOne({ 
        email: normalizedEmail, 
        password: normalizedPassword 
      }).lean();
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    req.session.user = {
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.json({
      success: true,
      message: "Login successful",
      user: {
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Internal server error during login"
    });
  }

});

app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

app.get("/me", (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false });
  }

  res.json({
    success: true,
    user: req.session.user
  });
});


app.post("/create-meeting", requireAuth, async (req, res) => {

  try {
    const meetingId = await generateUniqueMeetingId();

    await createMeetingRecord({
      meetingId
    });

    res.json({
      meetingId,
      link: `/room/${meetingId}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to create meeting"
    });
  }

});


app.post("/schedule-meeting", requireAuth, async (req, res) => {

try {

const { title, time } = req.body;

if (!title || !time) {
  return res.status(400).json({
    success: false,
    message: "Title and time are required"
  });
}

const parsedTime = new Date(time).getTime();

if (Number.isNaN(parsedTime) || parsedTime <= Date.now()) {
  return res.status(400).json({
    success: false,
    message: "Please choose a valid future date and time"
  });
}

const meetingId = await generateUniqueMeetingId();

await createMeetingRecord({
meetingId,
title,
scheduledFor: new Date(parsedTime)
});

res.json({
success:true,
meetingId,
link:`/room/${meetingId}`
});

} catch (error) {
  res.status(500).json({
    success: false,
    message: "Unable to schedule meeting"
  });
}

});

app.post("/start-meeting/:id", requireAuth, async (req, res) => {
  try {
    const meeting = await startMeetingNow(req.params.id);

    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found"
      });
    }

    res.json({
      success: true,
      link: `/room/${meeting.meetingId}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to start meeting"
    });
  }
});

app.get("/scheduled-meetings", async (req, res) => {
  try {
    const scheduledItems = await listScheduledMeetings();

    const meetingsList = scheduledItems.map((item) => ({
      meetingId: item.meetingId,
      title: item.title,
      time: item.scheduledFor,
      link: `/room/${item.meetingId}`
    }));

    res.json({
      success: true,
      meetings: meetingsList
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      meetings: []
    });
  }
});


app.get("/", (req,res)=>{
res.sendFile(__dirname + "/public/home.html");
});

app.get("/schedule", (req,res)=>{
requireAuth(req, res, () => {
res.sendFile(__dirname + "/public/schedule.html");
});
});



app.get("/room/:id", requireAuth, async (req,res)=>{
try {
const meeting = await findMeetingById(req.params.id);

if(!meeting){
return res.status(404).send("Meeting not found");
}

if(meeting.ended){
return res.status(403).send("This meeting has already ended");
}

res.sendFile(__dirname + "/public/index.html");
} catch (error) {
  return res.status(500).send("Unable to open meeting");
}
});

/* ------------------ START SERVER ------------------ */

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});