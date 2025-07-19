// index.js

import { logBox, sleep } from "./utils/commonFunction.js";
import dotenv from "dotenv";

dotenv.config();

async function runPipeline() {
  try {
    logBox(1, "Generating Story .....");
    const storyData = await import("./generateStory.js").then((mod) =>
      mod.default()
    );
    sleep(2000);

    logBox(2, "Generate Images .....");
    const imageData = await import("./generateImages.js").then((mod) =>
      mod.default(storyData)
    );
    sleep(2000);

    logBox(3, "Generating Audios .....");
    const ttsData = await import("./generateTTS.js").then((mod) =>
      mod.default(imageData)
    );
    sleep(2000);

    logBox(4, "Generating Videos from Images and Audios ...");
    const videoData = await import("./generateVideos.js").then((mod) =>
      mod.default(ttsData)
    );
    sleep(2000);

    // console.log("📤 Step 5: uploadToYoutube");
    // await import("./uploadToYoutube.js").then((mod) => mod.default(videoData));
    // sleep(2000);

    console.log("✅ Pipeline completed successfully.");
  } catch (error) {
    console.error("❌ Pipeline failed:", error);
    process.exit(1);
  }
}

runPipeline();
