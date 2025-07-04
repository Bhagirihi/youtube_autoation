/* fetchAndSaveVideos.mjs  ─ ES‑module version
   ------------------------------------------------------------
   1. Search YouTube for “horror story” videos
   2. Append/update rows in horror_story.xlsx (no duplicates)
   3. Try transcript via Recapio -> Gemini clean‑up -> .txt file
   4. Mark progress in the Note column
   ------------------------------------------------------------ */

import dotenv from "dotenv";
import ytsr from "ytsr";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { remove } from "diacritics";
import Sanscript from "sanscript";
import axios from "axios";
import XLSX from "xlsx";

dotenv.config();

/* ───────────────── CONFIG ───────────────── */
const SEARCH_TERM = "horror story";
const MAX_RESULTS = 30;
const EXCEL_FILE = path.resolve("horror_story.xlsx");
const WORKSHEET = "horror_story";
const OUTPUT_DIR = path.resolve("story_scripts");
const PARAGRAPH_SZ = 3;

const GEMINI_KEY = process.env.GEMINI_API_KEY;

/* ────────── Excel helpers ────────── */
function ensureExcelFileExists() {
  if (fs.existsSync(EXCEL_FILE)) return;
  const headers = [
    "Title",
    "UploadedAt",
    "Duration",
    "Views",
    "Channel",
    "URL",
    "Slug",
    "CreatedDate",
    "UpdatedDate",
    "Note",
    "AITitle",
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, WORKSHEET);
  XLSX.writeFile(wb, EXCEL_FILE);
  console.log("📄  Created new horror_story.xlsx");
}

function loadRows() {
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets[WORKSHEET];
  return ws ? XLSX.utils.sheet_to_json(ws) : [];
}

function saveRows(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, WORKSHEET);
  XLSX.writeFile(wb, EXCEL_FILE);
}

function upsertRow(url, data) {
  const rows = loadRows();
  const idx = rows.findIndex((r) => r.URL === url);
  if (idx === -1) rows.push(data);
  else rows[idx] = { ...rows[idx], ...data };
  saveRows(rows);
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const isDuplicate = (url) => loadRows().some((r) => r.URL === url);

/* ────────── Slug + text helpers ────────── */
function createSlug(txt = "") {
  const translit = Sanscript.t(txt, "devanagari", "iast");
  const ascii = remove(translit);
  return ascii
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

// paragraph join
function cleanAndParagraph(raw = "") {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const sentences = lines.reduce(
    (acc, line) => {
      const last = acc.at(-1) ?? "";
      if (last.length < 40 || !/[।!?]$/.test(last))
        acc[acc.length - 1] = (last + " " + line).trim();
      else acc.push(line);
      return acc;
    },
    [""]
  );
  const paras = [];
  for (let i = 0; i < sentences.length; i += PARAGRAPH_SZ)
    paras.push(sentences.slice(i, i + PARAGRAPH_SZ).join(" "));
  return paras.join("\n\n");
}

/* ────────── Gemini rewrite ────────── */
async function refineStory(rawText) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");
  const gen = new GoogleGenerativeAI(GEMINI_KEY).getGenerativeModel({
    model: "gemini-1.5-flash",
  });
  // Descriptive Titles:
  const prompt = `
आप एक अनुभवी हिंदी हॉरर‑फ़िक्शन एडिटर हैं।

**आपका कार्य:**
1. नीचे दिए गए कच्चे ट्रांसक्रिप्ट को पेशेवर कहानी के रूप में संपादित करें।
   - चैनल नाम, परिचय, आउट्रो या अन्य गैर‑कथात्मक हिस्से हटा दें।
   - सीधे कहानी से शुरुआत करें।
2. कहानी को भावनात्मक और डरावना बनाए रखें:
   - व्याकरण, शब्दावली और शैली सुधारें, पर मूल भावना बरक़रार रखें।
   - पैराग्राफ़ साफ़‑सुथरे और TTS‑फ़्रेंडली हों (अनावश्यक लाइन‑ब्रेक, बुलेट्स या चिन्ह न हों)।
3. कहानी की लंबाई 20–40 मिनट ऑडियो (≈ 6000‑12000 शब्द) के अनुरूप रखें।
   - यदि मूल कथा छोटी हो, तो पात्र, संवाद, वातावरण, रहस्य और डरावने तत्व विश्वसनीय ढंग से बढ़ाएँ।
   - संवादों में गहराई और यथार्थ जोड़ें ताकि श्रोता भावनात्मक रूप से जुड़ सकें।
4. **आउटपुट ठोस रूप से केवल एक ही बार एक वर्णनात्मक शीर्षक दें** (कोई वैकल्पिक या अतिरिक्त शीर्षक नहीं)
   - शीर्षक आकर्षक हो, कहानी का सार बताए, ≤ 8 शब्द, केवल हिंदी (UTF‑8)।
5. अंतिम आउटपुट पूरी तरह हिंदी (UTF‑8) में दें; किसी अन्य भाषा, कोड या तकनीकी विवरण की आवश्यकता नहीं।
   - कहानी इस तरह लिखें कि पेशेवर कथावाचक सीधे पढ़ सके—किसी बाद के संपादन की ज़रूरत न पड़े।

---

**आउटपुट फ़ॉर्मेट (यही रखें):**
**Title:** <वर्णनात्मक हिंदी शीर्षक>
<विस्तारित और संपादित हिंदी कहानी (6000‑12000 शब्द)>

---
नीचे कच्चा ट्रांसक्रिप्ट दिया गया है:
${raw}
`;

  const { response } = await gen.generateContent(prompt);
  const out = response.text();
  const m = out.match(/\*\*Title:\*\*\s*(.+)/i);
  const title = m ? m[1].trim() : "";
  const body = out.replace(/\*\*Title:\*\*.+?\n+/is, "").trim();
  return { title, story: cleanAndParagraph(body) };
}

/* ────────── Recapio poll ────────── */
async function getTranscriptViaRecapio(slug, maxPoll = 6) {
  let delay = 5_000;
  for (let i = 1; i <= maxPoll; i++) {
    try {
      const { data } = await axios.get(
        `https://api.recapio.com/youtube-chat/status/by-slug/${slug}`,
        { timeout: 15_000 }
      );
      if (data.status === "done" && data.transcript) {
        return data.transcript
          .map((o) => JSON.parse(`"${o.text ?? ""}"`))
          .join("\n");
      }
      console.log(`⏳ Recapio ${slug} status=${data.status} (${i}/${maxPoll})`);
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

/* ────────── Fetch YouTube list ────────── */
async function fetchEnoughVideos(term, max) {
  const first = (await ytsr.getFilters(term)).get("Type").get("Video");
  let next = first.url,
    vids = [];
  while (vids.length < max && next) {
    const res = await ytsr(next, { pages: 1 });
    vids.push(...res.items.filter((i) => i.type === "video"));
    next = res.continuation || null;
  }
  return vids.slice(0, max);
}

/* ────────── MAIN orchestrator ────────── */
export default async function fetchAndSaveVideos() {
  ensureExcelFileExists();

  const videos = await fetchEnoughVideos(SEARCH_TERM, MAX_RESULTS);
  if (!videos.length) return console.log("❌ No videos found");
  console.log(`🔍 Found ${videos.length} videos`);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const v of videos) {
    const { url, title, views, duration, author, uploadedAt } = v;
    if (isDuplicate(url)) {
      console.log(`⚠️  Duplicate skip: ${url}`);
      continue;
    }

    const slug = `${createSlug(title)}-by-${createSlug(author?.name)}`;
    const raw = await getTranscriptViaRecapio(slug);
    if (!raw) {
      console.log(`🚫 No transcript for ${slug}`);
      upsertRow(url, {
        Title: title,
        URL: url,
        Slug: slug,
        Note: "Transcript failed",
        CreatedDate: todayISO(),
        UpdatedDate: todayISO(),
      });
      continue;
    }

    const { title: aiTitle, story } = await refineStory(raw);
    const safe = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const fname = (aiTitle ? `${aiTitle}_${safe}` : safe) + ".txt";
    const file = path.join(OUTPUT_DIR, fname);
    fs.writeFileSync(file, story, "utf8");
    console.log(`✅ Saved → ${file}`);

    upsertRow(url, {
      Title: title,
      UploadedAt: uploadedAt ?? "",
      Duration: duration,
      Views: views,
      Channel: author?.name ?? "",
      URL: url,
      Slug: fname.replace(/\.txt$/, ""),
      CreatedDate: todayISO(),
      UpdatedDate: todayISO(),
      Note: "Story written",
      AITitle: createSlug(aiTitle),
    });
  }
}
