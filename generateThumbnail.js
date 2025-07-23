// uploadToYoutube.js
import readline from "node:readline";
import puppeteer from "puppeteer";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "node:url";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// 🔧 Utility to convert title to folder-safe format
const sanitizeTitle = (title) =>
  title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "_");

export default async function uploadToYoutube(videoData) {
  console.log("Uploading video:", videoData);
  const { title, selection } = videoData;
  const episode = await ask("Which Episode? ");
  rl.close();

  const storyFolderName = sanitizeTitle(title); // "The Stillness Beneath" → "The_Stillness_Beneath"
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
  const mimeType = imageFile.endsWith(".png") ? "image/png" : "image/jpeg";
  const base64Image = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  // 🔧 Replace placeholders
  const html = template
    .replace("{{title}}", videoData.title || "Untitled")
    .replace("{{episode}}", episode)
    .replace("{{image}}", base64Image);

  // 📸 Generate screenshot
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: "networkidle0" });

  await page.evaluateHandle("document.fonts.ready");
  // ✅ Wait until image is loaded
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const img = document.querySelector(".bg-image");
        if (img && img.complete) return resolve();
        img.onload = resolve;
        img.onerror = () => {
          console.error("❌ Image failed to load");
          resolve();
        };
      })
  );
  await page.screenshot({ path: outputThumbnailPath, fullPage: true });

  await browser.close();

  console.log("✅ Thumbnail generated: thumbnail.png");
  console.log("🎬 Uploading video:", videoData.title);

  return { ...videoData, ...outputThumbnailPath };
}
