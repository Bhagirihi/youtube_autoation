import { promptYoutubeSEO } from "../Prompt/index.js";
import { genAI } from "../index.js";

/**
 * Parse Markdown from promptYoutubeSEO (movie explain) into youtube_title, description, tags, hashtags.
 * Handles ## 0. / ## 0️. / ## 3. etc. (digit with optional emoji/variation before the dot).
 */
function parseYoutubeSEOMarkdown(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const lines = rawText.split("\n");
  const sections = {};
  let currentKey = null;
  let currentLines = [];
  for (const line of lines) {
    const heading = line.match(/^##\s*(\d+)\s*[.\s\uFE0F\u200D]*/);
    if (heading) {
      if (currentKey !== null) {
        sections[currentKey] = currentLines.join("\n").trim();
      }
      currentKey = heading[1];
      currentLines = [];
    } else if (currentKey !== null && line.trim()) {
      currentLines.push(line);
    }
  }
  if (currentKey !== null) {
    sections[currentKey] = currentLines.join("\n").trim();
  }
  const title = (sections["0"] || "").split("\n")[0].trim();
  const desc = (sections["3"] || sections["4"] || "").trim();
  const tagsStr = (sections["5"] || "").trim();
  const tags = tagsStr
    .split(",")
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean);
  const hashtags = (sections["6"] || "").trim();
  return {
    youtube_title: title || null,
    youtube_description: desc || null,
    youtube_tags: tags.length ? tags : null,
    youtube_hashtags: hashtags || null,
  };
}

/**
 * Get YouTube SEO for CinePlot Decode (movie explain). Uses promptYoutubeSEO and parses Markdown.
 */
export async function getYoutubeMovieSEO(movieTitle) {
  if (!movieTitle || typeof movieTitle !== "string") return null;
  try {
    const prompt = await promptYoutubeSEO(movieTitle);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.6 },
    });
    const { response } = await model.generateContent(prompt.trim());
    const rawText = response?.text?.() ?? "";
    if (!rawText) return null;
    const parsed = parseYoutubeSEOMarkdown(rawText);
    if (
      parsed &&
      (parsed.youtube_title || parsed.youtube_description || parsed.youtube_tags)
    ) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn("⚠️ YouTube Movie SEO generation failed:", err.message);
    return null;
  }
}
