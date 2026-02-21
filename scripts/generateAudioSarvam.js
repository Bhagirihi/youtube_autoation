/**
 * Sarvam AI TTS (Hindi/Indian languages). Use when USE_SARVAM_TTS=1.
 * Uses REST API: https://api.sarvam.ai/text-to-speech
 * Response: WAV as base64 in audios[0]. We decode and convert to MP3.
 */
import fs from "fs-extra";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { execSync } from "child_process";

const SARVAM_API_URL = "https://api.sarvam.ai/text-to-speech";
const MAX_CHARS = 2500; // bulbul:v3 limit

/**
 * Collect all Sarvam API keys from env: SARVAM_API_KEY, SARVAM_API_SUBSCRIPTION_KEY, SARVAM_API_KEY_1, SARVAM_API_KEY_2, ...
 * Returns non-empty array or [].
 */
export function getSarvamKeyList() {
  const keys = [];
  const add = (v) => {
    if (v && typeof v === "string" && v.trim()) keys.push(v.trim());
  };
  add(process.env.SARVAM_API_KEY);
  add(process.env.SARNA_API_KEY); // common typo alias
  add(process.env.SARVAM_API_SUBSCRIPTION_KEY);
  for (let i = 1; i <= 20; i++) {
    add(process.env[`SARVAM_API_KEY_${i}`]);
    add(process.env[`SARNA_API_KEY_${i}`]);
  }
  return [...new Set(keys)];
}

const SARVAM_OPTS = {
  target_language_code: process.env.SARVAM_LANGUAGE || "hi-IN",
  speaker: process.env.SARVAM_SPEAKER || "shubh",
  pace: parseFloat(process.env.SARVAM_PACE) || 0.98,
  speech_sample_rate: Number(process.env.SARVAM_SAMPLE_RATE) || 22050,
  enable_preprocessing: process.env.SARVAM_PREPROCESSING !== "0",
  model: process.env.SARVAM_MODEL || "bulbul:v3",
};

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
 * Call Sarvam TTS API with given apiKey; returns MP3 buffer. Input text max 2500 chars for bulbul:v3.
 * If keyList is passed and response is 429/403, tries next key in list.
 */
async function sarvamTTS(text, apiKey, keyList = null) {
  const keys = keyList && keyList.length ? keyList : apiKey ? [apiKey] : [];
  if (!keys.length) {
    throw new Error(
      "No Sarvam API key. Set SARVAM_API_KEY, SARVAM_API_KEY_1, … or SARVAM_API_SUBSCRIPTION_KEY in .env."
    );
  }
  let lastErr;
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[attempt];
    const payload = {
      text: String(text).slice(0, MAX_CHARS),
      ...SARVAM_OPTS,
    };
    const res = await fetch(SARVAM_API_URL, {
      method: "POST",
      headers: {
        "api-subscription-key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      const b64 = data?.audios?.[0];
      if (!b64 || typeof b64 !== "string") {
        throw new Error("Sarvam TTS returned no audio.");
      }
      const wavBuffer = Buffer.from(b64, "base64");
      return wavBufferToMp3(wavBuffer);
    }
    lastErr = new Error(`Sarvam TTS ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    const isRetryable = res.status === 429 || res.status === 403;
    if (isRetryable && keyList?.length > 1 && attempt < keys.length - 1) {
      console.warn(`    ⚠ Sarvam key ${attempt + 1} failed (${res.status}), trying next…`);
    } else {
      throw lastErr;
    }
  }
  throw lastErr;
}

async function wavBufferToMp3(wavBuffer) {
  const tmpDir = path.join(process.cwd(), "voiceover", ".tmp_sarvam");
  await fs.ensureDir(tmpDir);
  const wavPath = path.join(tmpDir, "out.wav");
  const mp3Path = path.join(tmpDir, "out.mp3");
  await fs.writeFile(wavPath, wavBuffer);
  execSync(`ffmpeg -y -i "${wavPath}" -acodec libmp3lame -q:a 2 "${mp3Path}"`, {
    stdio: "ignore",
  });
  const buf = await fs.readFile(mp3Path);
  await fs.remove(tmpDir).catch(() => {});
  return buf;
}

export async function generateAudioSarvam() {
  const keyList = getSarvamKeyList();
  if (!keyList.length) {
    throw new Error("No Sarvam API key. Set SARVAM_API_KEY or SARVAM_API_KEY_1, … in .env.");
  }
  await fs.ensureDir("voiceover");
  const outPath = path.join(process.cwd(), "voiceover", "narration.mp3");
  const tempDir = getTempDir();
  const storyPath = path.join(tempDir, "story.txt");
  const text = await fs.readFile(storyPath, "utf-8");

  const buffers = [];
  let chunkIndex = 0;
  for (let i = 0; i < text.length; i += MAX_CHARS) {
    const chunk = text.slice(i, i + MAX_CHARS);
    const keyIndex = chunkIndex % keyList.length;
    if (keyList.length > 1) {
      console.log(`  Sarvam TTS chunk ${chunkIndex + 1} (key ${keyIndex + 1}/${keyList.length})…`);
    } else {
      console.log(`  Sarvam TTS chunk ${chunkIndex + 1}…`);
    }
    const buf = await sarvamTTS(chunk, keyList[keyIndex], keyList);
    buffers.push(buf);
    chunkIndex++;
  }
  if (buffers.length === 1) {
    await fs.writeFile(outPath, buffers[0]);
  } else {
    const { execSync } = await import("child_process");
    const tmpDir = path.join(process.cwd(), "voiceover", ".tmp_concat");
    await fs.ensureDir(tmpDir);
    const listPath = path.join(tmpDir, "list.txt");
    const partNames = [];
    for (let i = 0; i < buffers.length; i++) {
      const name = `part_${i}.mp3`;
      await fs.writeFile(path.join(tmpDir, name), buffers[i]);
      partNames.push(name);
    }
    await fs.writeFile(listPath, partNames.map((n) => `file '${n}'`).join("\n"));
    execSync(`ffmpeg -y -f concat -safe 0 -i list.txt -c copy "${path.resolve(outPath)}"`, {
      stdio: "ignore",
      cwd: tmpDir,
    });
    await fs.remove(tmpDir);
  }
  console.log("✅ Audio generated with Sarvam TTS (voiceover/narration.mp3)");
}

/**
 * Paragraph-wise: one clip per paragraph, then concat + paragraph_timings.json.
 */
export async function generateAudioSarvamWithParagraphs(paragraphs) {
  if (!paragraphs?.length) {
    throw new Error("generateAudioSarvamWithParagraphs requires a non-empty paragraphs array.");
  }

  const keyList = getSarvamKeyList();
  if (!keyList.length) {
    throw new Error("No Sarvam API key. Set SARVAM_API_KEY or SARVAM_API_KEY_1, … in .env.");
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
    const keyIndex = i % keyList.length;
    if (keyList.length > 1) {
      console.log(`  Sarvam TTS paragraph ${i + 1}/${paragraphs.length} (key ${keyIndex + 1}/${keyList.length})…`);
    } else {
      console.log(`  Sarvam TTS paragraph ${i + 1}/${paragraphs.length}…`);
    }
    const mp3Buf = await sarvamTTS(text, keyList[keyIndex], keyList);
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
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${path.resolve(outPath)}"`,
    { stdio: "inherit" }
  );
  await fs.remove(listPath).catch(() => {});

  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  await fs.writeJson(path.join(tempDir, "paragraph_timings.json"), timings, { spaces: 2 });

  console.log(
    "✅ Audio generated with Sarvam TTS (paragraph-wise) → voiceover/narration.mp3 + paragraph_timings.json"
  );
}
