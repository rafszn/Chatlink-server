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
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST"],
  },
});

v2.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_KEY,
  api_secret: process.env.CLOUD_SECRET,
});

const PORT = process.env.PORT || 3330;
const upload = multer({ dest: "/tmp/" });

let chatRooms = {};
let userNames = {};
let validRoomIDs = [];
let roomTimers = {};

app.use(cors({ origin: process.env.FRONTEND_URL }));

const deleteRoom = async (roomId) => {
  if (chatRooms[roomId]) {
    for (const mediaId of chatRooms[roomId].media) {
      try {
        await v2.uploader.destroy(mediaId);
      } catch (error) {
        console.error(`Failed to delete media ${mediaId}: ${error.message}`);
      }
    }
  }

  io.to(roomId).emit("room-deleted");
  delete chatRooms[roomId];
  validRoomIDs = validRoomIDs.filter((id) => id !== roomId);
  clearTimeout(roomTimers[roomId]);
  delete roomTimers[roomId];
  console.log(`Room ${roomId} has been deleted due to inactivity.`);
};

const resetRoomTimer = (roomId) => {
  if (roomTimers[roomId]) {
    clearTimeout(roomTimers[roomId]);
  }

  roomTimers[roomId] = setTimeout(() => {
    deleteRoom(roomId);
  }, 10 * 60 * 1000); //10 minutes
};

app.get("/create-chat", (req, res) => {
  const roomId = uuidv4();
  chatRooms[roomId] = { messages: [], media: [] };
  validRoomIDs.push(roomId);
  resetRoomTimer(roomId);
  res
    .status(200)
    .json({ roomId, link: `${process.env.FRONTEND_URL}/chat/${roomId}` });
});

app.get("/", (req, res)=>{
  res.send("server is on ✔")
})

app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  try {
    const { file } = req;
    const resourceType = file.mimetype.startsWith("image/")
      ? "image"
      : file.mimetype.startsWith("video/")
      ? "video"
      : "raw";
    const resCloudinary = await v2.uploader.upload(file.path, {
      resource_type: resourceType,
    });

    return res.status(200).json({
      url: resCloudinary.secure_url,
      publicId: resCloudinary.public_id,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name }) => {
    if (!validRoomIDs.includes(roomId)) {
      return socket.emit("error", {
        message: "Room does not exist. generate a new link.",
      });
    }
    resetRoomTimer(roomId);

    if (!chatRooms[roomId]) {
      chatRooms[roomId] = { messages: [], media: [] };
    }

    userNames[socket.id] = name;
    socket.join(roomId);

    socket.to(roomId).emit("user-joined", {
      userName: name,
      message: `${name} has joined the room.`,
    });

    socket.emit(
      "chat-history",
      chatRooms[roomId].messages.map((msg) => ({
        ...msg,
        name: userNames[msg.userId] || "Anonymous",
      })),
    );

    socket.on("chat-message", (message) => {
      chatRooms[roomId].messages.push({
        ...message,
        name: userNames[socket.id] || "Anonymous",
      });
      io.to(roomId).emit("chat-message", chatRooms[roomId].messages);

      resetRoomTimer(roomId);
    });

    socket.on("upload-media", ({ publicId }) => {
      if (chatRooms[roomId]) {
        chatRooms[roomId].media.push(publicId);
      }
    });

    socket.on("disconnect", () => {
      if (chatRooms[roomId]) {
        chatRooms[roomId].messages = chatRooms[roomId].messages.filter(
          (id) => id !== socket.id,
        );
        if (chatRooms[roomId].messages.length === 0) {
          deleteRoom(roomId);
        } else {
          socket.to(roomId).emit("user-left", {
            userName: userNames[socket.id],
            message: `${userNames[socket.id]} has left the room.`,
          });
        }
      }
      delete userNames[socket.id];
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} ✔`);
});
