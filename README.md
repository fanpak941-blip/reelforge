# ReelForge — One Service, $0 Budget

This is now **one single app**: the website (frontend) and the video-generation
engine (backend) live in the same project and deploy as **one service on one
platform** — no Redis, no second worker process, no second hosting account.

## How it works

```
Browser opens your Render URL
        │
        ▼
Express serves public/index.html   (the website itself)
        │
        ▼  user clicks "Generate video"
POST /api/generate                 (routes/generate.js)
        │   validates the 4 choices, adds job to an in-memory queue, replies instantly
        ▼
queue/simpleQueue.js               (no Redis — just an array in memory)
        │
        ▼
pipeline/runVideoJob.js runs the full pipeline:
  script -> 5-second beats -> voice -> visuals -> stitch -> thumbnails
        │
        ▼
Finished video served back from /storage, browser polls /api/generate/:id/status
```

## Local test (optional, before deploying)

```bash
npm install
cp .env.example .env     # add your free Groq + Pexels keys
npm start
```
Open `http://localhost:4000` — that's the whole website AND the engine, together.

## Deploying for real — only 2 things needed, both free

**1. GitHub** (just to hold the code)
- Create a free GitHub account if you don't have one
- Create a new repository, upload this whole `reelforge-backend` folder to it
  (GitHub's web "Add file → Upload files" works fine, no command line needed)

**2. Render.com** (hosts the whole app — one service)
- Free account at render.com
- "New +" → "Web Service" → connect your GitHub repo
- Build Command: `npm install`
- Start Command: `npm start`
- Add Environment Variables (Render dashboard → Environment tab):
  - `GROQ_API_KEY` = your free Groq key
  - `PEXELS_API_KEY` = your free Pexels key
- Deploy. Render gives you one URL, e.g. `reelforge.onrender.com` —
  **that one link is your entire live website**, working end to end.

No Netlify, no Redis, no Upstash, no second service. One repo, one deploy.

## Free-tier accounts needed (both $0, no card)

| Service | For | Link |
|---|---|---|
| Groq | Script writing | console.groq.com |
| Pexels | Stock video footage | pexels.com/api |

You also need **ffmpeg** available on the server. Render's free Node
environment does not include it by default — switch the service to a
**Docker** environment and use the included `Dockerfile`, which installs
ffmpeg automatically.

## Trade-offs of the simpler setup (worth knowing)

- Jobs run **one at a time** — fine for a single owner/small audience; if
  several people generate videos simultaneously, they queue up rather than
  running in parallel. Upgrade path: bring back BullMQ + Redis (Upstash
  free tier) when there's real traffic to justify it.
- Jobs are **in memory only** — if the free Render instance restarts (it
  does after periods of inactivity), any in-progress job is lost. Acceptable
  for testing and early customers; revisit once revenue justifies an
  always-on paid instance.

## Owner free access

Send `isOwner=true` from the website (already wired into the frontend) to
skip credit checks and the avatar-mode paywall — your own account stays
free and unlimited while customers go through the $1 / $10 plans.

## Still missing (add only once there's revenue)

- **Avatar mode** — needs a paid provider (HeyGen/Synthesia). Currently
  returns a clear "upgrade" message instead of a broken video.
- **Real billing** — `checkAndDeductCredits()` in `routes/generate.js` is a
  placeholder; wire to Stripe + a real database once you're charging.
