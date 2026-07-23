const express = require('express');
const db = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const correct = process.env.ADMIN_PASSWORD || 'AKadmin1204';

  if (!password || password !== correct) {
    return res.status(401).json({ error: 'Incorrect admin password.' });
  }

  req.session.isAdmin = true;
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

router.use(requireAdmin);

router.get('/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const games = db.prepare('SELECT COUNT(*) c FROM games').get().c;
  const active = db.prepare(`SELECT COUNT(*) c FROM games WHERE status = 'active'`).get().c;
  const finished = db.prepare(`SELECT COUNT(*) c FROM games WHERE status = 'finished'`).get().c;
  res.json({ users, games, active, finished });
});

router.get('/users', (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, created_at, is_banned FROM users ORDER BY created_at DESC
  `).all();
  res.json(users);
});

router.post('/users/:id/ban', (req, res) => {
  const { banned } = req.body || {};
  db.prepare('UPDATE users SET is_banned = ? WHERE id = ?').run(banned ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.get('/games', (req, res) => {
  const games = db.prepare(`
    SELECT id, room_code, white_name, black_name, status, result, reason, time_control, created_at, updated_at
    FROM games ORDER BY updated_at DESC
  `).all();
  res.json(games);
});

router.get('/games/:id', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  res.json(game);
});

router.delete('/games/:id', (req, res) => {
  db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
