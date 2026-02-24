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

const THUMB_START_SEC = 4;
const INTRO_VIDEO_PATH = path.join(process.cwd(), "assets", "video", "intro.mp4");
const END_VIDEO_PATH = path.join(process.cwd(), "assets", "video", "end.mp4");
const THUMB_PATH = path.join(process.cwd(), "thumbnails", "thumb.jpg");

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

  const n = segmentDurations.length;
  const useIntroOutro =
    isDurationsArray &&
    n >= 2 &&
    fs.existsSync(INTRO_VIDEO_PATH) &&
    fs.existsSync(END_VIDEO_PATH);
  const thumbImagePath = fs.existsSync(THUMB_PATH) ? THUMB_PATH : images[0];
  if (useIntroOutro) {
    if (!fs.existsSync(THUMB_PATH)) {
      console.warn("⚠ thumbnails/thumb.jpg not found; using first scene image for 4s intro.");
    } else {
      ensureImage16x9Dark(thumbImagePath);
    }
  }

  let args;
  let filterComplex;
  let videoOut;
  let narrationIdx;
  let musicIdx;

  const scalePad = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1";

  if (useIntroOutro) {
    // Structure: thumb 4s → intro.mp4 (intro paragraph - 4s) → story images → end.mp4 (outro paragraph)
    const introDur = Math.max(0.1, segmentDurations[0] - THUMB_START_SEC);
    const endDur = Math.max(0.1, segmentDurations[n - 1]);
    const numStorySegments = n - 2;
    const numVideoInputs = 1 + 1 + numStorySegments + 1; // thumb + intro + story + end
    narrationIdx = numVideoInputs;
    musicIdx = numVideoInputs + 1;

    const videoInputs = [];
    const filterParts = [];

    // [0] thumb 4s
    videoInputs.push({ type: "image", path: thumbImagePath, duration: THUMB_START_SEC });
    filterParts.push(`[0:v]${scalePad}[v0]`);

    // [1] intro.mp4 trimmed to introDur
    videoInputs.push({ type: "video", path: INTRO_VIDEO_PATH });
    filterParts.push(`[1:v]trim=duration=${introDur},setpts=PTS-STARTPTS,${scalePad}[v1]`);

    // [2]..[numStorySegments+1] story images (images[1]..images[n-2])
    for (let i = 0; i < numStorySegments; i++) {
      const segIdx = 2 + i;
      const dur = segmentDurations[1 + i];
      videoInputs.push({ type: "image", path: images[1 + i], duration: dur });
      if (VIDEO_FAST) {
        filterParts.push(`[${segIdx}:v]${scalePad}[v${segIdx}]`);
      } else {
        const frameCount = Math.max(1, Math.floor(dur * fps));
        filterParts.push(`[${segIdx}:v]zoompan=z='min(zoom+0.0005,1.15)':d=${frameCount}:s=1280x720,setsar=1[v${segIdx}]`);
      }
    }

    // [numVideoInputs-1] end.mp4 trimmed to endDur
    const endInputIdx = numVideoInputs - 1;
    videoInputs.push({ type: "video", path: END_VIDEO_PATH });
    filterParts.push(`[${endInputIdx}:v]trim=duration=${endDur},setpts=PTS-STARTPTS,${scalePad}[v${endInputIdx}]`);

    const concatLabels = Array.from({ length: numVideoInputs }, (_, i) => `[v${i}]`).join("");
    filterParts.push(`${concatLabels}concat=n=${numVideoInputs}:v=1:a=0[v]`);

    const audioFilter = bgmPath
      ? `[${musicIdx}:a]volume=${BGM_VOLUME}[bgm];[${narrationIdx}:a][bgm]amix=inputs=2:duration=longest[a]`
      : `[${narrationIdx}:a]anull[a]`;

    filterComplex = filterParts.join(";");
    videoOut = "[v]";
    const baseDir = process.env.DATA_DIR || process.cwd();
    const srtPath = path.join(baseDir, "temp", "subtitles.srt");
    const burnSubtitles = (process.env.VIDEO_SUBTITLES === "1" || process.env.VIDEO_SUBTITLES === "true") && fs.existsSync(srtPath);
    const srtPathEsc = srtPath.replace(/\\/g, "/");
    if (HORROR_COLOR) {
      filterComplex += ";[v]curves=preset=darker[v2]";
      videoOut = "[v2]";
    }
    if (burnSubtitles) {
      filterComplex += `;${videoOut}subtitles=filename='${srtPathEsc}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,Outline=2,BackColour=&H80000000'[vout]`;
      videoOut = "[vout]";
    }
    filterComplex += ";" + audioFilter;

    args = ["-y"];
    for (const inp of videoInputs) {
      if (inp.type === "image") {
        args.push("-loop", "1", "-t", String(inp.duration), "-i", inp.path);
      } else {
        args.push("-i", inp.path);
      }
    }
    args.push("-i", narrationPath);
    if (bgmPath) args.push("-stream_loop", "-1", "-i", bgmPath);
    args.push("-filter_complex", filterComplex, "-map", videoOut, "-map", "[a]", "-shortest", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", X264_PRESET, "-c:a", "aac", "output/final.mp4");

    console.log("📐 Intro/outro: thumb 4s → intro.mp4 → story → end.mp4");
  } else {
    // Original: only scene images
    if (!useIntroOutro && isDurationsArray && n >= 2) {
      if (!fs.existsSync(INTRO_VIDEO_PATH)) console.warn("⚠ assets/video/intro.mp4 not found; skipping intro clip.");
      if (!fs.existsSync(END_VIDEO_PATH)) console.warn("⚠ assets/video/end.mp4 not found; skipping end clip.");
    }
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
    narrationIdx = images.length;
    musicIdx = narrationIdx + 1;
    const audioFilter = bgmPath
      ? `[${musicIdx}:a]volume=${BGM_VOLUME}[bgm];[${narrationIdx}:a][bgm]amix=inputs=2:duration=longest[a]`
      : `[${narrationIdx}:a]anull[a]`;

    const baseDir = process.env.DATA_DIR || process.cwd();
    const srtPath = path.join(baseDir, "temp", "subtitles.srt");
    const burnSubtitles = (process.env.VIDEO_SUBTITLES === "1" || process.env.VIDEO_SUBTITLES === "true") && fs.existsSync(srtPath);
    const srtPathEsc = srtPath.replace(/\\/g, "/");
    filterComplex = `${videoFilters};${concatInputs}concat=n=${sceneCount}:v=1:a=0[v]`;
    videoOut = "[v]";
    if (HORROR_COLOR) {
      filterComplex += ";[v]curves=preset=darker[v2]";
      videoOut = "[v2]";
      console.log("🎬 Horror color curve applied (darker shadows)");
    }
    if (burnSubtitles) {
      filterComplex += `;${videoOut}subtitles=filename='${srtPathEsc}':force_style='FontSize=22,PrimaryColour=&H00FFFFFF,Outline=2,BackColour=&H80000000'[vout]`;
      videoOut = "[vout]";
      console.log("📝 Burning paragraph-synced subtitles into video");
    }
    filterComplex += `;${audioFilter}`;

    args = ["-y"];
    for (let i = 0; i < images.length; i++) {
      args.push("-loop", "1", "-t", String(segmentDurations[i]), "-i", images[i]);
    }
    args.push("-i", narrationPath);
    if (bgmPath) args.push("-stream_loop", "-1", "-i", bgmPath);
    args.push("-filter_complex", filterComplex, "-map", videoOut, "-map", "[a]", "-shortest", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", X264_PRESET, "-c:a", "aac", "output/final.mp4");
  }

  const outputPath = path.join(process.cwd(), "output", "final.mp4");
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Video created (output/final.mp4)");
        resolve();
        return;
      }
      // Some environments (e.g. CI) report non-zero exit (e.g. 228) even when encoding completed
      try {
        const stat = fs.statSync(outputPath);
        if (stat && stat.size > 0) {
          console.warn(`⚠ ffmpeg exited with code ${code} but output/final.mp4 exists (${stat.size} bytes); treating as success.`);
          resolve();
          return;
        }
      } catch (_) {}
      reject(new Error(`ffmpeg exited with code ${code}`));
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
