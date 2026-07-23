async function checkSession() {
  const res = await fetch('/api/admin/session');
  const data = await res.json();
  if (data.isAdmin) showDashboard();
}

document.getElementById('adminLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('adminError');
  errEl.classList.remove('show');
  const btn = document.getElementById('adminSubmitBtn');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  try {
    const password = document.getElementById('adminPassword').value;
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enter admin portal';
  }
});

document.getElementById('adminLogoutBtn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.reload();
});

function showDashboard() {
  document.getElementById('loginGate').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  document.getElementById('adminNav').style.display = 'flex';
  loadStats();
  loadUsers();
  loadGames();
}

document.querySelectorAll('.admin-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('usersPanel').style.display = tab.dataset.tab === 'users' ? 'block' : 'none';
    document.getElementById('gamesPanel').style.display = tab.dataset.tab === 'games' ? 'block' : 'none';
  });
});

async function loadStats() {
  const res = await fetch('/api/admin/stats');
  const s = await res.json();
  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card"><div class="val">${s.users}</div><div class="lbl">Registered users</div></div>
    <div class="stat-card"><div class="val">${s.games}</div><div class="lbl">Total games</div></div>
    <div class="stat-card"><div class="val">${s.active}</div><div class="lbl">Active now</div></div>
    <div class="stat-card"><div class="val">${s.finished}</div><div class="lbl">Completed</div></div>
  `;
}

async function loadUsers() {
  const res = await fetch('/api/admin/users');
  const users = await res.json();
  document.getElementById('usersBody').innerHTML = users
    .map(
      (u) => `
    <tr>
      <td class="mono">${u.id}</td>
      <td>${escapeHtml(u.username)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td class="mono">${u.created_at}</td>
      <td>${u.is_banned ? '<span class="badge finished">banned</span>' : '<span class="badge active">active</span>'}</td>
      <td style="display:flex; gap:6px;">
        <button class="pill-btn" onclick="toggleBan(${u.id}, ${u.is_banned ? 0 : 1})">${u.is_banned ? 'Unban' : 'Ban'}</button>
        <button class="pill-btn danger" onclick="deleteUser(${u.id})">Delete</button>
      </td>
    </tr>`
    )
    .join('');
}

async function toggleBan(id, banned) {
  await fetch(`/api/admin/users/${id}/ban`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ banned }),
  });
  loadUsers();
}

async function deleteUser(id) {
  if (!confirm('Delete this user account permanently?')) return;
  await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
  loadUsers();
  loadStats();
}

async function loadGames() {
  const res = await fetch('/api/admin/games');
  const games = await res.json();
  document.getElementById('gamesBody').innerHTML = games
    .map(
      (g) => `
    <tr>
      <td class="mono">${g.room_code}</td>
      <td>${escapeHtml(g.white_name || '-')}</td>
      <td>${escapeHtml(g.black_name || '-')}</td>
      <td><span class="badge ${g.status}">${g.status}</span></td>
      <td>${g.result || '-'}</td>
      <td>${g.reason || '-'}</td>
      <td class="mono">${g.updated_at}</td>
      <td><button class="pill-btn danger" onclick="deleteGame(${g.id})">Delete</button></td>
    </tr>`
    )
    .join('');
}

async function deleteGame(id) {
  if (!confirm('Delete this game record permanently?')) return;
  await fetch(`/api/admin/games/${id}`, { method: 'DELETE' });
  loadGames();
  loadStats();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

checkSession();
