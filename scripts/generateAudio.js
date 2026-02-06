import fs from "fs-extra";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
const MODEL_ID = "eleven_multilingual_v2";
const MAX_CHARS = 2500;

export async function generateAudio() {
  await fs.ensureDir("voiceover");
  const outPath = "voiceover/narration.mp3";
  const storyPath = "temp/story.txt";
  const text = await fs.readFile(storyPath, "utf-8");

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("⚠ ELEVENLABS_API_KEY not set — creating silent narration.");
    await createSilentNarration(outPath, text);
    console.log("✅ Silent narration created (voiceover/narration.mp3)\n");
    return;
  }

  try {
    const elevenlabs = new ElevenLabsClient({ apiKey });
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
  } catch (err) {
    console.warn("\n⚠ TTS failed:", err?.message ?? err);
    await createSilentNarration(outPath, text);
    console.log("✅ Silent narration created (voiceover/narration.mp3)\n");
  }
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
