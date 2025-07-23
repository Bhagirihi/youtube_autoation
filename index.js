// index.js

import { logBox, sleep } from "./utils/commonFunction.js";
import inquirer from "inquirer";
import dotenv from "dotenv";

dotenv.config();

async function runPipeline(selection) {
  try {
    logBox(1, "Generating Story .....");
    var storyData;
    {
      storyData = await import("./generateStory.js").then((mod) =>
        mod.default(selection)
      );
    }

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

    console.log("📤 Step 5: Generate Thumbnail");
    await import("./generateThumbnail.js").then((mod) =>
      mod.default(videoData)
    );
    sleep(2000);

    console.log("✅ Pipeline completed successfully.");
  } catch (error) {
    console.error("❌ Pipeline failed:", error);
    process.exit(1);
  }
}

async function selectFlow() {
  const answer = await inquirer.prompt([
    {
      type: "list",
      name: "flow",
      message: "🔮 Choose your horror content flow:",
      choices: [
        { name: "🕯️ Horror Podcast Adda (Hindi)", value: "Hindi" },
        { name: "🌑 Creeping Echoes (English)", value: "English" },
        { name: "🚪 Exit", value: "exit" },
      ],
    },
  ]);
  console.log("flow:", answer.flow);

  if (answer.flow === "exit") {
    console.log("👋 Exiting...");
    process.exit(0);
  } else {
    runPipeline(answer.flow);
  }
}

selectFlow();
