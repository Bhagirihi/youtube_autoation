/**
 * Regenerate only description and tags for an existing story (temp/story.json).
 * Uses Gemini with the same key as story generation. Updates story.json in place.
 */
import fs from "fs-extra";
import path from "path";
import { getStoryKey, MODELS } from "./geminiKeys.js";

const getTempDir = () => path.join(process.env.DATA_DIR || process.cwd(), "temp");
const TAG_NAME = "Horror Podcast Adda";

function ensureTagInDescriptionAndTags(data) {
  if (data.description && !data.description.includes(TAG_NAME)) {
    data.description = data.description.trim() + "\n\n" + TAG_NAME;
  }
  if (Array.isArray(data.tags) && !data.tags.some((t) => String(t).trim() === TAG_NAME)) {
    data.tags = [...data.tags, TAG_NAME];
  }
}

function parseJson(raw) {
  raw = (raw || "").trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  return JSON.parse(raw);
}

export async function regenerateDescriptionTags() {
  const tempDir = getTempDir();
  const storyPath = path.join(tempDir, "story.json");
  if (!(await fs.pathExists(storyPath))) {
    throw new Error("temp/story.json not found. Run the Story step first.");
  }

  const story = await fs.readJson(storyPath);
  const title = story.title || "Hindi Horror Story";
  const storyText = story.story || "";

  const promptTemplate = await fs.readFile(
    path.join(process.env.DATA_DIR || process.cwd(), "prompts", "regenerate-description-tags.prompt.txt"),
    "utf-8"
  );
  const userPart = `TITLE:\n${title}\n\nSTORY:\n${storyText}`;
  const prompt = `${promptTemplate}\n\n---\n\n${userPart}`;

  const apiKey = await getStoryKey();
  if (!apiKey) {
    throw new Error("No Gemini key. Set GEMINI_MASTER_API_KEY or GEMINI_STORY_API_KEY in .env.");
  }

  let lastErr;
  for (const model of MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            },
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        lastErr = new Error(body?.error?.message || `Gemini ${res.status}`);
        continue;
      }
      const text = body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.();
      if (!text) {
        lastErr = new Error("Gemini returned no text");
        continue;
      }
      const parsed = parseJson(text);
      if (typeof parsed.description === "string") story.description = parsed.description.trim();
      if (Array.isArray(parsed.tags)) story.tags = parsed.tags.map((t) => String(t).trim()).filter(Boolean);
      ensureTagInDescriptionAndTags(story);
      await fs.writeJson(storyPath, story, { spaces: 2 });
      console.log("✅ Description and tags regenerated");
      return story;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("Failed to regenerate description and tags");
}
