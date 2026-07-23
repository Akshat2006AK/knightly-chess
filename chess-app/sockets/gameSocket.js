const { Chess } = require('chess.js');
const db = require('../config/db');

// In-memory clock + live-state tracking, keyed by room code.
// { whiteMs, blackMs, turn, lastTick, interval, sockets: Set }
const rooms = new Map();

function loadGame(roomCode) {
  return db.prepare('SELECT * FROM games WHERE room_code = ?').get(roomCode);
}

function ensureRoomState(game) {
  if (rooms.has(game.room_code)) return rooms.get(game.room_code);
  const chess = new Chess(game.fen || undefined);
  const state = {
    whiteMs: (game.time_control || 0) * 1000,
    blackMs: (game.time_control || 0) * 1000,
    turn: chess.turn(), // 'w' or 'b'
    lastTick: null,
    interval: null,
    sockets: new Set(),
    drawOfferBy: null,
  };
  rooms.set(game.room_code, state);
  return state;
}

function playerColor(game, userId) {
  if (game.white_id === userId) return 'w';
  if (game.black_id === userId) return 'b';
  return null;
}

function finishGame(game, result, reason) {
  db.prepare(`
    UPDATE games SET status = 'finished', result = ?, reason = ?, updated_at = datetime('now') WHERE id = ?
  `).run(result, reason, game.id);
  const state = rooms.get(game.room_code);
  if (state && state.interval) clearInterval(state.interval);
  rooms.delete(game.room_code);
}

module.exports = function registerGameSocket(io) {
  io.on('connection', (socket) => {
    const session = socket.request.session;
    if (!session || !session.userId) {
      socket.emit('error-message', 'You must be logged in to play.');
      socket.disconnect();
      return;
    }
    const userId = session.userId;
    const username = session.username;

    socket.on('join-room', (roomCode) => {
      const game = loadGame(roomCode);
      if (!game) return socket.emit('error-message', 'Game not found.');
      const color = playerColor(game, userId);
      if (!color) return socket.emit('error-message', 'You are not a player in this game.');

      socket.join(roomCode);
      socket.data.roomCode = roomCode;
      socket.data.color = color;

      const state = ensureRoomState(game);
      state.sockets.add(socket.id);

      socket.emit('room-joined', {
        fen: game.fen,
        color,
        status: game.status,
        whiteName: game.white_name,
        blackName: game.black_name,
        timeControl: game.time_control,
        whiteMs: state.whiteMs,
        blackMs: state.blackMs,
        turn: state.turn,
      });

      socket.to(roomCode).emit('opponent-connected', { username });

      if (game.status === 'active' && !state.interval && game.time_control > 0) {
        startClock(io, game.id, roomCode);
      }
    });

    socket.on('get-moves', ({ roomCode, square }, callback) => {
      try {
        const game = loadGame(roomCode);
        if (!game) return callback && callback([]);
        const chess = new Chess(game.fen);
        const moves = chess.moves({ square, verbose: true });
        callback && callback(moves.map((m) => ({ to: m.to, capture: !!m.captured, promotion: m.promotion })));
      } catch (e) {
        callback && callback([]);
      }
    });

    socket.on('move', ({ roomCode, from, to, promotion }) => {
      const game = loadGame(roomCode);
      if (!game || game.status !== 'active') return;
      const color = playerColor(game, userId);
      if (!color) return;

      const state = ensureRoomState(game);
      if (state.turn !== color) return socket.emit('error-message', 'It is not your turn.');

      const chess = new Chess(game.fen);
      let move;
      try {
        move = chess.move({ from, to, promotion: promotion || 'q' });
      } catch (e) {
        move = null;
      }
      if (!move) return socket.emit('error-message', 'Illegal move.');

      // apply elapsed time to the player who just moved
      if (game.time_control > 0 && state.lastTick) {
        const elapsed = Date.now() - state.lastTick;
        if (color === 'w') state.whiteMs = Math.max(0, state.whiteMs - elapsed);
        else state.blackMs = Math.max(0, state.blackMs - elapsed);
      }
      state.lastTick = Date.now();
      state.turn = chess.turn();
      state.drawOfferBy = null;

      db.prepare(`UPDATE games SET fen = ?, pgn = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(chess.fen(), chess.pgn(), game.id);

      io.to(roomCode).emit('move-made', {
        move,
        fen: chess.fen(),
        turn: state.turn,
        whiteMs: state.whiteMs,
        blackMs: state.blackMs,
        san: move.san,
      });

      if (chess.isGameOver()) {
        let result, reason;
        if (chess.isCheckmate()) {
          result = color === 'w' ? '1-0' : '0-1';
          reason = 'checkmate';
        } else if (chess.isStalemate()) {
          result = '1/2-1/2'; reason = 'stalemate';
        } else if (chess.isThreefoldRepetition()) {
          result = '1/2-1/2'; reason = 'threefold repetition';
        } else if (chess.isInsufficientMaterial()) {
          result = '1/2-1/2'; reason = 'insufficient material';
        } else {
          result = '1/2-1/2'; reason = 'draw';
        }
        const updated = loadGame(roomCode);
        finishGame(updated, result, reason);
        io.to(roomCode).emit('game-over', { result, reason });
      } else if (game.time_control > 0) {
        startClock(io, game.id, roomCode);
      }
    });

    socket.on('resign', ({ roomCode }) => {
      const game = loadGame(roomCode);
      if (!game || game.status !== 'active') return;
      const color = playerColor(game, userId);
      if (!color) return;
      const result = color === 'w' ? '0-1' : '1-0';
      finishGame(game, result, 'resignation');
      io.to(roomCode).emit('game-over', { result, reason: 'resignation', by: username });
    });

    socket.on('offer-draw', ({ roomCode }) => {
      const game = loadGame(roomCode);
      if (!game || game.status !== 'active') return;
      const state = ensureRoomState(game);
      state.drawOfferBy = userId;
      socket.to(roomCode).emit('draw-offered', { by: username });
    });

    socket.on('respond-draw', ({ roomCode, accept }) => {
      const game = loadGame(roomCode);
      if (!game || game.status !== 'active') return;
      const state = ensureRoomState(game);
      if (accept && state.drawOfferBy) {
        finishGame(game, '1/2-1/2', 'agreement');
        io.to(roomCode).emit('game-over', { result: '1/2-1/2', reason: 'agreement' });
      } else {
        state.drawOfferBy = null;
        io.to(roomCode).emit('draw-declined', { by: username });
      }
    });

    socket.on('chat-message', ({ roomCode, text }) => {
      if (!text || !text.trim()) return;
      const clean = String(text).slice(0, 300);
      io.to(roomCode).emit('chat-message', { username, text: clean, at: Date.now() });
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      if (roomCode) {
        socket.to(roomCode).emit('opponent-disconnected', { username });
        const state = rooms.get(roomCode);
        if (state) state.sockets.delete(socket.id);
      }
    });
  });
};

function startClock(io, gameId, roomCode) {
  const state = rooms.get(roomCode);
  if (!state) return;
  if (state.interval) clearInterval(state.interval);
  state.lastTick = Date.now();

  state.interval = setInterval(() => {
    const elapsed = Date.now() - state.lastTick;
    state.lastTick = Date.now();
    if (state.turn === 'w') state.whiteMs = Math.max(0, state.whiteMs - elapsed);
    else state.blackMs = Math.max(0, state.blackMs - elapsed);

    if (state.whiteMs <= 0 || state.blackMs <= 0) {
      clearInterval(state.interval);
      const game = loadGame(roomCode);
      if (game && game.status === 'active') {
        const result = state.whiteMs <= 0 ? '0-1' : '1-0';
        finishGame(game, result, 'timeout');
        io.to(roomCode).emit('game-over', { result, reason: 'timeout' });
      }
      return;
    }
    io.to(roomCode).emit('clock-tick', { whiteMs: state.whiteMs, blackMs: state.blackMs });
  }, 1000);
}
