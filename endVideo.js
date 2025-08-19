import cliProgress from "cli-progress";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { readdir } from "fs/promises";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { exec as execCb } from "child_process";

const exec = promisify(execCb);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const videoFolderHPA = path.resolve(__dirname, "bgm/HPA/fixed");

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");
}

// Run ffprobe to get video duration
async function getDuration(file) {
  const { stdout } = await exec(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`
  );
  return parseFloat(stdout.trim());
}

// Run ffmpeg with progress callback
function runFFmpegWithProgress(args, inputFile, onProgress) {
  return new Promise(async (resolve, reject) => {
    let duration = 0;
    if (inputFile && fs.existsSync(inputFile)) {
      try {
        duration = await getDuration(inputFile);
      } catch (e) {
        duration = 0;
      }
    }

    const ffmpeg = spawn("ffmpeg", args, { shell: true });
    ffmpeg.stderr.on("data", (data) => {
      const msg = data.toString();

      // Parse progress time
      const match = msg.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (match && duration > 0) {
        const [h, m, s] = match[1].split(":").map(parseFloat);
        const seconds = h * 3600 + m * 60 + s;
        const percent = Math.min((seconds / duration) * 100, 100);
        onProgress?.(percent);
      }
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed with code ${code}`));
    });
  });
}

// Reencode to consistent format
async function reencodeVideo(input, output, bar) {
  const args = [
    "-y",
    "-i",
    `"${input}"`,
    "-vf",
    `"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"`,
    "-c:v",
    "libx264",
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    `"${output}"`,
  ];

  await runFFmpegWithProgress(args, input, (percent) => {
    bar.update(Math.floor(percent));
  });
}

export default async function generateFinalVideo(videoData) {
  console.log("📼 Processing video:", videoData);
  const { title } = videoData;

  const safeTitle = sanitizeFilename(title) || "output";
  const __dirStory = path.dirname(safeTitle);
  const outputFolder = path.resolve(__dirname, __dirStory, "output");

  fs.mkdirSync(outputFolder, { recursive: true });

  const storyVideoPath = path.join(
    __dirname,
    "stories",
    safeTitle,
    "output",
    `${safeTitle}.mp4`
  );
  const thumbnail = path.join(
    __dirname,
    "stories",
    safeTitle,
    "output",
    `thumbnail.png`
  );
  const finalOutputPath = path.join(
    __dirname,
    "stories",
    safeTitle,
    "output",
    `${safeTitle}_merged.mp4`
  );

  // Step 1: Make thumbnail video
  console.log("🎬 Creating thumbnail video...");
  const thumbVideo = path.join(outputFolder, "thumb.mp4");
  await runFFmpegWithProgress(
    [
      "-y",
      "-loop",
      "1",
      "-t",
      "5",
      "-i",
      `"${thumbnail}"`,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=44100:cl=stereo",
      "-shortest",
      "-vf",
      `"scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"`,
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-pix_fmt",
      "yuv420p",
      `"${thumbVideo}"`,
    ],
    thumbnail,
    (p) => process.stdout.write(`\r   ➡️  Thumbnail progress: ${p.toFixed(1)}%`)
  );
  console.log("\n✅ Thumbnail created");

  // Step 2: Collect background videos
  const files = await readdir(videoFolderHPA);
  const videoFiles = files.filter((f) => f.endsWith(".mp4")).sort();
  const fullPaths = videoFiles.map((f) =>
    path.join(videoFolderHPA, f).replace(/\\/g, "/")
  );

  const intro1 = fullPaths.find((p) => p.includes("intro_music.mp4"));
  const end2 = fullPaths.find((p) => p.includes("end_2.mp4"));
  const end1 = fullPaths.find((p) => p.includes("end.mp4"));

  const mergeOrder = [thumbVideo, intro1, storyVideoPath, end2, end1].filter(
    Boolean
  );

  // Step 3: Re-encode all into temp folder
  console.log("🎬 Re-encoding videos...");
  const reencoded = [];
  const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

  for (let i = 0; i < mergeOrder.length; i++) {
    console.log(`\n➡️ Reencoding part ${i + 1}/${mergeOrder.length}`);
    bar.start(100, 0);
    const input = mergeOrder[i];
    const output = path.join(outputFolder, `part_${i}.mp4`);
    await reencodeVideo(input, output, bar);
    bar.stop();
    reencoded.push(output);
  }

  // Step 4: Create concat file
  const concatList = path.join(outputFolder, "file_list.txt");
  const fileContent = reencoded.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(concatList, fileContent);

  // Step 5: Concat
  console.log("🎬 Concatenating final video...");
  await runFFmpegWithProgress(
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      `"${concatList}"`,
      "-c",
      "copy",
      `"${finalOutputPath}"`,
    ],
    reencoded[0],
    (p) => process.stdout.write(`\r   ➡️  Concat progress: ${p.toFixed(1)}%`)
  );

  console.log("\n✅ Final video created:", finalOutputPath);
  return { finalOutputPath, mergeOrder: reencoded };
}
