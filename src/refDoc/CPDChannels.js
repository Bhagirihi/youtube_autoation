import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { downloadYouTubeVideo } from "../helper/YTDownload/index.js";
import { ensureFolderStructure } from "../helper/index.js";
import { uploadToYouTube } from "../auth/youtubeUpload.js";

const UPLOADED_FILE = "./src/refDoc/uploaded_shorts.json";

/* ==================== STORAGE ==================== */

const fileExistsOrCreate = (filePath = UPLOADED_FILE) => {
  try {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify([], null, 2));
    }

    return true;
  } catch (error) {
    console.error("❌ File init error:", error);
    return false;
  }
};

const readUploadedIds = () => {
  fileExistsOrCreate();
  const data = JSON.parse(fs.readFileSync(UPLOADED_FILE, "utf-8"));
  return data;
};

const saveUploadedId = (id) => {
  try {
    const uploaded = readUploadedIds();
    uploaded.push(id);
    fs.writeFileSync(UPLOADED_FILE, JSON.stringify(uploaded, null, 2));
  } catch (error) {
    console.error("❌ Error saving uploaded ID:", error);
  }
};

/* ==================== FETCH SHORTS ==================== */

const fetchChannelShorts = async (url) => {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp --flat-playlist --dump-json "${url}"`, (err, stdout) => {
      if (err) {
        console.error("❌ yt-dlp execution failed");
        return reject(err);
      }

      const shorts = stdout
        .trim()
        .split("\n")
        .map(JSON.parse)
        .filter((v) => v.id)
        .map((v) => ({
          id: v.id,
          title: v.title,
          channelId: v.uploader_id || v.channel_id || "unknown_channel",
          url: `https://youtube.com/shorts/${v.id}`,
          data: v,
        }));

      resolve(shorts);
    });
  });
};

/* ==================== UTILS ==================== */

const getChannelHandle = (url) => {
  const match = url.match(/@([^/]+)/);
  return match ? match[1] : "unknown_channel";
};

/* ==================== MAIN ==================== */

const cinePlotDecodeShorts = async () => {
  const CPDChannels = [
    "https://www.youtube.com/@CineDecode25/shorts",
    "https://www.youtube.com/@Movie_decode1/shorts",
    "https://www.youtube.com/@CineDecoded_Official02/shorts",
    "https://www.youtube.com/@Outline_M/shorts",
    "https://www.youtube.com/@recapsmoviesadda/shorts",
    "https://www.youtube.com/@Flick_movies_explanation/shorts",
    "https://www.youtube.com/@MoBieTVHindi/shorts",
    "https://www.youtube.com/@MovieMysteries1m/shorts",
    "https://www.youtube.com/@ModoxRecap/shorts",
    "https://www.youtube.com/@explainmovi3/shorts",
    "https://www.youtube.com/@V2Explain-n8n/shorts",
    "https://www.youtube.com/@Sudh_Gyan2.0/shorts",
    "https://www.youtube.com/@YThisSuraj/shorts",
    "https://www.youtube.com/@NeuzBazaarr/shorts",
    "https://www.youtube.com/@MovieMindsEx/shorts",
    "https://www.youtube.com/@FilmyXWorld/shorts",
  ];

  try {
    const uploadedIds = readUploadedIds();
    const channel = CPDChannels[Math.floor(Math.random() * CPDChannels.length)];
    const channelHandle = getChannelHandle(channel);
    const shorts = await fetchChannelShorts(channel);
    const newShorts = shorts.filter(
      (short) => !uploadedIds.includes(short.url)
    );

    if (!newShorts.length) {
      console.log("No new shorts. Exiting.");
      return null;
    }

    const selected = newShorts[Math.floor(Math.random() * newShorts.length)];
    console.log("Short:", selected.title, "|", channelHandle);

    const folder = await ensureFolderStructure(
      `cinePlotDecode/shorts/${channelHandle}`
    );

    const videoPath = path.join(folder, `${selected.id}.mp4`);

    const { thumbnailPath, description, title } = await downloadYouTubeVideo(
      selected.url,
      selected.title,
      "highest",
      true,
      "mp4",
      videoPath,
      folder
    );

    await uploadToYouTube({
      YTChannel: "CinePlotDecode",
      videoPath,
      thumbnailPath: thumbnailPath || undefined,
      title: title || selected.title,
      description:
        description ||
        ` ${title || selected.title}
        💣 Keywords / Tags:
sniper movie explanation, sniper killer movie, sniper action movie, sniper mission movie explanation, sniper plan movie, world’s deadliest sniper, Olympus Has Fallen explained in Hindi, sniper movies to watch, best sniper movie scenes, Hollywood sniper thriller, White House attack movie, sniper hero movie explained, Gerard Butler sniper action, American sniper movie, top Hollywood sniper movies 2025, latest sniper action thriller, Olympus Has Fallen sniper moments, sniper vs terrorist movie, action movie Hindi explained, sniper thriller movies 2025, top sniper action scenes, sniper scene from movies, new sniper movie, sniper South Indian movie 2025, sniper latest movie 2025, sniper action scenes, horror thriller, haunted house, paranormal thriller, scary movie scenes, slasher movie, thriller explained in Hindi, movieexplainedinhindi, hollywoodmoviehindiexplained, latestmovie2025

⚠️ Disclaimer:
This video is for educational and entertainment purposes only. All video clips, images, and music belong to their respective owners.
Content is used under Fair Use for review, commentary, and explanation.
If any content owner has an issue, please contact us for immediate removal.

📌 Hashtags:
#OlympusHasFallen #snipermovie #sniper #movieexplainedinhindi #hollywoodmoviehindiexplained #actionmovie #sniperaction #deadlysniper #americansniper #topmovies #hollywoodthriller #latestmovie2025`,
      tags: [
        "hollywood movie explained in hindi",
        "hollywood movie explain in hindi",
        "hollywood movies explanation",
        "hollywood movie hindi",
        "hollywood movie hindi dubbed 2024",
        "hollywood movie explained in hindi/urdu shorts",
        "hollywood movies",
        "hollywood movie",
        "best hollywood dubbed movie",
        "hollywood new movie",
        "top 10 hollywood movie",
        "hollywood romantic movies",
        "best romantic hollywood movies",
        "top 10 romantic hollywood movies",
        "hollywood full movies",
        "hollywood movies clips shorts",
      ],
      privacyStatus: "public",
    });

    saveUploadedId(selected.url);
    console.log("Upload done:", selected.title);

    return selected;
  } catch (error) {
    const msg = error?.message || String(error);
    if (/invalid_grant/i.test(msg)) {
      console.error("Auth token invalid. Delete src/auth/CinePlotDecode.token.json and run again to re-authorize.");
    }
    console.error("cinePlotDecodeShorts error:", error);
  }
};
export default cinePlotDecodeShorts;
