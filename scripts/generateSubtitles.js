import path from "path";
import fs from "fs-extra";

function getTempDir() {
  return path.join(process.env.DATA_DIR || process.cwd(), "temp");
}

function formatSrtTime(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  const ms = String(Math.floor((sec % 1) * 1000)).padStart(3, "0");
  return `${h}:${m}:${s},${ms}`;
}

/**
 * Generate SRT. If temp/story.json and temp/paragraph_timings.json exist, use them for
 * accurate paragraph-synced subtitles; otherwise use text with estimated timing.
 */
export async function generateSubtitles(text) {
  const tempDir = getTempDir();
  await fs.ensureDir(tempDir);
  const timingsPath = path.join(tempDir, "paragraph_timings.json");
  const storyPath = path.join(tempDir, "story.json");

  let srt = "";
  let usedParagraphSync = false;

  try {
    const timings = await fs.readJson(timingsPath);
    const story = await fs.readJson(storyPath);
    const paragraphs = story?.paragraphs?.filter((p) => (p?.text || "").trim());
    if (
      Array.isArray(timings) &&
      Array.isArray(paragraphs) &&
      timings.length === paragraphs.length
    ) {
      paragraphs.forEach((p, i) => {
        const start = timings[i].start ?? 0;
        const end = timings[i].end ?? start + (timings[i].duration ?? 0);
        srt += `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${(p.text || "").trim()}\n\n`;
      });
      usedParagraphSync = true;
    }
  } catch {
    // no timings or story; fall back to text-split
  }

  if (!usedParagraphSync) {
    const lines = text.match(/.{1,80}(\s|$)/g) || [text];
    let time = 0;
    lines.forEach((line, i) => {
      const start = formatSrtTime(time);
      const duration = Math.max(2, line.length / 15);
      time += duration;
      const end = formatSrtTime(time);
      srt += `${i + 1}\n${start} --> ${end}\n${line.trim()}\n\n`;
    });
  }

  await fs.writeFile(path.join(tempDir, "subtitles.srt"), srt);
  console.log(usedParagraphSync ? "✅ Subtitles generated (paragraph-synced)" : "✅ Subtitles generated");
}
