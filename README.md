# TaskBoard — Internal Team Task Manager

A lightweight, full-stack Kanban board for internal team use. Built with Node.js, Express, SQLite, and vanilla HTML/CSS/JS.

---

## Features

- **Kanban board** (TODO / DOING / DONE) with drag & drop
- **Auto-sync every 5 seconds** — changes from other users appear without reload
- **Dashboard** with charts, metrics, and team availability
- **Team availability** — see who has bandwidth to take new tasks
- **Private access** — single team password via environment variable
- **Responsive** — works on desktop and mobile

---

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd task-manager
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
TEAM_PASSWORD=your_secure_password_here
SESSION_SECRET=some_long_random_string_here
PORT=3000
NODE_ENV=development
```

### 3. Run locally

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Open: http://localhost:3000

---

## Deploy to Render (free)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Configure:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - **Environment variables:**
     - `TEAM_PASSWORD` → your password
     - `SESSION_SECRET` → random string (use https://randomkeygen.com)
     - `NODE_ENV` → `production`
5. Deploy

> **Note:** Render free tier has ephemeral disk — the SQLite file resets on deploy. Use a paid plan with persistent disk, or switch to Railway/Fly.io.

---

## Deploy to Railway

1. Push to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add environment variables in the Railway dashboard:
   - `TEAM_PASSWORD`, `SESSION_SECRET`, `NODE_ENV=production`
4. Railway auto-detects Node.js and deploys

Railway provides a persistent volume — ideal for SQLite.

---

## Deploy to Fly.io

```bash
npm install -g flyctl
fly auth login
fly launch  # follow prompts
fly secrets set TEAM_PASSWORD=yourpassword SESSION_SECRET=yoursecret NODE_ENV=production
fly deploy
```

Add a persistent volume in `fly.toml` for the SQLite file.

---

## Deploy to a VPS (DigitalOcean, Hetzner, etc.)

```bash
# On your server:
git clone <your-repo-url>
cd task-manager
npm install
cp .env.example .env
nano .env  # set your variables

# Use PM2 to keep it running:
npm install -g pm2
pm2 start server.js --name taskboard
pm2 save
pm2 startup
```

Use Nginx as reverse proxy pointing to port 3000.

---

## Changing the Team Password

1. Edit `.env` → update `TEAM_PASSWORD`
2. Restart the server: `pm2 restart taskboard` (or redeploy on Render/Railway)
3. Share the new password with your team

---

## Project Structure

```
task-manager/
├── server.js          # Express entry point
├── db/
│   └── database.js    # SQLite init & schema
├── routes/
│   ├── auth.js        # Login/logout
│   ├── tasks.js       # Task CRUD + reorder
│   └── stats.js       # Dashboard metrics + availability
├── public/
│   ├── index.html     # Full frontend (login + board + dashboard)
│   ├── app.js         # Frontend logic
│   └── styles.css     # Styles
├── .env.example
├── package.json
└── README.md
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Authenticate |
| POST | /api/auth/logout | Log out |
| GET | /api/auth/check | Check session |
| GET | /api/tasks | Get all tasks (filterable) |
| POST | /api/tasks | Create task |
| PUT | /api/tasks/:id | Update task |
| PATCH | /api/tasks/:id/status | Quick status change |
| PATCH | /api/tasks/reorder | Save drag & drop order |
| DELETE | /api/tasks/:id | Delete task |
| GET | /api/stats | Dashboard metrics |
| GET | /api/stats/availability | Team availability |
