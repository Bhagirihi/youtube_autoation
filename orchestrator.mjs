// // orchestrator.mjs – live‑watch + parallel workers
// // -------------------------------------------------
// import { fileURLToPath } from "url";
// import { dirname, join } from "path";
// import fs from "fs";
// import chokidar from "chokidar";
// import XLSX from "xlsx";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

// // ───────────────── CONFIG ─────────────────
// const WORKERS = [
//   join(__dirname, "story_Fetcher.js"),
//   join(__dirname, "story_By_AI.js"),
//   join(__dirname, "story_AI_video.js"),
// ];
// const WATCH_GLOBS = [
//   join(__dirname, "**/*.{js,json,txt,mp3,jpg,jpeg,png,webp,xlsx}"),
// ];
// const COOLDOWN_MS = 1_000; // ignore events within 1 s debounce
// let lastKick = 0;
// // ──────────────────────────────────────────

// // Ensure workbook exists once at boot
// ensureExcelFile();

// console.log("🚀  Orchestrator started (watch‑mode enabled)\n");

// let queued = false; // flag: run already scheduled?
// let running = false; // flag: workers currently running?

// kickOff(); // initial run
// watch(); // start chokidar

// // ───────── helpers ─────────
// function ensureExcelFile() {
//   const p = join(__dirname, "horror_story.xlsx");
//   if (fs.existsSync(p)) return;
//   const wb = XLSX.utils.book_new();
//   const ws = XLSX.utils.aoa_to_sheet([
//     [
//       "Title",
//       "UploadedAt",
//       "Duration",
//       "Views",
//       "Channel",
//       "URL",
//       "Slug",
//       "CreatedDate",
//       "UpdatedDate",
//       "Note",
//       "AITitle",
//     ],
//   ]);
//   XLSX.utils.book_append_sheet(wb, ws, "horror_story");
//   XLSX.writeFile(wb, p);
//   console.log("📄  Created new horror_story.xlsx");
// }

// async function runWorker(path) {
//   try {
//     const { default: fn } = await import(`${path}?update=${Date.now()}`); // bypass module cache
//     if (typeof fn !== "function")
//       throw new Error("default export not a function");
//     const t0 = Date.now();
//     await fn();
//     console.log(
//       `✅  ${path.split("/").pop()} finished in ${(Date.now() - t0) / 1000}s`
//     );
//   } catch (e) {
//     console.error(`❌  ${path.split("/").pop()} failed:`, e.message);
//   }
// }

// // run workers concurrently
// async function runAll() {
//   running = true;
//   console.log("\n🕑  New run:", new Date().toLocaleTimeString());
//   await Promise.all(WORKERS.map(runWorker));
//   console.log("⭐  Run complete — waiting for changes…\n");
//   running = false;
//   if (queued) {
//     // change happened while running
//     queued = false;
//     kickOff();
//   }
// }

// // debounce wrapper

// function kickOff() {
//   const now = Date.now();
//   if (running) {
//     queued = true; // run later
//   } else if (now - lastKick > COOLDOWN_MS) {
//     lastKick = now;
//     runAll();
//   }
// }

// // chokidar
// function watch() {
//   const watcher = chokidar.watch(WATCH_GLOBS, {
//     ignoreInitial: true,
//     depth: 4,
//   });
//   watcher.on("all", (evt, file) => {
//     console.log(
//       `🔄  File change (${evt}): ${file.replace(__dirname + "/", "")}`
//     );
//     kickOff();
//   });
// }

// orchestrator.mjs – sequential 24×7 runner
//------------------------------------------
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/*──────────────── CONFIG ────────────────*/
const WORKERS = [
  join(__dirname, "story_Fetcher.js"),
  join(__dirname, "story_By_AI.js"),
  join(__dirname, "story_AI_video.js"),
];
const LOOP_DELAY_MS = 5_000; // wait 5 s between full cycles
/*─────────────────────────────────────────*/

// ① make sure the workbook exists once at boot
ensureExcelFile();

// ② kick off the endless loop
console.log("🚀  Orchestrator started (sequential, 24×7)\n");
mainLoop().catch((e) => {
  console.error("💥 Fatal orchestrator error:", e);
  process.exit(1); // let Render auto‑restart if something crazy happens
});

/*──────────────── helper fns ─────────────*/
async function mainLoop() {
  while (true) {
    console.log("🕑  Cycle start:", new Date().toLocaleTimeString());
    for (const path of WORKERS) await runWorker(path);
    console.log("⭐  Cycle complete — sleeping…\n");
    await new Promise((r) => setTimeout(r, LOOP_DELAY_MS));
  }
}

async function runWorker(path) {
  const label = path.split("/").pop();
  try {
    const { default: fn } = await import(`${path}?t=${Date.now()}`); // bypass cache
    if (typeof fn !== "function")
      throw new Error("default export not a function");
    const t0 = Date.now();
    await fn(); // run the task
    console.log(`✅  ${label} finished in ${(Date.now() - t0) / 1000}s`);
  } catch (e) {
    console.error(`❌  ${label} failed: ${e.message}`);
    // do *not* throw: we want the loop to continue with the next worker
  }
}

function ensureExcelFile() {
  const p = join(__dirname, "horror_story.xlsx");
  if (fs.existsSync(p)) return;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    [
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
    ],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "horror_story");
  XLSX.writeFile(wb, p);
  console.log("📄  Created new horror_story.xlsx");
}
