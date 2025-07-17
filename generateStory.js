// generateStory.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  generateFolderFile,
  horrorPrompt,
  sleep,
} from "./utils/commonFunction.js";

export default async function generateStory() {
  console.log("📖 Generating story using Gemini...");
  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");

  const promptText = await horrorPrompt();
  console.log("promptText", promptText.trim());

  const gen = new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({
    model: "gemini-1.5-flash", //gemini-1.5-flash	1,000,000 gpt-3.5-turbo	16,385 gpt-4	8,192 gpt-4-32k	32,768 gpt-4o	128,000
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 8192, // can go higher (up to ~32K+)
    },
    retryDelay: "30s",
  });

  await sleep(2000 + Math.random() * 3000); // 2–5 sec delay

  const { response } = await gen.generateContent(promptText.trim());
  const rawOut = await extractJSONBlock(response.text());

  console.log("rawOut", rawOut);
  /*
  rawOut = {
    title: "Story Title",
    cover_image: "https://example.com/cover.jpg",
    image_tags: ["tag1", "tag2", "tag3"],
    intro: "Story Introduction",
    build_up: "Story Build-up",
    suspense: "Story Suspense",
    twist: "Story Twist",
    ending_line: "Story Ending Line",
  }
  */

  const aiOutput = JSON.parse(rawOut);
  const title = extractTitle(aiOutput.title);
  const safeTitle = sanitizeFilename(aiOutput.title);
  await generateFolderFile(`stories/${safeTitle}`, "story", rawOut);

  console.log("✅ Story generated:", { title, ...aiOutput });

  return {
    title,
    ...aiOutput,
  };
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
  return text
    .replace(/```json\s*/, "") // Remove opening ```json
    .replace(/```$/, "") // Remove closing ```
    .trim();
}
