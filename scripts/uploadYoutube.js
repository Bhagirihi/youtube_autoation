import fs from "fs";
import { google } from "googleapis";

export async function uploadYoutube(meta) {
  const auth = new google.auth.OAuth2(
    process.env.YT_CLIENT_ID,
    process.env.YT_CLIENT_SECRET,
    process.env.YT_REDIRECT_URI
  );

  auth.setCredentials({ refresh_token: process.env.YT_REFRESH_TOKEN });

  const youtube = google.youtube({ version: "v3", auth });

  await youtube.videos.insert({
    part: "snippet,status",
    requestBody: {
      snippet: {
        title: meta.title,
        description: meta.description,
        tags: meta.tags,
      },
      status: { privacyStatus: "public" },
    },
    media: {
      body: fs.createReadStream("output/final.mp4"),
    },
  });

  console.log("🚀 Uploaded to YouTube");
}
