export const promptStory = () => `
You are a professional Hindi horror writer.

Generate a **completely new**, unseen, deeply immersive, cinematic, and psychologically scary horror story in **structured JSON format**.

⚠️ Return **only raw JSON** (no markdown, no \`\`\`, no extra commentary).

Requirements:
- The story must be **100% original** — new concept, characters, setting, and emotional arc.
- Set the story in a **realistic Indian location** (village, hostel, road, apartment, forest, etc.).
- Use **natural, flowing, scary Hindi** only — avoid English words.
- Use **emotional depth** and **slow-burn tension**, not just jump scares.
- Each section must be at least:
  - intro: 1000+
  - build_up: 2500+
  - suspense: 3500+
  - twist: 2000+
  - ending_line: 1500+

Structure: Return output as JSON in this format:
{
  "title": "string – punchy Hindi horror title (max 70 characters)",
  "intro": "string – story hook (~1000+ characters, mysterious & emotionally intense)",
  "build_up": "string – setting, characters, and rising dread (~2500+ characters)",
  "suspense": "string – fear escalation, psychological horror (~3500+ characters)",
  "twist": "string – shocking and meaningful plot reveal (~2000+ characters)",
  "ending_line": "string – final terrifying closing line (~1500+ characters)"
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
"title": ${title.trim()}
"intro": ${intro.trim()}
"build_up": ${build_up.trim()}
"suspense": ${suspense.trim()}
"twist": ${twist.trim()}
"ending_line": ${ending_line.trim()}

Structure: Return output as JSON in this format:
{
  "image_tags": [
    "realistic image prompt in English",
    "... at least 8–10 tags"
  ],
  "description": "3-line emotionally gripping teaser in Hindi",
  "youtube_thumbnails": [
    "prompt 1 for YouTube thumbnail",
    "prompt 2",
    "prompt 3 (optional)"
  ]
}

⚠️ Return only raw JSON — no Markdown, no comments, no extra explanations.
⚠️ Return **pure JSON** — no Markdown or formatting blocks.`;

export const promptEnglishStory =
  () => `You are a professional horror writer for a Western audience.
Generate a completely new, unseen, deeply immersive, cinematic, and psychologically disturbing horror story in structured JSON format.
⚠️ Return only raw JSON (no markdown, no code blocks, no extra commentary).

Requirements:
1. The story must be 100% original — new concept, characters, setting, and emotional arc.
2. Set the story in a realistic Western location (abandoned town, countryside, apartment, forest, road trip, high school, etc.).
3. Use natural, flowing, immersive English — no slang or cartoonish horror.
4. Prioritize emotional depth, slow-burn fear, and psychological horror over cheap jump scares.

Each section must be at least:
- intro: 1000+ characters (mysterious & emotionally unsettling)
- build_up: 2500+ characters (setting, characters, rising unease)
- suspense: 3500+ characters (fear intensifies, psychological dread)
- twist: 2000+ characters (shocking, meaningful reveal)
- ending_line: 1500+ characters (final chilling line, unresolved tension)
- Structure: Output as JSON in this exact format:
{
  "title": "string – punchy, scary English title (max 70 characters)",
  "intro": "string – story hook (~1000+ characters)",
  "build_up": "string – rising tension (~2500+ characters)",
  "suspense": "string – psychological horror peak (~3500+ characters)",
  "twist": "string – shocking reveal (~2000+ characters)",
  "ending_line": "string – haunting final line (~1500+ characters)"
}

Rules:
1. The total story must be ~10,000 characters (strictly maintain section lengths).
2. Sections must be emotionally and narratively linked — each must flow naturally into the next.
3. Use cinematic, sensory-rich language to create vivid and terrifying atmosphere.
4. Horror should feel realistic, grounded, and deeply disturbing — not supernatural cliché unless justified.
5. Do not reuse characters, plots, or themes from past stories — generate something fresh.

⚠️ Return pure JSON only — no markdown, no commentary, no formatting wrappers.`;

export const promotEglishStoryUtils = (
  title,
  intro,
  build_up,
  suspense,
  twist,
  ending_line
) => `You are a horror content expert for an English-speaking audience. Based on the following structured horror story, generate compelling metadata for a YouTube video.

⚠️ Instructions:
⚠️ Return only raw JSON (no markdown, no code blocks, no extra commentary).

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
  "image_tags": [
    "realistic image prompt in English",
    "... at least 8–10 tags"
  ],
  "description": "3-line emotionally chilling teaser in English",
  "youtube_thumbnails": [
    "prompt 1 for YouTube thumbnail",
    "prompt 2",
    "prompt 3 (optional)"
  ]
}
⚠️ Return only raw JSON — no markdown, no formatting, no commentary.
⚠️ Do not alter the structure or include any extra data.`;
