import { logBox, splitTextIntoChunks } from "../index.js";

const SUPADATA_BASE = "https://api.supadata.ai/v1";

function getSupadataKey() {
  const key = process.env.SUPADATA_API_KEY;
  return key && typeof key === "string" ? key.trim() : "";
}

/** GET /transcript – returns { text, lang, availableLangs, content } or null */
async function fetchSupadataTranscriptRaw(videoUrl) {
  const apiKey = getSupadataKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${SUPADATA_BASE}/transcript?url=${encodeURIComponent(videoUrl)}`,
      { headers: { "x-api-key": apiKey } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Returns transcript text only (for fetchTranscript). */
async function fetchViaSupadata(videoUrl) {
  const data = await fetchSupadataTranscriptRaw(videoUrl);
  const content = data?.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const text = content.map((c) => c?.text ?? "").join(" ").trim();
  return text || null;
}

/** GET /metadata – returns video metadata. Set SUPADATA_API_KEY in .env */
export async function fetchSupadataMetadata(videoUrl) {
  const apiKey = getSupadataKey();
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `${SUPADATA_BASE}/metadata?url=${encodeURIComponent(videoUrl)}`,
      { headers: { "x-api-key": apiKey } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetches transcript + metadata in parallel and returns title, description, and transcript as a single text string.
 * Set SUPADATA_API_KEY in .env.
 * @returns {Promise<{ title: string, description: string, text: string } | null>}
 */
export async function fetchSupadataMerged(videoUrl) {
  const apiKey = getSupadataKey();
  if (!apiKey) return null;
  const [transcriptRes, metadataRes] = await Promise.all([
    fetch(`${SUPADATA_BASE}/transcript?url=${encodeURIComponent(videoUrl)}`, {
      headers: { "x-api-key": apiKey },
    }),
    fetch(`${SUPADATA_BASE}/metadata?url=${encodeURIComponent(videoUrl)}`, {
      headers: { "x-api-key": apiKey },
    }),
  ]);
  if (!transcriptRes.ok || !metadataRes.ok) return null;
  try {
    const [transcript, metadata] = await Promise.all([
      transcriptRes.json(),
      metadataRes.json(),
    ]);
    const content = transcript?.content;
    const text = Array.isArray(content)
      ? content.map((c) => c?.text ?? "").join(" ").trim()
      : "";
    return {
      title: metadata?.title ?? "",
      description: metadata?.description ?? "",
      text: text || "",
    };
  } catch {
    return null;
  }
}

async function fetchTranscript(videoUrl) {
  try {
    logBox("📜 Fetching transcript");

    const supadataText = await fetchViaSupadata(videoUrl);
    if (supadataText) {
      console.log(`✅ Transcript (${supadataText.length} chars).`);
      return await splitTextIntoChunks(supadataText);
    }

    console.log("⚠️ No transcript found. Set SUPADATA_API_KEY in .env.");
    return null;
  } catch (error) {
    console.error("❌ Error fetching transcript:", error.message);
    return null;
  }
}

export default fetchTranscript;
