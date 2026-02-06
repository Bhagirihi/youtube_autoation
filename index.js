import "dotenv/config";
import { preflight } from "./scripts/preflight.js";
import { generateStory } from "./scripts/generateStory.js";
import { generateAudio } from "./scripts/generateAudio.js";
import { generateSubtitles } from "./scripts/generateSubtitles.js";
import { downloadImages } from "./scripts/downloadImages.js";
import { makeVideo } from "./scripts/makeVideo.js";
import { generateThumbnail } from "./scripts/generateThumbnail.js";

function elapsed(start) {
  return ((Date.now() - start) / 1000).toFixed(1) + "s";
}

async function main() {
  const totalStart = Date.now();
  await preflight();
  const data = await generateStory();
  console.log("\n--- STORY ---");
  console.log("Title:", data.title);
  console.log("Story:", data.story);
  console.log("--- END STORY ---\n");
  console.log("[1/1] Story done");

  // let t = Date.now();
  // await generateAudio();
  // console.log(`[2/6] Audio done (${elapsed(t)})`);
  // t = Date.now();
  // await generateSubtitles(data.story);
  // console.log(`[3/6] Subtitles done (${elapsed(t)})`);
  // t = Date.now();
  // await downloadImages(data.scenes);
  // console.log(`[4/6] Images done (${elapsed(t)})`);
  // t = Date.now();
  // await makeVideo(data.scenes.length);
  // console.log(`[5/6] Video done (${elapsed(t)})`);
  // t = Date.now();
  // await generateThumbnail(data.title);
  // console.log(`[6/6] Thumbnail done (${elapsed(t)})`);

  console.log("🎉 Story pipeline complete — total " + elapsed(totalStart));
}

main().catch((err) => {
  console.error("Fatal:", err?.message || err);
  process.exit(1);
});
