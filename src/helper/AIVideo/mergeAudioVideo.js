import path from "path";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { getDuration } from "../index.js";

// Helper function to simulate __dirname in ES Modules environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Merges a video stream from one file and an audio stream from another using FFmpeg.
 *
 * NOTE: This function requires FFmpeg to be installed and accessible via the system's PATH.
 *
 * @param {string} baseFolder - The directory where the input files are located and the output should be saved.
 * @param {string} audioFileName - The name of the input audio file (e.g., 'background_music.mp3').
 * @param {string} videoFileName - The name of the input video file (e.g., 'raw_footage.mp4').
 * @returns {Promise<string>} A promise that resolves with the path to the final merged video file.
 */
export const mergeVideoAndAudio = async (
  baseFolder,
  audioFileName,
  videoFileName
) => {
  const inputVideoPath = path.join(baseFolder, videoFileName);
  const inputAudioPath = path.join(baseFolder, audioFileName);
  const outputVideoPath = path.join(baseFolder, "final_output.mp4");

  let af = "";
  const videoDuration = await getDuration(inputVideoPath);
  const audioDuration = await getDuration(inputAudioPath);
  if (videoDuration > 0 && audioDuration > 0 && Math.abs(audioDuration - videoDuration) > 0.5) {
    let ratio = audioDuration / videoDuration;
    if (ratio < 0.5) ratio = 0.5;
    else if (ratio > 2) ratio = 2;
    if (Math.abs(ratio - 1) > 0.01) {
      af = `-filter:a "atempo=${ratio.toFixed(3)}" `;
      console.log(`\n⚡ Audio speed adjusted to match video (atempo=${ratio.toFixed(3)})`);
    }
  }

  const ffmpegCommand =
    `ffmpeg -i "${inputVideoPath}" -i "${inputAudioPath}" ` +
    `-map 0:v -map 1:a -c:v copy ${af}-c:a aac -b:a 192k -pix_fmt yuv420p -movflags faststart -y "${outputVideoPath}"`;

  console.log(`\n🎬 Merging video and audio using FFmpeg...`);

  return new Promise((resolve, reject) => {
    exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ FFmpeg execution error: ${error.message}`);
        console.error(`FFmpeg Stderr:\n${stderr}`);
        return reject(new Error(`FFmpeg failed to merge files. See console for details.`));
      }
      console.log(`\n✅ Successfully merged video and audio to: ${outputVideoPath}`);
      resolve(outputVideoPath);
    });
  });
};

// --- Example Usage Block (for demonstration) ---
// NOTE: For this example to run, you must have actual files named 'video.mp4' and 'audio.mp3'
// in the same directory as this script, AND FFmpeg must be installed globally.

async function runExample() {
  console.log("--- Starting Video Merger Demo ---");
  // In a real scenario, baseFolder would point to where your files are.
  const baseFolder =
    "/Users/dhruvdave/Documents/Dhruv/AI_CODE/NEW_YT/YTAutomation/src/output/cinePlotDecode";
  const videoFile = "video.mp4"; // Replace with a real video file you have
  const audioFile = "merger.mp3"; // Replace with a real audio file you have

  try {
    const finalPath = await mergeVideoAndAudio(
      baseFolder,
      audioFile,
      videoFile
    );
    console.log(
      `\nOperation finished successfully. Final file is at: ${finalPath}`
    );
  } catch (e) {
    console.error(`\nOperation failed. Reason: ${e.message}`);
  }
  console.log("--- Demo End ---");
}

// You can uncomment the line below to run the example with your hardcoded paths,
// but remember this will only work if you have the files locally.
// runExample();

// The original call the user used:
// mergeVideoAndAudio();
