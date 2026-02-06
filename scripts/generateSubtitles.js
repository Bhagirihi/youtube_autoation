import fs from "fs-extra";

export async function generateSubtitles(text) {
  const lines = text.match(/.{1,80}(\s|$)/g) || [text];
  let time = 0;
  let srt = "";

  lines.forEach((line, i) => {
    const start = format(time);
    const duration = Math.max(2, line.length / 15);
    time += duration;
    const end = format(time);

    srt += `${i + 1}\n${start} --> ${end}\n${line.trim()}\n\n`;
  });

  await fs.ensureDir("temp");
  await fs.writeFile("temp/subtitles.srt", srt);
  console.log("✅ Subtitles generated");
}

function format(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(Math.floor(sec % 60)).padStart(2, "0");
  const ms = String(Math.floor((sec % 1) * 1000)).padStart(3, "0");
  return `${h}:${m}:${s},${ms}`;
}
