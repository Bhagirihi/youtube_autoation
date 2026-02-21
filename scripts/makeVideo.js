import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import ffmpeg from "fluent-ffmpeg";

const SIZE_16_9 = "1280:720";
/** Process image to 16:9 and dark/horror look: scale+crop, darken, desaturate, vignette. */
function ensureImage16x9Dark(imagePath) {
  const tmp = imagePath + ".tmp.jpg";
  const vf = `scale=${SIZE_16_9}:force_original_aspect_ratio=increase,crop=${SIZE_16_9},eq=brightness=-0.12:contrast=1.15:saturation=0.82,vignette=angle=PI/4:mode=forward`;
  execSync(`ffmpeg -y -i "${imagePath}" -vf "${vf}" "${tmp}"`, { stdio: "ignore" });
  fs.moveSync(tmp, imagePath, { overwrite: true });
}

function ensureImages16x9Dark(imagePaths) {
  if (!imagePaths?.length) return;
  for (const p of imagePaths) {
    if (fs.existsSync(p)) ensureImage16x9Dark(p);
  }
}

// When using Inworld TTS, BGM is fixed at 0.04; otherwise use BGM_VOLUME from env (default 0.04).
const BGM_VOLUME =
  process.env.USE_INWORLD_TTS === "1" || process.env.USE_INWORLD_TTS === "true"
    ? 0.04
    : parseFloat(process.env.BGM_VOLUME) || 0.04;
// Faster encoding: "veryfast" | "fast" | "medium" (default). "veryfast" can cut encode time by ~2–3x.
const X264_PRESET = process.env.VIDEO_PRESET || "veryfast";
// Set VIDEO_FAST=1 to use static scaled images instead of zoompan (much faster, no Ken Burns effect).
const VIDEO_FAST = process.env.VIDEO_FAST === "1" || process.env.VIDEO_FAST === "true";
// Set HORROR_COLOR=1 to apply a subtle darker color curve to the final video (cold, cinematic horror look).
const HORROR_COLOR = process.env.HORROR_COLOR === "1" || process.env.HORROR_COLOR === "true";

function getSceneImagePaths() {
  const imagesDir = path.join(process.cwd(), "images");
  if (!fs.existsSync(imagesDir)) return [];
  const files = fs.readdirSync(imagesDir);
  const sceneFiles = files
    .filter((f) => /^scene_(\d+)\.jpg$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/^scene_(\d+)\.jpg$/i)[1], 10);
      const nb = parseInt(b.match(/^scene_(\d+)\.jpg$/i)[1], 10);
      return na - nb;
    });
  return sceneFiles.map((f) => path.join(imagesDir, f));
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
  const allImagePaths = getSceneImagePaths();
  const actualImageCount = allImagePaths.length;
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

  const images =
    actualImageCount >= sceneCount
      ? allImagePaths.slice(0, sceneCount)
      : Array.from({ length: sceneCount }, (_, i) => path.join(process.cwd(), "images", `scene_${i + 1}.jpg`));
  const missing = images.filter((p) => !fs.existsSync(p));
  if (missing.length > 0) {
    throw new Error(
      `Missing ${missing.length} image(s) (e.g. ${path.basename(missing[0])}). Run the images step first or add scene_*.jpg to images/`,
    );
  }
  ensureImages16x9Dark(images);
  console.log(`🖼 Using ${images.length} image(s) for video — 16:9, dark (${images.map((p) => path.basename(p)).join(", ")})`);
  const fps = 25;

  const videoFilters =
    VIDEO_FAST
      ? segmentDurations
          .map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`)
          .join(";")
      : segmentDurations
          .map((dur, i) => {
            const frameCount = Math.max(1, Math.floor(dur * fps));
            return `[${i}:v]zoompan=z='min(zoom+0.0005,1.15)':d=${frameCount}:s=1280x720,setsar=1[v${i}]`;
          })
          .join(";");
  if (VIDEO_FAST) console.log("⚡ Fast mode: static images (no zoom). Set VIDEO_FAST=0 for zoom effect.");
  const concatInputs = images.map((_, i) => `[v${i}]`).join("");
  const narrationIdx = images.length;
  const musicIdx = narrationIdx + 1;
  const audioFilter = bgmPath
    ? `[${musicIdx}:a]volume=${BGM_VOLUME}[bgm];[${narrationIdx}:a][bgm]amix=inputs=2:duration=longest[a]`
    : `[${narrationIdx}:a]anull[a]`;

  const baseDir = process.env.DATA_DIR || process.cwd();
  const srtPath = path.join(baseDir, "temp", "subtitles.srt");
  const burnSubtitles = (process.env.VIDEO_SUBTITLES === "1" || process.env.VIDEO_SUBTITLES === "true") && fs.existsSync(srtPath);
  const srtPathEsc = srtPath.replace(/\\/g, "/");
  let filterComplex = `${videoFilters};${concatInputs}concat=n=${sceneCount}:v=1:a=0[v]`;
  let videoChain = "[v]";
  if (HORROR_COLOR) {
    filterComplex += ";[v]curves=preset=darker[v2]";
    videoChain = "[v2]";
    console.log("🎬 Horror color curve applied (darker shadows)");
  }
  if (burnSubtitles) {
    filterComplex += `;${videoChain}subtitles=filename='${srtPathEsc}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,Outline=2,BackColour=&H80000000'[vout]`;
    videoChain = "[vout]";
    console.log("📝 Burning paragraph-synced subtitles into video");
  }
  const videoOut = videoChain;
  filterComplex += `;${audioFilter}`;

  const args = ["-y"];
  for (let i = 0; i < images.length; i++) {
    args.push("-loop", "1", "-t", String(segmentDurations[i]), "-i", images[i]);
  }
  args.push("-i", narrationPath);
  if (bgmPath) args.push("-stream_loop", "-1", "-i", bgmPath);
  args.push(
    "-filter_complex",
    filterComplex,
    "-map",
    videoOut,
    "-map",
    "[a]",
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    X264_PRESET,
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
