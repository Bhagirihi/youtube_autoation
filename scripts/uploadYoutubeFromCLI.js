/**
 * CLI entry for YouTube upload after pipeline (e.g. from GitHub Actions).
 * Reads temp/story.json and uploads output/final.mp4 + thumbnails/thumb.jpg.
 * Requires env: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REDIRECT_URI, YT_REFRESH_TOKEN.
 */
import path from "path";
import fs from "fs-extra";
import "dotenv/config";
import { uploadYoutube } from "./uploadYoutube.js";

const baseDir = () => process.env.DATA_DIR || process.cwd();

async function main() {
  const storyPath = path.join(baseDir(), "temp", "story.json");
  if (!(await fs.pathExists(storyPath))) {
    throw new Error("temp/story.json not found. Run the pipeline first.");
  }
  const story = await fs.readJson(storyPath);
  const root = baseDir();
  const meta = {
    title: story.title || "Horror Story",
    description: story.description || "",
    tags: Array.isArray(story.tags) ? story.tags : [],
    privacyStatus: process.env.YT_PRIVACY_STATUS || "public",
    thumbnailPath: path.join(root, "thumbnails", "thumb.jpg"),
  };
  const videoId = await uploadYoutube(meta);
  console.log("Video ID:", videoId);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
