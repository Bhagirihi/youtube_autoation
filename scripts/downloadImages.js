import fs from "fs-extra";
import { chromium } from "playwright";

export async function downloadImages(scenes) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    console.warn("⚠ No image prompts — skipping image download.");
    return;
  }
  await fs.ensureDir("images");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (let i = 0; i < scenes.length; i++) {
    const query = encodeURIComponent(scenes[i] + " cinematic horror");
    const url = `https://www.bing.com/images/search?q=${query}&form=HDRSC2`;

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    const img = await page.$("img.mimg");
    if (!img) {
      console.warn(`⚠ No image found for scene ${i + 1}, trying fallback selector`);
      const fallback = await page.$(".mimg");
      if (fallback) {
        const src = await fallback.getAttribute("src");
        if (src) {
          const res = await fetch(src);
          const buffer = Buffer.from(await res.arrayBuffer());
          await fs.writeFile(`images/scene_${i + 1}.jpg`, buffer);
          console.log(`🖼 Downloaded image ${i + 1}`);
        }
      }
      continue;
    }
    const src = await img.getAttribute("src");
    if (!src) {
      console.warn(`⚠ No src for scene ${i + 1}`);
      continue;
    }
    const res = await fetch(src);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(`images/scene_${i + 1}.jpg`, buffer);
    console.log(`🖼 Downloaded image ${i + 1}`);
  }

  await browser.close();
}
