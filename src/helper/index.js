import axios from "axios";
import fs, { link } from "fs/promises";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ExcelJS from "exceljs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

/* ────────────────────────────────────────────────
   Gemini Key Checker
──────────────────────────────────────────────── */
const MODELS = ["gemini-2.5-flash"];

// Helper function for delays
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isQuotaError(res, data) {
  return (
    res.status === 429 ||
    data?.error?.status === "RESOURCE_EXHAUSTED" ||
    /quota|rate limit|exceeded/i.test(data?.error?.message || "")
  );
}

function isRetryableServerError(res) {
  return res.status >= 500 && res.status < 600;
}

async function callGemini(model, apiKey) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply OK" }] }],
      }),
    },
  );
}

async function testKey(
  name,
  apiKey,
  { maxRetries = 4, baseDelayMs = 800 } = {},
) {
  for (const model of MODELS) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const res = await callGemini(model, apiKey);
        const data = await res.json();

        if (res.ok) {
          return { name, ok: true, model };
        }

        // ❌ Model not supported → try next model
        if (/not found/i.test(data?.error?.message || res.status != 200 || ""))
          break;

        // ❌ Hard failure
        return {
          name,
          ok: false,
          error: data?.error?.message || "Unknown error",
        };
      } catch (err) {
        if (attempt === maxRetries) {
          return { name, ok: false, error: err.message };
        }
        await sleep(baseDelayMs * 2 ** attempt);
        attempt++;
      }
    }
  }

  return {
    name,
    ok: false,
    error: "No supported models available for this key",
  };
}

const FALLBACK_KEY_API =
  "https://api.unsecuredapikeys.com/API/GetRandomKey?type=130";

async function fetchFallbackGeminiKey() {
  try {
    const res = await axios.get(FALLBACK_KEY_API, {
      timeout: 10000,
      headers: {
        accept: "*/*",
        "accept-language": "en-IN,en;q=0.9,en-GB;q=0.8,en-US;q=0.7,gu;q=0.6",
        origin: "https://unsecuredapikeys.com",
        referer: "https://unsecuredapikeys.com/",
        "sec-ch-ua":
          '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      },
    });
    const data = res?.data;
    // Only use if apiType is "GoogleAI"
    if (
      data?.apiType === "GoogleAI" &&
      data?.status === "Valid" &&
      data?.apiKey &&
      typeof data.apiKey === "string" &&
      data.apiKey.length > 0
    ) {
      return data.apiKey;
    }
    return null;
  } catch (err) {
    // Handle 429 rate limit: check if response contains fallbackApiKey
    if (err.response?.status === 429) {
      const data = err.response?.data;
      const fallbackKey = data?.fallbackApiKey;
      if (
        fallbackKey?.apiType === "GoogleAI" &&
        fallbackKey?.status === "Valid" &&
        fallbackKey?.apiKey &&
        typeof fallbackKey.apiKey === "string" &&
        fallbackKey.apiKey.length > 0
      ) {
        return fallbackKey.apiKey;
      }
      console.warn("⚠️ Fallback API rate-limited; using env keys only.");
      return null;
    }
    console.warn("⚠️ Failed to fetch fallback Gemini key:", err.message);
    return null;
  }
}

async function checkGeminiKeys() {
  // 1. Fallback key from API (try first)
  const fallbackKey = await fetchFallbackGeminiKey();
  const candidates = [];
  if (
    fallbackKey &&
    typeof fallbackKey === "string" &&
    fallbackKey.length > 0
  ) {
    candidates.push({ name: "fallback", key: fallbackKey });
  }

  // 2. All GEMINI keys from .env (GoogleGenerativeAI)
  const envKeys = Object.entries(process.env)
    .filter(
      ([k, v]) =>
        k.startsWith("GEMINI") && typeof v === "string" && v.trim().length > 0,
    )
    .map(([k, v]) => ({ name: k, key: v.trim() }));
  candidates.push(...envKeys);

  if (candidates.length === 0) {
    console.warn(
      "⚠️ No Gemini keys found (no fallback and no GEMINI_* in .env)",
    );
    return null;
  }

  for (const { name, key } of candidates) {
    const result = await testKey(name, key);
    if (result.ok) return key;
    console.warn(`${name}: ${result.error || "failed"}`);
  }

  console.warn("⚠️ No working Gemini key found.");
  return null;
}

/* ────────────────────────────────────────────────
   Gemini Client
──────────────────────────────────────────────── */
const GEMINI_KEY = await checkGeminiKeys();

if (!GEMINI_KEY) {
  throw new Error("❌ GEMINI_MASTER_API_KEY missing in .env");
}

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

export { genAI };

export const logBox = (label) => {
  const reset = "\x1b[0m";
  const bold = "\x1b[1m";
  const cyan = "\x1b[36m";
  const green = "\x1b[32m";

  const content = `${cyan}${bold}🛠️ ${reset} ${green}${label}${reset}`;
  const padding = 4;
  const lineLength = content.replace(/\x1b\[\d+m/g, "").length + padding;
  const top = "┌" + "─".repeat(lineLength) + "┐";
  const mid = `│ ${content}${" ".repeat(
    lineLength - content.replace(/\x1b\[\d+m/g, "").length - 1,
  )}│`;
  const bottom = "└" + "─".repeat(lineLength) + "┘";

  console.log(top);
  console.log(mid);
  console.log(bottom);
};

export { sleep };

/* ────────────────────────────────────────────────
   Dev Cache System (for development)
──────────────────────────────────────────────── */

const DEV_CACHE_DIR = path.join(process.cwd(), ".dev-cache");

/**
 * Check if dev cache is enabled
 */
function isDevCacheEnabled() {
  return (
    process.env.USE_DEV_CACHE === "true" || process.env.USE_DEV_CACHE === "1"
  );
}

/**
 * Save story data to dev cache
 * @param {string} cacheKey - Unique key for the cache (e.g., story title)
 * @param {object} data - Story data to cache
 * @param {boolean} force - Force save even if USE_DEV_CACHE is not set
 */
export async function saveDevCache(cacheKey, data, force = false) {
  if (!force && !isDevCacheEnabled()) return;

  try {
    // Ensure cache directory exists
    await fs.mkdir(DEV_CACHE_DIR, { recursive: true });

    // Create a safe filename from cache key
    const safeKey = await sanitizeFilename(cacheKey);
    const cacheFile = path.join(DEV_CACHE_DIR, `${safeKey}.json`);

    // Save with timestamp
    const cacheData = {
      cachedAt: new Date().toISOString(),
      data,
    };

    await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2), "utf-8");
    console.log(`💾 Dev cache saved: ${cacheFile}`);
  } catch (error) {
    console.warn(`⚠️ Failed to save dev cache: ${error.message}`);
  }
}

/**
 * Load story data from dev cache
 * @param {string} cacheKey - Unique key for the cache
 * @returns {object|null} - Cached data or null if not found
 */
export async function loadDevCache(cacheKey) {
  if (!isDevCacheEnabled()) return null;

  try {
    const safeKey = await sanitizeFilename(cacheKey);
    const cacheFile = path.join(DEV_CACHE_DIR, `${safeKey}.json`);

    // Check if cache file exists
    try {
      await fs.access(cacheFile);
    } catch {
      return null; // File doesn't exist
    }

    // Read and parse cache
    const cacheContent = await fs.readFile(cacheFile, "utf-8");
    const cacheData = JSON.parse(cacheContent);

    console.log(
      `📦 Dev cache loaded: ${cacheFile} (cached at ${cacheData.cachedAt})`,
    );
    return cacheData.data;
  } catch (error) {
    console.warn(`⚠️ Failed to load dev cache: ${error.message}`);
    return null;
  }
}

/**
 * Clear all dev cache files
 */
export async function clearDevCache() {
  if (!isDevCacheEnabled()) return;

  try {
    const files = await fs.readdir(DEV_CACHE_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        await fs.unlink(path.join(DEV_CACHE_DIR, file));
      }
    }
    console.log(`🗑️ Dev cache cleared`);
  } catch (error) {
    console.warn(`⚠️ Failed to clear dev cache: ${error.message}`);
  }
}

/**
 * Get cache status info
 */
export function getDevCacheStatus() {
  return {
    enabled: isDevCacheEnabled(),
    cacheDir: DEV_CACHE_DIR,
  };
}

export async function splitTextIntoChunks(text = story, chunkSize = 250) {
  const parts = [];
  let i = 0;
  const ends = ["।", ".", "?", "!", "…"];

  while (i < text.length) {
    let end = Math.min(i + chunkSize, text.length);
    let best = end;

    // Search backward for nearest sentence end within range
    for (let j = end; j > i; j--) {
      if (ends.includes(text[j])) {
        best = j + 1;
        break;
      }
    }

    const chunk = text.slice(i, best).trim();
    if (chunk) parts.push({ part: chunk });
    console.log(parts.length, chunk);

    i = best;
  }

  return parts;
}

export async function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "") // remove invalid chars
    .replace(/\s+/g, "_"); // replace spaces
}

export async function getDuration(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata.format.duration) {
        console.error(
          `❌ FFprobe Error for ${path.basename(filePath)}:`,
          err ? err.message : "No duration found.",
        );
        return resolve(0);
      }
      resolve(parseFloat(metadata.format.duration));
    });
  });
}
export async function ensureFolderStructure(videoTitle = "title") {
  // Validate videoTitle - ensure it's a string, not a Promise
  if (videoTitle instanceof Promise) {
    console.warn("⚠️ videoTitle is a Promise, awaiting...");
    videoTitle = await videoTitle;
  }

  if (typeof videoTitle !== "string") {
    throw new Error(
      `❌ Invalid videoTitle: expected string, got ${typeof videoTitle}. Value: ${videoTitle}`,
    );
  }

  // Check for Promise string representation (shouldn't happen, but safety check)
  if (videoTitle.includes("[object Promise]")) {
    throw new Error(
      `❌ Invalid videoTitle contains "[object Promise]": ${videoTitle}. This indicates a Promise was used without await.`,
    );
  }

  const outputDir = path.resolve("src/output");
  const videoFolder = path.join(outputDir, videoTitle);
  console.log(videoFolder, outputDir);

  // This line now correctly calls the Promise-based fs.mkdir
  await fs.mkdir(path.join(videoFolder, "volume"), { recursive: true });

  return videoFolder;
}

// ----------------------------------------------------------------------
// 1️⃣ SAVE NEW JSON FILE
// ----------------------------------------------------------------------
export async function saveJSONOutput(folder, title, data) {
  const fileTitle = await sanitizeFilename(title);
  const fileName = fileTitle + ".json";
  const filePath = path.join(folder, fileName);

  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

// ----------------------------------------------------------------------
// 2️⃣ UPDATE JSON FILE (MERGE NEW DATA INTO EXISTING FILE)
// ----------------------------------------------------------------------
export async function updateJSONOutput(folder, title, newData) {
  const fileTitle = await sanitizeFilename(title);
  const fileName = fileTitle + ".json";
  const filePath = path.join(folder, fileName);

  try {
    // Read old JSON
    const oldRaw = await fs.readFile(filePath, "utf-8");
    const oldData = JSON.parse(oldRaw);

    // Merge
    const merged = { ...oldData, ...newData };

    // Save updated JSON
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2));

    return filePath;
  } catch (err) {
    return await saveJSONOutput(folder, title, newData);
  }
}

// ======================================================================
// ============================ EXCEL HELPERS ============================
// ======================================================================

// Define columns only once
export function getExcelColumns() {
  return [
    { header: "Title", key: "title", width: 50 },
    { header: "URL", key: "url", width: 50 },
    { header: "Views", key: "views", width: 15 },
    { header: "Duration", key: "duration", width: 15 },
    { header: "Transcript", key: "transcript", width: 15 },
    { header: "Final Video Path", key: "finalVideo", width: 50 },
    { header: "Upload Status", key: "uploadStatus", width: 20 },
    { header: "Timestamp", key: "timestamp", width: 25 },
  ];
}

// ----------------------------------------------------------------------
// 3️⃣ SAVE NEW ROW IN EXCEL
// ----------------------------------------------------------------------
export async function saveToExcel(EXCEL_PATH, rowData) {
  let workbook;
  let sheet;

  try {
    // Check if file exists
    await fs.access(EXCEL_PATH);

    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(EXCEL_PATH);
    sheet = workbook.getWorksheet(1);

    if (!sheet) {
      sheet = workbook.addWorksheet("CinePlot Decode");
      sheet.columns = getExcelColumns();
    }
  } catch (err) {
    // Create new Excel
    workbook = new ExcelJS.Workbook();
    sheet = workbook.addWorksheet("CinePlot Decode");
    sheet.columns = getExcelColumns();
  }

  sheet.addRow({
    ...rowData,
    timestamp: new Date().toISOString(),
  });

  await workbook.xlsx.writeFile(EXCEL_PATH);
  console.log("📊 Excel updated:", EXCEL_PATH);
}

// ----------------------------------------------------------------------
// 4️⃣ UPDATE A SPECIFIC ROW IN EXCEL
// Finds row by Title OR URL and updates only provided fields.
// ----------------------------------------------------------------------
export async function updateToExcel(EXCEL_PATH, findBy = {}, updateData = {}) {
  let workbook = new ExcelJS.Workbook();
  let sheet;

  try {
    // Load existing file
    await fs.access(EXCEL_PATH);
    await workbook.xlsx.readFile(EXCEL_PATH);
    sheet = workbook.getWorksheet(1);

    if (!sheet) {
      console.error("❌ Sheet not found.");
      return;
    }
  } catch (err) {
    console.error("❌ Excel file does NOT exist. Cannot update.");
    return;
  }

  // Find row index using Title OR URL
  let targetRow;
  sheet.eachRow((row) => {
    const rowValues = row.values;

    const title = rowValues[1];
    const url = rowValues[2];

    if (
      (findBy.title && findBy.title === title) ||
      (findBy.url && findBy.url === url)
    ) {
      targetRow = row;
    }
  });

  if (!targetRow) {
    console.log("⚠️ No matching row found to update.");
    return;
  }

  // Update only provided fields
  Object.keys(updateData).forEach((key) => {
    const col = sheet.getColumn(key);

    if (col) {
      const colIndex = col.number;
      targetRow.getCell(colIndex).value = updateData[key];
    }
  });

  targetRow.getCell("timestamp").value = new Date().toISOString();

  await workbook.xlsx.writeFile(EXCEL_PATH);

  console.log("♻️ Excel row updated successfully.");
}

export async function getRandomGeminiModel() {
  const models = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    // DO NOT default to gemini-2.0-flash on free tier
  ];
  return models[Math.floor(Math.random() * models.length)];
}
export async function extractJSONBlock(text) {
  if (!text || typeof text !== "string") {
    throw new Error("Empty or invalid AI response");
  }

  // 1. Remove markdown fences safely
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // 2. Extract JSON object boundaries
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response");
  }

  let jsonString = cleaned.slice(start, end + 1);

  // 3. Fix control characters within JSON string values
  // This function escapes control characters that appear inside string values
  function escapeControlCharsInStrings(jsonStr) {
    let result = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];
      const code = char.charCodeAt(0);

      // Handle escape sequences
      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      // Handle backslash (start of escape sequence)
      if (char === "\\") {
        escapeNext = true;
        result += char;
        continue;
      }

      // Handle string delimiters
      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      // Process characters based on context
      if (inString) {
        // Inside a string value - escape unescaped control characters
        if (code >= 0 && code <= 31) {
          // Control characters that need escaping
          switch (code) {
            case 9: // \t (tab)
              result += "\\t";
              break;
            case 10: // \n (newline)
              result += "\\n";
              break;
            case 13: // \r (carriage return)
              result += "\\r";
              break;
            default:
              // Remove other control characters (they're invalid in JSON strings)
              break;
          }
        } else {
          result += char;
        }
      } else {
        // Outside string - allow whitespace but remove other control chars
        if (
          code >= 0 &&
          code <= 31 &&
          code !== 9 &&
          code !== 10 &&
          code !== 13
        ) {
          // Remove invalid control characters outside strings
          continue;
        }
        result += char;
      }
    }

    return result;
  }

  // 4. Apply control character escaping
  jsonString = escapeControlCharsInStrings(jsonString);

  // 5. Additional fixes
  jsonString = jsonString
    // Fix smart quotes
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    // Remove trailing commas before closing braces/brackets
    .replace(/,\s*([}\]])/g, "$1")
    // Normalize newlines outside strings
    .replace(/\r\n/g, "\n");

  // 6. Validate JSON
  try {
    JSON.parse(jsonString);
  } catch (err) {
    err.message = `Invalid JSON from AI: ${err.message}`;
    throw err;
  }

  return jsonString;
}

export function sanitizeJson(text) {
  return (
    text
      .replace(/[\u0000-\u001F\u007F]/g, "") // control chars
      // .replace(/\r?\n/g, "\\n") // real newlines → escaped
      .replace(/\\+"/g, '"') // fix over-escaping
      .replace(/“|”/g, '"') // smart quotes
      .replace(/’|‘/g, "") // apostrophes
      .replace(/[“”]/g, '"') // smart quotes
      .replace(/[‘’]/g, "'") //
      .trim()
  );
}

export const updateFolderFile = async (folder, updates) => {
  const folderPath = path.resolve(folder);
  const filePath = path.join(folderPath, `story.txt`);

  try {
    if (!fs.existsSync(filePath)) {
      console.error("❌ File does not exist:", filePath);
      return false;
    }

    // Read old content
    const oldContent = fs.readFileSync(filePath, "utf8");
    let data = {};
    try {
      data = JSON.parse(oldContent);
    } catch (e) {
      console.error("❌ Existing file is not valid JSON.");
      return false;
    }

    // Merge updates into existing data
    const updatedData = { ...data, ...updates };

    // Save back to file
    fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), "utf8");

    console.log(`✅ File updated at: ${filePath}`);
    return true;
  } catch (error) {
    console.error("❌ Error updating file:", error);
    return false;
  }
};

export const generateFolderFile = async (folder, safeTitle, content) => {
  const folderPath = path.resolve(folder);
  const filePath = path.join(folderPath, `${safeTitle}.txt`);

  try {
    // Create nested folder structure if not exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true }); // ✅ allows "a/b/c"
    }

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");
    console.log(`✅ Content saved to: ${filePath}`);
    return true;
  } catch (error) {
    console.error("❌ Error writing file:", error);
    return false;
  }
};

export async function retryWithBackoff(
  fn,
  { retries = 3, baseDelay = 3000, maxDelay = 60000 } = {},
) {
  let attempt = 0;

  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;

      const status = error?.status;
      const retryInfo = error?.errorDetails?.find((d) =>
        d["@type"]?.includes("RetryInfo"),
      );

      const serverDelay = retryInfo?.retryDelay
        ? parseInt(retryInfo.retryDelay.replace("s", "")) * 1000
        : null;

      const delay = Math.min(serverDelay ?? baseDelay * 2 ** attempt, maxDelay);

      if (attempt > retries || status !== 429) {
        throw error;
      }

      console.warn(
        `⚠️ Gemini quota hit. Retrying in ${
          delay / 1000
        }s (attempt ${attempt}/${retries})`,
      );

      await new Promise((res) => setTimeout(res, delay));
    }
  }
}

export async function generateThumbnail(prompt, fileName) {
  const model = genAI.getGenerativeModel({
    model: "imagen-3.0-fast-generate-001",
  });

  const result = await model.generateContent([{ text: prompt }]);

  const imageBase64 =
    result.response.candidates[0].content.parts[0].inlineData.data;

  // ✅ Ensure folder exists
  const outputDir = path.join(process.cwd(), "thumbnails");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ✅ Save image
  const filePath = path.join(outputDir, fileName);
  const buffer = Buffer.from(imageBase64, "base64");
  fs.writeFileSync(filePath, buffer);

  console.log("✅ Thumbnail saved:", filePath);
  return filePath;
}
