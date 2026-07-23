const params = new URLSearchParams(window.location.search);
const roomCode = (params.get('room') || '').toUpperCase();
document.getElementById('roomLabel').textContent = roomCode;

const GLYPHS = {
  wK: '\u2654', wQ: '\u2655', wR: '\u2656', wB: '\u2657', wN: '\u2658', wP: '\u2659',
  bK: '\u265A', bQ: '\u265B', bR: '\u265C', bB: '\u265D', bN: '\u265E', bP: '\u265F',
};
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

let socket = null;
let myColor = null;
let myUsername = null;
let currentFen = null;
let currentTurn = 'w';
let selectedSquare = null;
let legalTargets = [];
let lastMove = null;
let moveList = [];
let timeControl = 600;
let pendingPromotion = null;

async function boot() {
  if (!roomCode) return (window.location.href = '/lobby.html');

  const meRes = await fetch('/api/auth/me');
  if (!meRes.ok) return (window.location.href = '/login.html');
  const me = await meRes.json();
  myUsername = me.username;

  socket = io();
  socket.on('connect', () => socket.emit('join-room', roomCode));

  socket.on('error-message', (msg) => toast(msg));

  socket.on('room-joined', (data) => {
    myColor = data.color;
    currentFen = data.fen;
    currentTurn = data.turn;
    timeControl = data.timeControl;

    document.getElementById('meName').textContent = myUsername + (myColor === 'w' ? ' (White)' : ' (Black)');
    const oppName = myColor === 'w' ? data.blackName : data.whiteName;
    document.getElementById('oppName').textContent = oppName
      ? oppName + (myColor === 'w' ? ' (Black)' : ' (White)')
      : 'Waiting for opponent\u2026';

    renderClock('meClock', myColor === 'w' ? data.whiteMs : data.blackMs);
    renderClock('oppClock', myColor === 'w' ? data.blackMs : data.whiteMs);
    updateTurnDots();
    renderBoard();
  });

  socket.on('opponent-connected', ({ username }) => {
    document.getElementById('oppName').textContent = username + (myColor === 'w' ? ' (Black)' : ' (White)');
    toast(username + ' joined the game.');
  });

  socket.on('opponent-disconnected', ({ username }) => toast(username + ' disconnected.'));

  socket.on('move-made', (data) => {
    currentFen = data.fen;
    currentTurn = data.turn;
    lastMove = data.move;
    moveList.push(data.san);
    selectedSquare = null;
    legalTargets = [];
    renderBoard();
    renderLedger();
    updateTurnDots();
    if (myColor === 'w') {
      renderClock('meClock', data.whiteMs);
      renderClock('oppClock', data.blackMs);
    } else {
      renderClock('meClock', data.blackMs);
      renderClock('oppClock', data.whiteMs);
    }
  });

  socket.on('clock-tick', (data) => {
    if (myColor === 'w') {
      renderClock('meClock', data.whiteMs);
      renderClock('oppClock', data.blackMs);
    } else {
      renderClock('meClock', data.blackMs);
      renderClock('oppClock', data.whiteMs);
    }
  });

  socket.on('game-over', ({ result, reason, by }) => {
    showGameOver(result, reason, by);
  });

  socket.on('draw-offered', ({ by }) => {
    document.getElementById('drawSub').textContent = by + ' is offering a draw.';
    document.getElementById('drawModal').classList.add('show');
  });

  socket.on('draw-declined', ({ by }) => toast(by + ' declined the draw.'));

  socket.on('chat-message', ({ username, text }) => addChatLine(username, text));
}

function updateTurnDots() {
  const meIsTurn = currentTurn === myColor;
  document.getElementById('meDot').classList.toggle('turn', meIsTurn);
  document.getElementById('oppDot').classList.toggle('turn', !meIsTurn);
}

function renderClock(id, ms) {
  const el = document.getElementById(id);
  if (timeControl === 0) {
    el.textContent = '\u221E';
    return;
  }
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  el.textContent = `${m}:${s}`;
  el.classList.toggle('low', totalSec <= 20);
}

function parseFen(fen) {
  const rows = fen.split(' ')[0].split('/');
  const board = [];
  for (const row of rows) {
    const line = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) line.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        line.push(color + ch.toUpperCase());
      }
    }
    board.push(line);
  }
  return board; // board[0] = rank 8 ... board[7] = rank 1
}

function squareName(rankIdx, fileIdx) {
  // rankIdx 0 = rank 8
  return FILES[fileIdx] + (8 - rankIdx);
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';
  const grid = parseFen(currentFen);
  const flip = myColor === 'b';

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const rankIdx = flip ? 7 - r : r;
      const fileIdx = flip ? 7 - f : f;
      const sqName = squareName(rankIdx, fileIdx);
      const piece = grid[rankIdx][fileIdx];
      const light = (rankIdx + fileIdx) % 2 === 0;

      const sq = document.createElement('div');
      sq.className = 'sq ' + (light ? 'light' : 'dark');
      sq.dataset.square = sqName;

      if (f === 0) {
        const coord = document.createElement('span');
        coord.className = 'coord';
        coord.textContent = sqName[1];
        sq.appendChild(coord);
      }

      if (piece) {
        const span = document.createElement('span');
        span.className = 'piece' + (piece[0] === myColor ? ' mine' : '');
        span.innerHTML = GLYPHS[piece];
        sq.appendChild(span);
      }

      if (lastMove && (sqName === lastMove.from || sqName === lastMove.to)) {
        sq.classList.add('last-move');
      }
      if (selectedSquare === sqName) sq.classList.add('selected');
      const target = legalTargets.find((m) => m.to === sqName);
      if (target) sq.classList.add(target.capture ? 'legal-capture' : 'legal');

      sq.addEventListener('click', () => onSquareClick(sqName, piece));
      boardEl.appendChild(sq);
    }
  }
}

function onSquareClick(sqName, piece) {
  if (!myColor || currentTurn !== myColor) return;

  const target = legalTargets.find((m) => m.to === sqName);
  if (selectedSquare && target) {
    if (target.promotion) {
      pendingPromotion = { from: selectedSquare, to: sqName };
      openPromoModal();
      return;
    }
    sendMove(selectedSquare, sqName);
    return;
  }

  if (piece && piece[0] === myColor) {
    selectedSquare = sqName;
    socket.emit('get-moves', { roomCode, square: sqName }, (moves) => {
      legalTargets = moves || [];
      renderBoard();
    });
  } else {
    selectedSquare = null;
    legalTargets = [];
    renderBoard();
  }
}

function sendMove(from, to, promotion) {
  socket.emit('move', { roomCode, from, to, promotion });
  selectedSquare = null;
  legalTargets = [];
}

function openPromoModal() {
  const opts = document.getElementById('promoOptions');
  opts.innerHTML = '';
  const pieces = [['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight']];
  pieces.forEach(([code, label]) => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      document.getElementById('promoModal').classList.remove('show');
      sendMove(pendingPromotion.from, pendingPromotion.to, code);
    });
    opts.appendChild(btn);
  });
  document.getElementById('promoModal').classList.add('show');
}

function renderLedger() {
  const el = document.getElementById('ledger');
  let html = '';
  for (let i = 0; i < moveList.length; i += 2) {
    const num = i / 2 + 1;
    html += `<div class="ledger-row"><span class="num">${num}.</span><span class="san">${moveList[i] || ''}</span><span class="san">${moveList[i + 1] || ''}</span></div>`;
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function showGameOver(result, reason, by) {
  document.getElementById('overTitle').textContent =
    result === '1/2-1/2' ? 'Draw' : (result === '1-0') === (myColor === 'w') ? 'You won!' : 'You lost';
  const reasonText = { checkmate: 'by checkmate', resignation: (by ? by + ' resigned' : 'by resignation'), timeout: 'on time', stalemate: 'by stalemate', agreement: 'by agreement' }[reason] || reason;
  document.getElementById('overSub').textContent = reasonText || '';
  document.getElementById('overModal').classList.add('show');
}

document.getElementById('resignBtn').addEventListener('click', () => {
  if (confirm('Resign this game?')) socket.emit('resign', { roomCode });
});

document.getElementById('drawBtn').addEventListener('click', () => {
  socket.emit('offer-draw', { roomCode });
  toast('Draw offer sent.');
});

document.getElementById('drawAcceptBtn').addEventListener('click', () => {
  socket.emit('respond-draw', { roomCode, accept: true });
  document.getElementById('drawModal').classList.remove('show');
});
document.getElementById('drawDeclineBtn').addEventListener('click', () => {
  socket.emit('respond-draw', { roomCode, accept: false });
  document.getElementById('drawModal').classList.remove('show');
});

function addChatLine(username, text) {
  const log = document.getElementById('chatLog');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  const u = document.createElement('span');
  u.className = 'u';
  u.textContent = username + ':';
  div.appendChild(u);
  div.appendChild(document.createTextNode(text));
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

document.getElementById('chatSendBtn').addEventListener('click', sendChat);
document.getElementById('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});
function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  socket.emit('chat-message', { roomCode, text });
  input.value = '';
}

function toast(msg) {
  const stack = document.getElementById('toastStack');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

boot();
