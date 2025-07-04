// makeVideos.mjs
import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import XLSX from "xlsx";
import cliProgress from "cli-progress";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ===== CONFIG =========================================== */
const SHEET_INDEX = 0;
const COL_SLUG = "Slug";
const COL_NOTE = "Note";
const FADE_SEC = 1.5;
const FRAME_W = 1920;
const FRAME_H = 1080;

const audioDir = path.join(__dirname, "audio_scripts");
const imgRoot = path.join(__dirname, "images");
const outDir = path.join(__dirname, "AI_videos");
const bgmFile = path.join(__dirname, "bgm", "music.mp3");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function mixAudio(narration, outFile) {
  if (fs.existsSync(bgmFile)) {
    spawnSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        narration,
        "-i",
        bgmFile,
        "-filter_complex",
        "[1:a]volume=0.2[a1];[0:a][a1]amix=inputs=2:duration=first",
        "-c:a",
        "libmp3lame",
        "-ar",
        "48000",
        outFile,
      ],
      { stdio: "inherit" }
    );
  } else {
    fs.copyFileSync(narration, outFile);
  }
}

function audioDurationSec(file) {
  const probe = spawnSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    file,
  ]);
  return Math.ceil(parseFloat(probe.stdout.toString().trim()));
}

function ffmpegArgs(images, audio, outFile, sceneSec) {
  const args = [];
  images.forEach((f) => {
    args.push("-loop", "1", "-t", (sceneSec + FADE_SEC).toString(), "-i", f);
  });

  args.push("-i", audio);

  let chain = "";
  images.forEach((_, i) => {
    chain +=
      `[${i}:v]scale=${FRAME_W}:${FRAME_H}:force_original_aspect_ratio=decrease,` +
      `pad=${FRAME_W}:${FRAME_H}:(ow-iw)/2:(oh-ih)/2,setsar=1[s${i}];`;
  });

  let offset = 0;
  for (let i = 0; i < images.length - 1; i++) {
    const start = offset + sceneSec;
    const xfade = `xfade=transition=fade:duration=${FADE_SEC}:offset=${start}`;
    chain +=
      i === 0
        ? `[s0][s1]${xfade}[v1];`
        : `[v${i}][s${i + 1}]${xfade}[v${i + 1}];`;
    offset += sceneSec;
  }
  const lastVid = images.length > 1 ? `[v${images.length - 1}]` : "[s0]";

  args.push(
    "-filter_complex",
    chain.slice(0, -1),
    "-map",
    lastVid,
    "-map",
    `${images.length}:a`,
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-r",
    "30",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    "-y",
    outFile,
    "-progress",
    "pipe:1",
    "-nostats",
    "-ar",
    "48000"
  );
  return args;
}

export default async function generateAIVideos() {
  const wb = XLSX.readFile(path.join(__dirname, "horror_story.xlsx"));
  const ws = wb.Sheets[wb.SheetNames[SHEET_INDEX]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const todo = rows.filter(
    (r) => (r[COL_NOTE] || "").trim() === "Audio Created"
  );
  console.log(`\n🗂️  ${todo.length} video(s) to build\n`);

  let doneCount = 0;
  rows.forEach((row) => {
    if ((row[COL_NOTE] || "").trim() !== "Audio Created") return;

    const slug = (row[COL_SLUG] || "").trim();
    if (!slug) {
      console.warn("Row missing slug – skipped");
      return;
    }

    const narration = path.join(audioDir, `${slug}.mp3`);
    if (!fs.existsSync(narration)) {
      console.warn(`Audio not found: ${slug}`);
      return;
    } else {
      console.log(`Audio found: ${narration} ${slug}`);
    }

    const images = fs
      .readdirSync(imgRoot)
      .filter((f) => /\.(jpe?g|png)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => path.join(imgRoot, f));

    if (!images.length) {
      console.warn("No still images in images/");
      return;
    }

    console.log(
      `┌── (${++doneCount}/${todo.length}) ${slug} – ${images.length} stills`
    );

    // const mixed = path.join(imgRoot, "mixed_tmp.mp3");
    const mixed = path.join(imgRoot, `${slug}_mixed.mp3`);
    mixAudio(narration, mixed);

    const audioSec = audioDurationSec(mixed);
    const sceneSec = Math.ceil(audioSec / images.length);

    const outFile = path.join(outDir, `${slug}.mp4`);
    const ff = spawn("ffmpeg", ffmpegArgs(images, mixed, outFile, sceneSec));

    const totalVidSec = images.length * sceneSec;
    const bar = new cliProgress.SingleBar({
      format: "    [{bar}] {percentage}% | {value}/{total}s",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
    });
    bar.start(totalVidSec, 0);

    ff.stdout.setEncoding("utf8");
    ff.stdout.on("data", (line) => {
      const m = line.match(/out_time_ms=(\d+)/);
      if (m) {
        const sec = parseInt(m[1], 10) / 1e6;
        bar.update(Math.min(sec, totalVidSec));
      }
      if (line.trim() === "progress=end") bar.update(totalVidSec);
    });
    ff.stderr.pipe(process.stderr);

    ff.on("close", (code) => {
      bar.stop();
      fs.unlinkSync(mixed);
      if (code === 0) {
        console.log(`    ✅  Saved → ${outFile}\n`);
        row[COL_NOTE] = "AI Video Created";
      } else {
        console.warn(`    ❌  FFmpeg exited with code ${code}\n`);
      }

      if (doneCount === todo.length) {
        wb.Sheets[wb.SheetNames[SHEET_INDEX]] = XLSX.utils.json_to_sheet(rows, {
          header: Object.keys(rows[0]),
        });
        XLSX.writeFile(wb, path.join(__dirname, "horror_story.xlsx"));
        console.log("⭐  Workbook updated – batch complete");
      }
    });
  });
}
