# ⬡ CPU Scheduling Simulator

**Interactive Operating System scheduling visualizer** — add processes, pick an
algorithm, and watch the ready queue, animated Gantt chart, and performance
metrics update in real time. Compare all six algorithms side by side and export
the results.

> University Operating Systems project. Frontend is pure HTML/CSS/vanilla JS
> (Canvas API, no frameworks). An optional Node/Express/MongoDB/Socket.IO
> backend adds accounts, cloud-saved simulations, an admin dashboard, and live
> updates.

---

## 🔴 Live Demo

**https://YOUR-SITE-NAME.netlify.app**  ← replace after deploying (see [Deployment](#-deployment))

The live demo runs **fully in the browser** — every scheduling feature works with
no backend. Accounts, cloud save, and the admin dashboard only appear when a
backend is configured.

---

## ✨ Features

| | |
|---|---|
| **6 algorithms** | FCFS · SJF (non-preemptive) · SRTF · Round Robin · Priority (NP) · Priority (preemptive) |
| **Animated Gantt chart** | Per-tick playback with adjustable speed, idle-time gaps, hover tooltips |
| **Process state view** | Ready queue → CPU → completed, updated live during playback |
| **Statistics** | Avg waiting / turnaround / response time, CPU utilization, throughput + Canvas bar charts |
| **Comparison mode** | Runs all 6 algorithms on the same input and highlights the best average waiting time |
| **Step-by-step mode** | Pause / step / reset controls |
| **Export** | JSON, CSV, and print-to-PDF |
| **UX** | Dark / light theme (persisted), keyboard shortcuts, responsive layout |
| **Full-stack (optional)** | JWT auth + bcrypt, save/load/delete simulations in MongoDB, admin analytics, Socket.IO live events |

---

## 🚀 Two ways to run it

### 1. Standalone (what the live demo uses)

No install, no backend. Just open `client/index.html` — or serve the folder:

```bash
npx serve client
```

`client/index.html` ships with `window.CPUSIM_API = ""`, which keeps the app in
browser-only mode.

### 2. Full-stack (accounts, cloud save, admin, live updates)

**Prerequisites:** Node.js 18+ and MongoDB (local or [MongoDB Atlas](https://www.mongodb.com/atlas)).

```bash
npm install
cp .env.example .env          # then edit MONGO_URI and set a strong JWT_SECRET
npm run dev                   # nodemon, http://localhost:5000
```

The Express server serves the frontend and the API from the same origin, so open
**http://localhost:5000**. If MongoDB is unreachable the server still starts —
the scheduling features work and only the account/save features are disabled.

To point the frontend at a **remote** backend instead, edit `client/index.html`:

```html
<script>window.CPUSIM_API = "https://your-api.onrender.com";</script>
```

(Use `"/"` for a same-origin backend.)

---

## 📁 Project structure

```
CPU-Scheduling-Simulator/
├── client/                     # Static frontend — this is what Netlify publishes
│   ├── index.html              #   UI + window.CPUSIM_API backend switch
│   ├── style.css               #   Dark / light theme
│   └── script.js               #   Process mgmt, 6 algorithms, Gantt, charts, export
│
├── server/                     # Optional Express API (MVC)
│   ├── server.js               #   Express + Socket.IO entry point
│   ├── config/db.js            #   MongoDB connection (degrades gracefully)
│   ├── models/                 #   User · Simulation · Analytics (Mongoose)
│   ├── controllers/            #   auth · simulation · analytics
│   ├── routes/                 #   /api/auth · /api/simulations · /api/analytics
│   ├── middleware/             #   JWT protect/adminOnly · errorHandler · rateLimiter
│   ├── services/schedulerService.js   # Server-side copy of all 6 algorithms
│   └── utils/validators.js     #   express-validator schemas
│
├── netlify.toml                # Publishes ./client, no build step
├── .env.example
├── package.json
└── LICENSE
```

The six algorithms are implemented **identically** on the client
(`client/script.js`) and the server (`server/services/schedulerService.js`); the
client uses its own copy whenever no backend is configured or a request fails.

---

## 🌐 Deployment

### Frontend → Netlify (used by the live demo)

`netlify.toml` is already configured (`publish = "client"`, no build command).

- **Netlify UI:** New site → import this GitHub repo → deploy. Nothing to configure.
- **CLI:** `npm i -g netlify-cli && netlify deploy --prod`

After the first deploy, set the site name under **Site settings → Change site
name**, then update the [Live Demo](#-live-demo) link above.

### Backend → Render / Railway (optional)

Netlify cannot run the Node server. To host the full-stack version, deploy
`server/` to a Node host:

1. Create a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster and copy its connection string.
2. New Web Service on [Render](https://render.com) / [Railway](https://railway.app) from this repo.
   - Build: `npm install` · Start: `npm start`
   - Env vars: `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production`, `CLIENT_URL=https://YOUR-SITE-NAME.netlify.app`
3. Set `window.CPUSIM_API` in `client/index.html` to the service URL and redeploy Netlify.

---

## 📡 API reference (full-stack mode)

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user, returns JWT |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/auth/profile` | Current user profile (auth) |

### Simulations
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/simulations/run` | Run one algorithm, return schedule + results (auth) |
| POST | `/api/simulations/save` | Save a simulation (auth) |
| POST | `/api/simulations/compare` | Run all 6 algorithms (auth) |
| GET | `/api/simulations` | List the user's saved simulations (auth) |
| GET | `/api/simulations/:id` | Get one saved simulation (auth) |
| DELETE | `/api/simulations/:id` | Delete a saved simulation (auth) |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/analytics/stats` | System-wide usage stats (admin) |
| GET | `/api/analytics/comparison` | Aggregated algorithm performance from saved runs (auth) |
| GET | `/api/health` | Liveness check |

---

## 📚 Algorithms

| Algorithm | Type | Notes |
|---|---|---|
| FCFS | Non-preemptive | Arrival order; can cause the convoy effect |
| SJF | Non-preemptive | Shortest available burst first; optimal avg WT for a static batch |
| SRTF | Preemptive | Preempts when a shorter remaining burst arrives |
| Round Robin | Preemptive | Fixed time quantum; new arrivals enqueue before the preempted process |
| Priority (NP) | Non-preemptive | Lowest number = highest priority |
| Priority (Pre) | Preemptive | Higher-priority arrival preempts immediately |

Waiting = Turnaround − Burst · Response = First CPU time − Arrival ·
CPU utilization = Σ burst / makespan.

---

## ⚙️ Environment variables (full-stack mode)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | `development` / `production` | `development` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/cpuscheduler` |
| `JWT_SECRET` | JWT signing secret (use a long random string) | — |
| `JWT_EXPIRE` | Token lifetime | `7d` |
| `CLIENT_URL` | Allowed CORS origin for the frontend | `http://localhost:5000` |

---

## 🧭 Future improvements

- Multilevel Queue & Multilevel Feedback Queue
- Priority aging to prevent starvation
- CSV import for bulk process entry
- Shareable simulation links
- Dockerfile / `render.yaml` for one-click backend deploy

---

## 👥 Team

- Fizzah Shakeel — 2024F-BSE-312
- Akif Jaseem — 2024F-BSE-264
- Unaira Ali — 2024F-BSE-190
- Zobia Khan — 2024F-BSE-193

## 📄 License

[MIT](LICENSE)
