import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import puppeteer from "puppeteer";
import sharp from "sharp";
import { updateJSONOutput } from "../../helper/index.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Thumbnail template and fonts live in src/helper/thumbnails (no ref dependency)
const THUMB_BASE = path.join(process.cwd(), "src", "helper", "thumbnails");
const THUMB_FONTS = path.join(THUMB_BASE, "fonts");
const HINDI_TEMPLATE = "hindi.html";

/**
 * Generate YouTube thumbnail for Horror Podcast Adda.
 * Uses first image from folder/images as background, renders an HTML layout with Puppeteer,
 * and saves the result to folder/thumbnail.png.
 */
export default async function generateThumbnail(input) {
  const { storyData, folder, safeTitle } = input;

  const displayTitle = storyData?.display_title || storyData?.title;
  if (!displayTitle) {
    throw new Error("❌ Story data missing display_title or title");
  }

  const imagesDir = path.join(folder, "images");
  const outputThumbnailPath = path.join(folder, "thumbnail.png");

  // Skip if thumbnail already exists and is marked completed
  try {
    const jsonFiles = fs.readdirSync(folder).filter((f) => f.endsWith(".json"));
    if (jsonFiles.length > 0) {
      const state = JSON.parse(fs.readFileSync(path.join(folder, jsonFiles[0]), "utf-8"));
      if (state.thumbnail_status === "completed" && state.thumbnail_path && fs.existsSync(state.thumbnail_path)) {
        return { ...input, thumbnail_path: state.thumbnail_path };
      }
    }
  } catch {}

  if (!fs.existsSync(imagesDir)) {
    throw new Error(`❌ Images folder not found: ${imagesDir}`);
  }

  const files = await fsPromises.readdir(imagesDir);
  const imageFile = files.find((f) => /\.(jpg|jpeg|png)$/i.test(f));
  if (!imageFile) {
    throw new Error(`❌ No image (jpg/png) found in ${imagesDir}`);
  }

  const imagePath = path.join(imagesDir, imageFile);
  const imageBuffer = await fsPromises.readFile(imagePath);
  const mimeType = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const base64Image = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

  // Main title and optional subtitle (e.g. "Title: Subtitle")
  const fullTitle = String(displayTitle).trim();
  const parts = fullTitle.split(":");
  const mainTitle = (parts[0] || "").trim() || "Untitled";
  const subTitle = (parts[1] || "").trim();

  const episode = 1;
  const templatePath = path.join(THUMB_BASE, HINDI_TEMPLATE);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`❌ Thumbnail template not found: ${templatePath}`);
  }

  let template = await fsPromises.readFile(templatePath, "utf-8");
  const fontBase = `file://${path.resolve(THUMB_FONTS).replace(/\\/g, "/")}/`;
  template = template
    .replace(/\{\{font_path_base\}\}/g, fontBase)
    .replace("{{main_title}}", mainTitle)
    .replace("{{sub_title}}", subTitle)
    .replace("{{episode}}", String(episode))
    .replace("{{image}}", base64Image);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--allow-file-access-from-files", "--enable-local-file-accesses"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(template, {
      waitUntil: ["networkidle0", "domcontentloaded", "load"],
    });

    await sleep(5000);
    await page.evaluateHandle("document.fonts.ready");
    await page.evaluate(() => {
      document.querySelectorAll("img[loading='lazy']").forEach((img) => {
        img.loading = "eager";
        img.fetchPriority = "high";
      });
    });
    await page.evaluate(async () => {
      const pending = Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve);
              img.addEventListener("error", resolve);
            })
        );
      await Promise.all(pending);
    });

    const screenshotBuffer = await page.screenshot({ type: "png", fullPage: true });
    let finalBuffer = screenshotBuffer;
    if (screenshotBuffer.length > 2 * 1024 * 1024) {
      finalBuffer = await sharp(screenshotBuffer).png({ quality: 70 }).toBuffer();
    }

    await fsPromises.writeFile(outputThumbnailPath, finalBuffer);
  } finally {
    await browser.close();
  }

  await updateJSONOutput(folder, safeTitle, {
    thumbnail_path: outputThumbnailPath,
    thumbnail_status: "completed",
  });

  return {
    ...input,
    thumbnail_path: outputThumbnailPath,
  };
}
