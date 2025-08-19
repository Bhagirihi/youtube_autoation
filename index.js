// index.js

import { logBox, sleep } from "./utils/commonFunction.js";
import inquirer from "inquirer";
import dotenv from "dotenv";
import { title } from "process";

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

    // const storyData = {
    //   title: "स्याही जो आत्मा पीती है || उसने कला नहीं, मौत चुनी थी।",
    //   selection: "Hindi",
    //   youtube_titles: [
    //     "उसने कला नहीं, मौत चुनी थी।",
    //     "पहाड़ों में मिला वो शापित रंग।",
    //     "मेरी कला ही मेरी कब्र बन गई।",
    //     "अंतिम कृति: एक आत्मा की चीख़।",
    //     "वो स्याही नहीं, एक भूख थी।",
    //   ],
    //   intro:
    //     "पहाड़ों की रातें गहरी होती हैं। इतनी गहरी कि सियाही भी शरमा जाए। मैं अनन्या, एक कुम्हार, अपनी कला में जान फूँकने के लिए दिल्ली की भीड़-भाड़ छोड़कर सिरोना गाँव के इस पुश्तैनी घर में आई थी। सोचा था यहाँ की खामोशी मेरे सूने कैनवास को भर देगी। पर यहाँ की खामोशी बोलती थी। रात को जब देवदार के पेड़ों से ओस टपकती, तो लगता कोई मेरे कमरे के बाहर दबे पाँव चल रहा है। हवा जब खिड़की के पुराने पल्लों से टकराती, तो लगता कोई सर्द साँसें ले रहा है। ये घर... ये साँस लेता था। और इसकी साँसों में एक अजीब सी नमी थी, मिट्टी और सदियों पुरानी उदासी की मिली-जुली गंध। एक रात, छत पर बने पुराने संदूक में मुझे वो मटकी मिली। छोटी सी, काले रंग की, जिस पर मोम की मोटी परत जमी थी। उसे छूते ही मेरे हाथ काँप गए। एक अजीब सी कशिश थी उसमें, जैसे वो सदियों से मेरा ही इंतज़ार कर रही हो। उस मटकी के अंदर कुछ था, जो मुझे बुला रहा था। एक ऐसा राज़, जो मेरी कला को ज़िंदगी या शायद... मौत देने वाला था। उस रात, पहली बार मुझे लगा कि इस घर में मैं अकेली नहीं हूँ। कोई था, जो देख रहा था। जो चाहता था कि मैं उस मटकी को खोलूँ।",
    //   story_outline:
    //     "पहाड़ों की खामोश रातों में एक कुम्हारिन को अपने पुश्तैनी घर की छत पर एक अजीब काली मटकी मिलती है। उसमें छिपी स्याही साधारण नहीं, बल्कि शापित है। वह कला को ज़िंदगी देती है, लेकिन कलाकार की आत्मा पी जाती है। हर कृति के साथ मौत और नज़दीक आती जाती है। क्या अनन्या बच पाएगी, या उसकी कला ही उसका मक़बरा बन जाएगी? चलिये शुरू करते हैं...",
    //   title_new: "स्याही जिसने मेरी आत्मा निगल ली",
    //   image_tags: [
    //     "a dusty old attic with a black clay pot covered in thick wax, dim lantern light flickering",
    //     "dew dripping from tall pine trees under a moonlit sky, creating eerie shadows",
    //     "a potter’s hands trembling as they scrape wax from an ancient urn, black soil under fingernails",
    //     "a clay vase painted with black ink, glowing faintly like trapped fireflies in darkness",
    //     "a half-open window in an old house, cold mist seeping in, curtains shifting as if someone breathed",
    //     "a beautifully carved clay pot where the leaves and flowers are subtly moving on their own",
    //     "a tall shadowy woman with hair touching the ground, standing in a dark corner of a room",
    //     "a clay pot with a woman’s figure facing away, positioned exactly under a pine tree in the courtyard",
    //     "a large clay urn with a woman’s face, black ink tears flowing from its eyes like real blood",
    //     "a terrified woman staring at her own face carved onto a clay vessel, illuminated by flickering oil lamp",
    //   ],
    //   youtube_thumbnails: [
    //     "Scary black clay pot glowing in darkness",
    //     "Terrified woman looking at cursed pottery",
    //     "Haunted attic with eerie shadows",
    //     "Ink tears flowing from a clay face",
    //     "Ghostly woman standing in the mist",
    //   ],
    //   voicePath:
    //     "stories/स्याही_जो_आत्मा_पीती_है_उसने_कला_नहीं,_मौत_चुनी_थी।/voiceover/स्याही_जो_आत्मा_पीती_है_उसने_कला_नहीं,_मौत_चुनी_थी।.mp3",
    // };

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

    logBox(5, "📸 Generate Thumbnail");
    const thumbnail = await import("./generateThumbnail.js").then((mod) =>
      mod.default(videoData)
    );
    sleep(2000);

    logBox(6, "Merging Videos with Intro ...");
    const mergeData = await import("./endVideo.js").then((mod) =>
      mod.default(thumbnail)
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
