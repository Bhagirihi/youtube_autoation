/**
 * Run a single pipeline step. Used by the UI for manual step execution.
 * Usage: node scripts/runStep.js <step>
 * Steps: story | audio | subtitles | images | video | thumbnail
 */
import "dotenv/config";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { preflight } from "./preflight.js";
import { generateStory } from "./generateStory.js";
import { generateAudio } from "./generateAudio.js";
import { generateSubtitles } from "./generateSubtitles.js";
import { downloadImages } from "./downloadImages.js";
import { makeVideo } from "./makeVideo.js";
import { generateThumbnail } from "./generateThumbnail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, "..");
const tempDir = path.join(dataDir, "temp");

async function loadStory() {
  const p = path.join(tempDir, "story.json");
  if (!(await fs.pathExists(p))) return null;
  return fs.readJson(p);
}

const steps = {
  story: async () => {
    await preflight();
    await generateStory();
  },
  audio: async () => {
    const story = await loadStory();
    if (!story) throw new Error("No story. Run Story step first.");
    await generateAudio();
  },
  subtitles: async () => {
    const story = await loadStory();
    if (!story?.story) {
      const txt = path.join(tempDir, "story.txt");
      if (await fs.pathExists(txt)) {
        const text = await fs.readFile(txt, "utf-8");
        await generateSubtitles(text);
        return;
      }
      throw new Error("No story. Run Story step first.");
    }
    await generateSubtitles(story.story);
  },
  images: async () => {
    const story = await loadStory();
    if (!story) throw new Error("No story. Run Story step first.");
    const prompts = story.paragraphs?.length
      ? story.paragraphs.map((p) => p.imagePrompt)
      : story.scenes || [];
    if (!prompts.length) throw new Error("No image prompts in story.");
    await downloadImages(prompts);
  },
  video: async () => {
    let segmentDurations = null;
    try {
      const timings = await fs.readJson(path.join(tempDir, "paragraph_timings.json"));
      segmentDurations = timings.map((t) => t.duration);
    } catch {}
    await makeVideo(segmentDurations ?? 1);
  },
  thumbnail: async () => {
    const story = await loadStory();
    if (!story?.title) throw new Error("No title. Run Story step first.");
    await generateThumbnail(story.title);
  },
};

const step = process.argv[2]?.toLowerCase();
if (!step || !steps[step]) {
  console.error("Usage: node scripts/runStep.js <step>");
  console.error("Steps: " + Object.keys(steps).join(" | "));
  process.exit(1);
}

steps[step]()
  .then(() => {
    console.log(`[Step: ${step}] Done.`);
  })
  .catch((err) => {
    console.error(err?.message || err);
    process.exit(1);
  });
