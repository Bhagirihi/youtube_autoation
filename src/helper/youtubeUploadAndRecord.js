import { uploadToYouTube } from "../auth/youtubeUpload.js";
import { updateJSONOutput } from "./index.js";

/**
 * Upload video to YouTube and record video_id + url (and optional extra fields) into folder JSON.
 * Shared by HorrorPodcastAdda and CinePlotDecode (full) to avoid duplication.
 *
 * @param {Object} params
 * @param {string} [params.folder] - Output folder path (if provided with safeTitle, JSON is updated)
 * @param {string} [params.safeTitle] - Safe title used for JSON filename
 * @param {Object} [params.extraFields={}] - Extra keys to write to folder JSON (e.g. upload_status, youtube_title)
 * @param {string} params.videoPath
 * @param {string} params.title
 * @param {string} [params.description]
 * @param {string} [params.thumbnailPath]
 * @param {string[]} [params.tags]
 * @param {string} params.YTChannel
 * @param {string} params.privacyStatus
 * @returns {Promise<{ videoId: string, youtube_url: string }>}
 */
export async function uploadToYouTubeAndRecord({
  folder,
  safeTitle,
  extraFields = {},
  videoPath,
  title,
  description,
  thumbnailPath,
  tags = [],
  YTChannel,
  privacyStatus,
}) {
  const videoId = await uploadToYouTube({
    videoPath,
    title,
    description,
    thumbnailPath,
    tags,
    YTChannel,
    privacyStatus,
  });
  const youtube_url = `https://www.youtube.com/watch?v=${videoId}`;

  if (folder && safeTitle) {
    await updateJSONOutput(folder, safeTitle, {
      youtube_video_id: videoId,
      youtube_url,
      ...extraFields,
    });
  }

  return { videoId, youtube_url };
}
