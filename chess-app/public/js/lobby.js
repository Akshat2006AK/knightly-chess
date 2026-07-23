let selectedTime = 600;
let currentUser = null;

async function init() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return (window.location.href = '/login.html');
    currentUser = await res.json();
    document.getElementById('whoami').textContent = currentUser.username;
  } catch {
    return (window.location.href = '/login.html');
  }
  loadGames();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
});

document.querySelectorAll('.time-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.time-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    selectedTime = Number(chip.dataset.secs);
  });
});

let lastRoomCode = null;

document.getElementById('createBtn').addEventListener('click', async () => {
  const btn = document.getElementById('createBtn');
  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    const res = await fetch('/api/games/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeControl: selectedTime }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    lastRoomCode = data.roomCode;
    document.getElementById('roomCodeDisplay').textContent = data.roomCode;
    document.getElementById('createdRoomBox').style.display = 'block';
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create room';
  }
});

document.getElementById('copyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(lastRoomCode);
  const btn = document.getElementById('copyBtn');
  const original = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => (btn.textContent = original), 1200);
});

document.getElementById('enterRoomBtn').addEventListener('click', () => {
  window.location.href = `/game.html?room=${lastRoomCode}`;
});

document.getElementById('joinBtn').addEventListener('click', async () => {
  const errEl = document.getElementById('joinError');
  errEl.classList.remove('show');
  const code = document.getElementById('joinCode').value.trim().toUpperCase();
  if (!code) return;
  try {
    const res = await fetch('/api/games/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode: code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    window.location.href = `/game.html?room=${data.roomCode}`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('show');
  }
});

async function loadGames() {
  const list = document.getElementById('gameList');
  try {
    const res = await fetch('/api/games/mine');
    const games = await res.json();
    if (!games.length) {
      list.innerHTML = '<li class="empty-state">No games yet &mdash; create a room to get started.</li>';
      return;
    }
    list.innerHTML = games
      .map((g) => {
        const opp = g.white_id === currentUser.id ? g.black_name : g.white_name;
        return `
        <li>
          <div>
            <div><strong>${g.room_code}</strong> ${opp ? 'vs ' + escapeHtml(opp) : '(waiting for opponent)'}</div>
            <div style="color:var(--text-muted); font-size:12px;">${g.result ? g.result + ' &middot; ' + (g.reason || '') : ''}</div>
          </div>
          <div style="display:flex; align-items:center; gap:10px;">
            <span class="badge ${g.status}">${g.status}</span>
            <a href="/game.html?room=${g.room_code}" class="btn" style="padding:7px 14px; font-size:12px;">Open</a>
          </div>
        </li>`;
      })
      .join('');
  } catch {
    list.innerHTML = '<li class="empty-state">Could not load games.</li>';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
