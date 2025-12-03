//node server that will handle socket io connections
const io = require('socket.io')(process.env.PORT || 8000, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const users = {};
io.on('connection', (socket) => {
  socket.on('new-user-joined', name => {
    // console.log("New-user",name);
    users[socket.id] = name;
    socket.broadcast.emit('user-joined', name);
  });
  socket.on('send', message => {
    socket.broadcast.emit('receive', { message: message, name: users[socket.id] })
  });
  socket.on('disconnect', message => {
    socket.broadcast.emit('left', users[socket.id]);
    delete users[socket.id];
  });
})

const http = require('http');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end('Hello World');
});