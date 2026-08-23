/**
 * Derive missing material/item PNGs from existing Imagine craft mats (#218).
 * ponytail: tint clones until bespoke Imagine art lands per id.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const materialsDir = path.join(root, "public/assets/materials");
const itemsDir = path.join(root, "public/assets/items");

/** @type {Record<string, { from: string; hue?: number; folder?: "materials" | "items" }>} */
const DERIVE = {
  "stone-chip": { from: "stone", hue: 15 },
  "root-bark": { from: "wood", hue: 25 },
  "cinder-scale": { from: "ember-ash", hue: 10 },
  "bog-wick": { from: "lantern-wick", hue: 80 },
  "isle-frond": { from: "wild-fiber", hue: 35 },
  "salt-shard": { from: "pebble", hue: 20 },
  "shoal-mist": { from: "mist-shard", hue: 15 },
  "tide-spine": { from: "brook-pearl", hue: 40 },
  "coral-chip": { from: "pebble", hue: 330 },
  "kelp-strand": { from: "wild-fiber", hue: 90 },
  "dune-shell": { from: "pebble", hue: 35 },
  "brackish-scale": { from: "stone", hue: 100 },
  "pearl-dust": { from: "brook-pearl", hue: 5 },
  "reef-thread": { from: "wild-fiber", hue: 180 },
  "mist-tendril": { from: "mist-shard", hue: 25 },
  "barnacle-plate": { from: "stone", hue: 200 },
  "gulf-wick": { from: "lantern-wick", hue: 160 },
  "spray-feather": { from: "storm-feather", hue: 20 },
  "lagoon-fur": { from: "moss-fiber", hue: 150 },
  "atoll-mist": { from: "mist-shard", hue: 45 },
  "wood-cudgel": { from: "wood", folder: "items" },
  "stone-knife": { from: "stone", folder: "items" },
  "ember-charm": { from: "ember-ash", folder: "items", hue: 5 },
  "moss-salve": { from: "moss-fiber", folder: "items" },
  "storm-charm": { from: "storm-feather", folder: "items" },
  "fox-fire-charm": { from: "lantern-wick", folder: "items", hue: 15 },
  "fen-charm": { from: "peat-tuft", folder: "items" },
  "nymph-charm": { from: "brook-pearl", folder: "items", hue: 30 },
  "hound-collar": { from: "stone", folder: "items", hue: 25 },
  "brook-tonic": { from: "brook-pearl", folder: "items", hue: 20 },
  "brook-crystal": { from: "brook-pearl", folder: "items", hue: 50 },
  "moonwake-draught": { from: "mist-shard", folder: "items", hue: 270 },
  "portable-moonshrine": { from: "stone", folder: "items", hue: 280 },
  boat: { from: "wood", folder: "items", hue: 15 },
  "tide-cleaver": { from: "tide-crown", folder: "items" },
  "cairn-maul": { from: "boulder-crown", folder: "items" },
  "sovereign-seal": { from: "boulder-crown", folder: "items", hue: 30 },
  "sovereign-plate": { from: "boulder-crown", folder: "items", hue: 60 },
  "tide-crown": { from: "tide-crown", folder: "items" },
  "boulder-crown": { from: "boulder-crown", folder: "items" },
};

async function writeDerived(id, spec) {
  const folder = spec.folder ?? "materials";
  const outDir = folder === "items" ? itemsDir : materialsDir;
  const outPath = path.join(outDir, `${id}.png`);
  if (fs.existsSync(outPath)) {
    return;
  }
  const srcPath = path.join(materialsDir, `${spec.from}.png`);
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Missing source icon: ${spec.from} for ${id}`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  let pipeline = sharp(srcPath);
  if (spec.hue) {
    pipeline = pipeline.modulate({ hue: spec.hue });
  }
  await pipeline.png().toFile(outPath);
  console.log(`wrote ${path.relative(root, outPath)}`);
}

for (const [id, spec] of Object.entries(DERIVE)) {
  await writeDerived(id, spec);
}
