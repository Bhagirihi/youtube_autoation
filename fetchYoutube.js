import yts from "yt-search";
import { readExcel, saveExcel, updateExcel } from "./helper/excelHelpers.js";
import { createSlug } from "./helper/globalHelpers.js";

/**
 * Search YouTube and return N videos (defaults to 3).
 *
 * @param {string}  query - Search phrase.
 * @param {number=} limit - Max number of videos to keep.
 * @returns {Promise<Array<{title:string,url:string,views:number,duration:string}>>}
 */

export async function searchVideos(query = "Horror Story in Hindi", limit = 3) {
  if (!query?.trim()) throw new Error("Query string is required");

  const { videos } = await yts(query);
  const now = new Date();
  const days = 7;
  const daysAgo = new Date(now - days * 24 * 60 * 60 * 1000);
  const filtered = videos.filter((video) => {
    if (!video.ago) return false;

    const [numStr, unit] = video.ago.split(" ");
    const num = parseInt(numStr);
    const unitMap = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    };

    const millis = unitMap[unit.replace(/s$/, "")] || 0;
    const estimatedUploadTime = new Date(now - num * millis);
    return estimatedUploadTime >= daysAgo;
  });

  return filtered.map(
    ({ title, author, url, views, timestamp: duration, ago }) => ({
      title,
      author,
      url,
      views,
      ago,
      duration,
      slug: `${createSlug(title)}-by-${createSlug(author?.name)}`,
      status: "fetched",
    })
  );
}

searchVideos()
  .then((results) => {
    saveExcel(results);
    const allRows = readExcel();
    console.table(allRows);
  })
  .catch(console.error);
