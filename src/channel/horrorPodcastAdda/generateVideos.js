import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { getDuration, updateJSONOutput } from "../../helper/index.js";

const execAsync = promisify(exec);

/**
 * Generate videos from images and audio
 * Creates video segments from each image with corresponding audio duration
 */
export default async function generateVideos(input) {
  const { storyData, folder, safeTitle, audio_path, images } = input;
  const videosDir = path.join(folder, "videos");
  const mergedVideoPath = path.join(folder, "video_merged.mp4");

  // Check if videos already exist and are marked as completed
  try {
    const jsonFiles = fs.readdirSync(folder).filter((f) => f.endsWith(".json"));
    if (jsonFiles.length > 0) {
      const jsonPath = path.join(folder, jsonFiles[0]);
      const state = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

      if (
        state.videos_status === "completed" &&
        state.video_merged &&
        fs.existsSync(state.video_merged)
      ) {
        // Verify video segments exist
        const segmentsExist =
          Array.isArray(state.video_segments) &&
          state.video_segments.every((seg) => fs.existsSync(seg.path));
        if (segmentsExist) {
          return {
            ...input,
            video_segments: state.video_segments,
            video_merged: state.video_merged,
            videosDir,
          };
        }
      }
    }
  } catch (err) {
    // If JSON read fails, continue with generation
  }

  if (!audio_path || !fs.existsSync(audio_path)) {
    throw new Error("❌ Audio file not found");
  }

  if (!images || images.length === 0) {
    throw new Error("❌ No images found");
  }

  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir, { recursive: true });
  }

  const totalAudioDuration = await getDuration(audio_path);
  const durationPerImage = Math.ceil(totalAudioDuration / images.length);

  const videoSegments = [];
  const D = durationPerImage;
  const total = images.length;

  function progressLabel(current, skipped = false) {
    const pct = Math.round((current / total) * 100);
    return `[ ${current}/${total} ] ${pct}%${skipped ? " (cached)" : ""}`;
  }

  // Step 1: Create each segment = one image + its slice of audio (skip existing for resume)
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const videoName = `segment_${i + 1}.mp4`;
    const videoPath = path.join(videosDir, videoName);
    const audioStart = i * D;

    // Resume: skip if this segment already exists
    if (fs.existsSync(videoPath)) {
      videoSegments.push({
        path: videoPath,
        image: image.path,
        duration: D,
        index: i + 1,
      });
      console.log(`  ${progressLabel(i + 1, true)} segment_${i + 1}.mp4`);
      continue;
    }

    try {
      console.log(`  ${progressLabel(i + 1)} Creating segment_${i + 1}.mp4...`);

      const imgPath = path.resolve(image.path);
      const audPath = path.resolve(audio_path);
      const outPath = path.resolve(videoPath);

      // -loop 1 -t D = image for D seconds; -ss start -t D = audio slice from start, length D
      const segCmd =
        `ffmpeg -y -loop 1 -t ${D} -i "${imgPath}" -ss ${audioStart} -t ${D} -i "${audPath}" ` +
        `-map 0:v -map 1:a -c:v libx264 -pix_fmt yuv420p -vf "scale=1920:1080" -r 30 ` +
        `-c:a aac -b:a 320k -ar 48000 -shortest "${outPath}"`;

      await execAsync(segCmd);

      videoSegments.push({
        path: videoPath,
        image: image.path,
        duration: D,
        index: i + 1,
      });
    } catch (err) {
      console.error(`  ❌ Segment ${i + 1}/${total} failed:`, err.message);
      if (err.stderr) console.error(err.stderr);
    }
  }

  // Step 2: Concat intro + segments + end → temp, then add BGM (low volume) → video_merged.mp4
  const listFile = path.join(folder, "video_list.txt");
  const introPath = path.resolve(process.cwd(), "src/helper/post/HPA/intro.mp4");
  const endPath = path.resolve(process.cwd(), "src/helper/post/HPA/end.mp4");
  const bgmPath = path.resolve(process.cwd(), "src/helper/post/HPA/bgm_horror_podcast_adda.mp3");
  const tempMergedPath = path.join(folder, "video_merged_temp.mp4");

  if (videoSegments.length > 0) {
    console.log("  Merging segments...");

    const segmentLines = videoSegments.map(
      (seg) => `file '${path.resolve(seg.path).replace(/'/g, "'\\''")}'`
    );
    const parts = [];
    if (fs.existsSync(introPath)) {
      parts.push(`file '${introPath.replace(/'/g, "'\\''")}'`);
    }
    parts.push(...segmentLines);
    if (fs.existsSync(endPath)) {
      parts.push(`file '${endPath.replace(/'/g, "'\\''")}'`);
    }
    const listContent = parts.join("\n");

    fs.writeFileSync(listFile, listContent);

    const outPath = path.resolve(mergedVideoPath);

    try {
      // Concat to temp file first
      const concatCmd =
        `ffmpeg -y -f concat -safe 0 -i "${path.resolve(listFile)}" ` +
        `-c copy -movflags +faststart "${path.resolve(tempMergedPath)}"`;
      await execAsync(concatCmd);
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile);

      // Add BGM from start to end (low volume, looped to match duration)
      if (fs.existsSync(bgmPath)) {
        console.log("  Adding BGM...");
        const bgmCmd =
          `ffmpeg -y -i "${path.resolve(tempMergedPath)}" -stream_loop -1 -i "${bgmPath}" ` +
          `-filter_complex "[0:a]aresample=48000[va];[1:a]volume=0.15,aresample=48000[bg];[va][bg]amix=inputs=2:duration=first:dropout_transition=1[a]" ` +
          `-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 320k -shortest "${outPath}"`;
        await execAsync(bgmCmd);
        if (fs.existsSync(tempMergedPath)) fs.unlinkSync(tempMergedPath);
      } else {
        fs.renameSync(path.resolve(tempMergedPath), outPath);
      }
    } catch (err) {
      if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
      try {
        if (fs.existsSync(tempMergedPath)) fs.unlinkSync(tempMergedPath);
      } catch (_) {}
      console.error("❌ Concat/BGM error:", err.message);
      if (err.stderr) console.error(err.stderr);
      throw err;
    }
  }

  await updateJSONOutput(folder, safeTitle, {
    video_segments: videoSegments,
    video_merged: mergedVideoPath,
    videos_status: "completed",
  });

  return {
    ...input,
    video_segments: videoSegments,
    video_merged: mergedVideoPath,
    videosDir,
  };
}
