// generateStory.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  generateFolderFile,
  horrorPrompt,
  sleep,
} from "./utils/commonFunction.js";
import {
  promptStory,
  promptStoryUtils,
  promptEnglishStory,
  promotEglishStoryUtils,
} from "./prompt.js";

function getRandomGeminiModel() {
  const models = ["gemini-1.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];

  const randomIndex = Math.floor(Math.random() * models.length);
  return models[randomIndex];
}

export default async function generateStory(storyData) {
  console.log(
    `Generating Story for ${
      storyData === "Hindi" ? "Horror Podcast Adda" : "Creeping Echoes"
    }`
  );
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");
  const randomModel = await getRandomGeminiModel();
  const gen = new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({
    model: randomModel, //gemini-1.5-flash	1,000,000 gpt-3.5-turbo	16,385 gpt-4	8,192 gpt-4-32k	32,768 gpt-4o	128,000
    generationConfig: {
      temperature: 0.85 + Math.random() * 0.1, // add jitter
      //maxOutputTokens: 8192, // can go higher (up to ~32K+)
    },
    retryDelay: "30s",
  });
  await sleep(2000 + Math.random() * 3000); // 2–5 sec delay
  const storyPrompt =
    storyData === "Hindi" ? await promptStory() : await promptEnglishStory();
  const dynamicPromptsStory = `${storyPrompt}\n\n// Generate story seed: ${Date.now()}`;

  const { response } = await gen.generateContent(dynamicPromptsStory.trim());
  const rawOut = await extractJSONBlock(response.text());

  const aiOutput = JSON.parse(rawOut);
  console.log("AI Output P1:", aiOutput);
  const title = extractTitle(aiOutput.title);
  const safeTitle = sanitizeFilename(aiOutput.title);
  const storyUtilsPrompt =
    storyData === "Hindi"
      ? await promotEglishStoryUtils(...Object.values(aiOutput))
      : await promptStoryUtils(...Object.values(aiOutput));
  const dynamicPromptsStoryUtils = `${storyUtilsPrompt}\n\n// Generate story seed: ${Date.now()}`;

  await sleep(2000 + Math.random() * 3000); // 2–5 sec delay

  const responseUtils = await gen.generateContent(
    dynamicPromptsStoryUtils.trim()
  );

  const rawUtilsOut = await extractJSONBlock(responseUtils.response.text());
  const aiOutputUtils = JSON.parse(rawUtilsOut);
  console.log("AI Output P2:", aiOutputUtils);

  const StoryData = {
    title,
    ...aiOutput,
    ...aiOutputUtils,
  };
  console.log("StoryData", StoryData);

  await generateFolderFile(`stories/${safeTitle}`, "story", StoryData);

  console.log("✅ Story generated:", { title, ...aiOutput, ...aiOutputUtils });

  return StoryData;
}

// ----------------------- Helper Functions -----------------------

function extractTitle(story) {
  const lines = story.split("\n").filter(Boolean);
  return lines[0].length < 100 ? lines[0] : "AI_Story";
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 50);
}

function extractJSONBlock(text) {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (match) {
    return match[1].trim();
  }

  // fallback: try to parse the first valid JSON-like object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  throw new Error("❌ No valid JSON block found in text");
}
