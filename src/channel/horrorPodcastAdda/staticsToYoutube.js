import { uploadToYouTubeAndRecord } from "../../helper/youtubeUploadAndRecord.js";
import { updateJSONOutput } from "../../helper/index.js";
import { getYoutubeHPASEO } from "../../helper/GenerateTitles/HPATitels.js";

/**
 * Upload Horror Podcast Adda video to YouTube.
 * Uses promptYoutubeHPASEO (Gemini) for SEO title, description, tags when available; else falls back to storyData / defaults.
 */
export default async function staticsToYoutube({
  storyData,
  folder,
  safeTitle,
  final_video,
  thumbnail_path,
}) {
  const {
    display_title,
    youtube_tags = [],
    youtube_description = "",
    youtube_title = "",
  } = storyData;

  if (!final_video) {
    throw new Error("❌ Final video not found");
  }

  let title =
    youtube_title || display_title || "Horror Story | Horror Podcast Adda";
  let description = youtube_description;
  let tags = Array.isArray(youtube_tags)
    ? youtube_tags
    : youtube_tags
      ? String(youtube_tags)
          .split(",")
          .map((t) => t.trim())
      : [];

  // Use story-level SEO if present (from generateStory), else fetch via getYoutubeHPASEO
  const hasStorySEO =
    (youtube_title && youtube_title.length > 0) ||
    (youtube_description && youtube_description.length > 0) ||
    (Array.isArray(youtube_tags) && youtube_tags.length > 0);
  if (!hasStorySEO) {
    const storyTitleForSEO = display_title || storyData?.title || title;
    const seo = await getYoutubeHPASEO(storyTitleForSEO);
    if (seo) {
      if (seo.youtube_title && seo.youtube_title.length > 0)
        title = seo.youtube_title.substring(0, 100);
      if (seo.youtube_description && seo.youtube_description.length > 0) {
        description = seo.youtube_description;
        if (seo.youtube_hashtags && seo.youtube_hashtags.trim())
          description =
            description.trim() + "\n\n" + seo.youtube_hashtags.trim();
      }
      if (Array.isArray(seo.youtube_tags) && seo.youtube_tags.length > 0)
        tags = seo.youtube_tags
          .map((t) => (typeof t === "string" ? t.trim() : String(t)))
          .filter(Boolean);
    }
  }

  // Fallback description if still empty
  if (!description || description.length === 0) {
    description = `Watch this bone-chilling horror story on Horror Podcast Adda - डर का एक नया ठिकाना!\n\n${display_title || title}\n\nLike, Share, and Subscribe for more horror stories!\n\n#HorrorStory #HorrorPodcastAdda #HindiHorror`;
  }

  if (tags.length === 0) {
    tags = [
      "Horror Podcast Adda",
      "Horror Story",
      "Hindi Horror",
      "Horror Story in Hindi",
      "Scary Story",
      "True Horror Story",
    ];
  }

  // YouTube keywords: each tag max 30 chars, no #/newlines, total under ~400 to avoid "invalid video keywords"
  const sanitizeTags = (list) => {
    const MAX_TAG_LEN = 30;
    const MAX_TOTAL_CHARS = 400;
    const seen = new Set();
    let total = 0;
    const out = [];
    for (const t of list) {
      const s = (typeof t === "string" ? t : String(t))
        .trim()
        .replace(/[#\n\r]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, MAX_TAG_LEN);
      if (!s || seen.has(s.toLowerCase())) continue;
      if (total + s.length > MAX_TOTAL_CHARS) break;
      seen.add(s.toLowerCase());
      total += s.length;
      out.push(s);
      if (out.length >= 50) break;
    }
    return out;
  };
  tags = sanitizeTags(tags);

  try {
    const { videoId, youtube_url } = await uploadToYouTubeAndRecord({
      folder,
      safeTitle,
      videoPath: final_video,
      title: title.substring(0, 100),
      description: description.substring(0, 5000),
      thumbnailPath: thumbnail_path,
      tags,
      YTChannel: "HorrorPodcastAdda",
      privacyStatus: "private",
      extraFields: {
        youtube_title: title.substring(0, 100),
        youtube_description: description.substring(0, 5000),
        youtube_tags: tags,
        upload_status: "completed",
        uploaded_at: new Date().toISOString(),
      },
    });

    return {
      ...storyData,
      folder,
      safeTitle,
      youtube_video_id: videoId,
      youtube_url,
      upload_status: "completed",
    };
  } catch (error) {
    console.error("❌ YouTube upload failed:", error.message);

    await updateJSONOutput(folder, safeTitle, {
      upload_status: "failed",
      upload_error: error.message,
    });

    throw error;
  }
}
