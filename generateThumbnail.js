// uploadToYoutube.js
import readline from "node:readline";
import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import sharp from "sharp";

const API_KEY = process.env.YOUTUBE_API_KEY; // Replace with your API key
const youtube = google.youtube({ version: "v3", auth: API_KEY });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// 🔧 Utility to convert title to folder-safe format

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");
}

async function getChannelIdFromHandle(handle) {
  const res = await youtube.search.list({
    part: "snippet",
    q: handle, // e.g. "@HorrorPodcastAdda"
    type: "channel",
    maxResults: 1,
  });

  if (res.data.items && res.data.items.length > 0) {
    return res.data.items[0].snippet.channelId;
  } else {
    throw new Error("Channel not found");
  }
}

async function staticsToYoutube() {
  try {
    // Step 1: Resolve @handle → channelId
    const channelId = await getChannelIdFromHandle("@HorrorPodcastAdda");

    // Step 2: Fetch stats
    const res = await youtube.channels.list({
      part: "statistics",
      id: channelId,
    });

    if (res.data.items && res.data.items.length > 0) {
      const stats = res.data.items[0].statistics;
      console.log(`📺 Total Videos: ${stats.videoCount}`);
      return stats.videoCount;
    } else {
      console.log("❌ No stats found");
      return null;
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

export default async function uploadToYoutube(videoData) {
  console.log("Uploading video:", videoData);
  const { title, selection } = videoData;
  const episode = await staticsToYoutube();
  var NewEpisode = Number(episode) + 1;
  const storyFolderName = sanitizeFilename(title); // "The Stillness Beneath" → "The_Stillness_Beneath"
  const thumbnailsDir = path.join(
    __dirname,
    "stories",
    storyFolderName,
    "images",
    "thumbnails"
  );

  const thumbnailsDirOut = path.join(
    __dirname,
    "stories",
    storyFolderName,
    "output"
  );

  console.log(`📁 Looking in: ${thumbnailsDir}`);

  // 🔍 Find the first image
  const files = await fs.readdir(thumbnailsDir);
  const imageFile = files.find((file) => /\.(jpg|jpeg|png)$/i.test(file));

  if (!imageFile) {
    console.error("❌ No image found in thumbnails folder.");
    return;
  }

  const imagePath = path.join(thumbnailsDir, imageFile);
  const outputThumbnailPath = path.join(thumbnailsDirOut, "thumbnail.png");
  const htmlFile =
    selection === "Hindi" ? "thumbnail_Hindi.html" : "thumbnail_English.html";
  const template = await fs.readFile(htmlFile, "utf-8");
  const imageBuffer = await fs.readFile(imagePath);
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
  const base64Image = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  const thumbnailsDir_1 = path.join(__dirname, "logos", "T1.png");
  const buffer = await fs.readFile(thumbnailsDir_1);
  const base64Logo = `data:image/png;base64,${buffer.toString("base64")}`;

  // 🔧 Replace placeholders
  const html = template
    .replace("{{title}}", videoData.title || "Untitled")
    .replace("{{episode}}", NewEpisode)
    .replace("{{image}}", base64Image)
    .replace("{{image_1}}", base64Logo);
  // .replace("{{image}}", `file://${imagePath}`);

  // 📸 Generate screenshot
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--allow-file-access-from-files", "--enable-local-file-accesses"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  console.log("📸 Generating thumbnail...", html);
  await page.setContent(html, { waitUntil: "networkidle0" });

  await page.evaluateHandle("document.fonts.ready");
  // ✅ Wait until image is loaded
  // ✅ Wait until background image is applied to .bg div

  await page.evaluate(() => {
    document.querySelectorAll("img[loading='lazy']").forEach((img) => {
      img.loading = "eager";
      img.fetchPriority = "high";
    });
  });

  await page.evaluate(async () => {
    const selectors = Array.from(document.images).map((img) => {
      if (img.complete) return;
      return new Promise((resolve) => {
        img.addEventListener("load", resolve);
        img.addEventListener("error", resolve);
      });
    });
    await Promise.all(selectors);
  });

  const screenshotBuffer = await page.screenshot({
    type: "png",
    path: outputThumbnailPath,
    fullPage: true,
  });
  // Compress further with sharp if >2MB
  let finalBuffer = screenshotBuffer;
  if (screenshotBuffer.length > 2 * 1024 * 1024) {
    finalBuffer = await sharp(screenshotBuffer)
      .png({ quality: 70 }) // lower quality if needed
      .toBuffer();
  }

  // Save to file
  await fs.writeFile(outputThumbnailPath, finalBuffer);

  await browser.close();

  console.log(
    `✅ Thumbnail generated: ${outputThumbnailPath} (${(finalBuffer.length / 1024).toFixed(1)} KB)`
  );
  console.log("🎬 Uploading video:", videoData.title);

  return { ...videoData, ...outputThumbnailPath };
}
