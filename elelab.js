/**
 * ElevenLabs API key check. If valid and has remaining credit, TTS uses ElevenLabs; else falls back to Gemini TTS.
 * Uses env keys (ELEVENLABS_API_KEY / ELEVEN_API_KEY) and optional fallback from unsecuredapikeys (type=199).
 */

const FALLBACK_ELEVENLABS_API =
  "https://api.unsecuredapikeys.com/API/GetRandomKey?type=199";

async function fetchFallbackElevenLabsKey() {
  try {
    const res = await fetch(FALLBACK_ELEVENLABS_API, {
      signal: AbortSignal.timeout(10000),
      headers: {
        accept: "*/*",
        "accept-language": "en-IN,en;q=0.9,en-GB;q=0.8,en-US;q=0.7",
        origin: "https://unsecuredapikeys.com",
        referer: "https://unsecuredapikeys.com/",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      },
    });
    const data = await res.json();
    if (
      data?.apiKey &&
      typeof data.apiKey === "string" &&
      data.apiKey.trim().length > 0
    ) {
      return data.apiKey.trim();
    }
    if (res.status === 429 && data?.fallbackApiKey?.apiKey) {
      const key = data.fallbackApiKey.apiKey;
      if (typeof key === "string" && key.trim().length > 0) return key.trim();
    }
    return null;
  } catch (err) {
    console.warn("⚠️ Failed to fetch fallback ElevenLabs key:", err?.message);
    return null;
  }
}

/**
 * Returns candidate API keys to try: env first, then fallback from API.
 */
async function getElevenLabsKeyCandidates() {
  const envKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.ELEVEN_API_KEY?.trim() ||
    "";
  const candidates = [];
  if (envKey) candidates.push(envKey);
  const fallbackKey = await fetchFallbackElevenLabsKey();
  if (fallbackKey && !candidates.includes(fallbackKey)) {
    candidates.push(fallbackKey);
  }
  return candidates;
}

/**
 * Check ElevenLabs API key and subscription.
 * @returns {{ valid: boolean, remaining?: number | null, isPaid?: boolean, reason?: string, limited?: boolean, ... }}
 */
export async function checkElevenLabsKey(apiKey) {
  if (!apiKey) {
    return { valid: false, reason: "No API key" };
  }

  const res = await fetch("https://api.elevenlabs.io/v1/user", {
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    return { valid: false, reason: "Invalid API key" };
  }

  if (res.status === 429) {
    return { valid: true, limited: true, reason: "Rate limit hit", remaining: 0 };
  }

  if (!res.ok) {
    return { valid: false, reason: `Unexpected error: ${res.status}` };
  }

  const data = await res.json();
  const limit = data.subscription?.character_limit;
  const used = data.subscription?.character_count ?? 0;
  const remaining =
    limit != null ? Math.max(0, limit - used) : null;
  const isPaid =
    data.subscription?.tier &&
    !["free", "trial"].includes(String(data.subscription.tier).toLowerCase());

  return {
    valid: true,
    subscription: data.subscription?.tier || "unknown",
    characterLimit: limit ?? null,
    characterUsed: used,
    remaining,
    isPaid: !!isPaid,
  };
}

/**
 * Decide whether to use ElevenLabs for TTS: use if valid and has remaining credit (or paid/unlimited).
 * Tries env key(s) first, then fallback API key (type=199).
 * @returns {{ use: boolean, apiKey?: string, reason?: string }}
 */
export async function shouldUseElevenLabs() {
  const candidates = await getElevenLabsKeyCandidates();
  if (candidates.length === 0) {
    return { use: false, reason: "No ELEVENLABS_API_KEY / ELEVEN_API_KEY and no fallback key" };
  }

  let lastReason;
  for (const apiKey of candidates) {
    const result = await checkElevenLabsKey(apiKey);
    if (!result.valid) {
      lastReason = result.reason || "Invalid key";
      continue;
    }
    if (result.limited && result.remaining === 0) {
      lastReason = "Rate limit hit, no credit";
      continue;
    }
    if (result.remaining !== null && result.remaining <= 0 && !result.isPaid) {
      lastReason = "No remaining character credit";
      continue;
    }
    return { use: true, apiKey };
  }

  return {
    use: false,
    apiKey: candidates[0],
    reason: lastReason || "No valid key with credit",
  };
}
