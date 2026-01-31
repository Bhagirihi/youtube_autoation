import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

import {
  promptStoryTitle,
  promptStory,
  promptYoutubeHPASEO,
} from "../Prompt/index.js";

import {
  extractJSONBlock,
  getRandomGeminiModel,
  retryWithBackoff,
  genAI,
} from "../index.js";

dotenv.config();

/* ────────────────────────────────────────────────
   Core Prompt Executor
──────────────────────────────────────────────── */

async function parseAIJson(rawText) {
  console.log("🎯 Parsing AI response...", rawText);
  let jsonBlock;
  try {
    jsonBlock = await extractJSONBlock(rawText);
    const dataParsed = JSON.parse(jsonBlock);
    return dataParsed;
  } catch (error) {
    console.error("❌ JSON Parse Error:", error.message);
    console.error(
      "📄 Problematic JSON (first 1000 chars):",
      jsonBlock?.substring(0, 1000)
    );

    // Try to fix common JSON issues and retry
    if (jsonBlock) {
      try {
        // Remove trailing commas before closing braces/brackets
        let fixedJson = jsonBlock.replace(/,\s*([}\]])/g, "$1");
        // Try parsing the fixed JSON
        const dataParsed = JSON.parse(fixedJson);
        console.log(
          "✅ Fixed JSON (removed trailing commas) and parsed successfully"
        );
        return dataParsed;
      } catch (retryError) {
        console.error("❌ Failed to fix JSON:", retryError.message);
        // Log more context around the error position
        const positionMatch = error.message.match(/position (\d+)/);
        if (positionMatch) {
          const pos = parseInt(positionMatch[1]);
          const start = Math.max(0, pos - 50);
          const end = Math.min(jsonBlock.length, pos + 50);
          console.error(
            "📍 Context around error:",
            jsonBlock.substring(start, end)
          );
        }
        throw new Error(`JSON parsing failed: ${error.message}`);
      }
    }
    throw error;
  }
}

async function executePrompt(prompt) {
  return retryWithBackoff(
    async () => {
      // Use default genAI client from helper/index.js
      // const modelName = String(await getRandomGeminiModel());
      // console.log(`🎯 Using Gemini model: ${modelName}`);

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.85 + Math.random() * 0.1,
        },
      });

      const finalPrompt = `${prompt}\n\n// Seed: ${Date.now()}`;
      const { response } = await model.generateContent(finalPrompt.trim());

      const rawText = response.text();
      console.log("🎯 Raw Response:", JSON.stringify(rawText));

      const storyData = await parseAIJson(rawText);
      console.log("✅ Parsed JSON object:", storyData);

      return storyData;
    },
    {
      retries: 3,
      baseDelay: 3000,
      maxDelay: 60000,
    }
  );
}

/* ────────────────────────────────────────────────
   Public APIs
──────────────────────────────────────────────── */
export async function generateAITitles() {
  const prompt = await promptStoryTitle();
  return await executePrompt(prompt.toString());
}

export async function generateAIStory(title) {
  if (!title) throw new Error("❌ Title is required");
  const prompt = await promptStory(title);
  return await executePrompt(prompt.toString());
}

/**
 * Get YouTube SEO metadata (title, description, tags, hashtags) for Horror Podcast Adda upload.
 * Calls Gemini with promptYoutubeHPASEO and returns parsed JSON. Returns null on error.
 */
export async function getYoutubeHPASEO(storyTitle) {
  if (!storyTitle || typeof storyTitle !== "string") return null;
  try {
    const prompt = await promptYoutubeHPASEO(storyTitle);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.6 },
    });
    const { response } = await model.generateContent(prompt.trim());
    const rawText = response?.text?.() ?? "";
    if (!rawText) return null;
    const parsed = await parseAIJson(rawText);
    if (
      parsed &&
      (parsed.youtube_title ||
        parsed.youtube_description ||
        parsed.youtube_tags)
    ) {
      return parsed;
    }
    return null;
  } catch (err) {
    console.warn("⚠️ YouTube HPA SEO generation failed:", err.message);
    return null;
  }
}
