const express = require("express");
const http = require("http");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");
const { v2 } = require("cloudinary");
const multer = require("multer");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Replace with your frontend URL
    methods: ["GET", "POST"],
  },
});
const PORT = process.env.PORT || 3330;
const upload = multer({ dest: "/tmp/" });

let chatRooms = {};
let userNames = {}; // Stores user IDs and their names

app.use(cors({ origin: "http://localhost:5173" }));
app.get("/create-chat", (req, res) => {
  const roomId = uuidv4();
  chatRooms[roomId] = [];
  res
    .status(200)
    .json({ roomId, link: `http://localhost:5173/chat/${roomId}` });
});

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  v2.config({
    cloud_name: "dic7urzye",
    api_key: "239763643334781",
    api_secret: process.env.CLOUD_SECRET,
  });
  try {
    const { file } = req;
    const resCloudinary = await v2.uploader.upload(file.path, {
      resource_type: file.mimetype.startsWith("image/") ? "image" : "raw", // Handle PDFs
    });
    res.status(200).json({ url: resCloudinary.secure_url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    if (!chatRooms[roomId]) {
      chatRooms[roomId] = [];
    }
    chatRooms[roomId].push(socket.id);
    userNames[socket.id] = name; // Store user's name
    socket.join(roomId);

    // Notify all users in the room that a new user has joined
    socket.to(roomId).emit("user-joined", {
      userName: name,
      message: `${name} has joined the room.`,
    });

    // Send existing chat history to the new user
    socket.emit(
      "chat-history",
      chatRooms[roomId].map((msg) => ({
        ...msg,
        name: userNames[msg.userId] || "Anonymous",
      })),
    );

    socket.on("chat-message", (message) => {
      chatRooms[roomId].push({
        ...message,
        name: userNames[socket.id] || "Anonymous",
      });
      io.to(roomId).emit("chat-message", chatRooms[roomId]);
    });

    socket.on("disconnect", () => {
      if (chatRooms[roomId]) {
        chatRooms[roomId] = chatRooms[roomId].filter((id) => id !== socket.id);
        if (chatRooms[roomId].length === 0) {
          delete chatRooms[roomId];
        } else {
          // Notify remaining users when someone leaves
          socket.to(roomId).emit("user-left", {
            userName: userNames[socket.id],
            message: `${userNames[socket.id]} has left the room.`,
          });
        }
      }
      delete userNames[socket.id]; // Remove user's name
    });
  });
});

server.listen(PORT, () => {
  console.log(`server is on  ✔`);
});
