function showError(msg) {
  const el = document.getElementById('formError');
  el.textContent = msg;
  el.classList.add('show');
}

function clearError() {
  const el = document.getElementById('formError');
  el.classList.remove('show');
  el.textContent = '';
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Creating account...';
    try {
      const username = document.getElementById('username').value.trim();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      await postJSON('/api/auth/register', { username, email, password });
      window.location.href = '/lobby.html';
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Create account';
    }
  });
}

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Logging in...';
    try {
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      await postJSON('/api/auth/login', { username, password });
      window.location.href = '/lobby.html';
    } catch (err) {
      showError(err.message);
      btn.disabled = false;
      btn.textContent = 'Log in';
    }
  });
}
