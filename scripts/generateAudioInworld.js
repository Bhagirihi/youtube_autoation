/**
 * Inworld AI TTS. Use when USE_INWORLD_TTS=1.
 * API: https://api.inworld.ai/tts/v1/voice
 * Auth: Basic (set INWORLD_BASIC_AUTH to base64 string, or INWORLD_API_KEY for key:secret).
 * Response: JSON with audioContent (base64 MP3).
 */
import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";

const INWORLD_TTS_URL = "https://api.inworld.ai/tts/v1/voice";
const MAX_CHARS = 5000;
const DEFAULT_VOICE_ID = "default-zyczuogqy1-_d96nvotsyq__hpa";

const INWORLD_OPTS = {
  model_id: process.env.INWORLD_MODEL_ID || "inworld-tts-1.5-max",
  speaking_rate: parseFloat(process.env.INWORLD_SPEAKING_RATE) || 0.97,
  temperature: parseFloat(process.env.INWORLD_TEMPERATURE) || 0.87,
};

/**
 * Get one auth header for a given index (0 = INWORLD_BASIC_AUTH / INWORLD_API_KEY, 1 = _2, etc.).
 */
function getAuthForIndex(i) {
  const suffix = i === 0 ? "" : `_${i + 1}`;
  const raw = process.env[`INWORLD_BASIC_AUTH${suffix}`]?.trim();
  if (raw) {
    const base64 = raw.replace(/^Basic\s+/i, "");
    return `Basic ${base64}`;
  }
  const key = process.env[`INWORLD_API_KEY${suffix}`]?.trim();
  if (!key) return null;
  const secret = process.env[`INWORLD_API_SECRET${suffix}`]?.trim();
  const toEncode = secret ? `${key}:${secret}` : key;
  return `Basic ${Buffer.from(toEncode, "utf-8").toString("base64")}`;
}

/**
 * Get voice_id for a given key index. INWORLD_VOICE_ID for index 0, INWORLD_VOICE_ID_2 for index 1, etc.
 */
function getVoiceIdForIndex(i) {
  const suffix = i === 0 ? "" : `_${i + 1}`;
  const voiceId = process.env[`INWORLD_VOICE_ID${suffix}`]?.trim();
  return voiceId || process.env.INWORLD_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
}

/**
 * Returns list of { auth, voiceId } for each configured key.
 * Keys: INWORLD_BASIC_AUTH, INWORLD_BASIC_AUTH_2, ... or INWORLD_API_KEY, INWORLD_API_KEY_2, ...
 * Voice per key: INWORLD_VOICE_ID (key 0), INWORLD_VOICE_ID_2 (key 1), ...
 */
function getCredentialsList() {
  const list = [];
  for (let i = 0; i < 20; i++) {
    const auth = getAuthForIndex(i);
    if (!auth) break;
    list.push({ auth, voiceId: getVoiceIdForIndex(i) });
  }
  return list;
}

function getAuthHeader() {
  const list = getCredentialsList();
  return list.length > 0 ? list[0].auth : null;
}

/**
 * Returns non-empty array of auth headers (one per key) for UI count, or [].
 */
export function getInworldKeyList() {
  return getCredentialsList().map((c) => c.auth);
}

function getTempDir() {
  return path.join(process.env.DATA_DIR || process.cwd(), "temp");
}

function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) reject(err);
      else resolve(data.format.duration);
    });
  });
}

/**
 * Call Inworld TTS API; returns MP3 buffer.
 * voiceId: use the one for this key (e.g. INWORLD_VOICE_ID_2 when using INWORLD_BASIC_AUTH_2).
 */
async function inworldTTS(text, authHeader, voiceId) {
  const payload = {
    text: String(text).slice(0, MAX_CHARS),
    voice_id: voiceId || DEFAULT_VOICE_ID,
    audio_config: {
      audio_encoding: "MP3",
      speaking_rate: INWORLD_OPTS.speaking_rate,
    },
    temperature: INWORLD_OPTS.temperature,
    model_id: INWORLD_OPTS.model_id,
  };
  const res = await fetch(INWORLD_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Inworld TTS ${res.status}: ${body || res.statusText}`);
  }
  const data = await res.json();
  const b64 = data?.audioContent;
  if (!b64 || typeof b64 !== "string") {
    throw new Error("Inworld TTS returned no audioContent.");
  }
  return Buffer.from(b64, "base64");
}

export async function generateAudioInworld() {
  const credentials = getCredentialsList();
  if (!credentials.length) {
    throw new Error("No Inworld auth. Set INWORLD_BASIC_AUTH (base64) or INWORLD_API_KEY in .env.");
  }
  const tempDir = getTempDir();
  const storyPath = path.join(tempDir, "story.txt");
  if (!(await fs.pathExists(storyPath))) {
    throw new Error("temp/story.txt not found. Run Story step first.");
  }
  const text = await fs.readFile(storyPath, "utf-8");
  await fs.ensureDir("voiceover");
  const outPath = path.join(process.cwd(), "voiceover", "narration.mp3");

  if (text.length <= MAX_CHARS) {
    const { auth, voiceId } = credentials[0];
    const buf = await inworldTTS(text, auth, voiceId);
    await fs.writeFile(outPath, buf);
  } else {
    const parts = text.match(new RegExp(`.{1,${MAX_CHARS}}(?:\\s|$)|.{1,${MAX_CHARS}}`, "g")) || [text];
    const buffers = [];
    for (let i = 0; i < parts.length; i++) {
      const { auth, voiceId } = credentials[i % credentials.length];
      console.log(`  Inworld TTS part ${i + 1}/${parts.length}…`);
      buffers.push(await inworldTTS(parts[i], auth, voiceId));
    }
    const tmpDir = path.join(process.cwd(), "voiceover", ".tmp_inworld_concat");
    await fs.ensureDir(tmpDir);
    const listPath = path.join(tmpDir, "list.txt");
    const partNames = parts.map((_, i) => `p_${i}.mp3`);
    for (let i = 0; i < buffers.length; i++) {
      await fs.writeFile(path.join(tmpDir, partNames[i]), buffers[i]);
    }
    await fs.writeFile(listPath, partNames.map((n) => `file '${n}'`).join("\n"));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${path.resolve(outPath)}"`, {
      stdio: "ignore",
      cwd: tmpDir,
    });
    await fs.remove(tmpDir).catch(() => {});
  }
  console.log("✅ Audio generated with Inworld TTS (voiceover/narration.mp3)");
}

/**
 * Paragraph-wise: one clip per paragraph, concat, then paragraph_timings.json.
 */
export async function generateAudioInworldWithParagraphs(paragraphs) {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    throw new Error("generateAudioInworldWithParagraphs requires a non-empty paragraphs array.");
  }
  const credentials = getCredentialsList();
  if (!credentials.length) {
    throw new Error("No Inworld auth. Set INWORLD_BASIC_AUTH or INWORLD_API_KEY in .env.");
  }

  const voiceoverDir = path.join(process.cwd(), "voiceover");
  await fs.ensureDir(voiceoverDir);
  const timings = [];
  let start = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const text = typeof paragraphs[i] === "string" ? paragraphs[i] : paragraphs[i]?.text;
    if (!text?.trim()) {
      timings.push({ start, end: start, duration: 0 });
      continue;
    }
    const { auth, voiceId } = credentials[i % credentials.length];
    const keyLabel = credentials.length > 1 ? ` (key ${(i % credentials.length) + 1})` : "";
    console.log(`  Inworld TTS paragraph ${i + 1}/${paragraphs.length}${keyLabel}…`);
    const mp3Buf = await inworldTTS(text, auth, voiceId);
    const partPath = path.join(voiceoverDir, `p_${i}.mp3`);
    await fs.writeFile(partPath, mp3Buf);
    const duration = await getAudioDuration(partPath);
    const end = start + duration;
    timings.push({ start, end, duration });
    start = end;
  }

  const listPath = path.join(voiceoverDir, "concat_list.txt");
  await fs.writeFile(
    listPath,
    timings.map((_, i) => `file 'p_${i}.mp3'`).join("\n")
  );
  const outPath = path.join(voiceoverDir, "narration.mp3");
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${path.resolve(outPath)}"`, {
    stdio: "ignore",
    cwd: voiceoverDir,
  });
  await fs.remove(listPath).catch(() => {});

  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  await fs.writeJson(path.join(tempDir, "paragraph_timings.json"), timings, { spaces: 2 });

  console.log(
    "✅ Audio generated with Inworld TTS (paragraph-wise) → voiceover/narration.mp3 + paragraph_timings.json"
  );
}
