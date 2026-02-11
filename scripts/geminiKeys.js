const MODELS = ["gemini-2.5-flash"];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callGemini(model, apiKey) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      apiKey
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    }
  );
}

async function testKey(
  name,
  apiKey,
  { maxRetries = 4, baseDelayMs = 800 } = {}
) {
  for (const model of MODELS) {
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const res = await callGemini(model, apiKey);
        const data = await res.json();

        if (res.ok) {
          return { name, ok: true, model };
        }

        if (
          /not found/i.test(data?.error?.message || "") ||
          res.status !== 200
        ) {
          break;
        }

        return {
          name,
          ok: false,
          error: data?.error?.message || "Unknown error",
        };
      } catch (err) {
        if (attempt === maxRetries) {
          return { name, ok: false, error: err.message };
        }
        await sleep(baseDelayMs * 2 ** attempt);
        attempt++;
      }
    }
  }

  return {
    name,
    ok: false,
    error: "No supported models available for this key",
  };
}

const FALLBACK_KEY_API =
  "https://api.unsecuredapikeys.com/API/GetRandomKey?type=130";

async function fetchFallbackGeminiKey() {
  try {
    const res = await fetch(FALLBACK_KEY_API, {
      signal: AbortSignal.timeout(10000),
      headers: {
        accept: "*/*",
        "accept-language": "en-IN,en;q=0.9,en-GB;q=0.8,en-US;q=0.7,gu;q=0.6",
        origin: "https://unsecuredapikeys.com",
        referer: "https://unsecuredapikeys.com/",
        "sec-ch-ua":
          '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      },
    });
    const data = await res.json();

    if (
      data?.apiType === "GoogleAI" &&
      data?.status === "Valid" &&
      data?.apiKey &&
      typeof data.apiKey === "string" &&
      data.apiKey.length > 0
    ) {
      return data.apiKey;
    }
    if (res.status === 429 && data?.fallbackApiKey) {
      const fallback = data.fallbackApiKey;
      if (
        fallback?.apiType === "GoogleAI" &&
        fallback?.status === "Valid" &&
        fallback?.apiKey &&
        typeof fallback.apiKey === "string" &&
        fallback.apiKey.length > 0
      ) {
        return fallback.apiKey;
      }
    }
    if (res.status === 429) {
      console.warn("⚠️ Fallback API rate-limited; using env keys only.");
    }
    return null;
  } catch (err) {
    console.warn("⚠️ Failed to fetch fallback Gemini key:", err.message);
    return null;
  }
}

export async function checkGeminiKeys() {
  const fallbackKey = await fetchFallbackGeminiKey();
  const candidates = [];

  if (
    fallbackKey &&
    typeof fallbackKey === "string" &&
    fallbackKey.length > 0
  ) {
    candidates.push({ name: "fallback", key: fallbackKey });
  }

  const envKeys = Object.entries(process.env)
    .filter(
      ([k, v]) =>
        k.startsWith("GEMINI") && typeof v === "string" && v.trim().length > 0
    )
    .map(([k, v]) => ({ name: k, key: v.trim() }));
  candidates.push(...envKeys);

  if (candidates.length === 0) {
    console.warn(
      "⚠️ No Gemini keys found (no fallback and no GEMINI_* in .env)"
    );
    return null;
  }

  for (const { name, key } of candidates) {
    const result = await testKey(name, key);
    if (result.ok) return key;
    console.warn(`${name}: ${result.error || "failed"} (expired or quota?)`);
  }

  console.warn("⚠️ All Gemini keys failed (expired or out of quota). Add or rotate keys in .env.");
  return null;
}

/**
 * Key for story generation. Use GEMINI_STORY_API_KEY if set, else first working key.
 */
export async function getStoryKey() {
  const storyKey = process.env.GEMINI_STORY_API_KEY?.trim();
  if (storyKey) {
    const result = await testKey("GEMINI_STORY_API_KEY", storyKey);
    if (result.ok) return storyKey;
    console.warn(`GEMINI_STORY_API_KEY: ${result.error || "failed"}`);
  }
  return checkGeminiKeys();
}

/**
 * List of keys for TTS. Use GEMINI_TTS_API_KEY only if set; else all GEMINI_* keys (for rotation per paragraph).
 */
export async function getTTSKeyList() {
  const single = process.env.GEMINI_TTS_API_KEY?.trim();
  if (single) return [single];

  const fallbackKey = await fetchFallbackGeminiKey();
  const list = [];
  if (fallbackKey && typeof fallbackKey === "string" && fallbackKey.length > 0) {
    list.push(fallbackKey);
  }
  const envKeys = Object.entries(process.env)
    .filter(
      ([k, v]) =>
        k.startsWith("GEMINI") && typeof v === "string" && v.trim().length > 0
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v.trim());
  for (const k of envKeys) {
    if (!list.includes(k)) list.push(k);
  }
  return list.length ? list : null;
}

export { MODELS };
