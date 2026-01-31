import fs from "fs/promises";
import path from "path";
import { logBox, updateJSONOutput } from "../../helper/index.js";
import { runPipelineWithResume } from "../../helper/pipelineRunner.js";
import generateStory from "./generateStory.js";
import { getResumableState } from "./resumeHelper.js";

/** Merge story + SEO from currentData into folder JSON so the kept JSON has full details. */
async function ensureStoryAndSEOInJson(folder, safeTitle, data) {
  if (!folder || !safeTitle || !data) return;
  const storyAndSEO = {
    story_title: data.story_title,
    display_title: data.display_title,
    cold_opening: data.cold_opening,
    welcome_intro: data.welcome_intro,
    intro: data.intro,
    build_up: data.build_up,
    suspense: data.suspense,
    twist: data.twist,
    ending_line: data.ending_line,
    image_tags: data.image_tags,
    gemini_description: data.gemini_description,
    youtube_title: data.youtube_title,
    youtube_description: data.youtube_description,
    youtube_tags: data.youtube_tags,
    youtube_hashtags: data.youtube_hashtags,
  };
  const strip = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
  await updateJSONOutput(folder, safeTitle, strip(storyAndSEO));
}

/** After successful upload, remove audio/video/assets; keep only folder JSON. */
async function cleanupOutputKeepJsonOnly(folder) {
  if (!folder || typeof folder !== "string") return;
  const toRemove = [
    path.join(folder, "merger.mp3"),
    path.join(folder, "volume"),
    path.join(folder, "images"),
    path.join(folder, "videos"),
    path.join(folder, "video_merged.mp4"),
    path.join(folder, "video_merged_temp.mp4"),
    path.join(folder, "final_video.mp4"),
    path.join(folder, "thumbnail.png"),
    path.join(folder, "story.txt"),
    path.join(folder, "video_list.txt"),
    path.join(folder, "final_list.txt"),
  ];
  for (const p of toRemove) {
    try {
      const s = await fs.stat(p);
      if (s.isDirectory()) await fs.rm(p, { recursive: true });
      else await fs.unlink(p);
    } catch {
      // ignore missing
    }
  }
}

/** Ordered pipeline steps; resumeFrom is the first step to run. */
const STEP_ORDER = ["story", "tts", "images", "videos", "thumbnail", "endVideo", "upload"];

const STEP_LABELS = {
  story: "Generating Story .....",
  tts: "Generating Audios .....",
  images: "Generate Story Video Content .....",
  videos: "Generating Videos from Images and Audios ...",
  thumbnail: "📸 Generate Thumbnail",
  endVideo: "Merging Videos with Intro ...",
  upload: "Uploading to YouTube ...",
};

async function horrorPodcastAdda() {
  logBox("Horror Podcast Adda Start");
  try {
    const currentData = await runPipelineWithResume({
      stepOrder: STEP_ORDER,
      getResumableState,
      logStep: (name) => logBox(STEP_LABELS[name] || name),
      steps: {
        story: async () => ({ storyData: await generateStory() }),
        tts: async (p) => {
          const ttsData = await import("./generateTTS.js").then((mod) =>
            mod.default({ storyData: p?.storyData })
          );
          return ttsData?.storyData ? ttsData : { ...ttsData, storyData: ttsData };
        },
        images: async (p) => (await import("./generateImages.js")).default(p),
        videos: async (p) => (await import("./generateVideos.js")).default(p),
        thumbnail: async (p) => (await import("./generateThumbnail.js")).default(p),
        endVideo: async (p) => (await import("./endVideo.js")).default(p),
        upload: async (p) => (await import("./staticsToYoutube.js")).default(p),
      },
      onComplete: async (payload) => {
        console.log("Done. Video URL:", payload?.youtube_url || "Check YouTube Studio");
        if (payload?.folder && payload?.safeTitle) {
          await ensureStoryAndSEOInJson(payload.folder, payload.safeTitle, payload);
          await cleanupOutputKeepJsonOnly(payload.folder);
        }
      },
    });
  } catch (error) {
    console.error("❌ Pipeline failed:", error);
    process.exit(1);
  }
}

export default horrorPodcastAdda;
