import path from "path";
import fs from "fs/promises";
import axios from "axios";
import { sleep } from "../index.js";

export async function voiceByBhashini(transcriptJson, folder) {
  const chunks = transcriptJson.map((part) => part.part);
  const generatedAudioPaths = [];

  try {
    console.log("🎙️ Generating TTS using Bhashini (axios)…");
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkFile = `${i + 1}.mp3`;
      const chunkPath = path.join(folder, "volume", chunkFile);

      try {
        console.log(`🗣️ Generating TTS (chunk ${i + 1}/${chunks.length})`);
        const url = "https://tts.bhashini.ai/v1/synthesize";

        const payload = {
          text: chunkText,
          language: "Hindi",
          voiceName: "mr-m3",
        };

        const res = await axios.post(url, payload, {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "*/*",
          },
          responseType: "arraybuffer",
        });

        const audioBuffer = Buffer.from(res.data);
        await fs.writeFile(chunkPath, audioBuffer); // Use async write

        console.log(`✅ Audio saved`);
        generatedAudioPaths.push(chunkPath);

        const delay = 4000 + Math.floor(Math.random() * 3000);
        // console.log(`⏳ Cooling down for ${delay / 1000}s before next chunk`);
        await sleep(delay);
      } catch (err) {
        console.error(`❌ Failed TTS for chunk ${i + 1}:`, err.message);
      }
    }
    return true;

    // // 🎯 CRITICAL FIX: Merge ONLY after the loop finishes
    // if (generatedAudioPaths.length > 0) {
    //   return await mergeAudios(folder);
    // } else {
    //   console.log("⚠️ No audio chunks were successfully generated to merge.");
    //   return null;
    // }
  } catch (err) {
    console.error("❌ TTS Error:", err);
    throw err;
  }
}
