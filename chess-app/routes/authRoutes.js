const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are all required.' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscores only.' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ error: 'That username or email is already registered.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const info = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, hash);

    req.session.userId = info.lastInsertRowid;
    req.session.username = username;

    return res.json({ id: info.lastInsertRowid, username });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }
    if (user.is_banned) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect username or password.' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    return res.json({ id: user.id, username: user.username });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Something went wrong logging you in.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ id: req.session.userId, username: req.session.username });
  }
  return res.status(401).json({ error: 'Not logged in.' });
});

module.exports = router;
