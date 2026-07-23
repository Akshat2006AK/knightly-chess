const express = require('express');
const { Chess } = require('chess.js');
const db = require('../config/db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

router.use(requireAuth);

// Create a new room. Creator is seated as White and waits for an opponent.
router.post('/create', (req, res) => {
  let { timeControl } = req.body || {};
  timeControl = Number.isFinite(Number(timeControl)) ? Number(timeControl) : 600;
  if (![0, 180, 300, 600, 900, 1800].includes(timeControl)) timeControl = 600;

  let roomCode;
  do {
    roomCode = makeRoomCode();
  } while (db.prepare('SELECT id FROM games WHERE room_code = ?').get(roomCode));

  const chess = new Chess();
  const info = db.prepare(`
    INSERT INTO games (room_code, white_id, white_name, status, fen, pgn, time_control)
    VALUES (?, ?, ?, 'waiting', ?, ?, ?)
  `).run(roomCode, req.session.userId, req.session.username, chess.fen(), chess.pgn(), timeControl);

  res.json({ id: info.lastInsertRowid, roomCode });
});

// Join an existing room as Black (or reconnect if you're already seated).
router.post('/join', (req, res) => {
  const { roomCode } = req.body || {};
  if (!roomCode) return res.status(400).json({ error: 'Room code is required.' });

  const game = db.prepare('SELECT * FROM games WHERE room_code = ?').get(roomCode.toUpperCase().trim());
  if (!game) return res.status(404).json({ error: 'No game found with that room code.' });

  if (game.white_id === req.session.userId || game.black_id === req.session.userId) {
    return res.json({ id: game.id, roomCode: game.room_code });
  }

  if (game.status !== 'waiting' || game.black_id) {
    return res.status(409).json({ error: 'That game already has two players.' });
  }

  db.prepare(`UPDATE games SET black_id = ?, black_name = ?, status = 'active', updated_at = datetime('now') WHERE id = ?`)
    .run(req.session.userId, req.session.username, game.id);

  res.json({ id: game.id, roomCode: game.room_code });
});

// List my games (recent first)
router.get('/mine', (req, res) => {
  const games = db.prepare(`
    SELECT * FROM games
    WHERE white_id = ? OR black_id = ?
    ORDER BY updated_at DESC
    LIMIT 25
  `).all(req.session.userId, req.session.userId);
  res.json(games);
});

// Fetch a single game's public state
router.get('/:roomCode', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE room_code = ?').get(req.params.roomCode.toUpperCase());
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  if (game.white_id !== req.session.userId && game.black_id !== req.session.userId) {
    return res.status(403).json({ error: 'You are not a player in this game.' });
  }
  res.json(game);
});

module.exports = router;
