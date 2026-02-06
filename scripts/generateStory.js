import fs from "fs-extra";
import path from "path";
import { checkGeminiKeys, MODELS } from "./geminiKeys.js";

const getTempDir = () => path.join(process.env.DATA_DIR || process.cwd(), "temp");

export async function generateStory() {
  const prompt = await fs.readFile("prompts/story.prompt.txt", "utf-8");
  let data;

  const apiKey = await checkGeminiKeys();
  if (!apiKey) {
    throw new Error(
      "No Gemini key available. Set GEMINI_API_KEY (or other GEMINI_*) in .env or ensure fallback key is available. Stopping."
    );
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
              temperature: 0.9,
              maxOutputTokens: 8192,
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

      const candidate = body?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      if (finishReason && finishReason !== "STOP" && finishReason !== 1) {
        lastErr = new Error(
          `Gemini blocked or stopped: finishReason=${finishReason}`
        );
        continue;
      }

      const text = candidate?.content?.parts?.[0]?.text?.trim?.();
      if (!text) {
        lastErr = new Error(
          finishReason
            ? `Gemini returned no text (finishReason=${finishReason})`
            : "Gemini returned empty content"
        );
        continue;
      }

      data = parseStoryJson(text);
      if (!data.paragraphs || !Array.isArray(data.paragraphs) || data.paragraphs.length === 0) {
        const scenes = data.scenes && data.scenes.length ? data.scenes : ["horror scene"];
        const parts = (data.story || "")
          .split(/\n\n+/)
          .map((t) => t.trim())
          .filter(Boolean);
        data.paragraphs = parts.map((text, i) => ({
          text,
          imagePrompt: scenes[i % scenes.length] || "cinematic horror",
        }));
      }
      console.log("✅ Story generated (Gemini)");
      break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!data) {
    throw new Error(
      `Gemini did not return a new story. Last error: ${lastErr?.message ?? lastErr}. Stopping.`
    );
  }

  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  await fs.writeJson(path.join(tempDir, "story.json"), data, { spaces: 2 });
  await fs.writeFile(path.join(tempDir, "story.txt"), data.story);
  return data;
}

function parseStoryJson(raw) {
  raw = raw.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();
  return JSON.parse(raw);
}
