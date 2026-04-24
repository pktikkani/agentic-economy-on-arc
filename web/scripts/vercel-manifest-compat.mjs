import { copyFileSync, cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const nextDir = join(process.cwd(), ".next");
const source = join(nextDir, "routes-manifest.json");
const target = join(nextDir, "routes-manifest-deterministic.json");

if (existsSync(source) && !existsSync(target)) {
  copyFileSync(source, target);
  console.log("Created .next/routes-manifest-deterministic.json for Vercel packaging.");
}

const repoRootNextDir = join(dirname(process.cwd()), ".next");
if (process.cwd().endsWith("/web") && existsSync(nextDir)) {
  rmSync(repoRootNextDir, { recursive: true, force: true });
  cpSync(nextDir, repoRootNextDir, { recursive: true });
  console.log("Mirrored web/.next to repo root .next for Vercel packaging.");
}
