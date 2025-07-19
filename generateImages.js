import axios from "axios";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function generateImages(storyData) {
  const results = [];
  const resultsThumbnails = [];
  const tags = storyData.image_tags;
  const thumbnailsTags = storyData.youtube_thumbnails;
  const UNSPLASH_KEY = process.env.UNSPLASH_API_KEY;

  if (!UNSPLASH_KEY) throw new Error("❌ UNSPLASH_API_KEY missing");

  // 🔧 Prepare nested image folder: story/{title}/images
  const safeTitle = sanitizeFolderName(storyData.title);
  const imageFolder = path.join(__dirname, "stories", safeTitle, "images");
  const YTimageFolder = path.join(
    __dirname,
    "stories",
    safeTitle,
    "images",
    "thumbnails"
  );

  if (!fs.existsSync(imageFolder)) {
    fs.mkdirSync(imageFolder, { recursive: true });
  }
  if (!fs.existsSync(YTimageFolder)) {
    fs.mkdirSync(YTimageFolder, { recursive: true });
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
      const name = await sanitizeFilename(tag);
      if (photo) {
        const imageUrl = photo.urls.full;
        const filename = `${name}.jpg`;
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

  for (const tag of thumbnailsTags) {
    const searchQuery = `${tag}`;

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
      const name = await sanitizeFilename(tag);
      if (photo) {
        const imageUrl = photo.urls.full;
        const filename = `${name}.jpg`;
        const filePath = path.join(YTimageFolder, filename);

        // ⬇️ Download image
        const imgRes = await axios.get(imageUrl, { responseType: "stream" });
        const writer = fs.createWriteStream(filePath);
        imgRes.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });

        console.log(`✅ Downloaded: ${filename}`);
        resultsThumbnails.push(filePath);
      } else {
        console.log(`⚠️ No image found for: ${tag}`);
        resultsThumbnails.push({ tag, error: "No image found" });
      }
    } catch (err) {
      console.error(`❌ Error for "${tag}":`, err.message);
      results.push({ tag, error: err.message });
    }
  }

  return {
    storyData,
    ...results,
    ...resultsThumbnails,
  };
}

// ✅ Sanitize filename to prevent errors
function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .replace(/-/g, "_") // convert hyphens to underscores
    .replace(/[^\w\s._]/g, "") // remove all except letters, digits, underscore, dot, space
    .replace(/\s+/g, "_") // replace spaces with underscores
    .replace(/_+/g, "_") // collapse multiple underscores
    .replace(/[\._]+$/, "") // remove trailing dot/underscore
    .substring(0, 100); // limit length
}

function sanitizeFolderName(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}
