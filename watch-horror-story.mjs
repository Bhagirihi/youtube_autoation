import chokidar from "chokidar";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { fork } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, "Horror_Story.xlsx");

let queue = [];
let isProcessing = false;

// 1. Create Excel file if not exists
function createExcelIfNotExist() {
  if (!fs.existsSync(filePath)) {
    console.log("📄 File not found. Creating Horror_Story.xlsx...");
    const headers = [
      { Title: "", Url: "", Tags: "", Status: "" }, // initial row
    ];
    const worksheet = xlsx.utils.json_to_sheet(headers);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Stories");
    xlsx.writeFile(workbook, filePath);
    console.log("✅ File created with headers.");
  }
}

// 2. Add script to queue
function enqueueScript(scriptPath, label, row) {
  queue.push({ scriptPath, label, row });
  processQueue(); // Start processing if not already
}

// 3. Process queue
// function processQueue() {
//   if (isProcessing || queue.length === 0) return;

//   const { scriptPath, label, row } = queue.shift();
//   isProcessing = true;

//   console.log(`\n🚀 Running script for: ${label}`);
//   exec(`node ${scriptPath}`, (error, stdout, stderr) => {
//     if (error) console.error(`❌ Error in ${label}: ${error.message}`);
//     if (stdout) console.log(`📤 Output:\n${stdout}`);
//     if (stderr) console.error(`⚠️ Stderr:\n${stderr}`);

//     isProcessing = false;
//     processQueue(); // Process next one
//   });
// }
function processQueue() {
  if (isProcessing || queue.length === 0) return;

  const { scriptPath, label, row } = queue.shift();
  isProcessing = true;

  console.log(`\n🚀 Running script for: ${label}`);

  const child = fork(scriptPath, [], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
  });

  // ✅ Send the row to the child
  child.send({ label, row });

  child.on("message", (msg) => {
    console.log(`📤 Message from ${label}:`, msg);
  });

  child.on("exit", (code) => {
    console.log(`✅ Script "${label}" finished with code ${code}`);
    isProcessing = false;
    processQueue();
  });
}

// 4. Evaluate conditions and enqueue
function readAndCheckExcel() {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const scriptWriter = sheetData.filter((row) =>
      row.status?.toLowerCase().includes("fetched")
    );
    const scriptRefiner = sheetData.filter((row) =>
      row.status?.toLowerCase().includes("written")
    );
    const scriptVoiceOver = sheetData.filter((row) =>
      row.status?.toLowerCase().includes("refined")
    );
    const scriptVideo = sheetData.filter((row) =>
      row.status?.toLowerCase().includes("voiceovered")
    );

    const videoToYouTube = sheetData.filter((row) =>
      row.status?.toLowerCase().includes("videoPrepared")
    );

    if (scriptWriter.length) {
      console.log(
        `📝 Found ${JSON.stringify(sheetData[0])} stories to process...`
      );
      enqueueScript(
        path.join(__dirname, "scriptWriter.js"),
        "scriptWriter",
        JSON.stringify(sheetData[0])
      );
    }

    if (scriptRefiner.length) {
      enqueueScript(
        path.join(__dirname, "scriptRefiner.js"),
        "scriptRefiner",
        JSON.stringify(sheetData[0])
      );
    }

    if (scriptVoiceOver.length) {
      enqueueScript(
        path.join(__dirname, "scriptVoiceOver.js"),
        "scriptVoiceOver"
      );
    }

    if (scriptVideo.length) {
      enqueueScript(path.join(__dirname, "scriptVideo.js"), "scriptVideo");
    }

    if (videoToYouTube.length) {
      enqueueScript(
        path.join(__dirname, "videoToYouTube.js"),
        "Video Uploaded to YouTube"
      );
    }

    if (
      !scriptWriter.length &&
      !scriptRefiner.length &&
      !scriptVoiceOver.length &&
      !scriptVideo.length &&
      !videoToYouTube.length
    ) {
      console.log("⚠️ No matching stories to process.");
      console.log("Fetching new videos. Please wait...");
      enqueueScript(
        path.join(__dirname, "fetchYoutube.js"),
        "Finding new videos"
      );
    }
  } catch (error) {
    console.error("❌ Error reading Excel:", error);
  }
}

// 5. Init
createExcelIfNotExist();
readAndCheckExcel();

chokidar.watch(filePath).on("change", () => {
  console.log("\n📂 File updated, checking...");
  readAndCheckExcel();
});
