import { readdir, writeFile, unlink } from "fs/promises";
import fs from "fs";
import { access } from "fs/promises";
import path from "path";
import { basename, join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import cliProgress from "cli-progress";
import { exec } from "child_process";

// Handle __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config paths
const videoFolderHPA = path.resolve(__dirname, "bgm/HPA/fixed");
const videoFolderCE = path.resolve(__dirname, "bgm/CE");
const outputListPath = path.resolve(__dirname, "tempList.txt");

export default async function generateFinalVideo({ videoData }) {
  const { title, selection } = videoData;
  const safeTitle = await sanitizeFilename(title);
  console.log("📼 Processing video:", safeTitle, title, videoData);

  const storyVideoPath = path.join(
    __dirname,
    "stories",
    safeTitle,
    "output",
    `${safeTitle}.mp4`
  );
  console.log("📼 Story video:", storyVideoPath);
  const finalOutputPath = path.join(
    __dirname,
    "stories",
    safeTitle,
    "output",
    `${safeTitle}_merged.mp4`
  );

  // 1. Read and sort BGM videos
  var files = await readdir(videoFolderHPA);
  if (selection === "English") files = await readdir(videoFolderCE);

  const videoFiles = files.filter((file) => file.endsWith(".mp4")).sort();
  const fullPaths = videoFiles.map((file) =>
    selection === "English"
      ? path.join(videoFolderCE, file).replace(/\\/g, "/")
      : path.join(videoFolderHPA, file).replace(/\\/g, "/")
  );

  // 2. Insert story into 2nd position
  fullPaths.splice(1, 0, storyVideoPath.replace(/\\/g, "/"));

  // 3. Extract intro and end
  const intro = fullPaths.find((p) => p.includes("intro_music.mp4"));
  const intro_2 = fullPaths.find((p) => p.includes("intro_music_2.mp4"));
  const end_2 = fullPaths.find((p) => p.includes("end_2.mp4"));
  const end = fullPaths.find((p) => p.includes("end.mp4"));
  const orderedPaths = [
    intro,
    intro_2,
    storyVideoPath.replace(/\\/g, "/"),
    end_2,
    end,
  ];

  // 4. Write tempList.txt
  const listContent = orderedPaths.map((p) => `file '${p}'`).join("\n");
  await writeFile(outputListPath, listContent);
  console.log(
    "✅ tempList.txt generated with inserted story video:\n",
    listContent
  );

  await verifyFilesExist(orderedPaths); // ✅ Add this line before writeFile()
  compareFiles(orderedPaths);
  // fixAllFilesInSamePath(orderedPaths);
  // compareFiles(orderedPaths);

  // 5. Setup CLI Progress Bar
  const progressBar = new cliProgress.SingleBar({
    format: "🔄 Merging Video |{bar}| {percentage}% | ETA: {eta}s",
    barCompleteChar: "█",
    barIncompleteChar: "-",
    hideCursor: true,
  });
  progressBar.start(100, 0);

  // console.log("outputListPath",outputListPath)

  // 6. Merge with progress
  await new Promise((resolve, reject) => {
    let lastPercentage = 0;

    ffmpeg()
      .input(outputListPath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions(["-preset veryfast", "-crf 23", "-movflags +faststart"])
      .format("mp4")
      .on("progress", (progress) => {
        // progress.percent is a float, round it
        const percent = Math.min(Math.floor(progress.percent || 0), 100);
        if (percent > lastPercentage) {
          lastPercentage = percent;
          progressBar.update(percent);
        }
      })
      .on("end", async () => {
        progressBar.update(100);
        progressBar.stop();
        console.log("🎬 Video merge complete:", finalOutputPath);
        await unlink(outputListPath);
        resolve();
      })
      .on("error", (err) => {
        progressBar.stop();
        console.error("❌ Merge error:", err.message);
        reject(err);
      })
      .save(finalOutputPath);
  });

  return { ...videoData, finalOutputPath };
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");
}

/**
 * Run ffprobe and parse stream data
 */
function getStreamInfo(filePath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffprobe -v error -show_streams -of json "${filePath}"`,
      (error, stdout) => {
        if (error) {
          reject(`FFprobe error: ${error.message}`);
        } else {
          try {
            const data = JSON.parse(stdout);
            const videoStream = data.streams.find(
              (s) => s.codec_type === "video"
            );
            const audioStream = data.streams.find(
              (s) => s.codec_type === "audio"
            );
            resolve({ file: filePath, video: videoStream, audio: audioStream });
          } catch (err) {
            reject(`JSON parse error: ${err.message}`);
          }
        }
      }
    );
  });
}

/**
 * Compare properties between multiple files
 */
function describeMismatch(ref, curr) {
  const diffs = [];

  // Video comparison
  if (ref.video && curr.video) {
    if (ref.video.codec_name !== curr.video.codec_name)
      diffs.push(
        `Video codec: ${ref.video.codec_name} vs ${curr.video.codec_name}`
      );
    if (
      ref.video.width !== curr.video.width ||
      ref.video.height !== curr.video.height
    )
      diffs.push(
        `Resolution: ${ref.video.width}x${ref.video.height} vs ${curr.video.width}x${curr.video.height}`
      );
    if (ref.video.pix_fmt !== curr.video.pix_fmt)
      diffs.push(`Pixel format: ${ref.video.pix_fmt} vs ${curr.video.pix_fmt}`);
    if (ref.video.r_frame_rate !== curr.video.r_frame_rate)
      diffs.push(
        `Frame rate: ${ref.video.r_frame_rate} vs ${curr.video.r_frame_rate}`
      );
  } else if (ref.video || curr.video) {
    diffs.push("One of the files has no video");
  }

  // Audio comparison
  if (ref.audio && curr.audio) {
    if (ref.audio.codec_name !== curr.audio.codec_name)
      diffs.push(
        `Audio codec: ${ref.audio.codec_name} vs ${curr.audio.codec_name}`
      );
    if (ref.audio.sample_rate !== curr.audio.sample_rate)
      diffs.push(
        `Sample rate: ${ref.audio.sample_rate}Hz vs ${curr.audio.sample_rate}Hz`
      );
    if (ref.audio.channels !== curr.audio.channels)
      diffs.push(
        `Channels: ${ref.audio.channels}ch vs ${curr.audio.channels}ch`
      );
  } else if (ref.audio || curr.audio) {
    diffs.push("One of the files has no audio");
  }

  return diffs;
}

export async function compareFiles(filePaths = []) {
  try {
    const allData = await Promise.all(filePaths.map(getStreamInfo));

    // Print details of each file
    allData.forEach(({ file, video, audio }, i) => {
      console.log(`\n🎥 File ${i + 1}: ${path.basename(file)}`);
      if (video) {
        console.log(
          `  📼 Video: ${video.codec_name}, ${video.width}x${video.height}, ${video.pix_fmt}, ${video.r_frame_rate}`
        );
      } else {
        console.log("  ❌ No video stream");
      }

      if (audio) {
        console.log(
          `  🔊 Audio: ${audio.codec_name}, ${audio.sample_rate}Hz, ${audio.channels}ch`
        );
      } else {
        console.log("  ❌ No audio stream");
      }
    });

    // Compare each file to the first one
    const ref = allData[0];
    for (let i = 1; i < allData.length; i++) {
      const curr = allData[i];
      const mismatches = describeMismatch(ref, curr);

      if (mismatches.length > 0) {
        console.log(
          `\n⚠️ Mismatch between ${path.basename(ref.file)} and ${path.basename(curr.file)}:`
        );
        mismatches.forEach((m) => console.log(`  - ${m}`));
      }
    }
  } catch (err) {
    console.error("❌ Error:", err);
  }
}
function fixFile(inputPath) {
  return new Promise((resolve, reject) => {
    const dir = dirname(inputPath);
    const ext = extname(inputPath);
    const base = basename(inputPath, ext);
    const outputPath = join(dir, `${base}_fixed${ext}`);

    const cmd =
      `ffmpeg -y -i "${inputPath}" ` +
      `-vf "fps=30,format=yuv420p,scale=1920:1080" ` +
      `-ar 44100 -ac 2 ` +
      `-c:v libx264 -c:a aac -preset veryfast -crf 23 "${outputPath}"`;

    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        reject(`❌ Failed to process ${base}${ext}:\n${stderr}`);
      } else {
        resolve(`✅ Fixed: ${outputPath}`);
      }
    });
  });
}
async function fixAllFilesInSamePath(filePaths) {
  try {
    const results = await Promise.all(filePaths.map(fixFile));
    results.forEach((res) => console.log(res));
  } catch (err) {
    console.error(err);
  }
}
async function verifyFilesExist(filePaths) {
  for (const file of filePaths) {
    try {
      await access(file);
    } catch {
      throw new Error(`❌ Missing file: ${file}`);
    }
  }
}
