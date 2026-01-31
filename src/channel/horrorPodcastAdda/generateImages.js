import path from "path";
import fs from "fs";
import axios from "axios";
import { updateJSONOutput } from "../../helper/index.js";

const UNSPLASH_SEARCH_URL = "https://api.unsplash.com/search/photos";

/**
 * Download image from URL to file path
 */
async function downloadImage(url, outPath) {
  const response = await axios.get(url, {
    responseType: "stream",
    timeout: 60000,
  });
  const writer = fs.createWriteStream(outPath);
  response.data.pipe(writer);
  await new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

/**
 * Sanitize tag for use in filename (sync, for local file names only)
 */
function sanitizeTagForFilename(tag) {
  if (typeof tag !== "string") return `image`;
  return String(tag)
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/[^\w\s._]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/[._]+$/, "")
    .slice(0, 40) || "image";
}

/**
 * Generate images for Horror Podcast Adda story
 * Uses Unsplash API to fetch images based on image_tags from story (ref: YT_v3)
 */
export default async function generateImages(input) {
  const { storyData, folder, safeTitle } = input;

  const imagesDir = path.join(folder, "images");
  
  // Check if images already exist and are marked as completed
  if (fs.existsSync(imagesDir)) {
    try {
      const jsonFiles = fs.readdirSync(folder).filter(f => f.endsWith('.json'));
      if (jsonFiles.length > 0) {
        const jsonPath = path.join(folder, jsonFiles[0]);
        const state = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        
        if (state.images_status === "completed" && Array.isArray(state.images) && state.images.length > 0) {
          // Verify images actually exist on disk
          const allImagesExist = state.images.every(img => fs.existsSync(img.path));
          const imageFiles = fs.readdirSync(imagesDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
          
          if (allImagesExist && imageFiles.length >= state.images.length) {
            return {
              ...input,
              images: state.images,
              imagesDir,
              images_status: "completed",
            };
          }
        }
      }
    } catch (err) {
      // If JSON read fails, continue with generation
    }
  }

  const { image_tags } = storyData;
  const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_API_KEY;

  if (!UNSPLASH_KEY) {
    throw new Error("❌ UNSPLASH_ACCESS_KEY or UNSPLASH_API_KEY missing in .env");
  }

  if (!image_tags || !Array.isArray(image_tags) || image_tags.length === 0) {
    console.warn("⚠️ No image_tags found in story data. Skipping image generation.");
    return {
      ...input,
      images: [],
      images_status: "skipped",
      imagesDir: path.join(folder, "images"),
    };
  }

  if (!fs.existsSync(imagesDir)) {
    fs.mkdirSync(imagesDir, { recursive: true });
  }

  const generatedImages = [];
  const tags = image_tags.slice(0, 10);


  for (let i = 0; i < tags.length; i++) {
    const tag = typeof tags[i] === "string" ? tags[i] : String(tags[i]);
    const searchQuery = `${tag} horror dark atmosphere`;

    try {
      const res = await axios.get(UNSPLASH_SEARCH_URL, {
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
      if (!photo?.urls?.full) {
        console.warn(`⚠️ No image found for: "${tag}"`);
        continue;
      }

      const safeName = sanitizeTagForFilename(tag);
      const imageName = `image_${i + 1}_${safeName}.jpg`;
      const imagePath = path.join(imagesDir, imageName);

      await downloadImage(photo.urls.full, imagePath);

      generatedImages.push({
        path: imagePath,
        prompt: tag,
        index: i + 1,
      });

    } catch (err) {
      console.error(`❌ Failed to fetch image for "${tag}":`, err.message);
    }
  }

  await updateJSONOutput(folder, safeTitle, {
    images: generatedImages,
    images_status: generatedImages.length > 0 ? "completed" : "failed",
  });


  return {
    ...input,
    images: generatedImages,
    imagesDir,
    images_status: generatedImages.length > 0 ? "completed" : "failed",
  };
}
