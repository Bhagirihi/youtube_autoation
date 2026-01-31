import ytSearch from "yt-search";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";

import {
  ensureFolderStructure,
  sanitizeFilename,
  saveJSONOutput,
  updateJSONOutput,
  saveToExcel,
  logBox,
} from "../../helper/index.js";

import fetchTranscript from "../../helper/transcript/index.js";
import { voiceByBhashini } from "../../helper/TTS/bhasini.js";
import { downloadYouTubeVideo } from "../../helper/YTDownload/index.js";
import { mergeVideoAndAudio } from "../../helper/AIVideo/mergeAudioVideo.js";
import mergeAudios from "../../helper/TTS/mergeAudio.js";
import { getYoutubeMovieSEO } from "../../helper/GenerateTitles/CPDTitels.js";
import { uploadToYouTubeAndRecord } from "../../helper/youtubeUploadAndRecord.js";

// const MAX_DURATION_SECONDS = 900; // 15 minutes
const MIN_VIEWS = 10000; // 10k+
const MAX_RESULTS = 5;

const OUTPUT_BASE = path.resolve("src/output");
const CPD_BASE = path.join(OUTPUT_BASE, "cinePlotDecode");
const PROCESSED_VIDEOS_FILE = path.join(CPD_BASE, "processed_videos.json");

/** Extract YouTube video ID from URL for consistent comparison. */
function getVideoId(url) {
  if (!url || typeof url !== "string") return null;
  const m = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:\?|&|$)/);
  return m ? m[1] : null;
}

/** Load set of already-processed video IDs (from JSON file + existing output folders). */
async function getProcessedVideoIds() {
  const ids = new Set();
  try {
    if (fsSync.existsSync(PROCESSED_VIDEOS_FILE)) {
      const raw = await fs.readFile(PROCESSED_VIDEOS_FILE, "utf-8");
      const urls = JSON.parse(raw);
      if (Array.isArray(urls)) urls.forEach((u) => getVideoId(u) && ids.add(getVideoId(u)));
    }
  } catch {
    // ignore
  }
  if (!fsSync.existsSync(CPD_BASE)) return ids;
  const dirs = await fs.readdir(CPD_BASE, { withFileTypes: true }).catch(() => []);
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const folder = path.join(CPD_BASE, d.name);
    const files = await fs.readdir(folder).catch(() => []);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    for (const jf of jsonFiles) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(folder, jf), "utf-8"));
        if (data.url) ids.add(getVideoId(data.url));
      } catch {
        // ignore
      }
    }
  }
  return ids;
}

/** Append source video URL to processed list so it is not picked again. */
async function addProcessedVideo(url) {
  if (!url || !getVideoId(url)) return;
  try {
    let list = [];
    if (fsSync.existsSync(PROCESSED_VIDEOS_FILE)) {
      const raw = await fs.readFile(PROCESSED_VIDEOS_FILE, "utf-8");
      list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];
    }
    if (list.includes(url)) return;
    list.push(url);
    if (!fsSync.existsSync(CPD_BASE)) await fs.mkdir(CPD_BASE, { recursive: true });
    await fs.writeFile(PROCESSED_VIDEOS_FILE, JSON.stringify(list, null, 2));
  } catch (err) {
    console.warn("Could not save processed video URL:", err.message);
  }
}

/** Returns { folder, safeTitle, storyObj } if a folder has volume/*.mp3 but no merger.mp3 or no final_output.mp4 */
async function getResumableFolder() {
  try {
    if (!fsSync.existsSync(CPD_BASE)) return null;
    const dirs = await fs.readdir(CPD_BASE, { withFileTypes: true });
    const folders = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
    for (const name of folders) {
      const folder = path.join(CPD_BASE, name);
      const volumeDir = path.join(folder, "volume");
      const mergerPath = path.join(folder, "merger.mp3");
      const finalPath = path.join(folder, "final_output.mp4");
      if (!fsSync.existsSync(volumeDir)) continue;
      const volumeFiles = await fs.readdir(volumeDir).catch(() => []);
      const hasMp3 = volumeFiles.some((f) => f.endsWith(".mp3"));
      if (!hasMp3) continue;
      const needsMerge = !fsSync.existsSync(mergerPath);
      const needsFinal = !fsSync.existsSync(finalPath);
      if (!needsMerge && !needsFinal) continue;
      const jsonFiles = (await fs.readdir(folder).catch(() => [])).filter((f) =>
        f.endsWith(".json")
      );
      let storyObj = null;
      let safeTitle = name;
      for (const jf of jsonFiles) {
        const raw = await fs
          .readFile(path.join(folder, jf), "utf-8")
          .catch(() => null);
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (data.transcript && data.url) {
          storyObj = data;
          safeTitle = path
            .basename(jf, ".json")
            .replace(/[\n\r]+/g, "")
            .trim();
          break;
        }
      }
      if (!storyObj) continue;
      return { folder, safeTitle, storyObj, needsMerge, needsFinal };
    }
    return null;
  } catch {
    return null;
  }
}

const cinePlotDecode = async (query = "Movie Explain in Hindi") => {
  logBox("CINEPLOT DECODE", query);

  try {
    let folder, safeTitle, storyObj;

    const resumable = await getResumableFolder();
    if (resumable) {
      logBox("RESUME", resumable.folder);
      folder = resumable.folder;
      safeTitle = resumable.safeTitle;
      storyObj = resumable.storyObj;
      const videoPath = path.join(folder, "video.mp4");

      if (resumable.needsMerge) {
        const audioPath = await mergeAudios(folder);
        await updateJSONOutput(folder, safeTitle, {
          audio_path: audioPath,
          video_path: videoPath,
        });
        logBox("AUDIO MERGED", audioPath);
      }

      if (!fsSync.existsSync(videoPath) && storyObj.url) {
        await downloadYouTubeVideo(
          storyObj.url,
          storyObj.title,
          "highest",
          true,
          "mp4",
          videoPath,
          folder
        );
      }

      if (
        resumable.needsFinal &&
        fsSync.existsSync(path.join(folder, "merger.mp3")) &&
        fsSync.existsSync(videoPath)
      ) {
        const finalVideoPath = await mergeVideoAndAudio(
          folder,
          "merger.mp3",
          "video.mp4"
        );
        await updateJSONOutput(folder, safeTitle, {
          final_video: finalVideoPath,
        });
        logBox("FINAL VIDEO READY", finalVideoPath);
        const excelPath = path.join(CPD_BASE, "output.xlsx");
        await saveToExcel(excelPath, {
          title: safeTitle.replace(/[\n\r]+/g, "").trim(),
        });
        const seo = await getYoutubeMovieSEO(storyObj.title);
        if (seo) {
          try {
            const uploadTitle =
              (seo.youtube_title && seo.youtube_title.trim()) ||
              storyObj.title ||
              "Movie Explain in Hindi";
            const uploadDesc =
              (seo.youtube_description && seo.youtube_description.trim()) ||
              storyObj.description ||
              "Movie Explain in Hindi. Full story and ending explained.";
            const { youtube_url } = await uploadToYouTubeAndRecord({
              folder,
              safeTitle,
              YTChannel: "CinePlotDecode",
              videoPath: finalVideoPath,
              title: uploadTitle,
              description: uploadDesc,
              tags: Array.isArray(seo.youtube_tags) ? seo.youtube_tags : [],
              privacyStatus: "private",
            });
            logBox("YOUTUBE UPLOAD", youtube_url);
            await addProcessedVideo(storyObj.url);
          } catch (uploadErr) {
            console.error("YouTube upload failed:", uploadErr.message);
          }
        }
        return finalVideoPath;
      }
      return folder;
    }

    /* --------------------------------------------------
     * 1. SEARCH YOUTUBE
     * -------------------------------------------------- */
    logBox("SEARCH START", query);
    const { videos = [] } = await ytSearch(query);
    if (!videos.length) {
      logBox("NO VIDEOS FOUND", query);
      return [];
    }

    /* --------------------------------------------------
     * 2. FILTER VIDEOS (exclude already processed/uploaded)
     * -------------------------------------------------- */
    const processedIds = await getProcessedVideoIds();
    const filteredVideos = videos.filter(
      (v) => v.views >= MIN_VIEWS && !processedIds.has(getVideoId(v.url))
    );

    if (!filteredVideos.length) {
      logBox("NO SUITABLE VIDEOS", "All filtered or already processed");
      return [];
    }

    /* --------------------------------------------------
     * 3. PICK TOP VIDEO
     * -------------------------------------------------- */
    const topVideos = filteredVideos.slice(0, MAX_RESULTS).map((v) => ({
      title: v.title,
      url: v.url,
      views: v.views,
      duration: v.timestamp,
      description: v.description,
      channel: v.author?.name,
    }));

    logBox("TOP VIDEOS PICKED", topVideos.length);

    storyObj = topVideos[0];
    safeTitle = await sanitizeFilename(storyObj.title);
    folder = await ensureFolderStructure(`cinePlotDecode/${safeTitle}`);

    await saveJSONOutput(folder, safeTitle, storyObj);

    /* --------------------------------------------------
     * 4. FETCH TRANSCRIPT (skip if already in folder JSON)
     * -------------------------------------------------- */
    let transcript = null;
    try {
      const jsonPath = path.join(folder, safeTitle + ".json");
      if (fsSync.existsSync(jsonPath)) {
        const existing = JSON.parse(await fs.readFile(jsonPath, "utf-8"));
        if (
          existing.transcript &&
          Array.isArray(existing.transcript) &&
          existing.transcript.length > 0
        ) {
          transcript = existing.transcript;
          logBox("TRANSCRIPT", "Using existing (skip API)");
        }
      }
    } catch {
      // ignore
    }
    if (!transcript) {
      transcript = await fetchTranscript(storyObj.url);
      if (!transcript) {
        logBox("TRANSCRIPT FAILED", storyObj.url);
        return null;
      }
      storyObj.transcript = transcript;
      await updateJSONOutput(folder, safeTitle, { transcript });
    } else {
      storyObj.transcript = transcript;
    }

    /* --------------------------------------------------
     * 5. PARALLEL: TTS + VIDEO DOWNLOAD
     * -------------------------------------------------- */
    // const safeTitle = await sanitizeFilename(
    //   "BUS_Stuck_On_A_Edge_Of_A_Mountain,_8_Passengers_Are_Trapped_Inside_Movie_Explain_In_Hindi"
    // );
    // const folder = await ensureFolderStructure(`cinePlotDecode/${safeTitle}`);
    const videoPath = path.join(folder, "video.mp4");

    await Promise.all([
      voiceByBhashini(transcript, folder),
      downloadYouTubeVideo(
        storyObj.url,
        storyObj.title,
        "highest",
        true,
        "mp4",
        videoPath,
        folder
      ),
    ]);

    /* --------------------------------------------------
     * 6. MERGE AUDIO FILES
     * -------------------------------------------------- */

    const audioPath = await mergeAudios(folder);

    await updateJSONOutput(folder, safeTitle, {
      audio_path: audioPath,
      video_path: videoPath,
    });

    logBox("AUDIO & VIDEO READY", { audioPath, videoPath });

    /* --------------------------------------------------
     * 7. FINAL MERGE: AUDIO + VIDEO
     * -------------------------------------------------- */
    try {
      const finalVideoPath = await mergeVideoAndAudio(
        folder,
        "merger.mp3",
        "video.mp4"
      );

      await updateJSONOutput(folder, safeTitle, {
        final_video: finalVideoPath,
      });

      logBox("FINAL VIDEO READY", finalVideoPath);
      const excelPathMain = path.join(CPD_BASE, "output.xlsx");
      await saveToExcel(excelPathMain, {
        title: safeTitle.replace(/[\n\r]+/g, "").trim(),
      });

      const seo = await getYoutubeMovieSEO(storyObj.title);
      if (seo) {
        try {
          const uploadTitle =
            (seo.youtube_title && seo.youtube_title.trim()) ||
            storyObj.title ||
            "Movie Explain in Hindi";
          const uploadDesc =
            (seo.youtube_description && seo.youtube_description.trim()) ||
            storyObj.description ||
            "Movie Explain in Hindi. Full story and ending explained.";
          const { youtube_url } = await uploadToYouTubeAndRecord({
            folder,
            safeTitle,
            YTChannel: "CinePlotDecode",
            videoPath: finalVideoPath,
            title: uploadTitle,
            description: uploadDesc,
            tags: Array.isArray(seo.youtube_tags) ? seo.youtube_tags : [],
            privacyStatus: "private",
          });
          logBox("YOUTUBE UPLOAD", youtube_url);
          await addProcessedVideo(storyObj.url);
        } catch (uploadErr) {
          console.error("YouTube upload failed:", uploadErr.message);
        }
      }

      return finalVideoPath;
    } catch (mergeError) {
      console.log(mergeError);
      logBox("MERGE FAILED", mergeError.message);
      return null;
    }
  } catch (err) {
    console.log(err);
    logBox("GLOBAL ERROR", err.message);
    return null;
  }
};

export default cinePlotDecode;
