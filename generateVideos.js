import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import cliProgress from "cli-progress";

ffmpeg.setFfmpegPath(ffmpegPath);

// Utility to resolve __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");
}

// Main video generation function
export default async function generateAIVideo(videoData) {
  console.log("🎬 Generating video for:", videoData);
  const { title } = videoData;
  console.log("🎬 Generating video for:", __dirname);
  const safeTitle = sanitizeFilename(title);
  const storyFolder = path.join("stories", safeTitle);

  const imageFolder = path.join(storyFolder, "images");
  const audioPath = path.join(storyFolder, "voiceover", `${safeTitle}.mp3`);
  const outputFolder = path.join(storyFolder, "output");
  const outputPath = path.join(outputFolder, `${safeTitle}.mp4`);
  const inputListFile = path.join(imageFolder, "input_images.txt");
  const imageDuration = 5; // seconds per image

  fs.mkdirSync(outputFolder, { recursive: true });

  // 🕒 Get duration of audio
  const audioDuration = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration);
    });
  });

  // 🖼️ Load all image paths from folder
  const imagePaths = fs
    .readdirSync(imageFolder)
    .filter((file) => /\.(jpg|jpeg|png|webp|bmp)$/i.test(file))
    .sort()
    .map((file) => path.join(imageFolder, file));

  if (imagePaths.length === 0) throw new Error("❌ No images found.");
  console.log("🖼️ Images found:", imagePaths.length);

  // 🔢 Calculate how many images are needed for the audio duration
  const requiredImageCount = Math.ceil(audioDuration / imageDuration);
  console.log("🎞️ Required Image Count:", requiredImageCount);

  // 🔁 Repeat images as needed
  const repeatedImages = Array.from(
    { length: requiredImageCount },
    (_, i) => imagePaths[i % imagePaths.length]
  );

  // 📄 Write ffmpeg input file
  const txtData =
    repeatedImages
      .map((img) => `file '${path.resolve(img)}'\nduration ${imageDuration}`)
      .join("\n") + `\nfile '${repeatedImages[repeatedImages.length - 1]}'`;

  fs.writeFileSync(inputListFile, txtData);

  // 🔍 Find .txt file in imageFolder
  const txtFile = fs
    .readdirSync(imageFolder)
    .find((file) => /\.txt$/i.test(file));

  if (!txtFile) throw new Error("❌ No .txt file found in images folder.");

  const txtFilePath = path.join(imageFolder, txtFile);
  console.log("📄 Found .txt file:", txtFilePath);

  const lines = fs.readFileSync(txtFilePath, "utf-8").split("\n");
  lines.forEach((line) => {
    if (line.startsWith("file ")) {
      const filePath = line.replace("file '", "").replace("'", "").trim();
      if (!fs.existsSync(filePath)) {
        console.warn("❌ MISSING FILE:", filePath);
      }
    }
  });

  // 📊 Progress bar
  const bar = new cliProgress.SingleBar(
    {
      format: "🎬 Generating Video |{bar}| {percentage}% | {value}/{total}s",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  bar.start(Math.ceil(audioDuration), 0);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.resolve(txtFilePath))
      .inputOptions("-f", "concat", "-safe", "0")
      .input(audioPath)
      .complexFilter("volume=0.85")
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions([
        "-vf",
        "scale=1920:1080,format=yuv420p,eq=brightness=-0.15:contrast=1.2,vignette",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-b:v",
        "2000k",
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-shortest",
        "-tune",
        "stillimage",
      ])
      .output(outputPath)
      .on("progress", (progress) => {
        const time = parseFloat(
          progress.timemark.split(":").reduce((acc, t) => 60 * acc + +t)
        );
        bar.update(Math.min(time, audioDuration));
      })
      .on("end", () => {
        bar.update(audioDuration);
        bar.stop();
        console.log(`✅ Video created at: ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err) => {
        bar.stop();
        console.error("❌ Error generating video:", err);
        reject(err);
      })
      .run();
  });

  // // ✅ Now merge intro + core + outro
  // const introPath = path.resolve(__dirname, "bgm", "intro_music.mp4");
  // const outroPath = path.resolve(__dirname, "bgm", "end.mp4");
  // const finalOutput = path.join(outputFolder, `${safeTitle}_final.mp4`);
  // const mergeListFile = path.join(outputFolder, "merge.txt");

  // const mergeData = [
  //   `file '${introPath}'`,
  //   `file '${path.resolve(outputPath)}'`,
  //   `file '${outroPath}'`,
  // ].join("\n");

  // fs.writeFileSync(mergeListFile, mergeData);
  // // 🔍 Find .txt file in imageFolder
  // const mergeTxtFile = fs
  //   .readdirSync(outputFolder)
  //   .find((file) => /\.txt$/i.test(file));

  // if (!txtFile) throw new Error("❌ No .txt file found in images folder.");

  // const mergeTxtFilePath = path.join(outputFolder, mergeTxtFile);
  // console.log("📄 Found .txt file:", mergeTxtFilePath);

  // const mergeLines = fs.readFileSync(mergeTxtFilePath, "utf-8").split("\n");
  // mergeLines.forEach((line) => {
  //   if (line.startsWith("file ")) {
  //     const filePath = line.replace("file '", "").replace("'", "").trim();
  //     if (!fs.existsSync(filePath)) {
  //       console.warn("❌ MISSING FILE:", filePath);
  //     }
  //   }
  // });

  // console.log("🔀 Merging final video with intro & outro...");

  // return new Promise((resolve, reject) => {
  //   ffmpeg()
  //     .input(path.resolve(mergeTxtFilePath))
  //     .inputOptions("-f", "concat", "-safe", "0")
  //     .outputOptions(["-c", "copy"])

  //     .output(path.resolve(finalOutput))
  //     .on("end", () => {
  //       console.log(`🎉 Final video created at: ${finalOutput}`);
  //       resolve(finalOutput);
  //     })
  //     .on("error", (err) => {
  //       console.error("❌ FFmpeg Merge Error:", err);
  //       reject(err);
  //     })
  //     .run();
  // });
}
