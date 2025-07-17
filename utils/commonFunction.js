import axios from "axios";
import fs, { link } from "fs";
import path from "path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const generateFolderFile = async (folder, safeTitle, content) => {
  const folderPath = path.resolve(folder);
  const filePath = path.join(folderPath, `${safeTitle}.txt`);

  try {
    // Create nested folder structure if not exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true }); // ✅ allows "a/b/c"
    }

    fs.writeFileSync(filePath, content, "utf-8");
    console.log(`✅ Content saved to: ${filePath}`);
    return true;
  } catch (error) {
    console.error("❌ Error writing file:", error);
    return false;
  }
};

// promptText.js
export const horrorPrompt = async () => {
  return `You are a professional Hindi horror writer. Generate a deeply immersive, cinematic, psychologically scary horror story in structured JSON format.

Requirements:
- Generate a completely new, unseen story — do not reuse any previous outputs. This must be a fresh concept with new character names, setting, and emotional arc.
- ⚠️ Do NOT use Markdown formatting like \`\`\`json or \`\`\`. Return **only raw JSON** (no code blocks).
- The total story (all fields combined) must be **around 10,000 characters**.
- Write in natural, flowing, scary Hindi — no English.
- Set the story in a realistic location (e.g., village, hostel, forest, road, apartment).
- Start with intrigue, build suspense slowly, and end with a terrifying twist.
- Each section should feel like part of a real, scary short film.
- The twist should be unexpected but meaningful.
- The story must be **original and cinematic**.
- Generate **visually descriptive image_tags** based on events and scenes from the story.
- Generate one extremely punchy, mysterious, and clickable Hindi horror story title in this format: Use emojis and emotional triggers like fear, mystery, or urgency. Style should be similar to: "🔴 7वाँ दरवाज़ा खोला तो सामने आयीं अँधेरों की आत्माएँ!", "दर्पण में दिखी परछाई... क्या वो मैं था?", Keep it under 70 characters for best CTR. It must hint at the plot, but not reveal everything. Use daily language but make it emotionally disturbing.
Return JSON in this exact format, without Markdown:

{
  "title": "string – Hindi horror title",
  "intro": "string – story hook (5 to 6 lines ~ 1000+ chars)",
  "build_up": "string – setting and character build-up (~2500+ chars)",
  "suspense": "string – fear escalation (~3500+ chars)",
  "twist": "string – major plot reveal (~2000+ chars)",
  "ending_line": "string – final terrifying closing line (~1500+ chars)",
  "image_tags": [
    "string – image description from the story must be in English",
    "... (at least 8–10 tags)"
  ]
}

Rules:
Return output as plain JSON, like:
- Each section ('intro', 'build_up', 'suspense', 'twist', 'ending_line') must be long, atmospheric, and rich in detail.
- Maintain strong narrative continuity. Each section must logically and emotionally lead into the next.
- Focus on slow-burn horror and psychological tension — avoid sudden jumps or cheap scares.
- Use vivid, sensory-rich language to evoke emotions, settings, and character states.
- Ensure the horror is immersive, subtle, and layered — not just visual but emotional and psychological.
- Image tags should depict **realistic scenes, specific objects, locations, and emotional cues** from the story (e.g., "a dusty hallway with flickering lights", "a terrified reflection in an old mirror", not "scary ghost").
- Do not include commentary, section labels, or explanations in your output — return only the pure JSON structure.
- Story must feel cinematic, immersive, and emotionally unsettling with a cohesive arc.`;
};

// instructions
export async function fetchTTS(
  apiUrl = "https://www.openai.fm/api/generate",
  content,
  instructions,
  voice = "coral",
  generation = "67612c8-4975-452f-af3f-d44cca8915e5",
  folderPath,
  __dirname
) {
  try {
    const instructions = `Affect:
 A gentle, curious narrator with a soft British accent, leading young listeners through a mysterious yet child-safe adventure, where curiosity gently uncovers magical secrets hidden in a forgotten mansion.
Tone:
 Mysterious but warm, inviting wonder and imagination rather than fear — creating a magical and lightly spooky atmosphere full of gentle suspense, not horror.
Pacing:
 Steady and thoughtful, with pauses to highlight magical discoveries and curious turns. Designed to maintain the attention of children and gently lead them through each unfolding mystery.
Emotion:
 Curiosity, excitement, and a touch of awe. The story should inspire a love for exploring the unknown, with a lighthearted and safe sense of adventure throughout.
Pronunciation:
 Clear and expressive, with gentle rises and falls in tone to enhance storytelling. Each word should feel like part of a bedtime tale — easy to follow, and softly enchanting.`;

    console.log("🔊 Generating TTS Prompt:", instructions);
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
      Accept: "*/*",
      Referer: "https://www.openai.fm/",
      Origin: "https://www.openai.fm/",
    };

    const finalURL = `${apiUrl}?input=${encodeURIComponent(
      content
    )}&prompt=${encodeURIComponent(
      instructions
    )}&voice=${voice}&generation=${generation}`;

    const response = await axios.get(finalURL, {
      headers,
      responseType: "arraybuffer",
    });

    // ✅ Ensure the directory exists
    const dir = path.dirname(folderPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(folderPath, response.data);
    console.log(`✅ Audio saved to: ${folderPath}`);
  } catch (error) {
    console.error("❌ Failed to fetch TTS:", error.message);
    throw error;
  }
}
