import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const THUMB_W = 1280;
const THUMB_H = 720;

function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function generateThumbnail(title, subtitle = "Hindi Horror Story") {
  await fs.ensureDir(path.join(projectRoot, "thumbnails"));
  const bgPath = path.join(projectRoot, "images", "scene_1.jpg");
  if (!(await fs.pathExists(bgPath))) {
    throw new Error("images/scene_1.jpg not found. Run the Images step first.");
  }

  const templatePath = path.join(projectRoot, "templates", "thumbnail.html");
  let html = await fs.readFile(templatePath, "utf-8");
  const imageBuffer = await fs.readFile(bgPath);
  const imageDataUrl = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;
  html = html
    .replace("{{IMAGE_DATA_URL}}", imageDataUrl)
    .replace("{{MAIN_TITLE}}", escapeHtml(title || "Horror Story"))
    .replace("{{SUB_TITLE}}", escapeHtml(subtitle));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: THUMB_W, height: THUMB_H });
  await page.setContent(html, { waitUntil: "networkidle" });
  const thumbPath = path.join(projectRoot, "thumbnails", "thumb.jpg");
  await page.screenshot({
    path: thumbPath,
    type: "jpeg",
    quality: 92,
  });
  await browser.close();
  console.log("✅ Thumbnail generated (thumbnails/thumb.jpg) — 16:9, Horror Podcast Adda style");
}
