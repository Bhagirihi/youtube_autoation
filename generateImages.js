import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function generateImages(storyData) {
  console.log("🖼️ Generating images for:", storyData.title);

  const results = [];
  const tags = storyData.image_tags;
  const UNSPLASH_KEY = process.env.UNSPLASH_API_KEY;

  if (!UNSPLASH_KEY) throw new Error("❌ UNSPLASH_API_KEY missing");

  // 🔧 Prepare nested image folder: story/{title}/images
  const safeTitle = sanitizeFilename(storyData.title);
  const imageFolder = path.join(__dirname, "stories", safeTitle, "images");

  if (!fs.existsSync(imageFolder)) {
    fs.mkdirSync(imageFolder, { recursive: true });
  }

  for (const tag of tags) {
    const searchQuery = `${tag} horror story`;

    try {
      const res = await axios.get("https://api.unsplash.com/search/photos", {
        params: {
          query: searchQuery,
          per_page: 1,
          orientation: "landscape",
          content_filter: "high",
        },
        headers: {
          Authorization: `Client-ID ${UNSPLASH_KEY}`,
        },
      });

      const photo = res.data.results?.[0];
      if (photo) {
        const imageUrl = photo.urls.full;
        const filename = `${sanitizeFilename(tag)}.jpg`;
        const filePath = path.join(imageFolder, filename);

        // ⬇️ Download image
        const imgRes = await axios.get(imageUrl, { responseType: "stream" });
        const writer = fs.createWriteStream(filePath);
        imgRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        console.log(`✅ Downloaded: ${filename}`);
        results.push(filePath);
      } else {
        console.log(`⚠️ No image found for: ${tag}`);
        results.push({ tag, error: "No image found" });
      }
    } catch (err) {
      console.error(`❌ Error for "${tag}":`, err.message);
      results.push({ tag, error: err.message });
    }
  }

  return {
    storyData,
    ...results,
  };
}

// ✅ Sanitize filename to prevent errors
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // remove invalid
    .replace(/\s+/g, "_") // replace spaces with underscores
    .substring(0, 100);
}
