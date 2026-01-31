import dotenv from "dotenv";
import inquirer from "inquirer";
import horrorPodcastAdda from "./src/channel/horrorPodcastAdda/index.js";
import withIn24Hours from "./src/channel/withIn24Hours/index.js";
import cinePlotDecode from "./src/channel/cinePlotDecode/index.js";
import cinePlotDecodeShorts from "./src/refDoc/CPDChannels.js";

dotenv.config();

async function YTSelection() {
  const answers = await inquirer.prompt([
    {
      type: "rawlist",
      name: "channel",
      message: "📌 Select Youtube Channel:",
      choices: [
        "Horror Podcast Adda",
        "With In 24 Hours",
        "CinePlot Decode",
        "CinePlot Decode (shorts)",
      ],
      default: "Horror Podcast Adda",
      loop: false, // optional: stops cycling from last to first
    },
  ]);

  switch (answers.channel) {
    case "Horror Podcast Adda":
      return horrorPodcastAdda();
    case "With In 24 Hours":
      return withIn24Hours();
    case "CinePlot Decode":
      return cinePlotDecode();
    case "CinePlot Decode (shorts)":
      return cinePlotDecodeShorts();
  }
}

// FIX TOP-LEVEL AWAIT WARNING
(async () => {
  await YTSelection();
})();
