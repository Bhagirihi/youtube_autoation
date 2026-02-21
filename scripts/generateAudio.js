import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { shouldUseElevenLabs } from "../elelab.js";
import { generateAudioGemini, generateAudioGeminiWithParagraphs } from "./generateAudioGemini.js";
import {
  generateAudioSarvam,
  generateAudioSarvamWithParagraphs,
  getSarvamKeyList,
} from "./generateAudioSarvam.js";
import {
  generateAudioInworld,
  generateAudioInworldWithParagraphs,
  getInworldKeyList,
} from "./generateAudioInworld.js";

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 2500;

/** Slower pace = more suspense (e.g. 0.96 = 4% slower). Applied after TTS to narration + paragraph_timings. */
const TTS_PACE = (() => {
  const v = parseFloat(process.env.TTS_PACE);
  if (Number.isFinite(v) && v >= 0.5 && v <= 1.5) return v;
  return null;
})();

function getTempDir() {
  return path.join(process.env.DATA_DIR || process.cwd(), "temp");
}

/** If TTS_PACE is set, slow down narration with atempo and scale paragraph_timings so video stays in sync. */
async function applyPace(narrationPath, tempDir) {
  if (TTS_PACE == null || TTS_PACE === 1 || !(await fs.pathExists(narrationPath))) return;
  const tmpPath = narrationPath + ".pace.mp3";
  execSync(
    `ffmpeg -y -i "${narrationPath}" -filter:a "atempo=${TTS_PACE}" "${tmpPath}"`,
    { stdio: "ignore" }
  );
  await fs.move(tmpPath, narrationPath, { overwrite: true });
  const timingsPath = path.join(tempDir, "paragraph_timings.json");
  if (await fs.pathExists(timingsPath)) {
    const timings = await fs.readJson(timingsPath);
    const scale = 1 / TTS_PACE;
    const scaled = timings.map((t) => ({
      start: (t.start ?? 0) * scale,
      end: (t.end ?? t.start ?? 0) * scale,
      duration: (t.duration ?? 0) * scale,
    }));
    await fs.writeJson(timingsPath, scaled, { spaces: 2 });
  }
  console.log(`  Pace applied: ${(TTS_PACE * 100).toFixed(0)}% speed`);
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
  const forceSarvam = process.env.USE_SARVAM_TTS === "1" || process.env.USE_SARVAM_TTS === "true";
  const forceInworld = process.env.USE_INWORLD_TTS === "1" || process.env.USE_INWORLD_TTS === "true";
  const hasGeminiKey = !!(
    process.env.GEMINI_MASTER_API_KEY ||
    process.env.GEMINI_API_KEY ||
    (process.env.GEMINI_MASTER_API_KEY_1 && process.env.GEMINI_MASTER_API_KEY_1.trim())
  );
  const sarvamKeys = getSarvamKeyList();
  const hasSarvamKey = sarvamKeys.length > 0;
  const inworldKeys = getInworldKeyList();
  const hasInworldKey = inworldKeys.length > 0;

  const elevenLabsCheck = await shouldUseElevenLabs();
  const useElevenLabs = !forceGemini && !forceSarvam && !forceInworld && elevenLabsCheck.use && elevenLabsCheck.apiKey;

  if (forceInworld) {
    if (!hasInworldKey) {
      console.warn("⚠ USE_INWORLD_TTS=1 but INWORLD_BASIC_AUTH (or INWORLD_API_KEY) not set. Skipping Inworld.");
    }
  }
  if (forceInworld && hasInworldKey) {
    try {
      if (useParagraphMode) {
        await generateAudioInworldWithParagraphs(paragraphs);
      } else {
        await generateAudioInworld();
      }
      await applyPace(outPath, tempDir);
      return;
    } catch (err) {
      console.warn("⚠ Inworld TTS failed:", err?.message ?? err);
      if (hasGeminiKey) {
        console.log("  Falling back to Gemini TTS…");
        try {
          if (useParagraphMode) await generateAudioGeminiWithParagraphs(paragraphs);
          else await generateAudioGemini();
          await applyPace(outPath, tempDir);
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

  if (forceSarvam) {
    if (!hasSarvamKey) {
      console.warn("⚠ USE_SARVAM_TTS=1 but SARVAM_API_KEY (or SARVAM_API_SUBSCRIPTION_KEY) not set. Skipping Sarvam.");
    }
  }
  if (forceSarvam && hasSarvamKey) {
    try {
      if (useParagraphMode) {
        await generateAudioSarvamWithParagraphs(paragraphs);
      } else {
        await generateAudioSarvam();
      }
      await applyPace(outPath, tempDir);
      return;
    } catch (err) {
      console.warn("⚠ Sarvam TTS failed:", err?.message ?? err);
      if (hasGeminiKey) {
        console.log("  Falling back to Gemini TTS…");
        try {
          if (useParagraphMode) await generateAudioGeminiWithParagraphs(paragraphs);
          else await generateAudioGemini();
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
      await applyPace(outPath, tempDir);
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
      await applyPace(outPath, tempDir);
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
