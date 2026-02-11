import fs from "fs-extra";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { shouldUseElevenLabs } from "../elelab.js";
import { generateAudioGemini, generateAudioGeminiWithParagraphs } from "./generateAudioGemini.js";

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 2500;

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

export async function generateAudio() {
  await fs.ensureDir("voiceover");
  const outPath = "voiceover/narration.mp3";
  const tempDir = getTempDir();
  const storyPath = path.join(tempDir, "story.txt");
  const text = await fs.readFile(storyPath, "utf-8");

  let storyJson = null;
  try {
    storyJson = await fs.readJson(path.join(tempDir, "story.json"));
  } catch {
    // no story.json or invalid; will use full-story mode
  }
  const paragraphs = storyJson?.paragraphs?.filter((p) => (p?.text || "").trim());
  const useParagraphMode = Array.isArray(paragraphs) && paragraphs.length > 0;

  const forceGemini = process.env.USE_GEMINI_TTS === "1" || process.env.USE_GEMINI_TTS === "true";
  const hasGeminiKey = !!(
    process.env.GEMINI_MASTER_API_KEY ||
    process.env.GEMINI_API_KEY ||
    (process.env.GEMINI_MASTER_API_KEY_1 && process.env.GEMINI_MASTER_API_KEY_1.trim())
  );

  const elevenLabsCheck = await shouldUseElevenLabs();
  const useElevenLabs = !forceGemini && elevenLabsCheck.use && elevenLabsCheck.apiKey;

  if (useElevenLabs) {
    try {
      const elevenlabs = new ElevenLabsClient({ apiKey: elevenLabsCheck.apiKey });
      if (useParagraphMode) {
        const timings = [];
        const buffers = [];
        for (let i = 0; i < paragraphs.length; i++) {
          const pText = paragraphs[i].text || paragraphs[i];
          if (!String(pText).trim()) {
            const start = timings.reduce((s, t) => s + t.duration, 0);
            timings.push({ start, end: start, duration: 0 });
            continue;
          }
          console.log(`  TTS paragraph ${i + 1}/${paragraphs.length}…`);
          const chunk = String(pText).slice(0, MAX_CHARS);
          const res = await elevenlabs.textToSpeech.convert(VOICE_ID, {
            text: chunk,
            modelId: MODEL_ID,
            outputFormat: "mp3_44100_128",
          });
          const stream = res?.data ?? res;
          const buf = await streamToBuffer(stream);
          const partPath = path.join("voiceover", `p_${i}.mp3`);
          await fs.writeFile(partPath, buf);
          const duration = await getAudioDuration(partPath);
          const start = timings.reduce((s, t) => s + t.duration, 0);
          timings.push({ start, end: start + duration, duration });
          buffers.push(buf);
          await fs.remove(partPath).catch(() => {});
        }
        await concatMp3(buffers, outPath);
        await fs.ensureDir(tempDir);
        await fs.writeJson(path.join(tempDir, "paragraph_timings.json"), timings, { spaces: 2 });
        console.log("✅ Audio generated (paragraph-wise) → voiceover/narration.mp3 + paragraph_timings.json");
      } else {
        if (text.length <= MAX_CHARS) {
          const res = await elevenlabs.textToSpeech.convert(VOICE_ID, {
            text,
            modelId: MODEL_ID,
            outputFormat: "mp3_44100_128",
          });
          const stream = res?.data ?? res;
          const buf = await streamToBuffer(stream);
          await fs.writeFile(outPath, buf);
        } else {
          const buffers = [];
          for (let i = 0; i < text.length; i += MAX_CHARS) {
            const chunk = text.slice(i, i + MAX_CHARS);
            const res = await elevenlabs.textToSpeech.convert(VOICE_ID, {
              text: chunk,
              modelId: MODEL_ID,
              outputFormat: "mp3_44100_128",
            });
            const stream = res?.data ?? res;
            buffers.push(await streamToBuffer(stream));
          }
          await concatMp3(buffers, outPath);
        }
        console.log("✅ Audio generated (voiceover/narration.mp3)");
      }
      return;
    } catch (err) {
      console.warn("⚠ ElevenLabs TTS failed:", err?.message ?? err);
      if (hasGeminiKey) {
        console.log("  Falling back to Gemini TTS…");
        try {
          if (useParagraphMode) {
            await generateAudioGeminiWithParagraphs(paragraphs);
          } else {
            await generateAudioGemini();
          }
          return;
        } catch (e) {
          console.warn("⚠ Gemini TTS failed:", e?.message ?? e);
        }
      }
      await createSilentNarration(outPath, text);
      console.log("✅ Silent narration created (voiceover/narration.mp3)\n");
      return;
    }
  }

  if (forceGemini || hasGeminiKey) {
    try {
      if (useParagraphMode) {
        await generateAudioGeminiWithParagraphs(paragraphs);
      } else {
        await generateAudioGemini();
      }
      return;
    } catch (err) {
      console.warn("⚠ Gemini TTS failed:", err?.message ?? err);
      if (!elevenLabsCheck.apiKey) {
        await createSilentNarration(outPath, text);
        console.log("✅ Silent narration created (voiceover/narration.mp3)\n");
        return;
      }
    }
  }

  if (!elevenLabsCheck.use && elevenLabsCheck.reason) {
    console.warn(`⚠ ElevenLabs not used: ${elevenLabsCheck.reason}`);
  }
  console.warn("⚠ No TTS available — creating silent narration.");
  await createSilentNarration(outPath, text);
  console.log("✅ Silent narration created (voiceover/narration.mp3)\n");
}

async function streamToBuffer(stream) {
  if (stream && typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(stream)) return stream;
  if (stream instanceof Uint8Array) return Buffer.from(stream);
  throw new Error("Unsupported audio response");
}

async function concatMp3(buffers, outPath) {
  const path = await import("path");
  const { execSync } = await import("child_process");
  const tmpDir = path.join("voiceover", ".tmp_concat");
  await fs.ensureDir(tmpDir);
  const listPath = path.join(tmpDir, "list.txt");
  const partNames = [];
  for (let i = 0; i < buffers.length; i++) {
    const name = `part_${i}.mp3`;
    await fs.writeFile(path.join(tmpDir, name), buffers[i]);
    partNames.push(name);
  }
  await fs.writeFile(listPath, partNames.map((n) => `file '${n}'`).join("\n"));
  const outAbsolute = path.resolve(outPath);
  execSync(`ffmpeg -y -f concat -safe 0 -i list.txt -c copy "${outAbsolute}"`, {
    stdio: "ignore",
    cwd: tmpDir,
  });
  await fs.remove(tmpDir);
}

async function createSilentNarration(outPath, text) {
  const durationSec = Math.max(30, Math.ceil(text.length / 12));
  const { execSync } = await import("child_process");
  execSync(
    `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${durationSec} -q:a 9 -acodec libmp3lame "${outPath}"`,
    { stdio: "ignore" }
  );
}
