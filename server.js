import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from project root so keys are available even if server is run from another cwd
dotenv.config({ path: path.join(__dirname, ".env") });

import express from "express";
import { spawn } from "child_process";
import fs from "fs-extra";
import { getElevenLabsKeyCandidates, checkElevenLabsKey } from "./elelab.js";
import { getTTSKeyList } from "./scripts/geminiKeys.js";
import { getSarvamKeyList } from "./scripts/generateAudioSarvam.js";
import { getInworldKeyList } from "./scripts/generateAudioInworld.js";
import { regenerateDescriptionTags } from "./scripts/regenerateDescriptionTags.js";
import {
  getYoutubeAuthUrl,
  exchangeCodeForTokens,
  uploadYoutube,
  saveTokensToFile,
  getYoutubeConnectionStatus,
} from "./scripts/uploadYoutube.js";
if (process.env.VERCEL) process.env.DATA_DIR = process.env.DATA_DIR || "/tmp/horror-factory";
const dataDir = process.env.DATA_DIR || __dirname;

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/story", async (_req, res) => {
  try {
    const p = path.join(dataDir, "temp", "story.json");
    if (!(await fs.pathExists(p))) {
      return res.json({ story: null });
    }
    const data = await fs.readJson(p);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/story/regenerate-description-tags", async (_req, res) => {
  try {
    const prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dataDir;
    try {
      const story = await regenerateDescriptionTags();
      res.json({ ok: true, story });
    } finally {
      if (prevDataDir !== undefined) process.env.DATA_DIR = prevDataDir;
      else delete process.env.DATA_DIR;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY;

app.get("/api/unsplash", async (req, res) => {
  const query = (req.query.query || req.query.q || "horror").toString().trim();
  if (!UNSPLASH_KEY) {
    return res.status(503).json({
      error: "UNSPLASH_ACCESS_KEY not set",
      hint: "Add UNSPLASH_ACCESS_KEY (or UNSPLASH_API_KEY) to .env and restart the server.",
    });
  }
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&client_id=${encodeURIComponent(UNSPLASH_KEY)}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await r.json();
    const first = data?.results?.[0];
    const imageUrl = first?.urls?.regular || first?.urls?.small || first?.urls?.full;
    if (!imageUrl) {
      return res.status(404).json({ error: "No image found", query });
    }
    res.json({ url: imageUrl, query });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Build env for child process: set USE_*_TTS based on selected TTS.
 * tts = "gemini" | "elevenlabs" | "sarvam" | "inworld"
 */
function envWithTTSSelection(baseEnv, tts) {
  const env = { ...baseEnv, DATA_DIR: dataDir };
  const choice = String(tts || "").toLowerCase();
  env.USE_GEMINI_TTS = choice === "gemini" ? "1" : "0";
  env.USE_SARVAM_TTS = choice === "sarvam" ? "1" : "0";
  env.USE_INWORLD_TTS = choice === "inworld" ? "1" : "0";
  return env;
}

app.get("/api/tts-options", async (_req, res) => {
  try {
    const providers = [];

    // ElevenLabs: sum remaining chars across all keys
    try {
      const candidates = await getElevenLabsKeyCandidates();
      let totalRemaining = 0;
      let keyCount = 0;
      let available = false;
      let anyPaid = false;
      for (const key of candidates) {
        const info = await checkElevenLabsKey(key);
        if (info.valid) {
          keyCount++;
          if (info.remaining != null) totalRemaining += info.remaining;
          if (info.isPaid) anyPaid = true;
          const hasCredit = info.remaining === null || info.remaining > 0 || info.isPaid;
          if (hasCredit && !(info.limited && info.remaining === 0)) available = true;
        }
      }
      const totalCredit = totalRemaining > 0 ? totalRemaining : null;
      const credit =
        anyPaid && totalRemaining === 0
          ? "Paid / unlimited"
          : totalRemaining > 0
            ? `Total: ${totalRemaining.toLocaleString()} credits${keyCount > 1 ? ` (${keyCount} keys)` : ""}`
            : keyCount > 0
              ? `${keyCount} key(s) — check quota`
              : "No keys";
      providers.push({
        id: "elevenlabs",
        label: "ElevenLabs",
        keyCount,
        credit,
        totalCredit,
        available: available || keyCount > 0,
      });
    } catch (e) {
      providers.push({ id: "elevenlabs", label: "ElevenLabs", keyCount: 0, credit: "Error", totalCredit: null, available: false });
    }

    // Gemini: count TTS keys (no credit API; show key count)
    try {
      const list = await getTTSKeyList();
      const keyCount = list?.length ?? 0;
      const credit = keyCount ? `Total: ${keyCount} key(s)` : "No keys";
      providers.push({
        id: "gemini",
        label: "Gemini",
        keyCount,
        credit,
        totalCredit: keyCount > 0 ? keyCount : null,
        available: keyCount > 0,
      });
    } catch (e) {
      providers.push({ id: "gemini", label: "Gemini", keyCount: 0, credit: "Error", totalCredit: null, available: false });
    }

    // Sarvam: count keys (no credit API; show key count)
    try {
      const list = getSarvamKeyList();
      const keyCount = list.length;
      const credit = keyCount ? `Total: ${keyCount} key(s)` : "No keys";
      providers.push({
        id: "sarvam",
        label: "Sarvam AI",
        keyCount,
        credit,
        totalCredit: keyCount > 0 ? keyCount : null,
        available: keyCount > 0,
      });
    } catch (e) {
      providers.push({ id: "sarvam", label: "Sarvam AI", keyCount: 0, credit: "Error", totalCredit: null, available: false });
    }

    // Inworld: auth (Basic) count
    try {
      const list = getInworldKeyList();
      const keyCount = list.length;
      const credit = keyCount ? `${keyCount} key(s)` : "No auth";
      providers.push({
        id: "inworld",
        label: "Inworld AI",
        keyCount,
        credit,
        totalCredit: keyCount > 0 ? keyCount : null,
        available: keyCount > 0,
      });
    } catch (e) {
      providers.push({ id: "inworld", label: "Inworld AI", keyCount: 0, credit: "Error", totalCredit: null, available: false });
    }

    res.json({ providers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function sseStream(res, run) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };
  run(send).then(() => {}).catch(() => {});
}

app.get("/api/run", (req, res) => {
  const tts = req.query.tts;
  const env = envWithTTSSelection(process.env, tts);
  sseStream(res, (send) => {
    return new Promise((resolve, reject) => {
      const proc = spawn("node", ["index.js"], {
        cwd: __dirname,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      proc.stdout.setEncoding("utf8");
      proc.stderr.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => send("log", { line: chunk.trim() }));
      proc.stderr.on("data", (chunk) => send("log", { line: chunk.trim() }));
      proc.on("close", (code) => {
        send("done", { code });
        res.end();
        resolve();
      });
      proc.on("error", (err) => {
        send("error", { message: err.message });
        res.end();
        reject(err);
      });
    });
  });
});

const STEPS = ["story", "audio", "subtitles", "images", "video", "thumbnail", "regenerate-desc-tags"];

app.get("/api/status", async (_req, res) => {
  try {
    const tempDir = path.join(dataDir, "temp");
    const baseDir = __dirname;
    const hasStory = await fs.pathExists(path.join(tempDir, "story.json"));
    const steps = {
      story: hasStory,
      audio: await fs.pathExists(path.join(baseDir, "voiceover", "narration.mp3")),
      subtitles: await fs.pathExists(path.join(tempDir, "subtitles.srt")),
      images: await fs.pathExists(path.join(baseDir, "images", "scene_1.jpg")),
      video: await fs.pathExists(path.join(baseDir, "output", "final.mp4")),
      thumbnail: await fs.pathExists(path.join(baseDir, "thumbnails", "thumb.jpg")),
      "regenerate-desc-tags": hasStory,
    };
    res.json({ steps });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/run/step/:step", (req, res) => {
  const step = req.params.step?.toLowerCase();
  if (!step || !STEPS.includes(step)) {
    return res.status(400).json({ error: "Invalid step. Use: " + STEPS.join(", ") });
  }
  if (step === "regenerate-desc-tags") {
    sseStream(res, (send) => {
      const prevDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = dataDir;
      return regenerateDescriptionTags()
        .then((story) => {
          send("log", { line: "✅ Description and tags regenerated" });
          send("done", { code: 0, step });
          res.end();
        })
        .catch((err) => {
          send("log", { line: "Error: " + (err?.message || err) });
          send("done", { code: 1, step });
          res.end();
        })
        .finally(() => {
          if (prevDataDir !== undefined) process.env.DATA_DIR = prevDataDir;
          else delete process.env.DATA_DIR;
        });
    });
    return;
  }
  const tts = req.query.tts;
  const env = envWithTTSSelection(process.env, tts);
  sseStream(res, (send) => {
    return new Promise((resolve, reject) => {
      const proc = spawn("node", ["scripts/runStep.js", step], {
        cwd: __dirname,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
      proc.stdout.setEncoding("utf8");
      proc.stderr.setEncoding("utf8");
      proc.stdout.on("data", (chunk) => send("log", { line: chunk.trim() }));
      proc.stderr.on("data", (chunk) => send("log", { line: chunk.trim() }));
      proc.on("close", (code) => {
        send("done", { code, step });
        res.end();
        resolve();
      });
      proc.on("error", (err) => {
        send("error", { message: err.message });
        res.end();
        reject(err);
      });
    });
  });
});

app.get("/api/video", (_req, res) => {
  const p = path.join(dataDir, "output", "final.mp4");
  if (!fs.existsSync(p)) return res.status(404).send("Video not ready");
  res.sendFile(p);
});

app.get("/api/thumb", (_req, res) => {
  const p = path.join(dataDir, "thumbnails", "thumb.jpg");
  if (!fs.existsSync(p)) return res.status(404).send("Thumbnail not ready");
  res.sendFile(p);
});

// --- YouTube OAuth & Upload ---
app.get("/api/youtube", (_req, res) => res.json({ ok: true, message: "YouTube API" }));
app.get("/api/youtube/status", (_req, res) => {
  try {
    const status = getYoutubeConnectionStatus();
    res.json(status);
  } catch (e) {
    res.json({ connected: false });
  }
});

app.get("/api/youtube/auth", (_req, res) => {
  try {
    const url = getYoutubeAuthUrl();
    res.redirect(url);
  } catch (e) {
    res.status(500).send(`YouTube auth failed: ${e.message}. Check YT_CLIENT_SECRET_PATH and YT_REDIRECT_URI in .env.`);
  }
});

app.get("/api/youtube/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing code. Use the Connect YouTube link from the app.");
  }
  try {
    const tokens = await exchangeCodeForTokens(code);
    const refresh = tokens.refresh_token;
    if (!refresh) {
      return res.send(`
        <h2>No refresh token</h2>
        <p>Try again and make sure to approve all requested permissions. Add to .env:</p>
        <pre>YT_REFRESH_TOKEN=...</pre>
        <p><a href="/">Back to app</a></p>
      `);
    }
    try {
      await saveTokensToFile(tokens);
    } catch (_) {}
    res.send(`
      <h2>YouTube connected</h2>
      <p><strong>No need to edit .env.</strong> Tokens are saved to <code>auth/HorrorPodcastAdda.token.json</code>.</p>
      <p>Go back to the app and use <strong>Upload to YouTube</strong> — no manual refresh token step required.</p>
      <p><a href="/">Back to app</a></p>
    `);
  } catch (e) {
    res.status(500).send(`Callback failed: ${e.message}`);
  }
});

app.post("/api/youtube/upload", async (req, res) => {
  const wantsStream = req.headers.accept && req.headers.accept.includes("text/event-stream");
  try {
    const storyPath = path.join(dataDir, "temp", "story.json");
    if (!(await fs.pathExists(storyPath))) {
      return res.status(400).json({ error: "No story. Run Story step first." });
    }
    const story = await fs.readJson(storyPath);
    const meta = {
      title: story.title || "Horror Story",
      description: story.description || "",
      tags: Array.isArray(story.tags) ? story.tags : [],
      privacyStatus: process.env.YT_PRIVACY_STATUS || "public",
    };
    if (wantsStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();
      const send = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        res.flush?.();
      };
      await uploadYoutube(meta, (percent) => send({ progress: percent }));
      send({ progress: 100, done: true, message: "Uploaded to YouTube" });
      return res.end();
    }
    await uploadYoutube(meta);
    res.json({ ok: true, message: "Uploaded to YouTube" });
  } catch (e) {
    if (wantsStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ error: e.message, done: true })}\n\n`);
      return res.end();
    }
    res.status(500).json({ error: e.message });
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Horror Auto Factory — http://localhost:${PORT}`);
    if (!UNSPLASH_KEY) {
      console.warn("⚠ UNSPLASH_ACCESS_KEY not set — title/paragraph images will show placeholders. Add it to .env to enable Unsplash images.");
    } else {
      console.log("✓ Unsplash images enabled (UNSPLASH_ACCESS_KEY)");
    }
  });
}

export default app;
