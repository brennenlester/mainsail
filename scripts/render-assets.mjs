#!/usr/bin/env node
/**
 * `npm run render:assets [-- --only key1,key2]` — headless Blender renders (#360).
 * Finds Blender via $BLENDER, the macOS app bundle, or PATH, then runs
 * scripts/blender/render_assets.py. Follow with `npm run pack:atlas`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CANDIDATES = [
  process.env.BLENDER,
  "/Applications/Blender.app/Contents/MacOS/Blender",
  `${process.env.HOME}/Applications/Blender.app/Contents/MacOS/Blender`,
].filter(Boolean);

function findBlender() {
  for (const candidate of CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["blender"], {
    encoding: "utf8",
  });
  return which.status === 0 ? which.stdout.trim().split("\n")[0] : null;
}

const blender = findBlender();
if (!blender) {
  console.error("Blender not found. Install Blender 4.2+ or set BLENDER=/path/to/blender.");
  process.exit(1);
}

const result = spawnSync(
  blender,
  [
    "--background",
    "--factory-startup",
    "--python",
    path.join(ROOT, "scripts", "blender", "render_assets.py"),
    "--",
    ...process.argv.slice(2),
  ],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
// Blender is chatty; surface our own lines and anything that looks like a failure.
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
for (const line of output.split("\n")) {
  if (/^\[render\]|Error|Traceback|^\s+File "/.test(line)) console.log(line);
}
if (result.status !== 0 || /Traceback/.test(output)) {
  console.error(`Blender render failed (exit ${result.status}).`);
  process.exit(1);
}
