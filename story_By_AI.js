// tts_worker.mjs – ES‑module version with progress & idempotency
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import XLSX from "xlsx";
import { remove } from "diacritics";
import Sanscript from "sanscript";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ───── constants & paths ───── */
const EXCEL_FILE = path.join(__dirname, "horror_story.xlsx");
const SHEET = "horror_story";
const TXT_DIR = path.join(__dirname, "story_scripts");
const OUT_DIR = path.join(__dirname, "audio_scripts");
const F_VOICE_ID = "hi-IN-SwaraNeural";
const M_VOICE_ID = "hi-IN-MadhurNeural";
const MP3_FORMAT = "audio-48khz-192kbitrate-mono-mp3";
const EDGE_TTS_PKG = "@echristian/edge-tts";

const SPEECH_RATE = "-5%";
const PITCH = "-10%";
const STYLE = "narration-professional";
const STYLE_DEGREE = 1.0;
const PAR_SIZE = 3; // paragraph join length

/* ───── helpers ───── */
const todayISO = () => new Date().toISOString().slice(0, 10);

function createSlug(txt = "") {
  return remove(Sanscript.t(txt, "devanagari", "iast"))
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function candidateTxtNames(row) {
  // const sanitized = (row.AITitle || "").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  const slug = createSlug(row.Slug);
  // const dur = (row.Duration || "").replace(/\s/g, "");
  console.log(slug);
  return [`${row.Slug}.txt`];
}

function loadRows() {
  if (!fs.existsSync(EXCEL_FILE)) return [];
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets[SHEET];
  return ws ? XLSX.utils.sheet_to_json(ws) : [];
}

function saveRows(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, SHEET);
  XLSX.writeFile(wb, EXCEL_FILE);
}

function cleanAndParagraphText(raw = "") {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const sentences = lines.reduce(
    (acc, l) => {
      const last = acc.at(-1) || "";
      if (last.length < 40 || !/[।!?]$/.test(last))
        acc[acc.length - 1] = (last + " " + l).trim();
      else acc.push(l);
      return acc;
    },
    [""]
  );
  const paras = [];
  for (let i = 0; i < sentences.length; i += PAR_SIZE)
    paras.push(sentences.slice(i, i + PAR_SIZE).join(" "));
  return paras.join("\n\n");
}

/* ───── MAIN ───── */
export default async function generateStoryByAI() {
  const { synthesize } = await import(EDGE_TTS_PKG);
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const rows = loadRows();
  const targets = rows.filter((r) => r.Note === "Story written");
  const total = targets.length;
  let processed = 0;

  if (!total)
    return console.log("ℹ️  Nothing to do – no new ‘Story written’ rows.");

  for (const row of targets) {
    console.log(`\n[${++processed}/${total}] Processing: ${row.Title}`);

    // 1️⃣ locate TXT
    let txtPath;
    for (const name of candidateTxtNames(row)) {
      const p = path.join(TXT_DIR, name);
      try {
        await fsp.access(p);
        txtPath = p;
        break;
      } catch {}
    }
    if (!txtPath) {
      console.warn("  ⚠️  Transcript not found, skipping.");
      continue;
    }

    // 2️⃣ derive MP3 path + idempotency check
    const outName = path.basename(txtPath).replace(/\.txt$/, ".mp3");
    const outPath = path.join(OUT_DIR, outName);
    if (fs.existsSync(outPath)) {
      console.log("  ⏭️  MP3 already exists – skipping.");
      row.Note = "Audio Created";
      row.UpdatedDate = todayISO();
      continue;
    }

    // 3️⃣ read + chunk
    let remaining = await fsp.readFile(txtPath, "utf8");
    const chunks = [];
    while (remaining.length) {
      let chunk = remaining.slice(0, 4900);
      const cut = chunk.lastIndexOf("\n");
      if (cut > 2000) chunk = chunk.slice(0, cut);
      chunks.push(chunk.trim());
      remaining = remaining.slice(chunk.length);
    }
    console.log(
      `  • Chunked into ${chunks.length} block${chunks.length > 1 ? "s" : ""}`
    );

    // 4️⃣ synthesize each chunk
    const buffers = [];
    for (let i = 0; i < chunks.length; i++) {
      process.stdout.write(`    ↳ Synthesizing ${i + 1}/${chunks.length} … `);
      const { audio } = await synthesize({
        text: chunks[i],
        voice: M_VOICE_ID,
        format: MP3_FORMAT,
        rate: SPEECH_RATE,
        pitch: PITCH,
        style: STYLE,
        styleDegree: STYLE_DEGREE,
      });
      buffers.push(Buffer.from(await audio.arrayBuffer()));
      process.stdout.write("done\n");
    }

    // 5️⃣ write MP3
    await fsp.writeFile(outPath, Buffer.concat(buffers));
    console.log(`  ✅  MP3 saved → ${outName}`);

    // 6️⃣ update workbook row
    row.Note = "Audio Created";
    row.UpdatedDate = todayISO();
  }

  saveRows(rows);
  console.log("\n📊  Workbook updated.");
}
