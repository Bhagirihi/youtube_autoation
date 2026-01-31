# YouTube Automation (HPA + CinePlot Decode)

Automated pipelines for **Horror Podcast Adda**, **CinePlot Decode** (full), and **CinePlot Decode (Shorts)** – story/TTS/video generation and upload to YouTube.

## Quick start (local)

```bash
npm install
npm start
```

Then choose a channel from the menu.

## Scheduled / headless (no laptop)

```bash
# Run a specific channel
CHANNEL=CinePlotDecodeShorts node run-scheduled.js
CHANNEL=CinePlotDecode node run-scheduled.js
CHANNEL=HorrorPodcastAdda node run-scheduled.js

# Or use npm scripts
npm run scheduled:shorts
npm run scheduled:cpd
npm run scheduled:hpa
```

See [docs/RUN_WITHOUT_LAPTOP.md](docs/RUN_WITHOUT_LAPTOP.md) for VPS, Railway, or GitHub Actions setup.

## Setup (first time)

1. Copy `.env.example` to `.env` and add your API keys (Gemini, etc.).
2. For YouTube uploads: run once locally and complete OAuth so `src/auth/*.token.json` are created. For CI, use repo secrets (see `.github/workflows/yt-automation.yml`).

## Repo

- Branch **HPACPD**: this codebase (HPA + CinePlot Decode + Shorts).
