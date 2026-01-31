import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import { updateJSONOutput } from "../../helper/index.js";

const execAsync = promisify(exec);

/**
 * Finalize video by adding intro/outro if available
 * Note: video_merged already has audio from generateVideos, so we skip redundant audio merge
 */
export default async function endVideo(input) {
  const { storyData, folder, safeTitle, video_merged, thumbnail_path } = input;

  if (!video_merged || !fs.existsSync(video_merged)) {
    throw new Error("❌ Merged video file not found");
  }

  // video_merged already has audio from generateVideos Step 1, so use it directly
  let finalOutputPath = video_merged;

  // Check for intro/outro files in ref/YT_v3/bgm/HPA/
  const introPath = path.join(process.cwd(), "ref", "YT_v3", "bgm", "HPA", "intro.mp4");
  const outroPath = path.join(process.cwd(), "ref", "YT_v3", "bgm", "HPA", "outro.mp4");

  // If intro/outro exist, merge them
  if (fs.existsSync(introPath) || fs.existsSync(outroPath)) {
    const segments = [];

    if (fs.existsSync(introPath)) {
      segments.push(introPath);
    }

    segments.push(video_merged);

    if (fs.existsSync(outroPath)) {
      segments.push(outroPath);
    }

    if (segments.length > 1) {
      const listFile = path.join(folder, "final_list.txt");
      const finalWithIntroOutro = path.join(folder, "final_video.mp4");

      // Escape single quotes in paths for ffmpeg concat list (improvement #6)
      const listContent = segments
        .map((seg) => `file '${path.resolve(seg).replace(/'/g, "'\\''")}'`)
        .join("\n");

      fs.writeFileSync(listFile, listContent);

      await new Promise((resolve, reject) => {
        ffmpeg()
          .input(listFile)
          .inputOptions(["-f", "concat", "-safe", "0"])
          .videoCodec("libx264")
          .outputOptions(["-pix_fmt", "yuv420p"])
          .on("end", () => {
            if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
            resolve();
          })
          .on("error", (err) => {
            console.error("❌ Final merge error:", err.message);
            if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
            reject(err);
          })
          .save(finalWithIntroOutro);
      });

      finalOutputPath = finalWithIntroOutro;
    }
  } else {
    // No intro/outro, but ensure we have a consistent final_video path
    // Copy video_merged to final_video.mp4 for consistency
    const finalVideoPath = path.join(folder, "final_video.mp4");
    if (video_merged !== finalVideoPath) {
      fs.copyFileSync(video_merged, finalVideoPath);
      finalOutputPath = finalVideoPath;
    }
  }

  await updateJSONOutput(folder, safeTitle, {
    final_video: finalOutputPath,
    video_status: "completed",
  });


  return {
    ...input,
    final_video: finalOutputPath,
  };
}
