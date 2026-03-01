/**
 * CI-only: validate YouTube/Drive auth from .env (from ENV_FILE secret).
 * Exits 0 if OK, 1 with clear message if anything missing. Use in workflow before upload step.
 */
import "dotenv/config";
import { getYouTubeAuthMissing } from "./uploadYoutube.js";

const missing = getYouTubeAuthMissing();
if (missing) {
  const msg = "Add to repository secret ENV_FILE: " + missing.join("; ");
  console.error(msg);
  if (process.env.GITHUB_ACTIONS === "true") {
    console.error("::error::" + msg);
  }
  process.exit(1);
}
console.log("YouTube/Drive auth OK (client credentials + refresh token present).");
