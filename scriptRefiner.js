import {
  cleanAndParagraph,
  readFileUtf8,
  saveToFile,
  sleep,
} from "./helper/globalHelpers.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs-extra";
import { updateExcel } from "./helper/excelHelpers.js";

dotenv.config();

const DUMMY = true;

// Get message from parent
process.on("message", async ({ label, row }) => {
  const { slug } = JSON.parse(row);
  console.log(`🎙️ ${label} Received row for: ${slug}`);
  const filePath = path.join("storyScript", `${slug}_summary.txt`);
  const summary = await readFileUtf8(filePath);
  console.log(`🎙️ [${label}] summary length =`, summary.length);
  if (summary.length > 0) {
    const storyFromSummary = await generateStoryFromSummary(slug, summary);
    console.log(
      `🎙️ [${label}] Story Generated From Summary..., ${JSON.stringify(
        storyFromSummary
      )}`
    );
  } else {
    console.log(`🎙️ [${label}] summary is empty, skipping...`);
    process.send?.({ status: "skipped", title: row.title });
    process.exit(0);
  }

  // Simulate work
  await new Promise((res) => setTimeout(res, 1000));
  process.send?.({ status: "done", title: row.title });
  process.exit(0);
});

function extractJson(raw = "") {
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonLike = (match ? match[1] : raw).trim();

  // Fix: convert single quotes → double quotes, quote keys
  const fixed = jsonLike
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // quote keys
    .replace(/'([^']*)'/g, (_, s) => `"${s.replace(/"/g, '\\"')}"`); // convert '...' to "..."

  return fixed;
}

async function getMetaData(raw = "") {
  const result = {
    title: null,
    story: null,
    youtube_tags: [],
    image_tags: [],
  };

  // 1️⃣ Strict JSON.parse
  try {
    const obj = JSON.parse(raw);
    if (obj.title) result.title = obj.title;
    if (obj.story) result.story = obj.story;
    if (Array.isArray(obj.youtube_tags)) result.youtube_tags = obj.youtube_tags;
    if (Array.isArray(obj.image_tags)) result.image_tags = obj.image_tags;
    return result;
  } catch {
    /* ignore */
  }

  // 2️⃣ Loose Fallbacks with Regex

  // title
  const titleMatch = raw.match(/"title"\s*:\s*"([^"]+?)"/i);
  if (titleMatch) result.title = titleMatch[1].trim();

  // story
  const storyMatch = raw.match(/"story"\s*:\s*"([\s\S]*?)"\s*(,|\})/i);
  if (storyMatch) {
    result.story = storyMatch[1]
      .replace(/\\"/g, '"') // unescape quotes
      .replace(/\\n/g, "\n") // unescape line breaks
      .trim();
  }

  // youtube_tags
  const ytTagsMatch = raw.match(/"youtube_tags"\s*:\s*\[([^\]]+)\]/i);
  if (ytTagsMatch) {
    result.youtube_tags = ytTagsMatch[1]
      .split(",")
      .map((tag) => tag.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }

  // image_tags
  const imgTagsMatch = raw.match(/"image_tags"\s*:\s*\[([^\]]+)\]/i);
  if (imgTagsMatch) {
    result.image_tags = imgTagsMatch[1]
      .split(",")
      .map((tag) => tag.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }

  return result;
}

function cleanArrayString(input = "") {
  if (Array.isArray(input)) {
    input = input.join(", "); // Convert array to comma-separated string
  }

  return input
    .replace(/^\[|\]$/g, "") // remove [ and ]
    .replace(/,\s*$/, "") // remove trailing comma
    .trim();
}

async function downloadImage(url, filename, title) {
  const downloadFolder = path.resolve(`storyScript_AI/${title}/images`);
  await fs.ensureDir(downloadFolder);
  const filePath = path.join(downloadFolder, filename);
  const writer = fs.createWriteStream(filePath);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", () => resolve(filePath));
    writer.on("error", reject);
  });
}

async function fetchAndDownloadImages(tags, title) {
  const results = [];
  const UNSPLASH_KEY = process.env.UNSPLASH_API_KEY;

  if (!UNSPLASH_KEY) throw new Error("UNSPLASH_API_KEY missing");

  for (const tag of tags) {
    const searchQuery = `${tag} horror story`;

    try {
      const res = await axios.get("https://api.unsplash.com/search/photos", {
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
      if (photo) {
        const imageUrl = photo.urls.full;
        const filename = `${tag.replace(/\s+/g, "_")}.jpg`;

        const savedPath = await downloadImage(imageUrl, filename, title);

        results.push({
          tag,
          query: searchQuery,
          image_url: imageUrl,
          saved_as: filename,
          local_path: savedPath,
          photographer: photo.user.name,
          source_link: photo.links.html,
        });

        console.log(`✅ Downloaded: ${filename}`);
      } else {
        results.push({ tag, query: searchQuery, error: "No image found" });
        console.log(`⚠️ No result for: ${tag}`);
      }
    } catch (err) {
      console.error(`❌ Error for "${tag}":`, err.message);
      results.push({ tag, query: searchQuery, error: err.message });
    }
  }
}

const generatePrompt = (summary) => `
आप एक पेशेवर हिंदी हॉरर कहानी लेखक और वॉइसओवर स्क्रिप्ट राइटर हैं।

आपको नीचे दी गई इंग्लिश समरी को एक आकर्षक, भावनात्मक और डरावनी **हिंदी कहानी** में बदलनी है, जो विशेष रूप से वॉइसओवर और टेक्स्ट-टू-स्पीच (TTS) के लिए अनुकूल हो।

**कृपया ध्यान दें:**
1. कहानी में **डर, रहस्य और मानवीय भावनाओं का संतुलन** होना चाहिए।
2. वाक्यों की लंबाई मध्यम रखें ताकि **TTS स्वाभाविक रूप से पढ़ सके।**
3. जहां ज़रूरी हो, वहां **स्वाभाविक विराम (जैसे ‘...’ या '—')** जोड़ें।
4. कहानी का टोन सस्पेंसफुल और इमोशनल होना चाहिए।
5. TTS के लिए आसान शब्दों का प्रयोग करें।
6. स्क्रिप्ट को ऐसे लिखें जैसे यूट्यूब ऑडियो ड्रामा में सुनाई जाती है।
7. आउटपुट **सिर्फ़ निम्न JSON ऑब्जेक्ट दें** —
   कोई कोड‑ब्लॉक, अतिरिक्त टेक्स्ट, या लाइन‑ब्रेक न हो।
   **ध्यान रखें:**
   • हर key और value डबल‑क्वोट में हो।
   • यदि value के अंदर डबल‑क्वोट की ज़रूरत पड़े तो उसे \\" इस प्रकार escape करें।
   • कोई trailing comma न छोड़ें।
{
"title": "<1 आकर्षक हिंदी शीर्षक (≤ 8 शब्द)>",
 "image_tags": [<AI इमेज टूल के लिए English विज़ुअल टैग्स>],
"youtube_tags": ["<SEO-अनुकूल यूट्यूब टैग्स, 8–15>"],
"story": "<6000–12000 शब्दों की सस्पेंसफुल और TTS के अनुकूल स्क्रिप्ट>"
}

8. अंतिम आउटपुट पूर्ण रूप से हिंदी (UTF‑8) में हो —
   कहानी ऐसी होनी चाहिए जिसे पेशेवर कथावाचक **सीधा पढ़ सके**, किसी और संपादन की आवश्यकता न पड़े।

---

**🔽 इंग्लिश समरी:**

${summary.trim()}
`;

async function generateStoryFromSummary(slug, summary) {
  let aiOutput;

  if (DUMMY) {
    aiOutput = {
      title: "किराये का मकान: रूहों का बसेरा",
      image_tags: [
        "haunted house",
        "dark room",
        "ghostly figure",
        "eerie atmosphere",
        "old furniture",
        "Rajasthan village",
        "night scene",
        "paranormal activity",
        "family scared",
        "Indian horror",
      ],
      youtube_tags: [
        "किराये का मकान",
        "हिंदी हॉरर स्टोरी",
        "भूतिया कहानी",
        "डरावनी कहानी",
        "सच्ची कहानी",
        "हॉरर स्टोरी",
        "भूत प्रेत",
        "राजस्थान हॉरर",
        "पैरानॉर्मल एक्टिविटी",
        "डरावनी रात",
        "भूतिया घर",
        "हिंदी ऑडियो ड्रामा",
        "हॉरर स्टोरीज इन हिंदी",
        "हिंदी भूतिया कहानियाँ",
        "डरावनी कहानियाँ",
      ],
      story: "नमस्कार दोस्तों, मैं हूँ महेश...", // truncated for brevity
    };
  } else {
    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");

    const promptText = generatePrompt(summary);
    console.log(`🎙️ [${slug}] ${promptText.trim()}`);

    const gen = new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({
      model: "gemini-2.0-flash",
    });

    await sleep(2000 + Math.random() * 3000); // 2–5 sec delay

    const { response } = await gen.generateContent(promptText.trim());
    const rawOut = await response.text();
    console.log("rawOut", rawOut);

    try {
      aiOutput = JSON.parse(extractJson(rawOut));
    } catch (err) {
      console.error("❌ JSON parse failed:", rawOut);
      throw err;
    }

    console.log(`✅ Part ${JSON.stringify(aiOutput, null, 2)}`);
  }

  const data = JSON.stringify(aiOutput, null, 2);
  const { title, story, youtube_tags, image_tags } = await getMetaData(data);
  console.log("image Tags", image_tags);
  const imageTags = await cleanArrayString(image_tags);
  const youtubeTags = await cleanArrayString(youtube_tags);
  const cleanStory = await cleanAndParagraph(story || "");
  await fetchAndDownloadImages(image_tags, title);
  console.log("YT", youtube_tags, title, cleanStory, image_tags);
  await sleep(2000 + Math.random() * 3000); // 2000‐5000 ms
  await saveToFile(`storyScript_AI/${title}`, `AI_Story_${slug}`, cleanStory);
  await updateExcel(slug, {
    status: "refined",
    aiTitle: title,
    imageTag: imageTags,
    youtubeTag: youtubeTags,
  });
}
