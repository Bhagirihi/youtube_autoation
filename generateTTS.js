import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import { fetchTTS, sleep } from "./utils/commonFunction.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");
}

// 🧠 MAIN FUNCTION
export default async function generateTTS({ storyData }) {
  const {
    title,
    intro,
    build_up,
    suspense,
    twist,
    ending_line,
    instructions = "",
  } = storyData;

  const safeTitle = sanitizeFilename(title);
  const folderPath = path.join("stories", safeTitle, "voiceover");

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const segments = [
    { key: "intro", text: intro },
    { key: "build_up", text: build_up },
    { key: "suspense", text: suspense },
    { key: "twist", text: twist },
    { key: "ending_line", text: ending_line },
  ];

  const audioPaths = [];
  const tempListPath = path.join(folderPath, "temp_list.txt");

  for (const { key, text } of segments) {
    if (!text?.trim()) continue;

    const outputName = `${safeTitle}_${key}.mp3`;
    const outputPath = path.join(folderPath, outputName);

    try {
      console.log(`🗣️ Generating TTS for: ${key}`);
      await fetchTTS(
        "https://www.openai.fm/api/generate",
        text,

        "coral",
        "67612c8-4975-452f-af3f-d44cca8915e5",
        outputPath,
        __dirname
      );

      console.log(`✅ Stored segment path: ${outputPath}`);
      audioPaths.push(outputPath);
      // 🔁 Immediately update temp_list.txt
      const listContent = audioPaths.map((f) => `file '${f}'`).join("\n");
      fs.writeFileSync(tempListPath, listContent);
      await sleep(1000); // Wait 1s to prevent rate limit
    } catch (err) {
      console.error(`❌ Failed to fetch TTS for ${key}:`, err.message);
    }
  }

  // 🧩 Final merge with background
  const finalOutput = path.join(folderPath, `${safeTitle}.mp3`);
  const bgmPath = path.join("bgm", "music.mp3");

  try {
    // await mergeVoiceWithBackground(safeTitle, audioPaths, bgmPath, finalOutput);
    await mergeVoiceWithBackground(title, audioPaths, bgmPath, finalOutput);
    console.log(`✅ Final audio with BGM saved: ${finalOutput}`);
  } catch (err) {
    console.error("❌ Final merge failed:", err.message);
    throw err;
  }
  console.log("✅ Final audio with BGM saved:", {
    voicePath: finalOutput,
    ...storyData,
  });
  return { voicePath: finalOutput, ...storyData };
}

// 🎵 Merge voice parts and background music
async function mergeVoiceWithBackground(
  safeTitle = title,
  audioFiles = audio,
  bgmPath = bgm,
  outputPath = out
) {
  const tempDir = path.dirname(outputPath);
  const tempListPath = path.join(tempDir, "temp_list.txt");
  const mergedVoicePath = path.join(tempDir, `${safeTitle}_merge.mp3`);

  // ✅ Step 1: Create temp_list.txt with absolute paths
  fs.writeFileSync(
    tempListPath,
    audioFiles.map((f) => `file '${path.resolve(f)}'`).join("\n")
  );

  // ✅ Step 2: Merge TTS voice files
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.resolve(tempListPath))
      .inputOptions(["-f", "concat", "-safe", "0"])
      .audioCodec("libmp3lame") // ✅ Force re-encode all files to MP3
      .audioBitrate("192k") // ✅ Ensure consistent bitrate
      .outputOptions(["-ar", "44100"]) // ✅ Sample rate: 44.1kHz (standard)
      .on("end", () => {
        fs.unlinkSync(tempListPath); // 🧹 Clean up
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("❌ Voice merge error:", err.message);
        console.error("📋 FFmpeg STDERR:", stderr);
        reject(err);
      })
      .save(mergedVoicePath);
  });

  // ✅ Step 3: Mix with background music
  await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(mergedVoicePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata.format.duration;

      ffmpeg()
        .input(mergedVoicePath)
        .input(bgmPath)
        .complexFilter([
          "[1:a]volume=0.15, aecho=0.8:0.9:1000:0.3, apad[a1]",
          "[0:a][a1]amix=inputs=2:duration=first:dropout_transition=3",
        ])
        .audioCodec("libmp3lame")
        .duration(duration)
        .outputOptions("-shortest")
        .on("end", () => {
          fs.unlinkSync(mergedVoicePath); // Clean intermediate file
          console.log("✅ Final audio with BGM created:", outputPath);
          resolve();
        })
        .on("error", (err) => {
          console.error("❌ Final BGM merge error:", err.message);
          reject(err);
        })
        .save(outputPath);
    });
  });
}
