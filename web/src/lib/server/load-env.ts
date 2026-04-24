import path from "node:path";
import { config as loadDotenv } from "dotenv";

let loaded = false;

export function ensureServerEnvLoaded() {
  if (loaded) return;
  loadDotenv({ path: path.resolve(process.cwd(), ".env.local"), override: false, quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../.env"), override: false, quiet: true });
  loaded = true;
}
