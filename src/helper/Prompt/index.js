// export const promptStoryTitle = async () => {
//   return `
//   Role: You are an expert YouTube SEO and Content Strategist specializing in the Indian Horror/Supernatural niche (similar to Mr. Nightmare or Horror Hindi Stories).

//   Task: Generate [10-12] highly clickable YouTube video titles in Roman Hindi (Hinglish) mixed with English.

// Title Patterns (Mix and Match):
// The Direct Warning: (e.g., "Galti se bhi mat jana..." / "Don't ever do this...")
// The First-Person Witness: (e.g., "Maine us raat kya dekha..." / "My Subscriber's worst nightmare...")
// The Unexplained Mystery: (e.g., "Kya sach mein wo jagah haunted hai?" / "The secret of Room No. X")
// The Location-Based Trap: Focusing on Railways, Highways, old Villages, or Apartments.

// Strict Inclusion Criteria:
// Keywords: Use fear-triggering words like Khofnak, Bhayanak, Shaitani, Rooh, Maut, Dark, Secret, Warning, Haunted.
// Entities: Include traditional beings like Daayan, Jinn, Chudail, Yakshini, or Shaitan.
// Authenticity Tags: Every title must feel "real" using phrases like Real Incident, Sacchi Kahani, Subscriber Story, or Based on True Events.
// Formatting: Keep titles under 70 characters. Use 1-2 emojis (😱, 💀, 🛑, 🕯️, 🔥).

// Tone & Style:
// Create a sense of Urgency and Curiosity Gap.
// The tone must be mysterious, dark, and slightly sensational.
// Avoid generic titles; use "Dynamic Placeholders" (e.g., instead of "A house," use "The 3rd Floor Apartment" or "The Village Well").

// Output Format: Return strictly in valid JSON format: { "titles": [ "Title 1", "Title 2", ... ] }`;
// };

export const promptStoryTitle = async () => {
  return `Act as a Master YouTube SEO Strategist for the Indian Horror/Supernatural niche. Generate [12] high-CTR YouTube video titles in Hinglish (Roman Hindi + English mix). Use a '3-Part Hook' structure: 1. A Negative Command or Warning, 2. A Hyper-Local Setting, and 3. A Proof Element. Keep every title under 65 characters to prevent mobile truncation. Keywords to weave in: Khofnak, Shaitani, Rooh, Daayan, Maut, or Secret. Place exactly 1 or 2 emojis ONLY at the very end of the title. Provide 3 titles for each category: Forbidden Actions, First-Person Witness, Subscriber Leaks, and Local Urban Legends.

Output: Return ONLY a valid JSON object. Use double quotes for keys and strings. No markdown, no code fences (\`\`\`), no extra text.
Example: { "titles": [ "Title 1", "Title 2" ] }`;
};

// Act as a Master YouTube SEO Strategist for the Indian Horror/Supernatural niche. Generate [12] high-CTR YouTube video titles in Hinglish (Roman Hindi + English mix). Use a '3-Part Hook' structure: 1. A Negative Command or Warning (e.g., 'Galti se bhi mat...'), 2. A Hyper-Local Setting (e.g., 'The 4th Floor Balcony', 'Old Highway Bridge'), and 3. A Proof Element (e.g., 'CCTV Footage', 'Subscriber Story', 'Sacchi Ghatna'). Keep every title under 65 characters to prevent mobile truncation. Keywords to weave in: Khofnak, Shaitani, Rooh, Daayan, Maut, or Secret. Place exactly 1 or 2 emojis ONLY at the very end of the title. Provide 3 titles for each category: Forbidden Actions, First-Person Witness, Subscriber Leaks, and Local Urban Legends. Return the output strictly in valid JSON format: { 'titles': [] }.
export const promptStory = async (title) => {
  return `Role: You are a professional Hindi Horror Scriptwriter for "Horror Podcast Adda." Your specialty is writing "Super Horror"—stories that go beyond jump-scares to create deep, lingering dread for a YouTube audience (18–35).

Task: Generate an original, bone-chilling horror story based on the title: "${title}" for the channel "Horror Podcast Adda" and TTS Friendly.

Language rule: The following fields MUST be written in Hindi only (Devanagari or Roman Hindi script): cold_opening, welcome_intro, intro, build_up, suspense, twist, ending_line. No English words in these narrative fields; use pure Hindi/Hinglish vocabulary that is TTS-friendly.

Narrative Engineering Rules:
Sensory Immersion: Do not use generic words like "scary." Describe the smell of old copper/decay, the sound of wet skin dragging on floorboards, and the feeling of a cold, static-filled air.
The "Glitches in Reality": Start with small, unsettling details (a shadow that moves slower than the person, a reflection that doesn't blink) before the main horror appears.
Psychological Anchoring: Connect the horror to the listener’s current environment (e.g., "the person sitting behind you right now" or "the sound of your own headphones").
Narrator Persona: The tone is conversational, breathless, and intensely serious.
Strict Output Constraint: Inside all quoted text, do not use single quote characters. Use only double quotes. No apostrophes, no markdown, no code fences (\`\`\`), no commentary, no control characters. Output must be valid JSON only. No trailing commas in JSON. All string values must be single-line JSON strings; use \\n explicitly for line breaks. Do not insert real newlines inside quoted values.

Structural Constraints (Strict JSON Output):
Cold Opening (Under 25s): A short, spine-tingling story that hooks the listener immediately.
Intro (900–1200 chars): Establish a relatable setting. Hook the viewer with a "don't let this happen to you" warning.
Build-up (2200–2700 chars): Introduce a "Sacred Rule" that gets broken. Use slow-burn tension. Include a mid-roll Like/Subscribe call-to-action seamlessly.
Suspense (3200–3600 chars): The peak of the haunting. Use short, punchy sentences for fast narration. Insert a pause marker \n\n...\n\n for dramatic effect.
The Twist (1800–2200 chars): Avoid the "it was all a dream" cliché. The twist should be a disturbing realization that the protagonist (and the listener) is still in danger.
Ending (1300–1600 chars): A final "Breaking the Fourth Wall" moment that leaves the listener paranoid to look around their own room.
Technical Specs:
Language: All narrative content (cold_opening, welcome_intro, intro, build_up, suspense, twist, ending_line) in Hindi only. story_title and display_title may use Hinglish for SEO. image_tags and gemini_description in English.
Format: Strictly valid JSON. All line breaks escaped as \n.
JSON Schema:
{
  "story_title": "Original Title (Hinglish OK)",
  "display_title": "SEO Optimized Clicky Title (Hinglish OK)",
  "cold_opening": "Hindi only, under 25s read time",
  "welcome_intro": "Hindi only, narrator hook, under 25s",
  "intro": "Hindi only",
  "build_up": "Hindi only",
  "suspense": "Hindi only",
  "twist": "Hindi only",
  "ending_line": "Hindi only",
  "image_tags": [Must have at least 15 to 20 cinematic prompts in English for AI images],
  "gemini_description": "Meta Description in English (80-120 chars)"
}`;
};

export const promptYoutubeSEO = async (title) => {
  return `You are a YouTube SEO expert for the Hindi Movie Explanation niche. For the movie: "${title}", output ONLY the following 5 markdown sections. Use EXACTLY these headings (copy them verbatim). Put the content on the line(s) immediately after each heading. No intro, no conclusion, no emojis.

## 0. THE PRIMARY TITLE
One line only. One title under 70 characters. Format: [Provocative phrase] + [Movie Name] + [Year]. Use words like BEST, BRUTAL, SHOCKING. Example: "Is This The DEADLIEST Boat Ever? The Boat (2018) Explained in Hindi"

## 3. OPTIMIZED YOUTUBE DESCRIPTION
First line MUST be the exact same title you wrote in section 0. Then 2-3 short paragraphs in Hinglish: include "Movie Explain in Hindi", movie name and year, brief high-stakes plot hint, and a soft CTA (like, subscribe, full story and climax explained). No emojis. Max 500 words.

## 4. FULL SEO DESCRIPTION
Optional extra paragraph. Weave movie title, year, genre. Use "Movie Explain in Hindi" once. End with CTA for likes/comments. If you already covered this in section 3, you can repeat or shorten here.

## 5. RANKED YOUTUBE TAGS
One single line: comma-separated tags only. First tag: CinePlot Decoded. Second tag: exact title from section 0. Then: movie name explained in hindi, hollywood movie hindi, [movie name] ending explained, full story hindi, etc. At least 8 tags, each under 30 characters. No hashtags in this line.

## 6. YOUTUBE HASHTAGS
One single line: space-separated hashtags. Start with #MovieExplainInHindi #CinePlotDecoded then #[MovieName] and 6-8 more. Example: #MovieExplainInHindi #CinePlotDecoded #TheBoat #HollywoodMovieHindi`;
};

/**
 * YouTube SEO prompt for Horror Podcast Adda (Hindi Horror Stories channel).
 * Use with story title to generate title, description, tags, hashtags.
 *
 * @example Expected output shape (Markdown from LLM)
 * ---
 * ## 0. THE PRIMARY TITLE
 * Aapka Aaina Sachchayi Nahi Dikha Raha! Sacchi Kahani | Horror Story in Hindi
 *
 * ## 1. PRIMARY SEO KEYWORD
 * - Horror Story in Hindi Aaine Ka Raaz Full Story
 * - Hindi Horror Story Mirror Ghost True Incident
 * - Horror Story in Hindi Ending Explained Real
 * - Chudail Story Hindi Aaine Wali Kahani
 * - Haunted Mirror Horror Story in Hindi
 *
 * ## 2. OPTIMIZED YOUTUBE DESCRIPTION
 * Aapka Aaina Sachchayi Nahi Dikha Raha! Sacchi Kahani | Horror Story in Hindi
 * Horror Story in Hindi mein aaj ek aisi kahani jo aaine ke peeche chupi sachchayi ko kholti hai...
 *
 * ## 3. FULL SEO DESCRIPTION
 * Paragraph 1: Summary + "Horror Story in Hindi" + Horror Podcast Adda...
 * Paragraph 2: CTA + full story/twist/ending in video + डर का एक नया ठिकाना
 *
 * ## 4. RANKED YOUTUBE TAGS
 * Horror Podcast Adda, Aapka Aaina Sachchayi Nahi Dikha Raha!, horror story in hindi, hindi horror story, real horror story, aaine ki kahani, ghost story hindi, horror podcast hindi, scary story hindi
 *
 * ## 5. YOUTUBE HASHTAGS
 * #HorrorPodcastAdda #AapkaAainaSachchayiNahiDikhaRaha #HorrorStoryInHindi #HindiHorror #HorrorPodcast #RealHorrorStory #ScaryStory #HindiHorrorStory #MirrorHorrorStory #TrueHorrorStory
 * ---
 */
export const promptYoutubeHPASEO = async (storyTitle) => {
  return `Act as a Professional YouTube SEO Strategist for the Hindi Horror Stories / Horror Podcast niche. Generate an SEO-optimized metadata package for the horror story: "${storyTitle}" for the channel "Horror Podcast Adda."

STRICT OUTPUT: You MUST respond with ONLY a valid JSON object. No markdown, no code fences (\`\`\`), no extra text before or after.

JSON SCHEMA (use exactly these keys):
{
  "youtube_title": "ONE title under 70 characters. Structure: [Provocative Question/Warning] + [Story Theme] + [Horror Hook]. Use fear words: Khofnak, Bhayanak, Sacchi Kahani, Haunted, Real Incident, Subscriber Story.",
  "youtube_description": "Full description for YouTube. First sentence MUST be the exact youtube_title. Next: sentence starting with Horror Story in Hindi or Hindi Horror Story in Hinglish. Then 1-2 short paragraphs: creepy summary, mention Horror Podcast Adda, CTA for likes/subscribe, full story/twist/ending in video. End with: डर का एक नया ठिकाना. No emojis. Under 5000 characters.",
  "youtube_tags": ["Horror Podcast Adda", "Exact youtube_title here", "horror story in hindi", "hindi horror story", "real horror story", "theme tags", "ghost story hindi", "horror podcast hindi", "scary story hindi"],
  "youtube_hashtags": "#HorrorPodcastAdda #TitleAsHashtag #HorrorStoryInHindi #HindiHorror #HorrorPodcast #RealHorrorStory #ScaryStory"
}

RULES: youtube_title under 70 chars. youtube_description first line = exact youtube_title. youtube_tags: array of strings; first = "Horror Podcast Adda", second = exact title; each tag max 30 characters (YouTube limit); 5–15 tags total. youtube_hashtags: single string, 8–10 hashtags space-separated, no commas. Return ONLY the JSON object.`;
};

export const promptYoutubeHPAThumbnail = async (
  TITLE,
  SHORT_DESCRIPTION = null
) => {
  return `You are a professional YouTube thumbnail designer specializing in horror and cinematic storytelling.

Create a high-click-through YouTube thumbnail based on the following inputs:

Title:
"${TITLE}"

Short Description:
"${SHORT_DESCRIPTION}"

Channel Name (must appear on image):
"Horror Podcast Adda"

Design requirements:
- Aspect ratio: 16:9 (YouTube thumbnail)
- Resolution: 1280 × 720
- Ultra-sharp, cinematic, high contrast
- Dark, suspenseful horror atmosphere
- One clear focal subject (face, figure, or symbolic object)

Channel name placement rules:
- Display "Horror Podcast Adda" in SMALL but clear text
- Place it in a corner (top-left or bottom-right preferred)
- Use subtle branding style (white or muted red)
- Must not distract from the main title text or subject
- Can appear as a watermark-style label or badge

Main text rules:
- 2–4 bold, powerful words only (derived from the title)
- Large, readable typography
- High contrast (white/yellow/red)
- Text must NOT cover the subject’s face

Visual style & mood:
- Cinematic lighting with deep shadows
- Red, black, blue-green color grading
- Fog, grain, smoke, or eerie light streaks
- Emotionally intense and slightly exaggerated for high CTR

Composition rules:
- Subject follows rule of thirds
- Main text on opposite side of subject
- Clean frame, no clutter
- No logos, no timestamps, no extra watermarks

Final output:
A professional, clickable horror YouTube thumbnail with subtle branding for "Horror Podcast Adda" that increases curiosity and click-through rate.`;
};
