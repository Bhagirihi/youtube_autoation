// import fs from "fs";
// import readline from "readline";
// import { google } from "googleapis";

// const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];
// const TOKEN_PATH = "token.json";

// // Load client secrets
// fs.readFile("client_secret.json", (err, content) => {
//   if (err) return console.error("Error loading client secret:", err);
//   authorize(JSON.parse(content), uploadVideo);
// });

// function authorize(credentials, callback) {
//   const { client_secret, client_id, redirect_uris } = credentials.installed;
//   const oAuth2Client = new google.auth.OAuth2(
//     client_id,
//     client_secret,
//     redirect_uris[0]
//   );

//   fs.readFile(TOKEN_PATH, (err, token) => {
//     if (err) return getNewToken(oAuth2Client, callback);
//     oAuth2Client.setCredentials(JSON.parse(token));
//     callback(oAuth2Client);
//   });
// }

// function getNewToken(oAuth2Client, callback) {
//   const authUrl = oAuth2Client.generateAuthUrl({
//     access_type: "offline",
//     scope: SCOPES,
//   });
//   console.log("Authorize this app by visiting this url:", authUrl);

//   const rl = readline.createInterface({
//     input: process.stdin,
//     output: process.stdout,
//   });
//   rl.question("Enter the code from that page here: ", (code) => {
//     rl.close();
//     oAuth2Client.getToken(code, (err, token) => {
//       if (err) return console.error("Error retrieving access token", err);
//       oAuth2Client.setCredentials(token);
//       fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
//       console.log("Token stored to", TOKEN_PATH);
//       callback(oAuth2Client);
//     });
//   });
// }

// async function getNextPublishDate(youtube) {
//   // Fetch last uploaded video
//   const res = await youtube.search.list({
//     part: "snippet",
//     forMine: true,
//     type: "video",
//     order: "date",
//     maxResults: 1,
//   });

//   if (res.data.items.length === 0) {
//     console.log("⚠️ No previous videos found, scheduling for today + 2 days.");
//     const d = new Date();
//     d.setDate(d.getDate() + 2);
//     d.setHours(21, 0, 0, 0); // 9 PM IST
//     return d;
//   }

//   const lastVideoDate = new Date(res.data.items[0].snippet.publishedAt);
//   console.log("📅 Last video published at:", lastVideoDate.toString());

//   // Schedule next = last + 2 days
//   const nextDate = new Date(lastVideoDate);
//   nextDate.setDate(nextDate.getDate() + 2);
//   nextDate.setHours(10, 0, 0, 0);

//   return nextDate;
// }

// async function uploadVideo(auth) {
//   const youtube = google.youtube({ version: "v3", auth });
//   const filePath = "myvideo.mp4";
//   const fileSize = fs.statSync(filePath).size;

//   const publishDate = await getNextPublishDate(youtube);

//   youtube.videos.insert(
//     {
//       part: ["snippet", "status"],
//       requestBody: {
//         snippet: {
//           title: "👻 डरावनी कहानी | Horror Podcast Adda | Hindi Horror Story |",
//           description: `यह एक डरावनी कहानी है जिसमें एक गाँव की आत्मा रात को लौट आती है...

// #horrorpodcastadda #hindistoryhorror  #hindistory #storyinhindi #horrorpodacast  #bhootiyakahani #scarystory
// 🎧 Horror Podcast Adda — डर का एक नया ठिकाना!
// आपका स्वागत है एक ऐसे अड्डे पर जहाँ हर कहानी डर की एक नई परिभाषा रचती है।

// हम लाते हैं spine-chilling डरावनी कहानियाँ जो कल्पना और हकीकत के बीच की रेखा को मिटा देती हैं — presented in a cinematic horror podcast format.

// 👻 यहाँ क्या मिलेगा आपको:
// सच्ची भूतिया घटनाएँ (True Ghost Stories)

// रहस्यमयी चुड़ैलों और प्रेतात्माओं की कहानियाँ

// थ्रिलिंग हॉरर पॉडकास्ट डार्क वॉयसओवर और सस्पेंसफुल बैकग्राउंड म्यूज़िक के साथ

// काल्पनिक और असली डरावने अनुभव

// मानसिक, अलौकिक और मनोवैज्ञानिक हॉरर स्टोरीज़

// 📅 हर हफ्ते नई हिंदी हॉरर स्टोरी!
// 🎧 डर का असली अनुभव चाहिए? तो अभी सब्सक्राइब करें:

// 🔗 Subscribe to https://youtube.com/@HorrorPodcastAdda
// 🅾𝐈𝐧𝐬𝐭𝐚𝐠𝐫𝐚𝐦 :- https://www.instagram.com/horror_podcast_adda
// 📩 Business Inquiries / Collab: Horrorpodcastadda@gmail.com

// hindi horror podcast, hindi horror story, new hindi horror story, new horror story in hindi, bhoot ki kahani, darawani kahani, chudail, bhoot story, horror video, horror stories channel, ghost story in hindi, bhutiya kahani, creepy podcast in hindi, scary story hindi, horror podcast india, supernatural stories hindi, true horror hindi, डरावनी कहानियाँ, chudail horror story`,
//           tags: [
//             "Creeping Echoes",
//             "Horror Podcast Adda",
//             "animated stories",
//             "chilling stories",
//             "creepy encounters",
//             "creepy stories",
//             "ghost stories",
//             "ghost story in hindi",
//             "hindi horror stories",
//             "hindi horror story",
//             "horror",
//             "horror movie hindi",
//             "horror podcast",
//             "horror podcast hindi",
//             "horror stories",
//             "horror stories in hindi",
//             "horror story",
//             "indian horror story",
//             "scary encounters",
//             "scary video",
//             "sinister stories",
//             "true scary stories",
//             "urban legends",
//           ],
//           categoryId: "24", // Entertainment
//           defaultLanguage: "hi",
//           defaultAudioLanguage: "hi",
//         },
//         status: {
//           privacyStatus: "private",
//           publishAt: publishDate.toISOString(),
//           selfDeclaredMadeForKids: false,
//           license: "youtube",
//           embeddable: true,
//           publicStatsViewable: true,
//         },
//       },
//       media: {
//         body: fs.createReadStream(filePath),
//       },
//     },
//     {
//       onUploadProgress: (evt) => {
//         const progress = (evt.bytesRead / fileSize) * 100;
//         process.stdout.clearLine(0);
//         process.stdout.cursorTo(0);
//         process.stdout.write(`📤 Uploading: ${progress.toFixed(2)}%`);
//       },
//     },
//     (err, response) => {
//       if (err) return console.error("❌ Upload Error:", err);
//       console.log(`\n✅ Video uploaded! ID: ${response.data.id}`);
//       console.log(`📅 Scheduled to publish at: ${publishDate.toString()}`);

//       youtube.thumbnails.set(
//         {
//           videoId: response.data.id,
//           media: { body: fs.createReadStream("thumbnail.jpg") },
//         },
//         (err, res) => {
//           if (err) return console.error("❌ Thumbnail Error:", err);
//           console.log("✅ Thumbnail uploaded successfully!");
//         }
//       );
//     }
//   );
// }

import fs from "fs";
import readline from "readline";
import { google } from "googleapis";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];
const TOKEN_PATH = "./token.json"; // will be created automatically

function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check for saved token
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    return callback(oAuth2Client);
  }

  // Otherwise, get new token
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting:", authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) throw new Error("Error retrieving access token: " + err);
      oAuth2Client.setCredentials(token);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
      console.log("✅ Token stored to", TOKEN_PATH);
      callback(oAuth2Client);
    });
  });
}

// async function getNextPublishDate(youtube) {
//   const res = await youtube.search.list({
//     part: "snippet",
//     forMine: true,
//     type: "video",
//     order: "date",
//     maxResults: 1,
//   });

//   console.log("📅 Last video:", res.data.items[0]);
//   let nextDate = new Date();

//   if (res.data.items.length > 0) {
//     const lastVideoDate = new Date(res.data.items[0].snippet.publishedAt);
//     const lastVideoTitle = res.data.items[0].snippet.title;
//     console.log("📅 Last published at:", lastVideoDate, lastVideoTitle);
//     nextDate = new Date(lastVideoDate);
//     nextDate.setDate(nextDate.getDate() + 2);
//   } else {
//     nextDate.setDate(nextDate.getDate() + 2);
//   }

//   // --- force 9 PM IST ---
//   // 9:00 PM IST = 15:30 UTC
//   nextDate.setUTCHours(15, 30, 0, 0);

//   console.log("📅 Scheduled to publish at:", nextDate);
//   return nextDate;
// }

async function getNextPublishDate(youtube) {
  // 1. First fetch the latest uploaded videos
  const res = await youtube.search.list({
    part: "snippet",
    forMine: true,
    type: "video",
    order: "date",
    maxResults: 1,
  });

  if (!res.data.items || res.data.items.length === 0) {
    console.log("⚠️ No videos found, scheduling fresh one...");
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 2);
    nextDate.setUTCHours(15, 30, 0, 0); // 9 PM IST
    return nextDate;
  }

  const lastVideo = res.data.items[0];
  const lastVideoId = lastVideo.id.videoId;

  // 2. Get full details (including status.publishAt)
  const videoRes = await youtube.videos.list({
    part: "snippet,status",
    id: lastVideoId,
  });

  const video = videoRes.data.items[0];
  let lastVideoDate;

  if (video.status.publishAt) {
    // Scheduled video → use scheduled publishAt
    lastVideoDate = new Date(video.status.publishAt);
    console.log(
      "📅 Last scheduled publishAt: Scheduled video",
      lastVideoDate,
      lastVideoDate.toString(),
      video.snippet.title
    );
  } else {
    // Already published video
    lastVideoDate = new Date(video.snippet.publishedAt);
    console.log(
      "📅 Last publishedAt:",
      lastVideoDate,
      lastVideoDate.toString(),
      video.snippet.title
    );
  }

  // 3. Add +2 days
  const nextDate = new Date(lastVideoDate);
  nextDate.setDate(nextDate.getDate() + 2);

  // --- force 9 PM IST (15:30 UTC) ---
  nextDate.setUTCHours(15, 30, 0, 0);

  console.log(
    "📅 Next scheduled to publish at:",
    nextDate,
    nextDate.toString()
  );

  return nextDate;
}

export default async function uploadToYoutube(videoData) {
  console.log("📤 Uploading video:", videoData.title);

  return new Promise((resolve, reject) => {
    fs.readFile(
      "client_secret_944372979454-0dvscn6kups5otie9p1lesf61h39c4bs.apps.googleusercontent.com.json",
      (err, content) => {
        if (err) return reject("Error loading client secret: " + err);

        authorize(JSON.parse(content), async (auth) => {
          try {
            const youtube = google.youtube({ version: "v3", auth });
            const fileSize = fs.statSync(videoData.finalOutputPath).size;
            const publishDate = await getNextPublishDate(youtube);

                        await youtube.videos.insert(
                          {
                            part: ["snippet", "status"],
                            requestBody: {
                              snippet: {
                                title: `${videoData.title_new} | Horror Podcast Adda | Hindi Horror Story`,
                                description: `${videoData.title_new} | Horror Podcast Adda | Hindi Horror Story |

                             ${videoData.story_outline}

            #horrorpodcastadda #hindistoryhorror  #hindistory #storyinhindi #horrorpodacast  #bhootiyakahani #scarystory

            🎧 Horror Podcast Adda — डर का असली ठिकाना!
            आपका स्वागत है Horror Podcast Adda पर, जहाँ हर कहानी डर, सस्पेंस और रहस्य की एक नई दुनिया रचती है।
            हम लाते हैं हिंदी हॉरर स्टोरीज़, जो आपकी कल्पना और हकीकत की सीमाओं को धुंधला कर दें।

            👻 यहाँ आपको मिलेगा:
            1️⃣ Real Ghost Stories – सच्ची भूतिया घटनाएँ और अलौकिक अनुभव
            2️⃣ Chudail & Witch Tales – रहस्यमयी चुड़ैल और प्रेतात्माओं की कहानियाँ
            3️⃣ Psychological Horror – मनोवैज्ञानिक और मानसिक डरावनी कहानियाँ
            4️⃣ Dark Horror Podcasts – गहरी आवाज़ और सस्पेंसफुल बैकग्राउंड म्यूज़िक के साथ
            5️⃣ Scary Fiction & Reality Mix – काल्पनिक और वास्तविक डर का अनोखा संगम

            📅 हर हफ्ते नई हिंदी हॉरर स्टोरी!
            🎧 अगर आपको भूत-प्रेत, डरावनी कहानियाँ और हॉरर पॉडकास्ट सुनना पसंद है, तो यह चैनल आपके लिए है।

            🔔 अभी Subscribe करें और डर को महसूस करें:
            👉 https://youtube.com/@HorrorPodcastAdda

            📲 हमसे जुड़े रहिए:
            🅾 Instagram: https://www.instagram.com/horror_podcast_adda

            📩 Business / Collaboration: Horrorpodcastadda@gmail.com

            hindi horror podcast, hindi horror story, new hindi horror story, new horror story in hindi, bhoot ki kahani, darawani kahani, chudail, bhoot story, horror video, horror stories channel, ghost story in hindi, bhutiya kahani, creepy podcast in hindi, scary story hindi, horror podcast india, supernatural stories hindi, true horror hindi, डरावनी कहानियाँ, chudail horror story`,
                                tags: [
                                  "Creeping Echoes",
                                  "Horror Podcast Adda",
                                  "animated stories",
                                  "chilling stories",
                                  "creepy encounters",
                                  "creepy stories",
                                  "ghost stories",
                                  "ghost story in hindi",
                                  "hindi horror stories",
                                  "hindi horror story",
                                  "horror",
                                  "horror movie hindi",
                                  "horror podcast",
                                  "horror podcast hindi",
                                  "horror stories",
                                  "horror stories in hindi",
                                  "horror story",
                                  "indian horror story",
                                  "scary encounters",
                                  "scary video",
                                  "sinister stories",
                                  "true scary stories",
                                  "urban legends",
                                ],
                                categoryId: "24",
                                defaultLanguage: "hi",
                                defaultAudioLanguage: "hi",
                                recordingDate: new Date().toISOString(),
                              },
                              status: {
                                privacyStatus: "private",
                                publishAt: publishDate.toISOString(), // ✅ correct RFC 3339 UTC
                                selfDeclaredMadeForKids: false,
                                license: "youtube",
                                embeddable: true,
                                publicStatsViewable: true,
                              },
                            },
                            media: { body: fs.createReadStream(videoData.finalOutputPath) },
                          },
                          {
                            onUploadProgress: (evt) => {
                              const progress = (evt.bytesRead / fileSize) * 100;
                              process.stdout.clearLine(0);
                              process.stdout.cursorTo(0);
                              process.stdout.write(`Uploading: ${progress.toFixed(2)}%`);
                            },
                          },
                          (err, response) => {
                            if (err) return reject("❌ Upload Error: " + err);

                            console.log(`\n✅ Video uploaded! ID: ${response.data.id}`);
                            console.log(`📅 Scheduled: ${publishDate}`);

                            // Upload thumbnail
                            youtube.thumbnails.set(
                              {
                                videoId: response.data.id,
                                media: {
                                  body: fs.createReadStream(videoData.outputThumbnailPath),
                                },
                              },
                              (thumbErr) => {
                                if (thumbErr)
                                  return reject("❌ Thumbnail Error: " + thumbErr);
                                console.log("✅ Thumbnail uploaded successfully!");

                                resolve({
                                  videoId: response.data.id,
                                  scheduledAt: publishDate,
                                  ...videoData,
                                });
                              }
                            );
                          }
                        );
          } catch (e) {
            reject(e);
          }
        });
      }
    );
  });
}
