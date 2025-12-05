const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});
const path = require('path');

// Serve static files from current directory
app.use(express.static(__dirname));

// Route for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// App State
const users = {}; // { socketId: { name, room, role: 'admin'|'user' } }
const rooms = {}; // { roomName: [socketId, ...] }
const pendingUsers = {}; // { socketId: { name, room } }

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // 1. Join Request
  socket.on('join-request', ({ name, room }) => {
    // Sanitize room name
    room = room.trim();
    if (!room) room = "General";

    // Check if room exists and has users
    if (!rooms[room] || rooms[room].length === 0) {
      // Create room, make user Admin
      joinRoom(socket, name, room, 'admin');
    } else {
      // Room exists. Is there an admin?
      // For simplicity, the first user in the list is the admin.
      const adminSocketId = rooms[room][0];

      // Store in pending
      pendingUsers[socket.id] = { name, room };

      // Notify this user they are waiting
      socket.emit('join-pending', { message: 'Waiting for admin approval' });

      // Notify admin
      io.to(adminSocketId).emit('approval-request', {
        socketId: socket.id,
        name,
        room
      });
    }
  });

  // 2. Admin Decisions
  socket.on('approve-join', ({ socketId, room }) => {
    // Verify request came from admin of that room? (Skipping strict check for demo simplicity, but ideal)
    const pendingUser = pendingUsers[socketId];
    if (pendingUser) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        joinRoom(targetSocket, pendingUser.name, pendingUser.room, 'user');
      }
      delete pendingUsers[socketId];
    }
  });

  socket.on('deny-join', ({ socketId }) => {
    const pendingUser = pendingUsers[socketId];
    if (pendingUser) {
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.emit('join-denied', { message: 'The host has denied your request.' });
        targetSocket.disconnect(true);
      }
      delete pendingUsers[socketId];
    }
  });


  // 3. Chat Messages
  socket.on('send', message => {
    const user = users[socket.id];
    if (user) {
      socket.to(user.room).emit('receive', {
        message: message,
        name: user.name,
        type: 'text'
      });
    }
  });

  // 4. Media Handling
  socket.on('send-media', ({ file, fileName, type }) => {
    const user = users[socket.id];
    if (user) {
      socket.to(user.room).emit('receive', {
        message: file,
        fileName: fileName,
        name: user.name,
        type: type || 'media' // 'image' or 'file'
      });
    }
  });

  // 5. Disconnect
  socket.on('disconnect', () => {
    // Remove from pending if there
    if (pendingUsers[socket.id]) delete pendingUsers[socket.id];

    const user = users[socket.id];
    if (user) {
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      socket.to(user.room).emit('left', { name: user.name, time: time });

      // Remove from room list
      if (rooms[user.room]) {
        rooms[user.room] = rooms[user.room].filter(id => id !== socket.id);

        // If room empty, delete it
        if (rooms[user.room].length === 0) {
          delete rooms[user.room];
        } else {
          // New Admin Logic: If admin left, assign new admin?
          // Since we treat index 0 as admin, filtering automatiaclly promotes the next user.
          // We should notify the new admin.
          if (rooms[user.room].length > 0) {
            const newAdminId = rooms[user.room][0];
            // Update that user's role in our object
            if (users[newAdminId]) {
              users[newAdminId].role = 'admin';
              io.to(newAdminId).emit('admin-notification', 'You are now the Admin of this room.');
            }
          }
        }
      }
      delete users[socket.id];
    }
  });

});

function joinRoom(socket, name, room, role) {
  // Update state
  users[socket.id] = { name, room, role };

  if (!rooms[room]) rooms[room] = [];
  rooms[room].push(socket.id);

  socket.join(room);

  // Notify success
  socket.emit('join-success', { name, room, role });

  // Notify others
  socket.to(room).emit('user-joined', { name });
}

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
});