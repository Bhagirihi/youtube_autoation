# Run the pipeline without your laptop (auto-post to YouTube)

Use the **non-interactive runner** so a remote server or cron can run the pipeline:

```bash
# Run a specific channel
CHANNEL=HorrorPodcastAdda node run-scheduled.js
CHANNEL=CinePlotDecode node run-scheduled.js
CHANNEL=CinePlotDecodeShorts node run-scheduled.js

# Run a random channel (good for cron – one run = one attempt)
node run-scheduled.js
```

---

## Where to host (so it runs automatically)

### Option 1: VPS (recommended – full control, ~$5/mo or free)

**Best for:** Set-and-forget; runs on schedule without your laptop.

| Provider | Cost | Notes |
|----------|------|--------|
| **DigitalOcean** | ~$6/mo | 1 vCPU, 1GB RAM. Simple. |
| **Linode / Vultr** | ~$5–6/mo | Similar to DO. |
| **Oracle Cloud** | **Free** | Always-free ARM VM. More setup, no monthly cost. |

**Setup outline:**

1. Create a small Linux VM (Ubuntu 22.04).
2. Install Node.js 18+, FFmpeg, Chromium (for Puppeteer), and yt-dlp:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm ffmpeg chromium-browser
   # yt-dlp: https://github.com/yt-dlp/yt-dlp#installation
   ```
3. Clone your repo (or upload files). Add `.env` and token files (`src/auth/*.token.json`).
4. `npm install`
5. Schedule the runner with cron (e.g. once per day at 2 AM):
   ```bash
   crontab -e
   # Add: 0 2 * * * cd /path/to/YTAutomation && CHANNEL=CinePlotDecodeShorts node run-scheduled.js >> /var/log/yt-automation.log 2>&1
   ```

Result: the server runs the pipeline on schedule and posts to YouTube; no laptop needed.

---

### Option 2: Railway or Render (managed worker)

**Best for:** Don’t want to manage a raw server; still need long runs and persistence.

- **Railway:** Create a project, connect repo, add a **Cron Job** or **Worker** that runs `node run-scheduled.js`. Add env vars (`.env`). Use a **Volume** for `src/output` and `src/auth` if you need persistence (tokens, processed lists).
- **Render:** Similar – Background Worker, cron, or cron job; set build command and start command to run the script on schedule.

Pricing is usage-based; free tiers may have limits on run time or hours.

---

### Option 3: GitHub Actions (included – free, with limits)

**Best for:** Free automation; okay with storing secrets in GitHub and some setup.

A workflow is included: **`.github/workflows/yt-automation.yml`**. It:

- Runs on a **schedule** (daily at 02:00 UTC) and on **manual** trigger.
- Installs **Node**, **FFmpeg**, and **yt-dlp**.
- Restores/saves **processed_videos.json** and **uploaded_shorts.json** via cache so the same video isn’t re-uploaded.
- Writes the YouTube token from a secret so uploads work headless.

**Required repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Description |
|--------|-------------|
| `CINEPLOT_TOKEN_JSON` | Full contents of `src/auth/CinePlotDecode.token.json` (copy-paste the JSON). |
| `GEMINI_API_KEY` | (If using CinePlotDecode full or HPA) Your Gemini API key. |

**Optional:** `GOOGLE_CLIENT_SECRET_JSON` – contents of the Google client_secret `.json` if you don’t commit it.

**Default channel:** The workflow runs **CinePlotDecodeShorts** by default (lightest). Edit the `env.CHANNEL` in the workflow to use `CinePlotDecode` or `HorrorPodcastAdda`.

**Limitations:** Free tier ~2000 min/month; each run can be 15–60+ min. OAuth token refresh is interactive locally; if the token expires, re-authorize on your machine and update the `CINEPLOT_TOKEN_JSON` secret.

---

## Summary

| Goal | Suggested choice |
|------|-------------------|
| Easiest “no laptop” setup | **VPS** (DigitalOcean/Linode) or **Oracle Free** + cron + `run-scheduled.js` |
| Don’t manage a server | **Railway** or **Render** worker/cron + volume for tokens/output |
| Free only | **GitHub Actions** (with token-in-secret and run-time limits) or **Oracle Cloud Free** VPS |

For **automatic posting without depending on your laptop**, Option 1 (VPS + cron) or Option 2 (Railway/Render) is the most straightforward.
