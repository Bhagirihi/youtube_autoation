// excelHelpers.js
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Root‑level Excel by default ────────────────────────────────────────────
const defaultSheet = "Horror_Story";
const defaultPath = path.join(process.cwd(), `${defaultSheet}.xlsx`);

/**
 * Read rows from an Excel sheet (or return [] if file/sheet missing).
 * @param {string} filePath
 * @param {string} sheetName
 * @returns {Array<Object>}
 */
export function readExcel(filePath = defaultPath, sheetName = defaultSheet) {
  const file = path.resolve(filePath);
  if (!fs.existsSync(file)) return [];

  const wb = XLSX.readFile(file);
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

/**
 * Upsert videos into an Excel sheet.  Primary-key = video URL.
 * @param {Array<Object>} newVideos   – result from searchVideos()
 * @param {string} filePath
 * @param {string} sheetName
 */
export function saveExcel(
  newVideos,
  filePath = defaultPath,
  sheetName = defaultSheet
) {
  // 1️⃣ Read any existing data
  const rows = readExcel(filePath, sheetName);

  // 2️⃣ Build a quick lookup map (url ➜ rowIndex)
  const index = {};
  rows.forEach((row, i) => {
    index[row.url] = i;
  });

  // 3️⃣ De‑duplicate `newVideos` themselves (URL is the unique key)
  const uniqueBatch = Array.from(
    new Map(newVideos.map((v) => [v.url, v])).values()
  );

  // 4️⃣ Upsert
  let inserted = 0;
  let updated = 0;

  uniqueBatch.forEach((v) => {
    const row = {
      url: v.url,
      title: v.title,
      views: v.views ?? "",
      ago: v.ago ?? "",
      duration: v.duration ?? "",
      status: v.status ?? "",
      updatedAt: new Date().toISOString(),
      author: v.author?.name ?? "",
      slug: v.slug ?? "",
    };

    if (index[v.url] !== undefined) {
      rows[index[v.url]] = { ...rows[index[v.url]], ...row };
      updated++;
    } else {
      rows.push(row);
      inserted++;
    }
  });

  // 5️⃣ Write back to disk
  const wb = fs.existsSync(filePath)
    ? XLSX.readFile(filePath)
    : XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });

  wb.Sheets[sheetName] = ws;
  if (!wb.SheetNames.includes(sheetName)) wb.SheetNames.push(sheetName);

  XLSX.writeFile(wb, filePath);

  return { inserted, updated, total: rows.length };
}

export function updateExcel(
  slug,
  updateValue,
  filePath = defaultPath,
  sheetName = defaultSheet
) {
  const rows = readExcel(filePath, sheetName);

  const index = Object.fromEntries(rows.map((r, i) => [r.slug, i]));

  if (index[slug] !== undefined) {
    rows[index[slug]] = { ...rows[index[slug]], ...updateValue }; // ✔ merged
  } else {
    console.warn(`⚠️  Row with slug "${slug}" not found in ${sheetName}`);
    return false; // nothing written
  }

  const wb = fs.existsSync(filePath)
    ? XLSX.readFile(filePath)
    : XLSX.utils.book_new();
  wb.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows, { skipHeader: false });

  if (!wb.SheetNames.includes(sheetName)) wb.SheetNames.push(sheetName);
  XLSX.writeFile(wb, filePath);
  return true; // update success
}
