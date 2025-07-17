const promptStory = () => `
You are a professional Hindi horror story writer. Write a deeply immersive, psychologically intense horror story in structured JSON format.

⚠️ Requirements:
- The story must be completely new and original — do NOT reuse any ideas, characters, or titles.
- Write the entire story in **natural, cinematic Hindi** — avoid English except for proper nouns if needed.
- The story must have a **slow-burn psychological horror tone**, focusing on emotional depth and fear of the unknown.
- Set the story in a realistic setting (e.g., Indian village, abandoned hostel, forest, city apartment, road trip).
- Maintain strong narrative continuity — each section must **logically and emotionally flow into the next**.
- Avoid supernatural clichés unless given a unique and terrifying twist.
- Do NOT include any Markdown formatting — return raw JSON only.

🎯 Total length: ~10,000 characters (for all fields combined)

Return output in the following plain JSON format:

{
  "title": "string – punchy Hindi horror title with emoji (max 70 characters)",
  "intro": "string – story hook (~1000+ chars, create intrigue and emotional tension)",
  "build_up": "string – establish setting, characters, and rising dread (~2500+ chars)",
  "suspense": "string – fear escalation, strange events, psychological build-up (~3500+ chars)",
  "twist": "string – shocking, meaningful, and unexpected plot reveal (~2000+ chars)",
  "ending_line": "string – final terrifying or haunting line (~1500+ chars)"
}

🎬 Writing Rules:
- Each section ('intro', 'build_up', 'suspense', 'twist', 'ending_line') must be **cinematic, rich in detail, and emotionally gripping**.
- The tone should be disturbing, immersive, and layered — not just visual horror but deeply psychological.
- Each section must **lead naturally into the next**, maintaining continuity in plot, setting, tone, and characters.
- Focus on realism, atmosphere, and sensory storytelling — avoid jump scares or lazy plot devices.

⚠️ Output must be **pure JSON**, without any commentary or formatting.
`;

const promptStoryUtils = (
  title,
  intro,
  build_up,
  suspense,
  twist,
  ending_line
) => `
You are a Hindi horror content expert. Based on the following structured horror story, generate compelling metadata for a YouTube video.

⚠️ Instructions:
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
"title": ${title}
"intro": ${intro}
"build_up": ${build_up}
"suspense": ${suspense}
"twist": ${twist}
"ending_line": ${ending_line}

📤 Return JSON in this exact structure:

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
`;
