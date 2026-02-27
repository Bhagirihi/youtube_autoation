/**
 * CLI entry for YouTube upload (and optional Google Drive) after pipeline (e.g. from GitHub Actions).
 * Reads temp/story.json and uploads output/final.mp4 + thumbnails/thumb.jpg.
 * Set DRIVE_UPLOAD=1 to also push video, thumbnail and metadata to Google Drive.
 */
import path from "path";
import fs from "fs-extra";
import "dotenv/config";
import { uploadYoutube } from "./uploadYoutube.js";
import { uploadToGoogleDrive } from "./uploadToGoogleDrive.js";

const baseDir = () => process.env.DATA_DIR || process.cwd();

function getMeta(story) {
  const root = baseDir();
  return {
    title: story.title || "Horror Story",
    description: story.description || "",
    tags: Array.isArray(story.tags) ? story.tags : [],
    privacyStatus: process.env.YT_PRIVACY_STATUS || "public",
    thumbnailPath: path.join(root, "thumbnails", "thumb.jpg"),
  };
}

async function main() {
  const storyPath = path.join(baseDir(), "temp", "story.json");
  if (!(await fs.pathExists(storyPath))) {
    throw new Error("temp/story.json not found. Run the pipeline first.");
  }
  const story = await fs.readJson(storyPath);
  const meta = getMeta(story);

  const driveUpload =
    process.env.DRIVE_UPLOAD === "1" || process.env.DRIVE_UPLOAD === "true";
  if (driveUpload) {
    const result = await uploadToGoogleDrive(meta);
    console.log("Drive folder:", result.folderLink);
  }

  const videoId = await uploadYoutube(meta);
  console.log("Video ID:", videoId);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
