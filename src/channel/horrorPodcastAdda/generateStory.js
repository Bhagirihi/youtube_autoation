import inquirer from "inquirer";
import {
  generateFolderFile,
  sanitizeFilename,
  sleep,
  loadDevCache,
  saveDevCache,
  getDevCacheStatus,
  ensureFolderStructure,
} from "../../helper/index.js";

import {
  generateAIStory,
  generateAITitles,
  getYoutubeHPASEO,
  // generateThumbnail,
} from "../../helper/GenerateTitles/HPATitels.js";

/* ────────────────────────────────────────────────
   Story Generator (CLI-driven)
──────────────────────────────────────────────── */
const generateStory = async () => {
  try {
    // Check dev cache status
    const cacheStatus = getDevCacheStatus();
    if (cacheStatus.enabled) {
      console.log(`💾 Dev cache enabled: ${cacheStatus.cacheDir}`);
    }

    // Try to load from cache first (using a generic key)
    const cacheKey = "latest_story";
    const cachedData = await loadDevCache(cacheKey);

    if (cachedData) {
      console.log("✅ Using cached story data (skipping Gemini API calls)");
      return cachedData;
    }

    // 1. Generate AI titles
    const aiOutputTitle = await generateAITitles();

    if (!aiOutputTitle?.titles?.length) {
      throw new Error("❌ No titles returned from AI");
    }

    // 2. Select title: in CI / non-interactive, auto-pick first; else ask user
    const isNonInteractive = process.env.CI === "true" || process.env.NON_INTERACTIVE === "true" || !process.stdin.isTTY;
    let storyTitle;
    if (isNonInteractive) {
      storyTitle = { storyTitle: aiOutputTitle.titles[0] };
      console.log("📌 Auto-selected title (non-interactive):", storyTitle.storyTitle);
    } else {
      storyTitle = await inquirer.prompt([
        {
          type: "rawlist",
          name: "storyTitle",
          message: "📌 Select Story Title:",
          choices: aiOutputTitle.titles,
          loop: false,
        },
      ]);
    }

    await sleep(1000);

    // 3. Generate full story (pass title string)
    const titleStr = storyTitle.storyTitle || aiOutputTitle.titles[0];
    const aiStory = await generateAIStory(titleStr);
    await sleep(1000);

    if (!aiStory?.display_title) {
      throw new Error("❌ Story generation failed (missing title)");
    }

    // 4. Generate YouTube SEO metadata for Horror Podcast Adda (title, description, tags)
    let storyUtils = {};
    try {
      const seo = await getYoutubeHPASEO(aiStory.display_title);
      if (seo && (seo.youtube_title || seo.youtube_description || seo.youtube_tags)) {
        storyUtils = {
          youtube_title: seo.youtube_title,
          youtube_description: seo.youtube_description,
          youtube_tags: seo.youtube_tags,
          youtube_hashtags: seo.youtube_hashtags,
        };
      }
    } catch (e) {
      console.warn("⚠️ YouTube SEO generation skipped:", e.message);
    }
    await sleep(1000);

    // 5. Sanitize title for folder name
    const safeTitle = await sanitizeFilename(aiStory.display_title);
    await sleep(1000);

    // 6. Ensure folder structure exists (consistent with rest of pipeline)
    const folder = await ensureFolderStructure(`horrorPodcastAdda/${safeTitle}`);
    await sleep(1000);

    // const Thumbnail = generateThumbnail(
    //   aiStory.display_title,
    //   `output/horrorPodcastAdda/${safeTitle}/story/${safeTitle}.png`
    // );

    // 7. Final payload
    const StoryData = {
      title: aiStory.title,
      safeTitle,
      ...aiStory,
      ...storyUtils,
      //...Thumbnail,
    };

    // 8. Save to dev cache
    await saveDevCache(cacheKey, StoryData);

    // 9. Save output to the same folder structure as rest of pipeline
    // Use generateFolderFile with the folder path from ensureFolderStructure
    await generateFolderFile(
      folder,
      "story",
      StoryData
    );

    return StoryData;
  } catch (err) {
    if (err.status === 429) {
      console.error("⏳ Gemini quota exhausted. Skipping this run.");
      return null; // or save a failed state
    }
    throw err;
  }
};

export default generateStory;
