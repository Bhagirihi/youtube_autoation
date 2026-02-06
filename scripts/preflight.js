export async function preflight() {
  const tips = [];
  const hasGeminiKey = Object.keys(process.env).some(
    (k) => k.startsWith("GEMINI") && process.env[k]?.trim?.().length > 0
  );
  if (!hasGeminiKey) {
    tips.push({
      what: "AI story",
      why: "No GEMINI_* API key in .env, so a sample story will be used.",
      fix: "Add at least one key to .env: GEMINI_MASTER_API_KEY=your_key (from Google AI Studio).",
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
