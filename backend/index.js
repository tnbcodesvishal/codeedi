import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import axios from 'axios'
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { version } from "os";

const app = express();
const server = http.createServer(app);

const url = `https://codeedi-b65h.onrender.com`;
const interval = 30000;

function reloadWebsite() {
  axios
    .get(url)
    .then((response) => {
      console.log("website reloded");
    })
    .catch((error) => {
      console.error(`Error : ${error.message}`);
    });
}

setInterval(reloadWebsite, interval);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});


const firebaseConfig = {
  apiKey: "AIzaSyC3JExCbY9r0tvlzZbEAnlmLi0VDz1LksE",
  authDomain: "codeeditor-3c4ff.firebaseapp.com",
  projectId: "codeeditor-3c4ff",
  storageBucket: "codeeditor-3c4ff.firebasestorage.app",
  messagingSenderId: "51386885401",
  appId: "1:51386885401:web:639d0912bc25e1a90b1188",
};

const appFirebase = initializeApp(firebaseConfig);
const db = getFirestore(appFirebase);

const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", async ({ roomId, userName }) => {
    if (currentRoom) {
      socket.leave(currentRoom);
      rooms.get(currentRoom).delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom)));
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    rooms.get(roomId).add(userName);

    // Fetch the room data (code and language) from Firestore
    const roomRef = doc(db, "rooms", roomId);
    const roomSnapshot = await getDoc(roomRef);

    if (roomSnapshot.exists()) {
      const { code, language } = roomSnapshot.data();

      // Send the code to the new user
      if (code) {
        socket.emit("codeUpdate", code);
      }

      // Send the language to the new user
      if (language) {
        socket.emit("languageUpdate", language);
      }
    }

    io.to(roomId).emit("userJoined", Array.from(rooms.get(currentRoom)));
  });

  socket.on("codeChange", async ({ roomId, code }) => {
    socket.to(roomId).emit("codeUpdate", code);

    // Save the code in Firestore
    const roomRef = doc(db, "rooms", roomId);
    await setDoc(roomRef, { code }, { merge: true });
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom).delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom)));

      socket.leave(currentRoom);

      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  socket.on("languageChange", async ({ roomId, language }) => {
    io.to(roomId).emit("languageUpdate", language);

    // Save the language in Firestore
    const roomRef = doc(db, "rooms", roomId);
    await setDoc(roomRef, { language }, { merge: true });
  });


socket.on("compileCode", async ({ code, roomId, language, version }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      const response = await axios.post(
        "https://emkc.org/api/v2/piston/execute",
        {
          language,
          version,
          files: [
            {
              content: code,
            },
          ],
        }
      );

      room.output = response.data.run.output;
      io.to(roomId).emit("codeResponse", response.data);
    }
  });


  socket.on("disconnect", () => {
    if (currentRoom && currentUser) {
      rooms.get(currentRoom).delete(currentUser);
      io.to(currentRoom).emit("userJoined", Array.from(rooms.get(currentRoom)));

      if (rooms.get(currentRoom).size === 0) {
        rooms.delete(currentRoom);
        const roomRef = doc(db, "rooms", currentRoom);
        deleteDoc(roomRef);
      }
    }
    console.log("user Disconnected");
  });
});

const port = process.env.PORT || 5000;
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "/frontend/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log("server is working on port 5000");
});















