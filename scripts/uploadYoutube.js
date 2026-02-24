import fs from "fs-extra";
import path from "path";
import { Transform } from "stream";
import { google } from "googleapis";

const YT_SCOPE =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";

/** Default channel token file (same pattern as YTAutomation). */
const DEFAULT_TOKEN_PATH = path.join(
  process.cwd(),
  "auth",
  "HorrorPodcastAdda.token.json"
);

/**
 * Load OAuth credentials: from JSON string (YT_CLIENT_SECRET_JSON), from JSON file (YT_CLIENT_SECRET_PATH), or from env (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REDIRECT_URI).
 * If using JSON (string or file), redirect_uri is YT_REDIRECT_URI from env or JSON's first redirect_uri.
 */
function getCredentials() {
  const jsonStr = process.env.YT_CLIENT_SECRET_JSON?.trim();
  if (jsonStr) {
    try {
      const credentials = JSON.parse(jsonStr);
      const installed = credentials.installed || credentials.web;
      if (installed?.client_id && installed?.client_secret) {
        const redirectUri =
          process.env.YT_REDIRECT_URI?.trim() ||
          (installed.redirect_uris && installed.redirect_uris[0]);
        return {
          clientId: installed.client_id,
          clientSecret: installed.client_secret,
          redirectUri,
        };
      }
    } catch (_) {}
  }
  const jsonPath = process.env.YT_CLIENT_SECRET_PATH?.trim();
  if (jsonPath) {
    const fullPath = path.isAbsolute(jsonPath)
      ? jsonPath
      : path.join(process.cwd(), jsonPath);
    if (fs.existsSync(fullPath)) {
      const credentials = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      const installed = credentials.installed || credentials.web;
      const redirectUri =
        process.env.YT_REDIRECT_URI?.trim() ||
        (installed.redirect_uris && installed.redirect_uris[0]);
      return {
        clientId: installed.client_id,
        clientSecret: installed.client_secret,
        redirectUri,
      };
    }
  }
  return {
    clientId: process.env.YT_CLIENT_ID?.trim(),
    clientSecret: process.env.YT_CLIENT_SECRET?.trim(),
    redirectUri: process.env.YT_REDIRECT_URI?.trim(),
  };
}

/**
 * Get refresh token: from JSON string (YT_TOKEN_JSON), from token file (YT_TOKEN_PATH or auth/HorrorPodcastAdda.token.json), or from env YT_REFRESH_TOKEN.
 */
function getRefreshToken() {
  const tokenJsonStr = process.env.YT_TOKEN_JSON?.trim();
  if (tokenJsonStr) {
    try {
      const token = JSON.parse(tokenJsonStr);
      if (token.refresh_token) return token.refresh_token;
    } catch (_) {}
  }
  const tokenPath =
    process.env.YT_TOKEN_PATH?.trim() ||
    (fs.existsSync(DEFAULT_TOKEN_PATH) ? DEFAULT_TOKEN_PATH : null);
  if (tokenPath && fs.existsSync(tokenPath)) {
    try {
      const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
      if (token.refresh_token) return token.refresh_token;
    } catch (_) {}
  }
  return process.env.YT_REFRESH_TOKEN?.trim() || null;
}

/** Returns { connected: true, source: 'file'|'env' } if YouTube is ready to use; else { connected: false }. */
export function getYoutubeConnectionStatus() {
  try {
    const { clientId, clientSecret, redirectUri } = getCredentials();
    if (!clientId || !clientSecret || !redirectUri) return { connected: false };
    if (process.env.YT_TOKEN_JSON?.trim()) {
      try {
        const token = JSON.parse(process.env.YT_TOKEN_JSON.trim());
        if (token.refresh_token) return { connected: true, source: "env" };
      } catch (_) {}
    }
    const tokenPath =
      process.env.YT_TOKEN_PATH?.trim() ||
      (fs.existsSync(DEFAULT_TOKEN_PATH) ? DEFAULT_TOKEN_PATH : null);
    if (tokenPath && fs.existsSync(tokenPath)) {
      try {
        const token = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
        if (token.refresh_token) return { connected: true, source: "file" };
      } catch (_) {}
    }
    if (process.env.YT_REFRESH_TOKEN?.trim())
      return { connected: true, source: "env" };
    return { connected: false };
  } catch (_) {
    return { connected: false };
  }
}

export function getYoutubeAuthUrl() {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "YouTube credentials missing. Set YT_CLIENT_SECRET_JSON (client_secret JSON string), YT_CLIENT_SECRET_PATH (path to client_secret JSON), or YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REDIRECT_URI in .env."
    );
  }
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: YT_SCOPE,
  });
}

export async function exchangeCodeForTokens(code) {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("YouTube credentials missing. Set YT_CLIENT_SECRET_JSON, YT_CLIENT_SECRET_PATH, or YT_CLIENT_* in .env.");
  }
  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

/**
 * Save tokens to auth/HorrorPodcastAdda.token.json (so next time we can use file instead of .env refresh token).
 */
export async function saveTokensToFile(tokens) {
  const authDir = path.join(process.cwd(), "auth");
  await fs.ensureDir(authDir);
  const tokenPath = path.join(authDir, "HorrorPodcastAdda.token.json");
  await fs.writeJson(tokenPath, tokens, { spaces: 2 });
  return tokenPath;
}

/**
 * Get the channel's last published/scheduled video date (publishedAt or status.publishAt).
 * Uses uploads playlist; returns Date or null.
 */
async function getLastPublishedVideoDate(youtube) {
  try {
    const channel = await youtube.channels.list({
      part: "contentDetails",
      mine: true,
    });
    const uploadsId = channel.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) return null;
    const list = await youtube.playlistItems.list({
      part: "snippet,contentDetails",
      playlistId: uploadsId,
      maxResults: 1,
      order: "date",
    });
    const videoId = list.data?.items?.[0]?.contentDetails?.videoId;
    if (!videoId) return null;
    const video = await youtube.videos.list({
      part: "snippet,status",
      id: videoId,
    });
    const item = video.data?.items?.[0];
    if (!item) return null;
    const publishAt = item.status?.publishAt;
    const publishedAt = item.snippet?.publishedAt;
    const dateStr = publishAt || publishedAt;
    return dateStr ? new Date(dateStr) : null;
  } catch (_) {
    return null;
  }
}

const YT_SCHEDULE_TIMEZONE = process.env.YT_SCHEDULE_TIMEZONE || "Asia/Kolkata";
const YT_SCHEDULE_HOUR = parseInt(process.env.YT_SCHEDULE_HOUR || "21", 10);
const YT_SCHEDULE_MINUTE = parseInt(process.env.YT_SCHEDULE_MINUTE || "0", 10);
const YT_SCHEDULE_DAYS_AFTER = parseInt(process.env.YT_SCHEDULE_DAYS_AFTER || "2", 10);

/**
 * Next schedule time: last published + YT_SCHEDULE_DAYS_AFTER days at YT_SCHEDULE_HOUR:YT_SCHEDULE_MINUTE in YT_SCHEDULE_TIMEZONE.
 * Returns ISO string for YouTube status.publishAt (UTC).
 * Asia/Kolkata (IST) = UTC+5:30, so 21:00 IST = 15:30 UTC.
 */
function getNextScheduleTimeIso(lastPublishedDate) {
  const d = lastPublishedDate ? new Date(lastPublishedDate) : new Date();
  d.setUTCDate(d.getUTCDate() + YT_SCHEDULE_DAYS_AFTER);
  d.setUTCHours(0, 0, 0, 0);
  const localMins = YT_SCHEDULE_HOUR * 60 + YT_SCHEDULE_MINUTE;
  const tzOffsetMins = YT_SCHEDULE_TIMEZONE === "Asia/Kolkata" ? 330 : 0;
  let utcMins = localMins - tzOffsetMins;
  if (utcMins < 0) {
    utcMins += 24 * 60;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  d.setUTCHours(Math.floor(utcMins / 60), utcMins % 60, 0, 0);
  return d.toISOString();
}

/** YouTube tag rules: max 30 chars per tag, ~400 total, no # or newlines. */
function sanitizeTags(tags, maxTotal = 400, maxPerTag = 30) {
  let total = 0;
  return (Array.isArray(tags) ? tags : [])
    .map((t) =>
      (typeof t === "string" ? t : String(t))
        .trim()
        .replace(/[#\n\r]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, maxPerTag)
    )
    .filter((t) => t.length > 0)
    .filter((t) => {
      if (total + t.length > maxTotal) return false;
      total += t.length;
      return true;
    })
    .slice(0, 50);
}

/**
 * Create a stream that forwards file data and calls onProgress(percent) as bytes are read.
 */
function createProgressStream(filePath, onProgress) {
  const stat = fs.statSync(filePath);
  const total = stat.size;
  let uploaded = 0;
  const stream = fs.createReadStream(filePath);
  const transform = new Transform({
    transform(chunk, _enc, cb) {
      uploaded += chunk.length;
      const pct = total > 0 ? Math.min(100, Math.round((uploaded / total) * 100)) : 0;
      if (typeof onProgress === "function") onProgress(pct, uploaded, total);
      this.push(chunk);
      cb();
    },
  });
  stream.pipe(transform);
  return transform;
}

export async function uploadYoutube(meta, onProgress) {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  const refreshToken = getRefreshToken();
  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error(
      "YouTube auth missing. Use 'Connect YouTube' in the app or set YT_TOKEN_JSON / YT_REFRESH_TOKEN (or place HorrorPodcastAdda.token.json in auth/)."
    );
  }

  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
  auth.setCredentials({ refresh_token: refreshToken });

  const baseDir = process.env.DATA_DIR || process.cwd();
  const videoPath = path.join(baseDir, "output", "final.mp4");
  if (!fs.existsSync(videoPath)) {
    throw new Error("output/final.mp4 not found. Run the Video step first.");
  }

  const youtube = google.youtube({ version: "v3", auth });
  const safeTags = sanitizeTags(meta.tags);
  const description =
    typeof meta.description === "string" && meta.description.trim()
      ? meta.description.trim().substring(0, 5000)
      : "";

  const scheduleNext = process.env.YT_SCHEDULE_NEXT === "1" || process.env.YT_SCHEDULE_NEXT === "true";
  let status = {
    privacyStatus: meta.privacyStatus || "public",
    selfDeclaredMadeForKids: false,
    embeddable: true,
  };
  if (scheduleNext) {
    const lastPublished = await getLastPublishedVideoDate(youtube);
    const publishAt = getNextScheduleTimeIso(lastPublished);
    status = {
      ...status,
      privacyStatus: "private",
      publishAt,
    };
    if (onProgress && typeof onProgress === "function") {
      onProgress(0, 0, 0);
    }
    console.log("📅 Scheduling for", publishAt, "(last was", lastPublished ? lastPublished.toISOString() : "none", ")");
  }

  const bodyStream = createProgressStream(videoPath, onProgress);
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers: false,
    requestBody: {
      snippet: {
        title: (meta.title || "Horror Story").trim().substring(0, 100),
        description,
        tags: safeTags,
        categoryId: "24",
        defaultLanguage: "hi",
        defaultAudioLanguage: "hi",
      },
      status,
    },
    media: {
      body: bodyStream,
    },
  });

  const videoId = res.data?.id;
  if (!videoId) {
    throw new Error("Upload failed: no video ID returned");
  }

  const thumbPath =
    meta.thumbnailPath ||
    path.join(baseDir, "thumbnails", "thumb.jpg");
  if (fs.existsSync(thumbPath)) {
    try {
      await youtube.thumbnails.set({
        videoId,
        media: { body: fs.createReadStream(thumbPath) },
      });
      console.log("✅ Thumbnail set");
    } catch (e) {
      console.warn("Thumbnail upload failed:", e.message);
    }
  }

  console.log("🚀 Uploaded to YouTube —", videoId);
  return videoId;
}
