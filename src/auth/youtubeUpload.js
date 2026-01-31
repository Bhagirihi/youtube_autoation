import fs from "fs";
import { google } from "googleapis";
import { authorize } from "./auth.js";

export async function uploadToYouTube({
  videoPath,
  title,
  description,
  thumbnailPath,
  tags = [],
  YTChannel,
  privacyStatus,
}) {
  const auth = await authorize(YTChannel);
  const youtube = google.youtube({ version: "v3", auth });

  function buildSafeTitle(title) {
    const base =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : "Movie Explain";
    if (YTChannel === "CinePlotDecode") {
      return base.substring(0, 100);
    }
    const full = `${base} #shorts #MovieExplain #MovieShorts`;
    return full.substring(0, 100);
  }

  const getTopTags = async function getTopVideoTags(
    query = YTChannel === "CinePlotDecode"
      ? "Movie Explain in Hindi"
      : "Movie Explain"
  ) {
    // 1. Search for top videos
    const searchRes = await youtube.search.list({
      part: "id",
      q: query,
      maxResults: 5,
      type: "video",
    });
    const videoIds = searchRes.data.items.map((item) => item.id.videoId);

    // 2. Get video details (including tags)
    const videoRes = await youtube.videos.list({
      part: "snippet",
      id: videoIds.join(","),
    });
    return videoRes.data.items.map((item) => item.snippet.tags).flat();
  };

  const fileSize = fs.statSync(videoPath).size;

  // YouTube "invalid video keywords": each tag max 30 chars, no #/newlines, total under ~400
  let total = 0;
  const MAX_TAG = 30;
  const MAX_TOTAL = 400;
  const safeTags = (Array.isArray(tags) ? tags : [])
    .map((t) =>
      (typeof t === "string" ? t : String(t))
        .trim()
        .replace(/[#\n\r]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, MAX_TAG)
    )
    .filter((t) => t.length > 0)
    .filter((t) => {
      if (total + t.length > MAX_TOTAL) return false;
      total += t.length;
      return true;
    })
    .slice(0, 50);

  const finalTitle = buildSafeTitle(title);
  const finalDescription =
    typeof description === "string" && description.trim().length > 0
      ? description.trim().substring(0, 5000)
      : YTChannel === "CinePlotDecode"
        ? "Movie Explain in Hindi. Full story and ending explained."
        : "";

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: false,
    requestBody: {
      snippet: {
        title: finalTitle,
        description: finalDescription,
        tags: safeTags,
        categoryId: "24", // Entertainment
        defaultLanguage: "hi",
        defaultAudioLanguage: "hi",
        recordingDate: new Date().toISOString(),
      },
      status: {
        privacyStatus: privacyStatus,
        //   publishAt: publishDate.toISOString(), // ✅ correct RFC 3339 UTC
        selfDeclaredMadeForKids: false,
        license: "youtube",
        embeddable: true,
        publicStatsViewable: true,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  if (!res || !res.data || !res.data.id) {
    throw new Error("❌ Upload failed: No response or video ID from YouTube");
  }

  const videoId = res.data.id;

  // Upload thumbnail if provided
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: fs.createReadStream(thumbnailPath),
        },
      });
    } catch (thumbErr) {
      console.error("Thumbnail upload failed:", thumbErr.message);
    }
  }

  return videoId;
}
