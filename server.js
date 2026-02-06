import "dotenv/config";
import express from "express";
import { spawn } from "child_process";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

app.get("/api/run", (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };

  const proc = spawn("node", ["index.js"], {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DATA_DIR: dataDir },
  });

  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => send("log", { line: chunk.trim() }));
  proc.stderr.on("data", (chunk) => send("log", { line: chunk.trim() }));

  proc.on("close", (code) => {
    send("done", { code });
    res.end();
  });
  proc.on("error", (err) => {
    send("error", { message: err.message });
    res.end();
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
