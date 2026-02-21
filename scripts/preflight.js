export async function preflight() {
  const tips = [];
  const isCI = process.env.GITHUB_ACTIONS === "true";
  const hasGeminiKey = Object.keys(process.env).some(
    (k) => k.startsWith("GEMINI") && process.env[k]?.trim?.().length > 0
  );
  if (!hasGeminiKey) {
    tips.push({
      what: "AI story",
      why: "No GEMINI_* API key in .env — story generation will fail.",
      fix: isCI
        ? "Add GEMINI_MASTER_API_KEY (or GEMINI_STORY_API_KEY) to your ENV_FILE secret (Settings → Secrets → Actions). Get a key from Google AI Studio."
        : "Add at least one key to .env: GEMINI_MASTER_API_KEY=your_key (from Google AI Studio).",
    });
  }

  if (tips.length) {
    console.log("\n⚠️  Setup tips (optional):\n");
    tips.forEach(({ what, why, fix }) => {
      console.log(`  • ${what}: ${why}`);
      console.log(`    → ${fix}\n`);
    });
  }
}
