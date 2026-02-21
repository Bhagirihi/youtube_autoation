import path from "path";
import fs from "fs-extra";
import { chromium } from "playwright";

const baseDir = () => process.env.DATA_DIR || process.cwd();
const imagesDir = () => path.join(baseDir(), "images");

export async function downloadImages(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    console.warn("⚠ No image prompts — skipping image download.");
    return;
  }
  const dir = imagesDir();
  await fs.ensureDir(dir);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const horrorSuffix = " dark cinematic horror eerie night atmosphere no people 4k";
  const minSize = 8000; // skip tiny thumbnails (bytes)
  const maxCandidates = 5;

  for (let i = 0; i < scenes.length; i++) {
    const query = encodeURIComponent((scenes[i] + horrorSuffix).trim());
    const url = `https://www.bing.com/images/search?q=${query}&form=HDRSC2`;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const imgs = await page.$$("img.mimg");
    const candidates = [];
    for (const img of imgs.slice(0, maxCandidates)) {
      const src = await img.getAttribute("src");
      if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
        candidates.push(src);
      }
    }
    if (candidates.length === 0) {
      const fallback = await page.$(".mimg");
      if (fallback) {
        const src = await fallback.getAttribute("src");
        if (src) candidates.push(src);
      }
    }

    let bestBuffer = null;
    for (const src of candidates) {
      try {
        const res = await fetch(src, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) continue;
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length >= minSize && (!bestBuffer || buffer.length > bestBuffer.length)) {
          bestBuffer = buffer;
        }
      } catch (_) {}
    }
    if (bestBuffer) {
      await fs.writeFile(path.join(dir, `scene_${i + 1}.jpg`), bestBuffer);
      console.log(`🖼 Downloaded image ${i + 1}`);
    } else {
      console.warn(`⚠ No suitable image for scene ${i + 1} (tried ${candidates.length} candidates) — using placeholder`);
      let written = false;
      try {
        const placeholderUrl = `https://picsum.photos/seed/horror${i + 1}/800/600`;
        const res = await fetch(placeholderUrl, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(path.join(dir, `scene_${i + 1}.jpg`), buffer);
          written = true;
        }
      } catch (e) {
        console.warn(`⚠ Placeholder failed for scene ${i + 1}:`, e?.message || e);
      }
      if (!written) {
        const minimalJpeg = Buffer.from(
          "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
          "base64"
        );
        await fs.writeFile(path.join(dir, `scene_${i + 1}.jpg`), minimalJpeg);
        console.log(`🖼 Scene ${i + 1}: fallback minimal image (Bing + placeholder failed)`);
      }
    }
  }

  await browser.close();
}
