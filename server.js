"use strict";

const express = require('express');
let helmet;
try {
  helmet = require('helmet');
} catch (err) {
  console.warn("helmet module not found. Skipping security middleware. To enable, run: npm install helmet");
}

const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Use Helmet if available with additional security options.
if (helmet) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https:"],
        styleSrc: ["'self'", "https:"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", "ws:"],
      }
    },
    referrerPolicy: { policy: "no-referrer" }
  }));
}

// Use Express's built-in JSON parser.
app.use(express.json());

// Serve static files from your public directory.
app.use(express.static(path.join(__dirname, 'public')));

/* 
   IMPORTANT:
   Register your API endpoints BEFORE the fallback route.
*/

// Helper: File that stores user account data.
const SAVE_FILE = path.join(__dirname, 'saveData.json');

// Helper: Load accounts from the JSON file.
function loadAccounts() {
  try {
    const data = fs.readFileSync(SAVE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error("Could not load accounts, returning empty object:", err);
    return {};
  }
}

// Helper: Save accounts to the JSON file.
function saveAccounts(accounts) {
  fs.writeFile(SAVE_FILE, JSON.stringify(accounts, null, 2), (err) => {
    if (err) console.error("Error saving accounts:", err);
  });
}

// POST /create - Create a new account.
app.post('/create', (req, res) => {
  const { username, password, color } = req.body;
  if (!username || !password) {
    return res.status(400).send("Missing username or password.");
  }
  const accounts = loadAccounts();
  if (accounts[username]) {
    return res.status(400).send("Username already exists.");
  }
  // In production, always hash your passwords.
  accounts[username] = {
    password,
    color,
    data: {
      level: 1,
      xp: 0,
      coins: 100,
      class: "",
      weapon: null,
      totalEnemiesKilled: 0,
      totalCoinsCollected: 0,
      totalExpEarned: 0
    }
  };
  saveAccounts(accounts);
  res.status(200).send("Account created successfully.");
});

// POST /login - Log in with an existing account.
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = loadAccounts();
  if (!accounts[username]) {
    return res.status(400).send("Username not found.");
  }
  if (accounts[username].password !== password) {
    return res.status(400).send("Incorrect password.");
  }
  res.json({
    color: accounts[username].color,
    title: accounts[username].title || ""
  });
});

// POST /logAccount - Log account activity for auditing.
app.post('/logAccount', (req, res) => {
  console.log("Account activity:", req.body);
  res.status(200).send("Account activity logged.");
});

// POST /save - Save game data.
app.post('/save', (req, res) => {
  const { username, data } = req.body;
  if (!username || !data) {
    return res.status(400).send("Missing username or data.");
  }
  const accounts = loadAccounts();
  if (!accounts[username]) {
    return res.status(400).send("Account not found.");
  }
  accounts[username].data = { ...accounts[username].data, ...data };
  saveAccounts(accounts);
  res.status(200).send("Game data saved.");
});

// GET /load/:username - Load game data for a specific user.
app.get('/load/:username', (req, res) => {
  const username = req.params.username;
  const accounts = loadAccounts();
  if (!accounts[username]) {
    return res.status(404).send("User not found.");
  }
  res.json({ 
    ...accounts[username].data,
    color: accounts[username].color,
    title: accounts[username].title || ""
  });
});

// POST /changeClass - Update a player's class (admin functionality).
app.post('/changeClass', (req, res) => {
  const { playerName, newClass } = req.body;
  const accounts = loadAccounts();
  if (!accounts[playerName]) {
    return res.status(404).send("User not found.");
  }
  accounts[playerName].data.class = newClass;
  saveAccounts(accounts);
  res.status(200).send("Class updated.");
});

// POST /toggleMute - Toggle mute for a player.
app.post('/toggleMute', (req, res) => {
  const { playerName, mute } = req.body;
  console.log(`Player ${playerName} mute set to ${mute}`);
  res.status(200).send("Mute toggled.");
});

// Socket.io connections for real-time multiplayer events.
io.on('connection', (socket) => {
  console.log("New client connected", socket.id);

  // Handle movement updates from clients.
  socket.on("move", (data) => {
    data.id = socket.id;
    socket.broadcast.emit("playerMoved", data);
  });

  // Handle chat messages.
  socket.on("chat", (data) => {
    socket.broadcast.emit("chat", data);
  });

  socket.on("globalNotification", (data) => {
    socket.broadcast.emit("globalNotification", data);
  });

  socket.on("adminAnnouncement", (data) => {
    io.emit("globalNotification", {
      msg: data.text,
      duration: 5000,
      color: data.color,
      font: data.font
    });
  });

  socket.on("adminUpdate", (data) => {
    socket.broadcast.emit("adminUpdate", data);
  });

  socket.on("effect", (data) => {
    socket.broadcast.emit("effect", data);
  });

  socket.on("eventToggle", (data) => {
    // Broadcast the event toggle message to all other clients.
    socket.broadcast.emit("eventToggle", data);
  });

  // NEW: Listen for shutdown command from admin and broadcast it to all clients.
  socket.on("shutdown", function() {
    console.log("Shutdown command received from " + socket.id);
    io.emit("shutdown");
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    socket.broadcast.emit("playerDisconnected", socket.id); // NEW: Broadcast disconnect
  });
});

// Fallback route: Serve index.html for any other GET request.
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Index Not Found</title>
        </head>
        <body>
          <h1>index.html not found</h1>
          <p>Please ensure that your index.html file is in the public folder at ${path.join(__dirname, 'public')}</p>
        </body>
      </html>
    `);
  }
});

// Global error handling middleware.
app.use((err, req, res, next) => {
  console.error("Unexpected error:", err);
  res.status(500).send("Internal server error.");
});

// Start the server.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});