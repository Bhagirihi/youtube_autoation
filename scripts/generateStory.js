import fs from "fs-extra";
import path from "path";
import { getStoryKey, getStoryPart2Key, MODELS } from "./geminiKeys.js";

const getTempDir = () => path.join(process.env.DATA_DIR || process.cwd(), "temp");

// If USE_TWO_STEP_STORY is set (any value) → single prompt. If not set → two-step (long story + metadata).
const USE_TWO_STEP_STORY = !process.env.USE_TWO_STEP_STORY;

export async function generateStory() {
  const keyResult = await getStoryKey();
  if (!keyResult) {
    throw new Error(
      "No Gemini key for story. Set GEMINI_STORY_API_KEY or GEMINI_* in .env (or ensure fallback). Stopping."
    );
  }
  const { key: apiKey, name: keyName } = keyResult;

  let data;
  if (USE_TWO_STEP_STORY) {
    data = await generateStoryTwoStep(apiKey, keyName);
  } else {
    const prompt = await fs.readFile("prompts/story.prompt.txt", "utf-8");
    data = await callGeminiStory(apiKey, keyName, prompt, (parsed) => parsed);
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
  }

  if (!USE_TWO_STEP_STORY) {
    console.log("✅ Story generated (Gemini)");
  }

  ensureIntroOutro(data);

  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  await fs.writeJson(path.join(tempDir, "story.json"), data, { spaces: 2 });
  await fs.writeFile(path.join(tempDir, "story.txt"), data.story);
  return data;
}

async function generateStoryTwoStep(apiKeyPart1, keyNamePart1) {
  const keyResultPart2 = await getStoryPart2Key();
  const apiKeyPart2 = keyResultPart2?.key ?? apiKeyPart1;
  const keyNamePart2 = keyResultPart2?.name ?? keyNamePart1;

  const promptPart1 = await fs.readFile("prompts/story-part1.prompt.txt", "utf-8");
  const promptPart2Template = await fs.readFile("prompts/story-part2.prompt.txt", "utf-8");

  const part1 = await callGeminiStory(apiKeyPart1, keyNamePart1, promptPart1, (data) => {
    if (!data.title && data.story) throw new Error("Part 1 missing title or story");
    return data;
  });
  if (!part1.paragraphs || !Array.isArray(part1.paragraphs) || part1.paragraphs.length === 0) {
    const scenes = part1.scenes && part1.scenes.length ? part1.scenes : ["horror scene"];
    const parts = (part1.story || "")
      .split(/\n\n+/)
      .map((t) => t.trim())
      .filter(Boolean);
    part1.paragraphs = parts.map((text, i) => ({
      text,
      imagePrompt: scenes[i % scenes.length] || "cinematic horror",
    }));
  }
  console.log("✅ Part 1 done: story + title + images (~" + (part1.story?.length || 0) + " chars)");

  const storySnippet =
    (part1.story || "").length > 12000
      ? (part1.story || "").slice(0, 11000) + "\n\n[... story truncated for metadata prompt ...]"
      : part1.story || "";
  const promptPart2 =
    `INPUT:\n\nTitle: ${(part1.title || "").replace(/"/g, '\\"')}\n\nStory:\n${storySnippet}\n\n---\n\n` +
    promptPart2Template;

  const part2 = await callGeminiStory(apiKeyPart2, keyNamePart2, promptPart2, (data) => data);
  console.log("✅ Part 2 done: description, keywords, tags, hashtags");

  return {
    title: part1.title,
    titleImagePrompt: part1.titleImagePrompt,
    story: part1.story,
    paragraphs: part1.paragraphs,
    scenes: part1.scenes || [],
    description: part2.description ?? "",
    tripleKeywords: part2.tripleKeywords ?? [],
    highVolumeTags: part2.highVolumeTags ?? [],
    rankedTags: part2.rankedTags ?? [],
    highRankedKeywords: part2.highRankedKeywords ?? [],
    hashtags: part2.hashtags ?? [],
    tags: part2.tags ?? [],
  };
}

async function callGeminiStory(apiKey, keyName, prompt, validate) {
  let lastErr;
  const maxParseRetries = 2; // retry once on JSON parse/validate failure (new response)
  for (const model of MODELS) {
    for (let parseAttempt = 0; parseAttempt < maxParseRetries; parseAttempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: parseAttempt === 0 ? 0.9 : 0.7,
                maxOutputTokens: 16384,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        const body = await res.json();
        if (!res.ok) {
          lastErr = new Error(body?.error?.message || `Gemini ${res.status}`);
          console.warn(`[Gemini] story (key: ${keyName}, model: ${model}) → failed: ${lastErr.message}`);
          parseAttempt = maxParseRetries;
          break;
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
          console.warn(`[Gemini] story (key: ${keyName}, model: ${model}) → failed: ${lastErr.message}`);
          parseAttempt = maxParseRetries;
          break;
        }

        const isTruncated = finishReason === "MAX_TOKENS" || finishReason === 2;
        if (isTruncated) {
          console.warn("⚠️ Response truncated (MAX_TOKENS); attempting to use partial JSON.");
        } else if (finishReason && finishReason !== "STOP" && finishReason !== 1) {
          lastErr = new Error(
            `Gemini blocked or stopped: finishReason=${finishReason}`
          );
          console.warn(`[Gemini] story (key: ${keyName}, model: ${model}) → failed: ${lastErr.message}`);
          parseAttempt = maxParseRetries;
          break;
        }

        const data = parseStoryJson(text, isTruncated);
        validate(data);
        console.log(`[Gemini] story (key: ${keyName}, model: ${model}) → success`);
        return data;
      } catch (err) {
        lastErr = err;
        const isParseOrValidate =
          err instanceof SyntaxError ||
          /JSON|parse|property value|expect/i.test(String(err?.message ?? ""));
        if (isParseOrValidate && parseAttempt < maxParseRetries - 1) {
          console.warn(`[Gemini] story (key: ${keyName}, model: ${model}) → invalid JSON, retrying once…`);
        } else {
          console.warn(`[Gemini] story (key: ${keyName}, model: ${model}) → failed: ${err?.message || err}`);
          break;
        }
      }
    }
  }
  throw new Error(
    `Gemini did not return valid story. Last error: ${lastErr?.message ?? lastErr}`
  );
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

/**
 * Fix unescaped newlines inside JSON string values (common Gemini output bug).
 * Walks the string; inside double-quoted values, replaces literal \n with \\n.
 */
function sanitizeJsonStringNewlines(raw) {
  let out = "";
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < raw.length) {
    const c = raw[i];
    if (escape) {
      out += c;
      escape = false;
      i++;
      continue;
    }
    if (c === "\\") {
      out += c;
      escape = true;
      i++;
      continue;
    }
    if (inString) {
      if (c === '"') {
        inString = false;
        out += c;
        i++;
        continue;
      }
      if (c === "\n" || c === "\r") {
        out += "\\n";
        if (c === "\r" && raw[i + 1] === "\n") i++;
        i++;
        continue;
      }
      out += c;
      i++;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function parseStoryJson(raw, tryFixTruncated = false) {
  raw = raw.trim();
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) raw = codeBlock[1].trim();

  const attempts = [raw, sanitizeJsonStringNewlines(raw)];
  if (tryFixTruncated) {
    const openBraces = (raw.match(/{/g) || []).length - (raw.match(/}/g) || []).length;
    const openBrackets = (raw.match(/\[/g) || []).length - (raw.match(/]/g) || []).length;
    if (openBraces > 0 || openBrackets > 0) {
      attempts.push(raw + "]}");
      let fixed = raw;
      for (let i = 0; i < openBrackets; i++) fixed += "]";
      for (let i = 0; i < openBraces; i++) fixed += "}";
      attempts.push(fixed);
      attempts.push(sanitizeJsonStringNewlines(fixed));
    }
  }

  for (const s of attempts) {
    try {
      return JSON.parse(s);
    } catch (_) {}
  }
  throw new SyntaxError("JSON parse failed after all repair attempts");
}
