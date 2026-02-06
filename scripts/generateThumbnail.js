import ffmpeg from "fluent-ffmpeg";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function findFontPath() {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "Arial";
}

export async function generateThumbnail(title) {
  await fs.ensureDir("thumbnails");
  const bg = path.join(projectRoot, "images/scene_1.jpg");
  const safeTitle = title.replace(/[:\n]/g, " ").replace(/'/g, "\\'");
  const font = findFontPath();

  return new Promise((resolve, reject) => {
    const vf =
      font !== "Arial"
        ? `scale=1280:720,drawtext=fontfile='${font}':text='${safeTitle}':fontcolor=white:fontsize=60:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-120`
        : `scale=1280:720,drawtext=text='${safeTitle}':fontcolor=white:fontsize=60:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-120`;
    ffmpeg(bg)
      .outputOptions(["-vf", vf])
      .output(path.join(projectRoot, "thumbnails/thumb.jpg"))
      .on("end", () => {
        console.log("✅ Thumbnail generated (thumbnails/thumb.jpg)");
        resolve();
      })
      .on("error", reject)
      .run();
  });
}
