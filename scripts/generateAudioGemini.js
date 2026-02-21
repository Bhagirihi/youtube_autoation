/**
 * Generate narration using Gemini 2.5 TTS (Google AI Studio style).
 * Style: deep, breathy, slow-burning horror narration.
 * Supports full-story or paragraph-wise TTS; paragraph-wise writes paragraph_timings.json for video sync.
 * @see https://ai.google.dev/gemini-api/docs/speech-generation
 * @see https://aistudio.google.com/generate-speech
 */
import fs from "fs-extra";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { GoogleGenAI } from "@google/genai";
import { checkGeminiKeys, getTTSKeyList } from "./geminiKeys.js";

// const STYLE_PROMPT = `
// Narrate in a deep male voice with controlled breathing and cinematic tension.
// Speak at a natural storytelling pace — not slow, not rushed.
// Minimize pauses between sentences.
// No elongated vowels.
// Maintain steady rhythm while preserving psychological horror tone.
// Low whisper energy, restrained intensity, grounded realism.
// `;

// const STYLE_PROMPT = `
// Narrate in a deep male voice with controlled breathing and cinematic tension.
// Speak at a natural storytelling pace — not slow, not rushed.
// No elongated vowels.
// Maintain steady rhythm while preserving psychological horror tone.
// Low whisper energy, restrained intensity, grounded realism.
// `;

const STYLE_PROMPT = `
Deep male voice. Slightly slower, suspenseful pace for horror. Same pacing for every paragraph.
Minimal pauses between sentences. No long gaps or silence. No drawn-out vowels.
Calm, grounded delivery with subtle psychological tension.
Controlled breathing. Steady rhythm. Keep momentum; avoid slowing down mid-story.
Emotion through tone, not speed. Cinematic, eerie narration.
`;

const VOICE_NAME = process.env.GEMINI_TTS_VOICE || "Charon"; // Charon = Informative; Algenib = Gravelly
const MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const MAX_CHARS = 28000; // stay under 32k token context; leave room for style prompt
const DELAY_BETWEEN_PARAGRAPHS_MS = Number(process.env.GEMINI_TTS_DELAY_MS) || 2000; // reduce 429 rate limit when using multiple keys

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

function createWavHeader(
  dataLength,
  numChannels = 1,
  sampleRate = 24000,
  bitsPerSample = 16,
) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

function parseMimeType(mimeType) {
  const [fileType, ...params] = mimeType.split(";").map((s) => s.trim());
  const format = (fileType || "").split("/")[1] || "";
  const options = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 };
  if (format && format.startsWith("L")) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) options.bitsPerSample = bits;
  }
  for (const param of params) {
    const [key, value] = param.split("=").map((s) => s.trim());
    if (key === "rate") options.sampleRate = parseInt(value, 10) || 24000;
  }
  return options;
}

function toWavIfNeeded(base64Data, mimeType) {
  const options = parseMimeType(mimeType || "");
  const rawBuffer = Buffer.from(base64Data, "base64");
  const wavHeader = createWavHeader(
    rawBuffer.length,
    options.numChannels,
    options.sampleRate,
    options.bitsPerSample,
  );
  return Buffer.concat([wavHeader, rawBuffer]);
}

export async function generateAudioGemini() {
  await fs.ensureDir("voiceover");
  const outPath = "voiceover/narration.mp3";
  const tempDir = getTempDir();
  const storyPath = path.join(tempDir, "story.txt");
  const text = await fs.readFile(storyPath, "utf-8");

  const ttsKeys = await getTTSKeyList();
  const fallbackKey = await checkGeminiKeys();
  const keyList = ttsKeys?.length ? ttsKeys : fallbackKey ? [fallbackKey] : null;
  if (!keyList?.length) {
    throw new Error(
      "No Gemini API key for TTS. Set GEMINI_TTS_API_KEY or GEMINI_* in .env.",
    );
  }

  const fullPrompt = `${STYLE_PROMPT}\n\n${text}`;

  if (fullPrompt.length > MAX_CHARS) {
    console.warn(
      "⚠ Story is long; sending first",
      MAX_CHARS,
      "chars to Gemini TTS. Consider chunking for full length.",
    );
  }
  const content = fullPrompt.slice(0, MAX_CHARS);

  const config = {
    temperature: 1,
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: VOICE_NAME,
        },
      },
    },
  };

  let response;
  let lastErr;
  for (let attempt = 0; attempt < keyList.length; attempt++) {
    const ai = new GoogleGenAI({ apiKey: keyList[attempt] });
    try {
      response = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text: content }] }],
        config,
      });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const msg = (err?.message || String(err)).toLowerCase();
      const isKeyOrQuota =
        /quota|429|403|invalid.*key|expired|rate limit|resource exhausted/i.test(msg);
      if (isKeyOrQuota && attempt < keyList.length - 1) {
        console.warn(`  ⚠ Key ${attempt + 1} failed (${err?.message || err}), trying next…`);
      } else {
        throw err;
      }
    }
  }
  if (lastErr) throw lastErr;

  const part = response?.candidates?.[0]?.content?.parts?.[0];
  const inlineData = part?.inlineData;
  if (!inlineData?.data) {
    throw new Error(
      "Gemini TTS returned no audio. Check model/voice and try again.",
    );
  }

  const mimeType = inlineData.mimeType || "audio/L16; rate=24000";
  const wavBuffer = toWavIfNeeded(inlineData.data, mimeType);
  const wavPath = path.join("voiceover", "narration_gemini.wav");
  await fs.writeFile(wavPath, wavBuffer);

  const { execSync } = await import("child_process");
  const outAbsolute = path.resolve(outPath);
  execSync(
    `ffmpeg -y -i "${path.resolve(wavPath)}" -acodec libmp3lame -q:a 2 "${outAbsolute}"`,
    {
      stdio: "ignore",
    },
  );
  await fs.remove(wavPath).catch(() => {});

  console.log("✅ Audio generated with Gemini TTS (voiceover/narration.mp3)");
}

/**
 * Generate TTS for one paragraph; returns path to MP3 and duration in seconds.
 * Used for paragraph-wise video sync.
 */
async function generateOneParagraphGemini(
  ai,
  paragraphText,
  index,
  voiceoverDir,
) {
  const content =
    paragraphText.length > MAX_CHARS
      ? paragraphText.slice(0, MAX_CHARS)
      : paragraphText;
  const prompt = `${STYLE_PROMPT}\n\n${content}`;

  const config = {
    temperature: 1,
    responseModalities: ["AUDIO"],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAME } },
    },
  };

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config,
  });

  const part = response?.candidates?.[0]?.content?.parts?.[0];
  const inlineData = part?.inlineData;
  if (!inlineData?.data) {
    throw new Error(`Gemini TTS returned no audio for paragraph ${index + 1}.`);
  }

  const mimeType = inlineData.mimeType || "audio/L16; rate=24000";
  const wavBuffer = toWavIfNeeded(inlineData.data, mimeType);
  const wavPath = path.join(voiceoverDir, `p_${index}.wav`);
  await fs.writeFile(wavPath, wavBuffer);

  const mp3Path = path.join(voiceoverDir, `p_${index}.mp3`);
  const { execSync } = await import("child_process");
  execSync(
    `ffmpeg -y -i "${path.resolve(wavPath)}" -acodec libmp3lame -q:a 2 "${path.resolve(mp3Path)}"`,
    {
      stdio: "ignore",
    },
  );
  await fs.remove(wavPath).catch(() => {});

  const duration = await getAudioDuration(mp3Path);
  return { path: mp3Path, duration };
}

/**
 * Paragraph-wise TTS: one audio clip per paragraph, then concat into narration.mp3
 * and write temp/paragraph_timings.json for video (each image shown for that paragraph's duration).
 */
export async function generateAudioGeminiWithParagraphs(paragraphs) {
  if (!paragraphs?.length)
    throw new Error(
      "generateAudioGeminiWithParagraphs requires a non-empty paragraphs array.",
    );

  const ttsKeys = await getTTSKeyList();
  const fallbackKey = await checkGeminiKeys();
  const keyList = ttsKeys?.length ? ttsKeys : fallbackKey ? [fallbackKey] : null;
  if (!keyList?.length)
    throw new Error(
      "No Gemini API key for TTS. Set GEMINI_TTS_API_KEY or GEMINI_* in .env.",
    );

  const voiceoverDir = "voiceover";
  await fs.ensureDir(voiceoverDir);

  const timings = [];
  let start = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const text =
      typeof paragraphs[i] === "string" ? paragraphs[i] : paragraphs[i].text;
    if (!text?.trim()) {
      timings.push({ start, end: start, duration: 0 });
      continue;
    }
    let lastErr;
    let duration;
    for (let attempt = 0; attempt < keyList.length; attempt++) {
      const keyIndex = (i % keyList.length + attempt) % keyList.length;
      const apiKey = keyList[keyIndex];
      const ai = new GoogleGenAI({ apiKey });
      if (keyList.length > 1) {
        console.log(`  TTS paragraph ${i + 1}/${paragraphs.length} (key ${keyIndex + 1}/${keyList.length})…`);
      } else {
        console.log(`  TTS paragraph ${i + 1}/${paragraphs.length}…`);
      }
      try {
        const result = await generateOneParagraphGemini(ai, text, i, voiceoverDir);
        duration = result.duration;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = (err?.message || String(err)).toLowerCase();
        const isKeyOrQuota =
          /quota|429|403|invalid.*key|expired|rate limit|resource exhausted/i.test(msg) ||
          (err?.status !== undefined && (err.status === 429 || err.status === 403));
        if (isKeyOrQuota && keyList.length > 1 && attempt < keyList.length - 1) {
          console.warn(`    ⚠ Key ${keyIndex + 1} failed (${err?.message || err}), trying next…`);
        } else {
          throw err;
        }
      }
    }
    if (lastErr) throw lastErr;
    const end = start + duration;
    timings.push({ start, end, duration });
    start = end;
    if (DELAY_BETWEEN_PARAGRAPHS_MS > 0 && i < paragraphs.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_PARAGRAPHS_MS));
    }
  }

  const listPath = path.join(voiceoverDir, "concat_list.txt");
  // Paths in concat list are relative to the list file's directory (voiceover/), so use filenames only
  await fs.writeFile(
    listPath,
    timings.map((_, i) => `file 'p_${i}.mp3'`).join("\n"),
  );
  const outPath = path.join(voiceoverDir, "narration.mp3");
  const { execSync } = await import("child_process");
  const listAbsolute = path.resolve(listPath);
  const outAbsolute = path.resolve(outPath);
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listAbsolute}" -c copy "${outAbsolute}"`,
    { stdio: "inherit" },
  );
  await fs.remove(listPath).catch(() => {});

  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  await fs.writeJson(path.join(tempDir, "paragraph_timings.json"), timings, {
    spaces: 2,
  });

  console.log(
    "✅ Audio generated with Gemini TTS (paragraph-wise) → voiceover/narration.mp3 + paragraph_timings.json",
  );
}
