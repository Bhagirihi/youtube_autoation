import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { voiceByBhashini } from "../../helper/TTS/bhasini.js";
import mergeAudios from "../../helper/TTS/mergeAudio.js";
import {
  splitTextIntoChunks,
  sanitizeFilename,
  ensureFolderStructure,
  updateJSONOutput,
} from "../../helper/index.js";

/**
 * Generate TTS for Horror Podcast Adda story
 * Splits story into chunks and generates Hindi TTS using Bhashini
 */
export default async function generateTTS({ storyData }) {
  const {
    display_title,
    intro,
    build_up,
    suspense,
    twist,
    ending_line,
    welcome_intro,

    safeTitle: existingSafeTitle,
  } = storyData;

  // Validate and get display_title - ensure it's a string, not a Promise
  let titleToUse = display_title || storyData.title;
  if (!titleToUse) {
    throw new Error("❌ Story data missing display_title or title");
  }

  // If it's a Promise, we need to await it (shouldn't happen, but safety check)
  if (titleToUse instanceof Promise) {
    console.warn("⚠️ display_title is a Promise, awaiting...");
    titleToUse = await titleToUse;
  }

  if (typeof titleToUse !== "string") {
    throw new Error(
      `❌ Invalid display_title: expected string, got ${typeof titleToUse}`
    );
  }

  // Use existing safeTitle if available and valid, otherwise sanitize
  let safeTitle;
  if (
    existingSafeTitle &&
    typeof existingSafeTitle === "string" &&
    !existingSafeTitle.includes("Promise")
  ) {
    safeTitle = existingSafeTitle;
  } else {
    safeTitle = await sanitizeFilename(titleToUse);
  }

  // Final validation - ensure safeTitle is a string (not a Promise)
  if (safeTitle instanceof Promise) {
    console.warn("⚠️ sanitizeFilename returned a Promise, awaiting...");
    safeTitle = await safeTitle;
  }

  if (typeof safeTitle !== "string") {
    throw new Error(
      `❌ Invalid safeTitle: expected string, got ${typeof safeTitle}`
    );
  }

  const folder = await ensureFolderStructure(`horrorPodcastAdda/${safeTitle}`);
  const volumeDir = path.join(folder, "volume");
  const mergedAudioPath = path.join(folder, "merger.mp3");

  // Story + SEO to persist in folder JSON (so folder JSON has full story and SEO data)
  const storyAndSEO = {
    story_title: storyData.story_title,
    display_title: storyData.display_title,
    cold_opening: storyData.cold_opening,
    welcome_intro: storyData.welcome_intro,
    intro: storyData.intro,
    build_up: storyData.build_up,
    suspense: storyData.suspense,
    twist: storyData.twist,
    ending_line: storyData.ending_line,
    image_tags: storyData.image_tags,
    gemini_description: storyData.gemini_description,
    youtube_title: storyData.youtube_title,
    youtube_description: storyData.youtube_description,
    youtube_tags: storyData.youtube_tags,
    youtube_hashtags: storyData.youtube_hashtags,
  };
  const stripUndefined = (obj) =>
    Object.fromEntries(
      Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
    );

  if (!fs.existsSync(volumeDir)) {
    fs.mkdirSync(volumeDir, { recursive: true });
  }

  if (fs.existsSync(mergedAudioPath)) {
    await updateJSONOutput(folder, safeTitle, {
      ...stripUndefined(storyAndSEO),
      audio_path: mergedAudioPath,
      tts_status: "already_completed",
    });
    return {
      ...storyData,
      audio_path: mergedAudioPath,
      folder,
      safeTitle,
    };
  }

  // Check if audio chunks already exist in volume folder
  let existingAudioFiles = [];
  if (fs.existsSync(volumeDir)) {
    try {
      const files = await fsPromises.readdir(volumeDir);
      existingAudioFiles = files.filter(
        (f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".m4a")
      );
    } catch (err) {
      console.warn("⚠️ Could not read volume directory:", err.message);
    }
  }

  if (existingAudioFiles.length > 0) {
    const mergedPath = await mergeAudios(folder);
    await updateJSONOutput(folder, safeTitle, {
      ...stripUndefined(storyAndSEO),
      audio_path: mergedPath,
      tts_status: "merged_existing",
      chunks_count: existingAudioFiles.length,
    });
    return {
      ...storyData,
      audio_path: mergedPath,
      folder,
      safeTitle,
    };
  }

  // Combine all story segments
  const storySegments = [
    { name: "cold_opening", text: cold_opening || "" },
    { name: "welcome_intro", text: welcome_intro || "" },
    { name: "intro", text: intro || "" },
    { name: "build_up", text: build_up || "" },
    { name: "suspense", text: suspense || "" },
    { name: "twist", text: twist || "" },
    { name: "ending_line", text: ending_line || "" },
  ].filter((seg) => seg.text && seg.text.trim());

  // Split each segment into chunks and create transcript JSON
  const transcriptJson = [];
  let chunkIndex = 1;

  for (const segment of storySegments) {
    const chunks = await splitTextIntoChunks(segment.text, 250);
    for (const chunk of chunks) {
      transcriptJson.push({
        part: chunk.part,
        segment: segment.name,
        index: chunkIndex++,
      });
    }
  }

  await voiceByBhashini(transcriptJson, folder);
  const mergedPath = await mergeAudios(folder);
  await updateJSONOutput(folder, safeTitle, {
    ...stripUndefined(storyAndSEO),
    audio_path: mergedPath,
    tts_status: "completed",
    chunks_count: transcriptJson.length,
  });
  return {
    ...storyData,
    audio_path: mergedPath,
    folder,
    safeTitle,
  };
}
