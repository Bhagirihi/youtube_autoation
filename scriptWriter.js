import axios from "axios";
import { cleanAndParagraph, saveToFile } from "./helper/globalHelpers.js";
import { updateExcel } from "./helper/excelHelpers.js";
import dotenv from "dotenv";

dotenv.config();

// Get message from parent
process.on("message", async ({ label, row }) => {
  const { slug } = JSON.parse(row);
  console.log(`🎙️ Received row for: ${slug}`);
  // Use row.url, row.duration, etc.
  const transcript = await getTranscriptViaRecapio(slug);
  // Simulate work
  await new Promise((res) => setTimeout(res, 1000));

  process.send?.({ status: "done", title: row.title });
  process.exit(0);
});

export const fetcher = axios.create({
  // every request from this client will look Chrome‑ish
  headers: {
    // UA string from a current Chrome build
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/126.0.0.0 Safari/537.36",

    // usual browser defaults
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    // a few sites check these:
    Referer: "https://youtube.com/",
    Origin: "https://youtube.com",
  },

  // keep your existing timeout
  timeout: 15_000,
});

function cleanSummary(raw = "") {
  return raw
    .replace(/\\n/g, "\n") // Unescape newlines
    .replace(/\n{2,}/g, "\n\n") // Limit to double line breaks
    .replace(/###\s.*?\[\d{2}:\d{2}\]\n?/g, "") // Remove markdown headers with timestamps
    .replace(/^"(.*)"$/, "$1") // Remove surrounding double quotes if any
    .replace(/\\"/g, '"') // Unescape quotes
    .replace(/\\'/g, "'") // Unescape single quotes
    .replace(/\n{3,}/g, "\n\n") // Avoid triple spacing
    .trim(); // Final trim
}

async function getTranscriptViaRecapio(slug, maxPoll = 6) {
  let delay = 5_000;
  var parsedTranscript = "";
  const url = `https://api.recapio.com/youtube-chat/status/by-slug/${slug}`;
  for (let i = 1; i <= maxPoll; i++) {
    try {
      const { data } = await fetcher.get(url);
      const { transcript_ready, transcript, summary } = data;

      if (transcript_ready) {
        try {
          parsedTranscript = JSON.parse(transcript); // ✅ use JSON.parse, not JSON5
        } catch (err) {
          console.error("❌ JSON parse failed:", aiOutput);
          throw err;
        }
        const text = parsedTranscript.map((t) => t.text ?? "").join("\n");
        const cleanStory = await cleanAndParagraph(text || "");
        await saveToFile("storyScript", slug, cleanStory);

        const Summary = await cleanSummary(summary || "");
        await saveToFile("storyScript", `${slug}_summary`, Summary);

        await updateExcel(slug, { status: "written" });
        return cleanStory;
      }
      console.log(
        `⏳ Recapio ${slug} status=${transcript_ready} (${i}/${maxPoll})`
      );
    } catch (err) {
      if (err.response?.status === 404) {
        console.warn(`❌ Recapio 404 ${slug}`);
        return null;
      }
      console.warn(`⚠️  Recapio error (${slug})`, err.message);
    }
    await new Promise((r) => setTimeout(r, delay));
    delay *= 2;
  }
  return null;
}
