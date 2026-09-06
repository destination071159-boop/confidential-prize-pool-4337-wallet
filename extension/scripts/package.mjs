/**
 * Package the built extension for distribution.
 *
 *   node scripts/package.mjs            → build/ must exist; produces dist/zhieldwrap-<version>.zip
 *   node scripts/package.mjs --cws      → also strips `key`/`update_url` from the zipped manifest
 *                                         (Chrome Web Store rejects them; harmless if absent)
 *
 * Zero dependencies — shells out to the system `zip`. Run `pnpm build` first.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, cpSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const BUILD = join(ROOT, "build");
const DIST = join(ROOT, "dist");
const cws = process.argv.includes("--cws");

if (!existsSync(join(BUILD, "manifest.json"))) {
  console.error("build/manifest.json not found — run `pnpm build` first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(BUILD, "manifest.json"), "utf8"));
const version = manifest.version ?? "0.0.0";

// Stage a copy so we can safely strip fields for CWS without touching build/.
const STAGE = join(DIST, `zhieldwrap-${version}${cws ? "-cws" : ""}`);
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
cpSync(BUILD, STAGE, { recursive: true });

if (cws) {
  const m = JSON.parse(readFileSync(join(STAGE, "manifest.json"), "utf8"));
  delete m.key;
  delete m.update_url;
  writeFileSync(join(STAGE, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  console.log("Stripped `key`/`update_url` for Chrome Web Store.");
}

const zipPath = join(DIST, `zhieldwrap-${version}${cws ? "-cws" : ""}.zip`);
rmSync(zipPath, { force: true });
execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: STAGE });
console.log(`Packaged → ${zipPath}`);
