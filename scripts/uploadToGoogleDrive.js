/**
 * Upload pipeline output to Google Drive: video (final.mp4), thumbnail (thumb.jpg), and metadata (title, description, tags).
 * Uses same OAuth as YouTube (YT_* env). Enable Drive API in Google Cloud and re-auth once to get drive.file scope.
 * Optional: DRIVE_FOLDER_ID = existing folder id to upload into; else creates a new folder per run.
 */
import fs from "fs-extra";
import path from "path";
import { google } from "googleapis";
import {
  getCredentials,
  getRefreshToken,
  DRIVE_SCOPE,
} from "./uploadYoutube.js";

function getAuth() {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  const refreshToken = getRefreshToken();
  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error(
      "Google auth missing (same as YouTube). Set YT_CLIENT_SECRET_JSON + YT_TOKEN_JSON or YT_REFRESH_TOKEN, and re-connect once to grant Drive scope."
    );
  }
  const auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  auth.setCredentials({ refresh_token: refreshToken });
  auth.scopes = [DRIVE_SCOPE];
  return auth;
}

async function ensureFolder(drive, folderName, parentId) {
  const escaped = folderName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const q = parentId
    ? `name = '${escaped}' and '${parentId}' in parents and trashed = false`
    : `name = '${escaped}' and 'root' in parents and trashed = false`;
  const res = await drive.files.list({
    q,
    fields: "files(id, name)",
    spaces: "drive",
  });
  const existing = res.data.files?.[0];
  if (existing) return existing.id;
  const body = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) body.parents = [parentId];
  const file = await drive.files.create({
    requestBody: body,
    fields: "id",
  });
  return file.data.id;
}

/**
 * @param {object} meta - { title, description, tags }
 * @returns {Promise<{ folderId: string, videoId: string, thumbnailId: string, metadataId: string }>}
 */
export async function uploadToGoogleDrive(meta) {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const baseDir = process.env.DATA_DIR || process.cwd();
  const videoPath = path.join(baseDir, "output", "final.mp4");
  const thumbPath = path.join(baseDir, "thumbnails", "thumb.jpg");

  if (!(await fs.pathExists(videoPath))) {
    throw new Error("output/final.mp4 not found. Run the Video step first.");
  }

  const title = (meta.title || "Horror Story").trim().substring(0, 100);
  const dateStr = new Date().toISOString().slice(0, 10);
  const folderName = `Horror Story - ${title.slice(0, 50)} - ${dateStr}`;

  const parentId = process.env.DRIVE_FOLDER_ID?.trim() || null;
  const folderId = await ensureFolder(drive, folderName, parentId);
  console.log("📁 Uploading to Google Drive (same account as YouTube) — folder:", folderName);
  console.log("   Folder ID:", folderId);

  const uploadFile = async (filePath, mimeType, description) => {
    const stream = fs.createReadStream(filePath);
    const file = await drive.files.create({
      requestBody: {
        name: path.basename(filePath),
        description: description || undefined,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: stream,
      },
      fields: "id, webViewLink",
    });
    return file.data;
  };

  const videoFile = await uploadFile(
    videoPath,
    "video/mp4",
    meta.description?.trim().slice(0, 5000)
  );
  console.log("✅ Video uploaded:", videoFile.id);

  let thumbnailFile = null;
  if (await fs.pathExists(thumbPath)) {
    thumbnailFile = await uploadFile(thumbPath, "image/jpeg");
    console.log("✅ Thumbnail uploaded:", thumbnailFile.id);
  }

  const metadata = {
    title: meta.title || "Horror Story",
    description: meta.description || "",
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    uploadedAt: new Date().toISOString(),
    driveFolderId: folderId,
    driveVideoId: videoFile.id,
    driveThumbnailId: thumbnailFile?.id || null,
  };
  const metaJson = JSON.stringify(metadata, null, 2);
  const metaFile = await drive.files.create({
    requestBody: {
      name: "metadata.json",
      description: "Title, description, tags and Drive IDs for this video",
      parents: [folderId],
    },
    media: {
      mimeType: "application/json",
      body: Buffer.from(metaJson, "utf-8"),
    },
    fields: "id, webViewLink",
  });
  console.log("✅ Metadata uploaded:", metaFile.data.id);

  return {
    folderId,
    folderName,
    videoId: videoFile.id,
    thumbnailId: thumbnailFile?.id || null,
    metadataId: metaFile.data.id,
    folderLink: `https://drive.google.com/drive/folders/${folderId}`,
  };
}
