/**
 * Run only Step 3 – Generate audio (for testing).
 * Requires temp/story.json and temp/story.txt from a previous pipeline run.
 *
 * Usage: node scripts/runAudioOnly.js
 */
import "dotenv/config";
import { generateAudio } from "./generateAudio.js";

async function main() {
  console.log("Running audio step only…\n");
  await generateAudio();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
