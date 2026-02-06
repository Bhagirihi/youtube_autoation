import { spawn } from "child_process";
import fs from "fs-extra";
import ffmpeg from "fluent-ffmpeg";

export async function makeVideo(sceneCount) {
  await fs.ensureDir("output");
  const hasMusic = await fs.pathExists("assets/music/horror.mp3");
  if (!hasMusic) {
    console.warn("⚠ No assets/music/horror.mp3 — video will use narration only.");
  }

  const images = Array.from(
    { length: sceneCount },
    (_, i) => `images/scene_${i + 1}.jpg`
  );
  const duration = await getAudioDuration("voiceover/narration.mp3");
  const perScene = duration / images.length;
  const fps = 25;
  const frameCount = Math.floor(perScene * fps);

  const zoompanFilters = images
    .map(
      (_, i) =>
        `[${i}:v]zoompan=z='min(zoom+0.0005,1.15)':d=${frameCount}:s=1280x720,setsar=1[v${i}]`
    )
    .join(";");
  const concatInputs = images.map((_, i) => `[v${i}]`).join("");
  const narrationIdx = images.length;
  const audioFilter = hasMusic
    ? `[${narrationIdx}:a][${narrationIdx + 1}:a]amix=inputs=2:duration=shortest[a]`
    : `[${narrationIdx}:a]anull[a]`;

  const filterComplex = `${zoompanFilters};${concatInputs}concat=n=${images.length}:v=1:a=0[v];${audioFilter}`;

  const args = ["-y"];
  for (const img of images) {
    args.push("-loop", "1", "-t", String(perScene), "-i", img);
  }
  args.push("-i", "voiceover/narration.mp3");
  if (hasMusic) args.push("-i", "assets/music/horror.mp3");
  args.push(
    "-filter_complex", filterComplex,
    "-map", "[v]",
    "-map", "[a]",
    "-shortest",
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-c:a", "aac",
    "output/final.mp4"
  );

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: "inherit", cwd: process.cwd() });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Video created (output/final.mp4)");
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    proc.on("error", reject);
  });
}

function getAudioDuration(file) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(file, (err, data) => {
      if (err) reject(err);
      else resolve(data.format.duration);
    });
  });
}
