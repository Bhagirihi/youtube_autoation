import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import axios from "axios";

async function downloadThumbnail(imageUrl, localPath) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const dest = fs.createWriteStream(localPath);
    await new Promise((resolve, reject) => {
      res.body.pipe(dest);
      res.body.on("error", reject);
      dest.on("finish", resolve);
      dest.on("error", reject);
    });
    return localPath;
  } catch {
    return null;
  }
}

const DEFAULT_DOWNLOAD_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableDownloadError(err) {
  const msg = err?.message || String(err);
  return (
    /Download failed: 403/.test(msg) ||
    /Download failed: 429/.test(msg) ||
    /Download failed: 5\d\d/.test(msg) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(msg)
  );
}

function is403Error(err) {
  return /Download failed: 403/.test(err?.message || String(err));
}

/**
 * Fallback: download with yt-dlp (works from CI/datacenter IPs when API blocks 403).
 * Requires yt-dlp on PATH (e.g. installed in GitHub Actions).
 */
function downloadWithYtDlp(videoUrl, videoPath, folder, videoTitle) {
  console.log("🎥 Trying yt-dlp fallback (API blocked from this IP)...", videoTitle || videoUrl);
  const outTemplate = path.join(folder, "%(id)s.%(ext)s");

  try {
    execSync(
      "yt-dlp",
      [
        "-f", "best[ext=mp4]/best",
        "--merge-output-format", "mp4",
        "-o", outTemplate,
        "--write-thumbnail",
        "--write-description",
        "--no-write-subs",
        "--no-warnings",
        "--quiet",
        videoUrl,
      ],
      { stdio: "pipe", maxBuffer: 10 * 1024 * 1024 }
    );
  } catch (e) {
    throw new Error(`yt-dlp download failed: ${e?.message || e}`);
  }

  const videoExts = [".mp4", ".mkv", ".webm"];
  const dirFiles = fs.readdirSync(folder);
  const videoFile = dirFiles.find(
    (f) =>
      !f.includes("-thumbnail") &&
      !f.endsWith(".description") &&
      videoExts.some((ext) => f.endsWith(ext))
  );
  if (!videoFile) throw new Error("yt-dlp did not produce a video file");
  const actualPath = path.join(folder, videoFile);
  if (path.resolve(actualPath) !== path.resolve(videoPath)) {
    fs.renameSync(actualPath, videoPath);
  }

  const idFromFile = path.basename(videoFile, path.extname(videoFile));
  let thumbnailPath = path.join(folder, "thumbnail.jpg");
  const thumbFile = dirFiles.find((f) => f.startsWith(idFromFile) && f.includes("thumbnail"));
  if (thumbFile) thumbnailPath = path.join(folder, thumbFile);

  let description = "";
  const descFile = path.join(folder, idFromFile + ".description");
  if (fs.existsSync(descFile)) {
    description = fs.readFileSync(descFile, "utf-8").trim();
  }

  let title = videoTitle || "";
  try {
    title = execSync("yt-dlp", ["--print", "title", "--no-warnings", videoUrl], { encoding: "utf-8" }).trim();
  } catch {
    // keep videoTitle
  }

  console.log("✅ Video saved (yt-dlp):", videoPath);
  return { videoPath, thumbnailPath, description, title };
}

export async function downloadYouTubeVideo(
  videoUrl,
  videoTitle,
  videoQuality,
  hasAudio = false,
  videoFormat,
  videoPath,
  folder,
  options = {}
) {
  const maxRetries = options.retries ?? DEFAULT_DOWNLOAD_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await doDownloadYouTubeVideo(
        videoUrl,
        videoTitle,
        videoQuality,
        hasAudio,
        videoFormat,
        videoPath,
        folder,
        attempt > 1 ? attempt : null
      );
    } catch (err) {
      lastError = err;
      const canRetry = attempt < maxRetries && isRetryableDownloadError(err);
      if (canRetry) {
        console.warn(
          `⚠️ Download attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${retryDelayMs / 1000}s...`
        );
        await sleep(retryDelayMs);
      } else {
        break;
      }
    }
  }

  // On 403 (e.g. GitHub Actions datacenter IP blocked by API), try yt-dlp fallback
  if (lastError && is403Error(lastError)) {
    try {
      return downloadWithYtDlp(videoUrl, videoPath, folder, videoTitle);
    } catch (ytDlpErr) {
      console.warn("⚠️ yt-dlp fallback failed:", ytDlpErr?.message || ytDlpErr);
    }
  }
  throw lastError;
}

async function doDownloadYouTubeVideo(
  videoUrl,
  videoTitle,
  videoQuality,
  hasAudio,
  videoFormat,
  videoPath,
  folder,
  attemptLabel
) {
  if (attemptLabel) {
    console.log("🎥 Downloading (retry)...", videoTitle || videoUrl);
  } else {
    console.log("🎥 Downloading...", videoTitle || videoUrl);
  }

  const printProgress = (status, downloaded, total) => {
    const percentage = ((downloaded / total) * 100).toFixed(1);
    const barLength = 40;
    const filledLength = Math.round(barLength * (downloaded / total));
    const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);
    process.stdout.write(
      `\r${status}: [${bar}] ${percentage}% (${(
        downloaded /
        1024 /
        1024
      ).toFixed(2)}MB / ${(total / 1024 / 1024).toFixed(2)}MB)`
    );
  };

  try {
    const encodedUrl = encodeURIComponent(videoUrl); // STEP 1: Fetch video metadata

    const apiUrl = `https://ytdl.socialplug.io/api/video-info?url=${encodedUrl}`;

    const apiHeaders = {
      accept: "application/json, text/plain, */*",
      origin: "https://www.socialplug.io",
      referer: "https://www.socialplug.io/",
      "sec-ch-ua": '"Chromium";v="120", "Google Chrome";v="120", "Not_A Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    const response = await axios.get(apiUrl, { headers: apiHeaders });
    const json = response.data;
    if (!json.format_options) {
      throw new Error("format_options missing. API changed?");
    }

    const mp4Formats = json.format_options.video?.mp4;
    const thumbnailUrl = json.image;
    const description = json.description;
    const title = json.title;

    const localThumbPath = path.join(folder, "thumbnail.jpg");
    await downloadThumbnail(thumbnailUrl, localThumbPath);

    if (!mp4Formats) {
      throw new Error("MP4 formats not found!");
    } // STEP 2: Select video quality

    let selectedQuality;

    // if (videoQuality === "highest") {
    //   const qualities = Object.keys(mp4Formats)
    //     .map((q) => parseInt(q.replace("p", "")))
    //     .sort((a, b) => b - a);

    //   selectedQuality = qualities[0] + "p";
    // } else {
    //   selectedQuality = videoQuality;
    //   if (!mp4Formats[selectedQuality]) {
    //     throw new Error(`Requested quality ${selectedQuality} not available.`);
    //   }
    // }

    if (videoQuality === "highest") {
      let entries = Object.entries(mp4Formats);

      // If audio is required, filter FIRST
      if (hasAudio) {
        entries = entries.filter(([_, format]) => format.hasAudio === true);
      }

      if (entries.length === 0) {
        throw new Error("No MP4 formats found with required audio.");
      }

      const qualities = entries
        .map(([quality]) => parseInt(quality.replace("p", "")))
        .sort((a, b) => b - a);

      selectedQuality = qualities[0] + "p";
    } else {
      selectedQuality = videoQuality;

      if (!mp4Formats[selectedQuality]) {
        throw new Error(`Requested quality ${selectedQuality} not available.`);
      }

      if (hasAudio && mp4Formats[selectedQuality].hasAudio !== true) {
        throw new Error(
          `Requested quality ${selectedQuality} does not contain audio.`
        );
      }
    }

    const downloadUrl = mp4Formats[parseInt(selectedQuality)].url;

    const browserHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "identity",
      Referer: "https://www.socialplug.io/",
      Origin: "https://www.socialplug.io",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"macOS"',
    };

    const videoResponse = await axios.get(downloadUrl, {
      responseType: "stream",
      headers: browserHeaders,
      validateStatus: (status) => true,
    });

    if (videoResponse.status !== 200) {
      throw new Error(`Download failed: ${videoResponse.status}`);
    }

    const stream = videoResponse.data;
    const totalBytes = parseInt(
      videoResponse.headers["content-length"],
      10
    );
    let downloadedBytes = 0;

    const fileStream = fs.createWriteStream(videoPath);

    return await new Promise((resolve, reject) => {
      if (!isNaN(totalBytes) && stream) {
        stream.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          printProgress("Downloading", downloadedBytes, totalBytes);
        });
      }

      if (stream) {
        stream.pipe(fileStream);
      } else {
        reject(new Error("Video response body is missing or null."));
        return;
      }

      stream.on("error", (err) => {
        console.error("\n🚨 Download Stream Error:", err.message);
        reject(err);
      });

      fileStream.on("error", (err) => {
        console.error("\n🚨 Write Stream Error:", err.message);
        reject(err);
      });

      fileStream.on("finish", () => {
        if (!isNaN(totalBytes)) {
          printProgress("Downloading", totalBytes, totalBytes);
        }
      });

      fileStream.on("close", () => {
        console.log("✅ Video saved:", videoPath);
        resolve({
          videoPath,
          thumbnailPath: localThumbPath,
          description,
          title,
        });
      });
    });
  } catch (error) {
    console.error("❌ Download failed:", error.message);
    try {
      await fs.unlink(videoPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}
// I've included a basic version above for completeness.
