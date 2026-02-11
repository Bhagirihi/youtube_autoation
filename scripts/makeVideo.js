import { spawn } from "child_process";
import path from "path";
import fs from "fs-extra";
import ffmpeg from "fluent-ffmpeg";

const BGM_VOLUME = parseFloat(process.env.BGM_VOLUME) || 0.04; // 4% by default when BGM is used

function getSceneImageCount() {
  const imagesDir = path.join(process.cwd(), "images");
  if (!fs.existsSync(imagesDir)) return 0;
  let n = 0;
  while (fs.existsSync(path.join(imagesDir, `scene_${n + 1}.jpg`))) n++;
  return n;
}

function getBgmPath() {
  const envPath = process.env.BGM_PATH;
  if (envPath && envPath.trim()) {
    const p = path.resolve(envPath.trim());
    if (fs.existsSync(p)) return p;
  }
  const musicDir = path.join(process.cwd(), "assets", "music");
  for (const name of ["horror.mov", "horror.mp3"]) {
    const p = path.join(musicDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * @param {number | number[]} sceneCountOrDurations - number of scenes (equal split) or array of durations in seconds per scene (paragraph sync)
 */
export async function makeVideo(sceneCountOrDurations) {
  await fs.ensureDir("output");
  const narrationPath = path.join(process.cwd(), "voiceover", "narration.mp3");
  if (!fs.existsSync(narrationPath)) {
    throw new Error("voiceover/narration.mp3 not found. Run the audio step first.");
  }

  const bgmPath = getBgmPath();
  if (!bgmPath) {
    console.warn(
      "⚠ No BGM file (set BGM_PATH in .env or add assets/music/horror.mov/mp3) — video will use narration only.",
    );
  } else {
    const volPct = Math.round(BGM_VOLUME * 100);
    console.log(`🎵 BGM: ${path.basename(bgmPath)} at ${volPct}% volume`);
  }

  const totalDuration = await getAudioDuration(narrationPath);
  const actualImageCount = getSceneImageCount();
  const isDurationsArray = Array.isArray(sceneCountOrDurations);
  let sceneCount;
  let segmentDurations;
  if (isDurationsArray && sceneCountOrDurations.length > 0) {
    const fromTimings = sceneCountOrDurations;
    if (actualImageCount > fromTimings.length) {
      sceneCount = actualImageCount;
      segmentDurations = Array.from({ length: sceneCount }, () => totalDuration / sceneCount);
    } else {
      segmentDurations = fromTimings;
      sceneCount = segmentDurations.length;
    }
  } else {
    const requestedCount = Math.max(1, Math.floor(Number(sceneCountOrDurations)) || 1);
    sceneCount = actualImageCount > 0 ? actualImageCount : requestedCount;
    segmentDurations = Array.from({ length: sceneCount }, () => totalDuration / sceneCount);
  }

  const images = Array.from(
    { length: sceneCount },
    (_, i) => path.join(process.cwd(), "images", `scene_${i + 1}.jpg`),
  );
  const missing = images.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.length} image(s) (e.g. ${path.basename(missing[0])}). Run the images step first or add scene_1.jpg … scene_${sceneCount}.jpg to images/`,
    );
  }
  const fps = 25;

  const zoompanFilters = segmentDurations
    .map((dur, i) => {
      const frameCount = Math.max(1, Math.floor(dur * fps));
      return `[${i}:v]zoompan=z='min(zoom+0.0005,1.15)':d=${frameCount}:s=1280x720,setsar=1[v${i}]`;
    })
    .join(";");
  const concatInputs = images.map((_, i) => `[v${i}]`).join("");
  const narrationIdx = images.length;
  const musicIdx = narrationIdx + 1;
  const audioFilter = bgmPath
    ? `[${musicIdx}:a]volume=${BGM_VOLUME}[bgm];[${narrationIdx}:a][bgm]amix=inputs=2:duration=longest[a]`
    : `[${narrationIdx}:a]anull[a]`;

  const filterComplex = `${zoompanFilters};${concatInputs}concat=n=${sceneCount}:v=1:a=0[v];${audioFilter}`;

  const args = ["-y"];
  for (let i = 0; i < images.length; i++) {
    args.push("-loop", "1", "-t", String(segmentDurations[i]), "-i", images[i]);
  }
  args.push("-i", narrationPath);
  if (bgmPath) args.push("-i", bgmPath);
  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "output/final.mp4",
  );

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
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
