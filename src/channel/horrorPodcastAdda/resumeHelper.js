import path from "path";
import fs from "fs/promises";
import { sanitizeFilename } from "../../helper/index.js";

// Match ensureFolderStructure output: src/output/horrorPodcastAdda/<safeTitle>
const HPA_BASE = path.join(process.cwd(), "src", "output", "horrorPodcastAdda");

/**
 * Load story data from folder. Our pipeline saves it as folder/story.txt via generateFolderFile.
 */
async function loadStoryData(folder) {
  const storyPath = path.join(folder, "story.txt");
  try {
    const raw = await fs.readFile(storyPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load merged state from folder's JSON (any *.json in folder).
 */
async function loadFolderState(folder) {
  let entries = [];
  try {
    entries = await fs.readdir(folder, { withFileTypes: true });
  } catch {
    return null;
  }
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);
  if (jsonFiles.length === 0) return null;
  const jsonPath = path.join(folder, jsonFiles[0]);
  try {
    const raw = await fs.readFile(jsonPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Detect the last completed step and build payload for the next step.
 * Returns { resumeFrom, payload } or null if nothing to resume.
 * resumeFrom is one of: "images" | "videos" | "thumbnail" | "endVideo" | "upload"
 */
export async function getResumableState() {
  try {
    await fs.access(HPA_BASE);
  } catch {
    return null;
  }

  const entries = await fs.readdir(HPA_BASE, { withFileTypes: true });
  const dirs = entries
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith(".") &&
        d.name !== "[object Promise]",
    )
    .map((d) => ({ name: d.name, path: path.join(HPA_BASE, d.name) }));

  // Prefer most recently modified folder
  const withMtime = await Promise.all(
    dirs.map(async (d) => {
      let mtime = 0;
      try {
        const s = await fs.stat(d.path);
        mtime = s.mtimeMs;
      } catch {}
      return { ...d, mtime };
    }),
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);

  for (const { name: dirName, path: folder } of withMtime) {
    const safeTitle = dirName;
    let storyData = await loadStoryData(folder);
    const state = await loadFolderState(folder);

    // If story.txt is missing (e.g. resume after crash), build minimal storyData from state + folder name
    if (!storyData || !(storyData.display_title || storyData.title)) {
      if (!state) continue;
      storyData = {
        display_title: state.display_title || state.title || safeTitle,
        title: state.title || safeTitle,
        safeTitle,
      };
    }

    const normalizedStory = {
      ...storyData,
      safeTitle,
      display_title: storyData.display_title || storyData.title,
    };

    const mergerPath = path.join(folder, "merger.mp3");
    const videoMergedPath = path.join(folder, "video_merged.mp4");
    const thumbnailPath = path.join(folder, "thumbnail.png");
    const finalVideoPath = path.join(folder, "final_video.mp4");

    const hasMerger = await fs
      .access(mergerPath)
      .then(() => true)
      .catch(() => false);
    const hasVideoMerged = await fs
      .access(videoMergedPath)
      .then(() => true)
      .catch(() => false);
    const hasThumbnail = await fs
      .access(thumbnailPath)
      .then(() => true)
      .catch(() => false);
    const hasFinalVideo = await fs
      .access(finalVideoPath)
      .then(() => true)
      .catch(() => false);

    const thumbFromState = state?.thumbnail_path;
    const finalFromState = state?.final_video;

    // Already fully uploaded — skip this folder
    if (state?.upload_status === "completed") {
      continue;
    }

    // Upload: need final_video + thumbnail
    if ((hasFinalVideo || finalFromState) && (hasThumbnail || thumbFromState)) {
      const final_video = finalFromState || finalVideoPath;
      const thumbnail_path = thumbFromState || thumbnailPath;
      if (state?.video_status === "completed") {
        return {
          resumeFrom: "upload",
          payload: {
            storyData: normalizedStory,
            folder,
            safeTitle,
            final_video,
            thumbnail_path,
          },
        };
      }
    }

    // EndVideo: need video_merged + thumbnail
    if (
      (hasVideoMerged || state?.video_merged) &&
      (hasThumbnail || thumbFromState)
    ) {
      if (state?.thumbnail_status === "completed") {
        return {
          resumeFrom: "endVideo",
          payload: {
            storyData: normalizedStory,
            folder,
            safeTitle,
            video_merged: state.video_merged || videoMergedPath,
            thumbnail_path: state.thumbnail_path || thumbnailPath,
          },
        };
      }
    }

    // Thumbnail: need video_merged (videos done)
    if (hasVideoMerged || state?.video_merged) {
      if (state?.videos_status === "completed") {
        return {
          resumeFrom: "thumbnail",
          payload: {
            storyData: normalizedStory,
            folder,
            safeTitle,
            audio_path: state?.audio_path || mergerPath,
            images: state?.images || [],
            video_merged: state?.video_merged || videoMergedPath,
            video_segments: state?.video_segments || [],
            videosDir: path.join(folder, "videos"),
          },
        };
      }
    }

    // Videos: need images done
    if (
      state?.images_status === "completed" &&
      Array.isArray(state?.images) &&
      state.images.length > 0
    ) {
      return {
        resumeFrom: "videos",
        payload: {
          storyData: normalizedStory,
          folder,
          safeTitle,
          audio_path: state?.audio_path || mergerPath,
          images: state.images,
        },
      };
    }

    // Images: need TTS done (merger.mp3)
    if (hasMerger) {
      return {
        resumeFrom: "images",
        payload: {
          storyData: normalizedStory,
          folder,
          safeTitle,
          audio_path: mergerPath,
        },
      };
    }
  }

  return null;
}
