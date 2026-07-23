require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');
const registerGameSocket = require('./sockets/gameSocket');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const sessionMiddleware = session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
});

app.set('trust proxy', 1);
app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

// Share the same session data with socket.io connections
io.engine.use(sessionMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/admin', adminRoutes);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Fallback: unknown non-API GET requests go to the SPA-ish index
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

registerGameSocket(io);

server.listen(PORT, () => {
  console.log(`Knightly Chess server listening on port ${PORT}`);
});
