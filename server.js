const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

const Razorpay = require("razorpay");

app.use(express.json());
app.use(express.static("public"));

/* ------------------ IN-MEMORY DATA ------------------ */

const meetings = {};
// const users = {}; // userId -> { name, plan }

/* ------------------ RAZORPAY SETUP ------------------ */

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY || "YOUR_KEY_ID",
  key_secret: process.env.RAZORPAY_SECRET || "YOUR_KEY_SECRET"
});

const users = [
  { email: "admin@test.com", password: "123456", role: "admin" },
  { email: "user@test.com", password: "123456", role: "user" }
];

/* ------------------ PLANS ------------------ */

const plans = {
  free: 30 * 60 * 1000,
  pro: 120 * 60 * 1000,
  business: Infinity
};

/* ------------------ SOCKET CONNECTION ------------------ */

io.on("connection", socket => {

  let currentUser = {
    id: socket.id,
    name: "Guest",
    plan: "free"
  };

  users[socket.id] = currentUser;

  /* -------- JOIN ROOM -------- */

  socket.on("join-room", ({ roomId, userName }) => {

    if (userName) {
      currentUser.name = userName;
    }

    // Create meeting if not exists
    if (!meetings[roomId]) {
      meetings[roomId] = {
        startTime: Date.now(),
        duration: plans[currentUser.plan]
      };
    }

    socket.join(roomId);

    socket.to(roomId).emit("user-connected", {
      id: socket.id,
      name: currentUser.name
    });

    /* -------- DISCONNECT -------- */

    socket.on("disconnect", () => {
      socket.to(roomId).emit("user-disconnected", socket.id);
      delete users[socket.id];
    });

    /* -------- CHAT -------- */

    socket.on("chat-message", data => {

      io.to(data.room).emit("chat-message", {
        user: currentUser.name,
        message: data.message
      });

    });

  });

  /* -------- PLAN UPGRADE (AFTER PAYMENT) -------- */

  socket.on("upgrade-plan", (planType) => {

    if (plans[planType]) {
      currentUser.plan = planType;
      users[socket.id].plan = planType;

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

    res.json(order);

  } catch (error) {
    res.status(500).json({ error: "Order creation failed" });
  }

});

app.post("/login", (req, res) => {

  const { email, password } = req.body;

  const user = users.find(
    u => u.email === email && u.password === password
  );

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password"
    });
  }

  res.json({
    success: true,
    message: "Login successful",
    user: {
      email: user.email,
      role: user.role
    }
  });

});


/* ------------------ START SERVER ------------------ */

const PORT = process.env.PORT || 3000;

http.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});