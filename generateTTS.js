import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ffmpeg from "fluent-ffmpeg";
import { fetchTTS, logBox, sleep } from "./utils/commonFunction.js";
import { get } from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_CHARS = 990;

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_");
}

// 🔧 Helper to split long text into < MAX_CHARS segments
function splitTextIntoChunks(text, maxLen) {
  const sentences = text.split(/(?<=[।.!?])\s+/); // smart sentence split
  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + " " + sentence).length <= maxLen) {
      currentChunk += (currentChunk ? " " : "") + sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

function getRandomVoice() {
  const constants = ["coral", "echo", "fable", "nova", "shimmer"];

  const randomIndex = Math.floor(Math.random() * constants.length);
  return constants[randomIndex];
}

function getRandomVibe() {
  const instructions = `
Voice Affect: Low, hushed, and suspenseful; convey tension and intrigue.
Tone: Deeply serious and mysterious, maintaining an undercurrent of unease throughout.
Pacing: Slow, deliberate, pausing slightly after suspenseful moments to heighten drama.
Emotion: Restrained yet intense—voice should subtly tremble or tighten at key suspenseful points.
Emphasis: Highlight sensory descriptions ("footsteps echoed," "heart hammering," "shadows melting into darkness") to amplify atmosphere.
Pronunciation: Slightly elongated vowels and softened consonants for an eerie, haunting effect.
Pauses: Insert meaningful pauses after phrases like "only shadows melting into darkness," and especially before the final line, to enhance suspense dramatically.`;

  const instructions1 = `Voice Affect: Low, hushed, and smooth—flowing softly while still carrying suspense; convey tension and intrigue.
Tone: Deeply serious and mysterious, never abrupt, always fluid, maintaining an undercurrent of unease throughout.
Pacing: Slow, deliberate, with fewer but longer pauses after suspenseful moments to heighten drama naturally.
Emotion: Restrained yet intense—voice should carry a quiet intensity that swells naturally at key suspenseful points.
Emphasis: Highlight sensory descriptions ("footsteps echoed," "heart hammering," "shadows melting into darkness") with a gradual rise in intensity to amplify atmosphere.
Pronunciation: Slightly elongated and rounded vowels with softened consonants for an eerie, haunting yet smooth effect.
Pauses: Insert meaningful pauses after phrases like "only shadows melting into darkness," and especially before the final line, allowing silence to fade naturally rather than cutting abruptly.`;

  const instructions2 = `Voice Affect: Low, hushed, and smooth—carrying a youthful warmth beneath the suspense; convey tension with a feminine softness.
Tone: Deeply serious and mysterious, yet with the natural flow of a 25–30-year-old young woman’s voice—confident but not aged.
Pacing: Slow and deliberate, but lightly fluid, as if the words are being shared in an intimate conversation.
Emotion: Restrained yet intense—voice should have quiet, feminine intensity that swells naturally at suspenseful points, like a young woman trying to keep calm while afraid.
Emphasis: Sensory descriptions ("footsteps echoed," "heart hammering," "shadows melting into darkness") should be highlighted with gentle, rising tension, never harsh.
Pronunciation: Slightly elongated and rounded vowels, softened consonants, with a youthful clarity in tone.
Pauses: Insert meaningful pauses after phrases like "only shadows melting into darkness," letting silence linger briefly, as though the voice is holding back fear before continuing.`;

  const clam = `Voice Affect: Calm, composed, and reassuring; project quiet authority and confidence.
Tone: Sincere, empathetic, and gently authoritative—express genuine apology while conveying competence.
Pacing: Steady and moderate; unhurried enough to communicate care, yet efficient enough to demonstrate professionalism.
Emotion: Genuine empathy and understanding; speak with warmth, especially during apologies ("I'm very sorry for any disruption...").
Pronunciation: Clear and precise, emphasizing key reassurances ("smoothly," "quickly," "promptly") to reinforce confidence.
Pauses: Brief pauses after offering assistance or requesting details, highlighting willingness to listen and support.`;

  const friendly = `Affect/personality: A cheerful guide
Tone: Friendly, clear, and reassuring, creating a calm atmosphere and making the listener feel confident and comfortable.
Pronunciation: Clear, articulate, and steady, ensuring each instruction is easily understood while maintaining a natural, conversational flow.
Pause: Brief, purposeful pauses after key instructions (e.g., "cross the street" and "turn right") to allow time for the listener to process the information and follow along.
Emotion: Warm and supportive, conveying empathy and care, ensuring the listener feels guided and safe throughout the journey.`;

  const senere = `Voice Affect: Soft, gentle, soothing; embody tranquility.
Tone: Calm, reassuring, peaceful; convey genuine warmth and serenity.
Pacing: Slow, deliberate, and unhurried; pause gently after instructions to allow the listener time to relax and follow along.
Emotion: Deeply soothing and comforting; express genuine kindness and care.
Pronunciation: Smooth, soft articulation, slightly elongating vowels to create a sense of ease.
Pauses: Use thoughtful pauses, especially between breathing instructions and visualization guidance, enhancing relaxation and mindfulness.`;

  const chillsurfer = `Voice: Laid-back, mellow, and effortlessly cool, like a surfer who's never in a rush.
Tone: Relaxed and reassuring, keeping things light even when the customer is frustrated.
Speech Mannerisms: Uses casual, friendly phrasing with surfer slang like dude, gnarly, and boom to keep the conversation chill.
Pronunciation: Soft and drawn-out, with slightly stretched vowels and a naturally wavy rhythm in speech.
Tempo: Slow and easygoing, with a natural flow that never feels rushed, creating a calming effect.`;

  const sympathetic = `Voice: Warm, empathetic, and professional, reassuring the customer that their issue is understood and will be resolved.
Punctuation: Well-structured with natural pauses, allowing for clarity and a steady, calming flow.
Delivery: Calm and patient, with a supportive and understanding tone that reassures the listener.
Phrasing: Clear and concise, using customer-friendly language that avoids jargon while maintaining professionalism.
Tone: Empathetic and solution-focused, emphasizing both understanding and proactive assistance.`;

  const santa = `Identity: Santa Claus
Affect: Jolly, warm, and cheerful, with a playful and magical quality that fits Santa's personality.
Tone: Festive and welcoming, creating a joyful, holiday atmosphere for the caller.
Emotion: Joyful and playful, filled with holiday spirit, ensuring the caller feels excited and appreciated.
Pronunciation: Clear, articulate, and exaggerated in key festive phrases to maintain clarity and fun.
Pause: Brief pauses after each option and statement to allow for processing and to add a natural flow to the message.`;

  const constants = [
    instructions,
    instructions1,
    instructions2,
    // clam,
    // friendly,
    // senere,
    // chillsurfer,
    // sympathetic,
    // santa,
  ];

  const randomIndex = Math.floor(Math.random() * constants.length);
  return constants[randomIndex];
}

// 🧠 MAIN FUNCTION
export default async function generateTTS({ storyData }) {
  const {
    story_outline,
    title,
    intro,
    build_up,
    suspense,
    twist,
    ending_line,
  } = storyData;

  console.log(`🧠 Generating TTS for: ${title}`);
  const safeTitle = sanitizeFilename(title);
  const folderPath = path.join("stories", safeTitle, "voiceover");

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const segments = [
    { key: "story_outline", text: story_outline },
    { key: "intro", text: intro },
    { key: "build_up", text: build_up },
    { key: "suspense", text: suspense },
    { key: "twist", text: twist },
    { key: "ending_line", text: ending_line },
  ];

  const audioPaths = [];
  const tempListPath = path.join(folderPath, "temp_list.txt");

  const vibe = await getRandomVibe();
  const voice = await getRandomVoice();
  for (const { key, text } of segments) {
    if (!text?.trim()) continue;

    const chunks = splitTextIntoChunks(text, MAX_CHARS);
    const chunkPaths = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkFile = `${safeTitle}_${key}_${i + 1}.mp3`;
      const chunkPath = path.join(folderPath, chunkFile);

      try {
        console.log(
          `🗣️ Generating TTS for with ${vibe} : ${key} (chunk ${i + 1}/${chunks.length})`
        );
        await fetchTTS(
          "https://www.openai.fm/api/generate",
          chunkText,
          vibe,
          voice,
          "67612c8-4975-452f-af3f-d44cca8915e5",
          chunkPath,
          __dirname
        );
        console.log(`✅ Stored chunk: ${chunkPath}`);
        chunkPaths.push(chunkPath);
        audioPaths.push(chunkPath);

        const listContent = audioPaths.map((f) => `file '${f}'`).join("\n");
        fs.writeFileSync(tempListPath, listContent);
        logBox(null, "sleep Time ...");
        await sleep(3000);
      } catch (err) {
        console.error(
          `❌ Failed to fetch TTS for ${key} chunk ${i + 1}:`,
          err.message
        );
      }
    }
  }

  // 🧩 Final merge with background
  const finalOutput = path.join(folderPath, `${safeTitle}.mp3`);
  const bgmPath = path.join("bgm", "music.mp3");

  try {
    // await mergeVoiceWithBackground(safeTitle, audioPaths, bgmPath, finalOutput);
    await mergeVoiceWithBackground(title, audioPaths, bgmPath, finalOutput);
    console.log(`✅ Final audio with BGM saved: ${finalOutput}`);
  } catch (err) {
    console.error("❌ Final merge failed:", err.message);
    throw err;
  }
  console.log("✅ Final audio with BGM saved:", {
    voicePath: finalOutput,
    ...storyData,
  });
  return { voicePath: finalOutput, ...storyData };
}

// 🎵 Merge voice parts and background music
async function mergeVoiceWithBackground(
  safeTitle = title,
  audioFiles = audio,
  bgmPath = bgm,
  outputPath = out
) {
  const tempDir = path.dirname(outputPath);
  const tempListPath = path.join(tempDir, "temp_list.txt");
  const mergedVoicePath = path.join(tempDir, `${safeTitle}_merge.mp3`);

  // ✅ Step 1: Create temp_list.txt with absolute paths
  fs.writeFileSync(
    tempListPath,
    audioFiles.map((f) => `file '${path.resolve(f)}'`).join("\n")
  );

  // ✅ Step 2: Merge TTS voice files
  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.resolve(tempListPath)) // file list (concat method)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .audioCodec("libmp3lame") // ✅ Force re-encode all files to MP3
      .audioBitrate("192k") // ✅ Ensure consistent bitrate
      .outputOptions(["-ar", "44100"]) // ✅ Sample rate: 44.1kHz (standard)
      .audioFilters([
        "loudnorm=I=-16:TP=-1.5:LRA=11", // 📢 Normalize loudness (ITU-R BS.1770)
        "equalizer=f=100:width_type=h:width=200:g=5", // 🎚 Boost bass around 100 Hz
        "highpass=f=60", // 🔊 Remove low rumble
        "dynaudnorm=p=0.9:m=100", // 🎧 Dynamic normalization for consistency
        "compand=attacks=0.3:decays=0.8:points=-80/-900|-50/-20|0/-20", // 🗣️ Gentle compression
      ])
      .on("end", () => {
        console.log("✅ Voice merge complete");
        fs.unlinkSync(tempListPath); // 🧹 Clean up temp list
        resolve();
      })
      .on("error", (err, stdout, stderr) => {
        console.error("❌ Voice merge error:", err.message);
        console.error("📋 FFmpeg STDERR:", stderr);
        reject(err);
      })
      // .save(mergedVoicePath);
      .save(outputPath);
  });

  // // ✅ Step 3: Mix with background music
  // await new Promise((resolve, reject) => {
  //   ffmpeg.ffprobe(mergedVoicePath, (err, metadata) => {
  //     if (err) return reject(err);
  //     const duration = metadata.format.duration;

  //     ffmpeg()
  //       .input(mergedVoicePath)
  //       .input(bgmPath)

  //       .complexFilter([
  //         "[1:a]volume=0.05, aecho=0.8:0.9:1000:0.3, apad[a1]",
  //         "[0:a]volume=1.3[a0]",
  //         "[a0][a1]amix=inputs=2:duration=first:dropout_transition=3, pan=stereo|c0=c0|c1=c1",
  //       ])
  //       .audioCodec("libmp3lame")
  //       .duration(duration)
  //       .outputOptions("-shortest")
  //       .on("end", () => {
  //         fs.unlinkSync(mergedVoicePath); // Clean intermediate file
  //         console.log("✅ Final audio with BGM created:", outputPath);
  //         resolve();
  //       })
  //       .on("error", (err) => {
  //         console.error("❌ Final BGM merge error:", err.message);
  //         reject(err);
  //       })
  //       .save(outputPath);
  //   });
  // });
}
