/**
 * Run only the video step. Uses existing voiceover/narration.mp3, images/scene_*.jpg,
 * and temp/paragraph_timings.json (if present) for paragraph-synced durations.
 *
 * Usage: node scripts/runVideoOnly.js
 */
import "dotenv/config";
import path from "path";
import fs from "fs-extra";
import { makeVideo } from "./makeVideo.js";

function getTempDir() {
  return path.join(process.env.DATA_DIR || process.cwd(), "temp");
}

async function main() {
  console.log("Running video step only…\n");

  let segmentDurations = null;
  try {
    const timingsPath = path.join(getTempDir(), "paragraph_timings.json");
    const timings = await fs.readJson(timingsPath);
    segmentDurations = timings.map((t) => t.duration);
    console.log(`Using paragraph timings (${segmentDurations.length} segments).\n`);
  } catch {
    console.log("No paragraph_timings.json — using equal split across available images.\n");
  }

  await makeVideo(segmentDurations ?? 1);
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
