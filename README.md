# Horror Auto Factory v2

Full automation pipeline for **Horror Podcast Adda**: story + SEO → TTS → subtitles → Bing images → Ken Burns video → thumbnail → YouTube.

## Prerequisites

- **Node.js** v18+
- **Ollama** with **Llama 3** (story generation — free, local, no limits)
  ```bash
  # Install Ollama from https://ollama.com then:
  ollama run llama3
  ```
- **ffmpeg** (`ffmpeg -version`)
- **TTS**: Hindi voice via **edge-tts-universal** (npm; no Python/CLI needed).
- **Playwright Chromium**: `npx playwright install chromium`

## Why is there no audio? / Why “Ollama not running”?

- **No audio in the video**  
  The pipeline uses **edge-tts-universal** (Node) for Hindi voice. If synthesis fails (e.g. network), it falls back to **silent** narration. Ensure you have internet; no extra install is needed for TTS.

- **“Ollama not running”**  
  **Ollama** is a separate app that runs the Llama model locally. It does not start automatically with this project. To use AI-generated stories:
  1. Install Ollama from **https://ollama.com**
  2. Open the Ollama app (or in a terminal run `ollama serve`)
  3. Pull the model: `ollama run llama3`
  4. Then run `node index.js` again.

If Ollama is not running, the pipeline uses a **sample story** so the rest of the steps still complete.

## Setup

1. **Optional: copy .env for YouTube upload**
   ```bash
   cp .env.example .env
   # Edit .env only if you want YouTube upload (YT_* keys).
   ```

2. **Add background music**
   - Place at least one MP3 in `assets/music/` named **`horror.mp3`** (used by the video step).

3. **Install dependencies** (already done if you ran setup)
   ```bash
   npm install
   npx playwright install chromium
   ```

## Run full pipeline

```bash
node index.js
```

After 5–7 minutes you get:

- `output/final.mp4`
- `thumbnails/thumb.jpg`
- `temp/subtitles.srt`

To enable YouTube upload, set `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REDIRECT_URI`, `YT_REFRESH_TOKEN` in `.env` and uncomment the `uploadYoutube(data)` line in `index.js`.

## Project structure

```
horror-auto-factory-v2/
├── .env
├── index.js
├── prompts/story.prompt.txt
├── assets/music/          ← Put horror.mp3 here
├── temp/                  ← story.json, story.txt, subtitles.srt
├── voiceover/narration.mp3
├── images/                ← scene_1.jpg … scene_n.jpg
├── thumbnails/thumb.jpg
├── output/final.mp4
└── scripts/
    ├── generateStory.js
    ├── generateAudio.js
    ├── generateSubtitles.js
    ├── downloadImages.js
    ├── makeVideo.js
    ├── generateThumbnail.js
    └── uploadYoutube.js
```

## Deploy on Vercel

1. **Push the repo to GitHub** (if not already).

2. **Import on Vercel**
   - Go to [vercel.com](https://vercel.com) → **Add New** → **Project** → import your repo.
   - **Root Directory**: leave as is.
   - **Framework Preset**: Other (or leave auto-detected).

3. **Environment variables**  
   In the project **Settings → Environment Variables**, add at least:
   - `GEMINI_MASTER_API_KEY` (or any `GEMINI_*`) for story generation.
   - `UNSPLASH_ACCESS_KEY` for title/paragraph images.
   - Optionally: `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`. For **Gemini TTS**: `USE_GEMINI_TTS=1` and a `GEMINI_*` key; optional `GEMINI_TTS_VOICE` (e.g. `Charon`, `Algieba`).

4. **Deploy**  
   Vercel will use `server.js` (exported as the app) and serve the UI. Static files are served from `public/`.

**Notes**
- **Run pipeline** runs in a serverless function. Story generation can take 30–60s; the function is set to 60s max (Pro plan). On the Hobby plan (10s limit), the pipeline may time out — use it for **viewing/copying** a story generated elsewhere, or run the pipeline locally and rely on Vercel for the UI.
- Writable data (e.g. `temp/story.json`) is written under `/tmp` on Vercel, so “Run pipeline” can persist the story for that request.

## Features

| Feature              | Status |
|----------------------|--------|
| Auto story + SEO     | ✅     |
| Neural Hindi voice   | ✅     |
| Auto subtitles       | ✅     |
| Auto Bing images     | ✅     |
| Ken Burns motion     | ✅     |
| Background music     | ✅     |
| Scene sync with audio| ✅     |
| Thumbnail auto gen   | ✅     |
| Full automation      | ✅     |
