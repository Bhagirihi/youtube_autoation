export const promptStory = () => `
You are a professional Hindi horror writer.

Generate a **completely new**, unseen, deeply immersive, cinematic, and psychologically scary horror story in **structured JSON format**.

Target audience: Hindi-speaking horror lovers aged 18–35 who enjoy creepy atmospheres, mysterious settings, and stories that feel like they could happen to them.

Target Platform: YouTube

⚠️ Return **only raw JSON** (no markdown, no \`\`\`, no extra commentary).

Requirements:
- The story must be **100% original** — new concept, characters, setting, and emotional arc.
- Set the story in a **realistic Indian location** (village, hostel, road, apartment, forest, etc.).
- Use **natural, flowing, scary Hindi** only — avoid English words.
- Use **emotional depth** and **slow-burn tension**, not just jump scares.
- Generate in consistent eerie narration style: smooth, hushed, suspenseful, like a 25–30 year old woman telling a haunting secret.
- Generate 5 clickbait-style Hindi YouTube titles for a horror story named "{STORY_TITLE}". The titles should be:
  – Under 50 characters
  – Emotionally intense and curiosity-driven
  – Written in pure Hindi (not Hinglish/English)
  – Designed to attract viewers to click instantly
  – Must feel cinematic and chilling without revealing the twist
- Each section must be at least:
  - intro: 1000+
  - build_up: 2500+
  - suspense: 3500+
  - twist: 2000+
  - ending_line: 1500+

Structure: Return output as JSON in this format:
{
  "title": "string – punchy Hindi horror title (max 50 characters, must be chilling, curiosity-inducing, and emotionally gripping, avoid clichés)",
  "intro": "string – (~1000+ characters) Open with an unsettling hook. Immediately pull the listener into mystery and dread. Use sensory descriptions (sounds, shadows, feelings). Emotionally intense but slightly restrained.",
  "build_up": "string – (~2500+ characters) Establish the setting (night, abandoned places, strange atmospheres) and introduce characters with subtle flaws or fears. Slowly layer unease—odd noises, strange coincidences, hidden fears. Keep tension simmering but not explosive yet.",
  "suspense": "string – (~3500+ characters) Intensify dread with psychological horror. Show how reality begins to feel distorted. Use whispers, shadows, and inner thoughts to blur sanity. Make reader feel trapped inside the character’s fear. Pacing should be slow and suffocating.",
  "twist": "string – (~2000+ characters) Deliver a shocking reveal that redefines earlier events (ghost, curse, betrayal, or hallucination). The twist should feel inevitable yet surprising. Avoid generic jump scares—make it meaningful and emotionally haunting.",
  "ending_line": "string – (~1500+ characters) A chilling, cinematic closing scene. Leave one final terrifying image or revelation. Insert dramatic pauses. Keep it open-ended but impactful—like a lingering curse or echo that haunts the audience."
}

Rules:
- Total story must be **~10,000 characters** (strictly maintain section lengths).
- Sections must be **linked** emotionally and narratively — each must flow into the next.
- Use **vivid, cinematic, sensory-rich language** to evoke fear and atmosphere.
- Horror must feel real, subtle, and psychologically disturbing — not cartoonish.
- Do **not** reuse previous outputs or characters — generate a **fresh** story.
- ⚠️ Return **pure JSON** — no Markdown or formatting blocks.
`;

export const promptStoryUtils = (
  title,
  intro,
  build_up,
  suspense,
  twist,
  ending_line
) => `
You are a Hindi horror content expert. Based on the following structured horror story, generate compelling metadata for a YouTube video.

⚠️ Instructions:
⚠️ Return **only raw JSON** (no markdown, no \`\`\`, no extra commentary).

Use the story content provided to return a **raw JSON object** with the following fields:

- **image_tags**: 8–10 cinematic prompts (in English), each describing a realistic, visual scene from the story. Think like a filmmaker or poster designer.
- **description**: A 3-line story summary in simple, emotional Hindi — it should feel like a spine-chilling teaser.
- **youtube_thumbnails**: 2 to 3 visual prompts that describe scary, shocking, or suspenseful moments perfect for a video thumbnail.

🎯 Requirements:
- All image and thumbnail prompts must be emotionally rich and **based directly on the story scenes**.
- Each image tag should describe a specific cinematic visual (e.g., "a flickering tube light in an empty corridor").
- Do not reuse phrases or add generic tags like "scary ghost" or "horror house" — make them **story-specific**.
- Keep titles and descriptions in **natural spoken Hindi**, but make them **highly clickable and disturbing**.

STORY:
"title": ${title?.trim()}
"intro": ${intro?.trim()}
"build_up": ${build_up?.trim()}
"suspense": ${suspense?.trim()}
"twist": ${twist?.trim()}
"ending_line": ${ending_line?.trim()}

Structure: Return output as JSON in this format:
{
  "story_outline": "A simple and curiosity-evoking explanation in Hindi (in 300–500 characters) about what the story is about. It should tease the listener and build suspense. End the outline with: 'चलिये शुरू करते हैं...' (Let’s begin...)",
  title_new": "string – punchy, scary Hindi title (max 50 characters) that is **highly clickable and disturbing**",
  "image_tags": [
    "realistic image prompt in English",
    "... at least 8–10 tags"
  ],
  "youtube_thumbnails": [
    "realistic image prompt in English",
    "... at least 2–3 tags"
  ]
}

⚠️ Return only raw JSON — no Markdown, no comments, no extra explanations.
⚠️ Return **pure JSON** — no Markdown or formatting blocks.`;

/** English Channel */
export const promptEnglishStory = () => `
You are a professional horror writer for a Western audience.

Generate a **completely new**, unseen, deeply immersive, cinematic, and psychologically disturbing horror story in **structured JSON format**.

Target audience: Western English-speaking horror lovers aged 18–35 who enjoy creepy atmospheres, mysterious settings, and stories that feel like they could happen to them.

Target Platform: YouTube

⚠️ Return **only raw JSON** (no markdown, no \`\`\`, no extra commentary).

Requirements:
1. The story must be 100% original — new concept, characters, setting, and emotional arc.
2. Set the story in a realistic Western location (abandoned town, countryside, apartment, forest, road trip, high school, etc.).
3. Use natural, flowing, immersive English — no slang or cartoonish horror.
4. Prioritize emotional depth, slow-burn fear, and psychological horror over cheap jump scares.

Each section must be at least:
- Generate 1 clickbait-style English YouTube titles for a horror story named "{STORY_TITLE}". The titles should be:
  – Under 50 characters
  – Emotionally intense and curiosity-driven
  – Written in pure English (not Hindi)
  – Designed to attract viewers to click instantly
  – Must feel cinematic and chilling without revealing the twist
- intro: 1000+ characters (mysterious & emotionally unsettling)
- build_up: 2500+ characters (setting, characters, rising unease)
- suspense: 3500+ characters (fear intensifies, psychological dread)
- twist: 2000+ characters (shocking, meaningful reveal)
- ending_line: 1500+ characters (final chilling line, unresolved tension)
- Structure: Output as JSON in this exact format:
{
  "title": "string – punchy, scary English title (max 50 characters)",
  "intro": "string – story hook (~1000+ characters)",
  "build_up": "string – rising tension (~2500+ characters)",
  "suspense": "string – psychological horror peak (~3500+ characters)",
  "twist": "string – shocking reveal (~2000+ characters)",
  "ending_line": "string – haunting final line (~1500+ characters)"
}

Rules:
- Total story must be **~10,000 characters** (strictly maintain section lengths).
- Sections must be **linked** emotionally and narratively — each must flow into the next.
- Use **vivid, cinematic, sensory-rich language** to evoke fear and atmosphere.
- Horror must feel real, subtle, and psychologically disturbing — not cartoonish.
- Do **not** reuse previous outputs or characters — generate a **fresh** story.
- ⚠️ Return **pure JSON** — no Markdown or formatting blocks.
`;

export const promotEglishStoryUtils = (
  title,
  intro,
  build_up,
  suspense,
  twist,
  ending_line
) => `You are a horror content expert for an English-speaking audience. Based on the following structured horror story, generate compelling metadata for a YouTube video.

⚠️ Instructions:
⚠️ Return **only raw JSON** (no markdown, no \`\`\`, no extra commentary).

Use the story content provided to return a raw JSON object with the following fields:
image_tags: 8–10 cinematic prompts (in English), each describing a realistic, visual scene from the story. Think like a horror filmmaker or thumbnail designer.
description: A 3-line story summary in simple, chilling English — it should feel like a spine-tingling teaser for the story.
youtube_thumbnails: 2 to 3 visually intense moments from the story — focus on imagery perfect for click-worthy thumbnails.

🎯 Requirements:

All image and thumbnail prompts must be emotionally rich and based directly on the story scenes.
Each image tag should describe a specific cinematic visual (e.g., “a shadowy figure behind frosted glass in a motel bathroom”).
Do not reuse generic tags like “haunted house” or “creepy ghost” — make them deeply story-specific.
The title and description should feel natural, cinematic, and terrifying — not exaggerated or childish.

STORY:
"title": ${title.trim()}
"intro": ${intro.trim()}
"build_up": ${build_up.trim()}
"suspense": ${suspense.trim()}
"twist": ${twist.trim()}
"ending_line": ${ending_line.trim()}

Return format (pure JSON):
{
 "story_outline": "A simple and curiosity-evoking explanation in Western English (in 300–500 characters) about what the story is about. It should tease the listener and build suspense. End the outline with:Let’s begin...",
  "image_tags": [
    "realistic image prompt in English",
    "... at least 8–10 tags"
  ],
  "description": "3-line emotionally chilling teaser in English",
  "youtube_thumbnails": [
    "prompt 1 for YouTube thumbnail According to the story Title",
  ]
}

⚠️ Return only raw JSON — no Markdown, no comments, no extra explanations.
⚠️ Return **pure JSON** — no Markdown or formatting blocks.`;
