import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Sanscript from "sanscript";
import cliProgress from "cli-progress";
import { updateExcel } from "./helper/excelHelpers.js";

const F_VOICE_ID = "hi-IN-SwaraNeural";
const M_VOICE_ID = "hi-IN-MadhurNeural";
const MP3_FORMAT = "audio-48khz-192kbitrate-mono-mp3";
const EDGE_TTS_PKG = "@echristian/edge-tts";
const SPEECH_RATE = "-2%";
const PITCH = "-7%";
const STYLE = "narration-professional";
const STYLE_DEGREE = 0.5;

// Get current file & directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set base folder
const parentFolder = path.join(__dirname, "storyScript_AI");

// Start listening to the parent process
process.on("message", async ({ label, row }) => {
  const { aiTitle, slug } = JSON.parse(row);
  console.log(`🎙️ ${label} Received row for: ${aiTitle}`);

  // Get subfolders
  const subfolders = getSubfolderNames(parentFolder);
  console.log("📁 Subfolders:", subfolders);

  // Match using slug first (exact), then fallback to aiTitle (fuzzy)
  let matchedFolder = subfolders.find((folder) => folder === slug);

  if (!matchedFolder) {
    matchedFolder = subfolders.find((folder) =>
      folder.toLowerCase().includes(aiTitle.toLowerCase())
    );
  }

  if (matchedFolder) {
    const fullFolderPath = path.join(parentFolder, matchedFolder);
    const subtitlePath = path.join(fullFolderPath, `AI_Story_${slug}.txt`);
    const outputMp3Path = path.join(fullFolderPath, `${slug}.mp3`);

    console.log(`✅ Found folder: ${matchedFolder}`);
    console.log(`📂 Full Path: ${fullFolderPath}`);

    // Try reading subtitle
    if (fs.existsSync(subtitlePath)) {
      const subtitle = fs.readFileSync(subtitlePath, "utf-8");
      console.log(`📖 Reading: AI_Story_${slug}.txt`);
      await generateAIVoiceOver(subtitle, outputMp3Path);
      await updateExcel(slug, {
        status: "voiceovered",
        voiceOver: path.basename(outputMp3Path),
      });
    } else {
      console.warn(
        "⚠️ AI_Story_{slug}.txt not found in folder:",
        matchedFolder
      );
    }
  } else {
    console.log(`❌ No folder found matching title or slug.`);
  }

  // Simulate async work
  await new Promise((res) => setTimeout(res, 500));

  process.send?.({ status: "done", title: aiTitle });
  process.exit(0);
});

// Helper to get subfolder names inside a directory
function getSubfolderNames(parentDir) {
  const all = fs.readdirSync(parentDir, { withFileTypes: true });

  return all
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

async function generateAIVoiceOver(subtitle, outputPath) {
  const { synthesize } = await import(EDGE_TTS_PKG);

  // Break subtitle into chunks (e.g., paragraphs)
  const paragraphs = subtitle
    .split(/\n{2,}/) // split by double newlines
    .map((p) => p.trim())
    .filter(Boolean);

  const bar = new cliProgress.SingleBar(
    {
      format: `🔊 Generating Voice | {bar} | {percentage}% | {value}/{total} chunks`,
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  bar.start(paragraphs.length, 0);

  const buffers = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i];

    const { audio } = await synthesize({
      text: paragraph,
      voice: M_VOICE_ID,
      format: MP3_FORMAT,
      rate: SPEECH_RATE,
      pitch: PITCH,
      style: STYLE,
      styleDegree: STYLE_DEGREE,
    });

    const buf = Buffer.from(await audio.arrayBuffer());
    buffers.push(buf);

    bar.increment();
  }

  bar.stop();

  const finalBuffer = Buffer.concat(buffers);
  fs.writeFileSync(outputPath, finalBuffer);

  console.log(`✅ Voiceover saved as ${outputPath}`);
  return true;
}
