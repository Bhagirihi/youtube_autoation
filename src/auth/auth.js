// import fs from "fs";
// import open from "open";
// import { google } from "googleapis";
// import path from "path";

// const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];
// const CREDENTIALS_PATH = path.resolve(
//   "./src/auth/client_secret_944372979454-a2ero9ndeopgpvvqidgauo1m8cqhr64k.apps.googleusercontent.com.json"
// );

// const AUTH_DIR = "./auth";

// export async function authorize(channelKey) {
//   if (!channelKey) {
//     throw new Error("❌ channelKey is required");
//   }

//   const TOKEN_PATH = `${AUTH_DIR}/${channelKey}.token.json`;

//   const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
//   const { client_id, client_secret, redirect_uris } = credentials.installed;

//   const oAuth2Client = new google.auth.OAuth2(
//     client_id,
//     client_secret,
//     redirect_uris[0]
//   );

//   /* ==================== TOKEN LOAD ==================== */
//   async function verifyChannel(auth, channelKey) {
//     const youtube = google.youtube({ version: "v3", auth });

//     const res = await youtube.channels.list({
//       part: ["id", "snippet"],
//       mine: true,
//     });

//     if (!res.data.items || !res.data.items.length) {
//       throw new Error("❌ No YouTube channel found for this token");
//     }

//     const channel = res.data.items[0];

//     console.log("✅ Channel verified");
//     console.log("   Channel ID   :", channel.id);
//     console.log("   Channel Name :", channel.snippet.title);
//     console.log("   Channel Key  :", channelKey);

//     return channel.id;
//   }

//   function attachTokenRefreshLogger(oAuth2Client, tokenPath) {
//     oAuth2Client.on("tokens", (tokens) => {
//       const existing = fs.existsSync(tokenPath)
//         ? JSON.parse(fs.readFileSync(tokenPath))
//         : {};

//       const updated = { ...existing, ...tokens };

//       fs.writeFileSync(tokenPath, JSON.stringify(updated, null, 2));

//       if (tokens.refresh_token) {
//         console.log("🔁 New refresh token received & saved");
//       }

//       if (tokens.access_token) {
//         console.log("🔄 Access token refreshed at", new Date().toISOString());
//       }
//     });
//   }

//   if (fs.existsSync(TOKEN_PATH)) {
//     const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
//     oAuth2Client.setCredentials(token);

//     console.log(`🔐 Loaded token for channelKey: ${channelKey}`);

//     attachTokenRefreshLogger(oAuth2Client, TOKEN_PATH);
//     await verifyChannel(oAuth2Client, channelKey);

//     return oAuth2Client;
//   }

//   /* ==================== FIRST TIME AUTH ==================== */

//   const authUrl = oAuth2Client.generateAuthUrl({
//     access_type: "offline",
//     scope: SCOPES,
//     prompt: "consent",
//   });

//   console.log(`\n🔑 Authorize channel: ${channelKey}`);
//   console.log(authUrl);

//   await open(authUrl);

//   return new Promise((resolve, reject) => {
//     process.stdin.once("data", async (code) => {
//       try {
//         const { tokens } = await oAuth2Client.getToken(code.toString().trim());

//         oAuth2Client.setCredentials(tokens);

//         fs.mkdirSync(AUTH_DIR, { recursive: true });
//         fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

//         console.log(`✅ Token stored for: ${channelKey}`);

//         attachTokenRefreshLogger(oAuth2Client, TOKEN_PATH);
//         await verifyChannel(oAuth2Client, channelKey);

//         resolve(oAuth2Client);
//       } catch (err) {
//         reject(err);
//       }
//     });
//   });
// }

import fs from "fs";
import open from "open";
import { google } from "googleapis";
import path from "path";
import readline from "readline";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const CREDENTIALS_PATH = path.resolve(
  "./src/auth/client_secret_944372979454-a2ero9ndeopgpvvqidgauo1m8cqhr64k.apps.googleusercontent.com.json"
);
const AUTH_DIR = "./src/auth";

// Helper to ask user input in terminal
function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) =>
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

const CHANNELS = [
  { key: "HorrorPodcastAdda", name: "Horror Podcast Adda" },
  { key: "WithIn24Hours", name: "With In 24 Hours" },
  { key: "CinePlotDecode", name: "CinePlot Decode" },
];

/**
 * Authorize YouTube. If channelKey is provided (e.g. "HorrorPodcastAdda"), uses it without prompting.
 * If channelKey is null/undefined, prompts user to select a channel.
 */
export async function authorize(channelKey = null) {
  if (!channelKey) {
    console.log("\n=== YouTube Channel Token Setup ===");
    console.log("Select a YouTube channel to authorize:\n");
    CHANNELS.forEach((ch, idx) => {
      console.log(`  ${idx + 1}. ${ch.name} (${ch.key})`);
    });
    const selectedIndex = parseInt(await ask("Enter channel number (1-3): "), 10);
    if (!selectedIndex || selectedIndex < 1 || selectedIndex > CHANNELS.length) {
      throw new Error("❌ Invalid selection");
    }
    channelKey = CHANNELS[selectedIndex - 1].key;
  }

  const TOKEN_PATH = `${AUTH_DIR}/${channelKey}.token.json`;
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    attachTokenRefreshLogger(oAuth2Client, TOKEN_PATH);
    await verifyChannel(oAuth2Client, channelKey);
    return oAuth2Client;
  }

  // First-time login
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
  console.log("\n🔑 Open this URL to authorize:", authUrl);
  await open(authUrl);
  const code = await ask("Enter the code from browser: ");
  const { tokens } = await oAuth2Client.getToken(code);
  oAuth2Client.setCredentials(tokens);
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));

  attachTokenRefreshLogger(oAuth2Client, TOKEN_PATH);
  await verifyChannel(oAuth2Client, channelKey);

  return oAuth2Client;
}

/* ---------------- HELPERS ---------------- */

async function verifyChannel(auth, channelKey) {
  const youtube = google.youtube({ version: "v3", auth });
  const res = await youtube.channels.list({
    part: ["id", "snippet"],
    mine: true,
  });

  if (!res.data.items || !res.data.items.length)
    throw new Error("❌ No YouTube channel found for this token");

  return res.data.items[0].id;
}

function attachTokenRefreshLogger(oAuth2Client, tokenPath) {
  oAuth2Client.on("tokens", (tokens) => {
    const existing = fs.existsSync(tokenPath)
      ? JSON.parse(fs.readFileSync(tokenPath))
      : {};
    fs.writeFileSync(tokenPath, JSON.stringify({ ...existing, ...tokens }, null, 2));
  });
}
