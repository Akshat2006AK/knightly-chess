# Knightly &mdash; real-time chess for friends

A full-stack, self-hosted chess app: accounts, private rooms with a share code,
real-time moves and clocks over WebSockets, a move ledger, in-game chat, and an
owner-only admin portal.

## What's inside

- **Backend:** Node.js + Express + Socket.io, SQLite (via `better-sqlite3`) for
  storage, sessions shared between HTTP and WebSocket connections.
- **Game engine:** [`chess.js`](https://github.com/jhlywa/chess.js) validates
  every move server-side, so a player can't cheat by sending an illegal move
  from the browser console.
- **Frontend:** plain HTML/CSS/JS, no build step required.
- **Admin portal:** `/admin.html`, gated by a single password (see below), to
  view every registered user and every game.

## 1. Run it locally

```bash
npm install
cp .env.example .env      # then open .env and set your own SESSION_SECRET
npm start
```

Visit `http://localhost:3000`. The SQLite database file is created
automatically under `./data/` on first run &mdash; nothing else to configure.

## 2. The admin portal

Go to `/admin.html` (there's also a small link at the bottom of the login
page). The default password is:

```
'''
- See total users, total games, and how many games are active right now
- Browse every registered account, and ban or delete one
- Browse every game (players, result, how it ended), and delete a record

Admin access is a separate password, not tied to any user account, so keep it
private.

## 3. Push to GitHub

```bash
cd knightly-chess
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

`.env` and the local `data/` folder are already excluded via `.gitignore`, so
your secrets and local database won't be pushed.

## 4. Deploy on Render

**Option A — Blueprint (fastest):** This repo includes a `render.yaml`. In the
Render dashboard, choose **New > Blueprint**, point it at your GitHub repo,
and Render will create the web service, generate a `SESSION_SECRET`, and
attach a small persistent disk automatically. Just open the service afterward
and update `ADMIN_PASSWORD` to your own value if you don't want the default.

**Option B — Manual:**
1. **New > Web Service**, connect your GitHub repo.
2. Build command: `npm install`
3. Start command: `npm start`
4. Add environment variables:
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = (a long random string)
   - `ADMIN_PASSWORD` = (your own admin password)
5. **Important — add a persistent disk.** Render's free web services use an
   ephemeral filesystem: without a disk, your SQLite database (all users and
   games) is wiped on every deploy or restart. Under the service's **Disks**
   tab, add a disk mounted at `/opt/render/project/src/data` (1 GB is plenty
   for friends-and-family use).
6. Deploy. Render will give you a public `https://<your-app>.onrender.com`
   URL — share that with friends so they can register and play.

### A note on scale

This is built for a small circle of friends, not thousands of concurrent
users: sessions and live game clocks live in the Node process's memory, and
storage is a single SQLite file. That's simple, reliable, and free-tier
friendly for its intended use. If you ever outgrow it, the natural next step
is swapping SQLite for Postgres (Render offers a free managed Postgres
instance) and moving session/clock state into something like Redis.

## Project structure

```
knightly-chess/
├── server.js              # Express + Socket.io entry point
├── config/db.js           # SQLite connection + schema
├── middleware/auth.js     # requireAuth / requireAdmin guards
├── routes/
│   ├── authRoutes.js      # register, login, logout, /me
│   ├── gameRoutes.js      # create/join rooms, list my games
│   └── adminRoutes.js     # admin login + user/game management
├── sockets/gameSocket.js  # real-time moves, clocks, resign, draw, chat
├── public/
│   ├── index.html         # landing page
│   ├── register.html / login.html
│   ├── lobby.html         # create/join rooms, game history
│   ├── game.html           # the board itself
│   ├── admin.html         # owner dashboard
│   ├── css/style.css
│   └── js/                # one file per page
├── render.yaml             # Render blueprint
└── .env.example
```

## License

MIT — do whatever you'd like with it.
