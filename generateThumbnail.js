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

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");
}

export default async function uploadToYoutube(videoData) {
  console.log("Uploading video:", videoData);
  const { title, selection } = videoData;
  const episode = await ask("Which Episode? ");
  rl.close();

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
    .replace("{{episode}}", episode)
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

  setTimeout(async () => {
    console.log("Hello after 2 seconds");
    await page.screenshot({ path: outputThumbnailPath, fullPage: true });
    await browser.close();

    console.log("✅ Thumbnail generated: thumbnail.png");
    console.log("🎬 Uploading video:", videoData.title);

    return { ...videoData, ...outputThumbnailPath };
  }, 2000);
}
