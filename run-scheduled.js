/**
 * Non-interactive entry point for running a pipeline on a schedule (cron, GitHub Actions, VPS, etc.).
 * No laptop needed – set CHANNEL in env and run: node run-scheduled.js
 *
 * Usage:
 *   CHANNEL=HorrorPodcastAdda node run-scheduled.js
 *   CHANNEL=CinePlotDecode node run-scheduled.js
 *   CHANNEL=CinePlotDecodeShorts node run-scheduled.js
 *
 * If CHANNEL is not set, runs a random channel (good for cron: one run = one video attempt).
 */
import dotenv from "dotenv";
import horrorPodcastAdda from "./src/channel/horrorPodcastAdda/index.js";
import cinePlotDecode from "./src/channel/cinePlotDecode/index.js";
import cinePlotDecodeShorts from "./src/refDoc/CPDChannels.js";

dotenv.config();

const CHANNELS = {
  HorrorPodcastAdda: horrorPodcastAdda,
  CinePlotDecode: () => cinePlotDecode("Movie Explain in Hindi"),
  CinePlotDecodeShorts: cinePlotDecodeShorts,
};

async function run() {
  let channel = process.env.CHANNEL;
  if (!channel || !CHANNELS[channel]) {
    const keys = Object.keys(CHANNELS);
    channel = keys[Math.floor(Math.random() * keys.length)];
    console.log(`CHANNEL not set or invalid; picked at random: ${channel}`);
  }
  const runPipeline = CHANNELS[channel];
  await runPipeline();
}

run().catch((err) => {
  console.error("Scheduled run failed:", err);
  process.exit(1);
});
