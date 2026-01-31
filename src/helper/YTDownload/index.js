import fs from "fs";
import path from "path";
import fetch from "node-fetch";

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

export async function downloadYouTubeVideo(
  videoUrl,
  videoTitle,
  videoQuality,
  hasAudio = false,
  videoFormat,
  videoPath,
  folder
) {
  console.log("🎥 Downloading...", videoTitle || videoUrl);

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

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        origin: "https://www.socialplug.io",
        referer: "https://www.socialplug.io/",
        "sec-ch-ua-platform": '"macOS"',
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      },
    });

    const json = await response.json();
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

    const videoResponse = await fetch(downloadUrl);
    if (!videoResponse.ok)
      throw new Error(`Download failed: ${videoResponse.status}`); // ASSUME: The 'videoResponse' is the result of 'await fetch(downloadUrl)' // and that this line is the line *immediately* preceding the block below.

    const totalBytes = parseInt(
      videoResponse.headers.get("content-length"),
      10
    ); // <--- THIS LINE IS CRITICAL
    let downloadedBytes = 0; // Initialize a tracker for the promise scope

    if (isNaN(totalBytes)) {
      // Progress bar skipped when content-length missing
    }

    // This now correctly calls fs.createWriteStream from the standard 'fs' module.
    const fileStream = fs.createWriteStream(videoPath);

    return await new Promise((resolve, reject) => {
      // --- PROGRESS BAR INTEGRATION ---
      // 1. Listen for data chunks on the incoming stream (videoResponse.body)
      if (!isNaN(totalBytes) && videoResponse.body) {
        // Added check for videoResponse.body existence
        // totalBytes is now defined here
        videoResponse.body.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          printProgress("Downloading", downloadedBytes, totalBytes);
        });
      }

      // 2. Pipe the response body to the file stream
      if (videoResponse.body) {
        videoResponse.body.pipe(fileStream);
      } else {
        reject(new Error("Video response body is missing or null."));
        return;
      }

      // --- CRITICAL: Listen for all possible termination events --- // Download Stream Error (Network/Source Error)
      videoResponse.body.on("error", (err) => {
        console.error("\n🚨 Download Stream Error:", err.message);
        reject(err);
      }); // Write Stream Error (File System Error)

      fileStream.on("error", (err) => {
        console.error("\n🚨 Write Stream Error:", err.message);
        reject(err);
      }); // Resolve when the writing is finished

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
