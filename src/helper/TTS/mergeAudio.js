import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import ffmpeg from "fluent-ffmpeg";
import { getDuration } from "../index.js";

export default async function mergeAudios(
  folder = "/Users/dhruvdave/Documents/Dhruv/AI_CODE/NEW_YT/YTAutomation/src/output/cinePlotDecode"
) {
  const volumeDir = path.join(folder, "volume");
  const output = path.join(folder, "merger.mp3");
  const videoPath = path.join(folder, "video.mp4");
  const listFile = path.join(folder, "mergelist.txt");

  try {
    let files = await fs.readdir(volumeDir);

    files = files.filter(
      (f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".m4a")
    );
    files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) {
      console.log("❌ No audio files found inside /volume folder to merge.");
      return;
    }

    console.log("\n==============================");
    console.log(`🔊 AUDIO MERGE STARTED (${files.length} files)`);
    console.log("==============================\n");

    const listContent = files
      .map((file) => `file '${path.join(volumeDir, file)}'`)
      .join("\n");

    await fs.writeFile(listFile, listContent);

    // ↓↓↓ AUTO DURATION DETECTION ↓↓↓
    console.log("⏳ Detecting durations...");
    let videoDuration = 0;
    if (fsSync.existsSync(videoPath)) {
      videoDuration = await getDuration(videoPath);
    } else {
      console.warn("⚠️ video.mp4 not found; merging at normal speed.");
    }

    let totalAudioDuration = 0;
    for (const file of files) {
      totalAudioDuration += await getDuration(path.join(volumeDir, file));
    }

    console.log(`🎬 Video Duration: ${videoDuration}s`);
    console.log(`🎧 Audio Duration: ${totalAudioDuration}s`);
    
    // ↓↓↓ CALCULATE EXACT SPEED ↓↓↓
    // Validate video duration to avoid division by zero
    let speed = 1.0; // Default: no speed adjustment
    let audioFilter = null;
    
    if (videoDuration <= 0) {
      console.warn("⚠️ Video duration is 0 or invalid. Skipping speed adjustment.");
    } else {
      const rawSpeed = totalAudioDuration / videoDuration;
      
      // FFmpeg atempo filter only accepts values between 0.5 and 2.0
      // If speed is outside this range, we need to chain multiple atempo filters
      if (rawSpeed < 0.5) {
        // Too slow - use minimum atempo and accept longer audio
        console.warn(`⚠️ Speed ${rawSpeed.toFixed(4)} is too slow. Using minimum atempo (0.5)`);
        speed = 0.5;
        audioFilter = `atempo=0.5`;
      } else if (rawSpeed > 2.0) {
        // Too fast - chain multiple atempo filters
        // Calculate how many filters we need (each can do max 2.0x)
        const numFilters = Math.ceil(Math.log(rawSpeed) / Math.log(2.0));
        const perFilterSpeed = Math.pow(rawSpeed, 1 / numFilters);
        
        if (perFilterSpeed > 2.0) {
          // Even with chaining, we can't achieve this speed - cap at 2.0
          console.warn(`⚠️ Speed ${rawSpeed.toFixed(4)} is too extreme. Using max speed (2.0) with ${numFilters} filters`);
          speed = 2.0;
          audioFilter = Array(numFilters).fill('atempo=2.0').join(',');
        } else {
          // Chain filters with calculated per-filter speed
          speed = perFilterSpeed;
          const clampedSpeed = Math.max(0.5, Math.min(2.0, perFilterSpeed));
          audioFilter = Array(numFilters).fill(`atempo=${clampedSpeed.toFixed(3)}`).join(',');
          console.log(`ℹ️ Chaining ${numFilters} atempo filters (${clampedSpeed.toFixed(3)} each)`);
        }
      } else {
        // Speed is within valid range
        speed = rawSpeed;
        // Only apply filter if speed is not 1.0 (no adjustment needed)
        if (Math.abs(speed - 1.0) > 0.001) {
          audioFilter = `atempo=${speed.toFixed(3)}`;
        }
      }
    }

    console.log(`⚡ Calculated Speed: ${speed.toFixed(4)}`);

    console.log("\n⚙️ Running FFmpeg merge + speed...");
    console.log("------------------------------");

    await new Promise((resolve, reject) => {
      const ffmpegCommand = ffmpeg()
        .input(listFile)
        .inputOptions(["-f concat", "-safe 0"])
        .audioCodec("libmp3lame")
        .audioBitrate("320k");

      // Apply speed filter only if we have a valid filter string
      if (audioFilter && typeof audioFilter === "string") {
        ffmpegCommand.audioFilters(audioFilter);
      }

      ffmpegCommand
        .on("progress", (p) => {
          process.stdout.write(`⏳ Merging... ${p.percent?.toFixed(1)}% \r`);
        })
        .on("end", async () => {
          console.log("\n------------------------------");
          console.log("✅ Merge Completed Successfully!");
          console.log("📄 Output File:", output);
          await fs.unlink(listFile).catch(() => {});
          console.log("==============================\n");
          resolve(output);
        })
        .on("error", async (err, stdout, stderr) => {
          console.error("\n❌ FFmpeg Error:", err.message);
          await fs.unlink(listFile).catch(() => {});
          reject(err);
        })
        .save(output);
    });

    return output;
  } catch (err) {
    console.error("❌ Error in mergeAudios:", err.message);
    await fs.unlink(listFile).catch(() => {});
    throw err; // Re-throw to be caught by the main execution function
  }
}
