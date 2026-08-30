// ══════════════════════════════════════════════════════════════
//   server.js — Main Server Entry Point
//   Express + Socket.IO + MongoDB
// ══════════════════════════════════════════════════════════════
require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');

const connectDB      = require('./config/db');
const errorHandler   = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// ── Route imports ──
const authRoutes       = require('./routes/auth');
const simRoutes        = require('./routes/simulations');
const analyticsRoutes  = require('./routes/analytics');

// ── Connect Database ──
connectDB();

// ── App setup ──
const app    = express();
const server = http.createServer(app);

// Trust the first proxy hop (Render / Railway / Fly / Heroku) so
// express-rate-limit sees the real client IP instead of the proxy's.
app.set('trust proxy', 1);

// ── Socket.IO setup ──
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});
app.set('io', io); // make io accessible in controllers

io.on('connection', (socket) => {
  console.log(`⚡ Socket connected: ${socket.id}`);

  // Client can join a personal room
  socket.on('join:user', (userId) => {
    socket.join(`user:${userId}`);
    socket.emit('notification', { message: 'Connected to real-time updates', type: 'success' });
  });

  // Live queue updates
  socket.on('simulation:step', (data) => {
    socket.emit('queue:update', data);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Socket disconnected: ${socket.id}`);
  });
});

// ── CORS ──
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET','POST','PUT','DELETE'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// ── Body parsing ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ──
app.use('/api', apiLimiter);

// ── API Routes ──
app.use('/api/auth',        authRoutes);
app.use('/api/simulations', simRoutes);
app.use('/api/analytics',   analyticsRoutes);

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'CPU Scheduler API running ✅', version: '2.0.0' });
});

// ── Serve the frontend (both dev and production) ──
const clientDir = path.join(__dirname, '../client');
app.use(express.static(clientDir));

// ── Unknown API route → JSON 404 (before the SPA fallback) ──
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.originalUrl}` });
});

// ── Anything else → the single-page frontend ──
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

// ── Global error handler ──
app.use(errorHandler);

// ── Start server ──
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready`);
  console.log(`🌱 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = { app, server };
