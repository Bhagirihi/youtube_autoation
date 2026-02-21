import fs from "fs-extra";
import path from "path";
import { getStoryKey, MODELS } from "./geminiKeys.js";

const getTempDir = () => path.join(process.env.DATA_DIR || process.cwd(), "temp");

export async function generateStory() {
  const prompt = await fs.readFile("prompts/story.prompt.txt", "utf-8");
  let data;

  const apiKey = await getStoryKey();
  if (!apiKey) {
    throw new Error(
      "No Gemini key for story. Set GEMINI_STORY_API_KEY or GEMINI_* in .env (or ensure fallback). Stopping."
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
              maxOutputTokens: 16384,
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
      const text = candidate?.content?.parts?.[0]?.text?.trim?.();

      if (!text) {
        lastErr = new Error(
          finishReason
            ? `Gemini returned no text (finishReason=${finishReason})`
            : "Gemini returned empty content"
        );
        continue;
      }

      // MAX_TOKENS means response was truncated; try to parse and salvage
      const isTruncated = finishReason === "MAX_TOKENS" || finishReason === 2;
      if (isTruncated) {
        console.warn("⚠️ Response truncated (MAX_TOKENS); attempting to use partial JSON.");
      } else if (finishReason && finishReason !== "STOP" && finishReason !== 1) {
        lastErr = new Error(
          `Gemini blocked or stopped: finishReason=${finishReason}`
        );
        continue;
      }

      data = parseStoryJson(text, isTruncated);
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

  ensureIntroOutro(data);

  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  await fs.writeJson(path.join(tempDir, "story.json"), data, { spaces: 2 });
  await fs.writeFile(path.join(tempDir, "story.txt"), data.story);
  return data;
}

const INTRO =
  "नमस्कार दोस्तों! हॉरर पॉडकास्ट अड्डा — डर का एक नया ठिकाना में आपका एक बार फिर स्वागत है। आज हम आपके लिए लेकर आए हैं एक और नई डरावनी कहानी…";
const OUTRO =
  "तो दोस्तों, यह थी हमारी आज की हॉरर स्टोरी। अगर आपको यह कहानी पसंद आई हो तो लाइक करें, शेयर करें और चैनल को सब्सक्राइब करना न भूलें... मिलते हैं जल्द ही एक और नई डरावनी कहानी के साथ…";

function ensureIntroOutro(data) {
  let story = (data.story || "").trim();
  if (story && !story.startsWith(INTRO)) {
    story = INTRO + "\n\n" + story;
  }
  if (story && !story.endsWith(OUTRO)) {
    story = story + "\n\n" + OUTRO;
  }
  data.story = story;

  const paras = data.paragraphs;
  if (Array.isArray(paras) && paras.length > 0) {
    const first = paras[0];
    if (first && first.text && !first.text.trim().startsWith(INTRO)) {
      first.text = INTRO + " " + first.text.trim();
    }
    const last = paras[paras.length - 1];
    if (last && last.text && !last.text.trim().endsWith(OUTRO)) {
      last.text = last.text.trim() + " " + OUTRO;
    }
  }

  const tagName = "Horror Podcast Adda";
  if (data.description && !data.description.includes(tagName)) {
    data.description = data.description.trim() + "\n\n" + tagName;
  }
  if (Array.isArray(data.tags) && !data.tags.some((t) => String(t).trim() === tagName)) {
    data.tags = [...data.tags, tagName];
  }
}

function parseStoryJson(raw, tryFixTruncated = false) {
  raw = raw.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();

  const attempts = [raw];
  if (tryFixTruncated) {
    const openBraces = (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
    const openBrackets = (raw.match(/\[/g) || []).length - (raw.match(/]/g) || []).length;
    if (openBraces > 0 || openBrackets > 0) {
      // Typical truncation: inside "paragraphs": [ ... so try ]} then full close
      attempts.push(raw + "]}");
      let fixed = raw;
      for (let i = 0; i < openBrackets; i++) fixed += "]";
      for (let i = 0; i < openBraces; i++) fixed += "}";
      attempts.push(fixed);
    }
  }

  for (const s of attempts) {
    try {
      return JSON.parse(s);
    } catch (_) {}
  }
  return JSON.parse(raw);
}
