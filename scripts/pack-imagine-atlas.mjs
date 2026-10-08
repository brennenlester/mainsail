#!/usr/bin/env node
/**
 * Pack sprite PNGs into a Phaser multi-atlas (#360).
 *
 * Sources (later wins on the same key):
 *   public/assets/{player,creatures,world}/*.png            legacy Imagine art
 *   art/rendered/{player,creatures,world}/*.png             Blender renders (not shipped)
 *
 * Output (public/assets/atlas/):
 *   imagine-0.png, imagine-1.png, ...  power-of-two pages (mipmap friendly)
 *   imagine.json                       TexturePacker multi-atlas (trimmed frames)
 *   imagine-anims.json                 Phaser anim metadata from rendered/anims/*.json
 *
 * Usage: node scripts/pack-imagine-atlas.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "public", "assets");
// Blender source frames live outside public/ so they never ship in dist (#361).
const RENDERED = path.join(ROOT, "art", "rendered");
const OUT_DIR = path.join(ASSETS, "atlas");
const PAGE = 2048;
/** Edge pixels repeated around each frame so bilinear/mip sampling never pulls neighbors. */
const EXTRUDE = 2;
const PADDING = 2;
const CLASS_DIRS = ["player", "creatures", "world"];
// Villagers are only packed from Blender renders (legacy NPC PNGs stay standalone).
const RENDERED_ONLY_DIRS = ["npcs"];

const SKIP_ATLAS_KEYS = new Set([
  // Loaded separately in PreloadScene; packing the 1024² sheet bloats the atlas.
  "creature-tide-sovereign",
  "creature-cairn-sovereign",
  "creature-horizon-sovereign",
  "creature-eclipse-sovereign",
]);

function collectPngs() {
  const byKey = new Map();
  for (const base of [ASSETS, RENDERED]) {
    for (const dir of base === RENDERED ? [...CLASS_DIRS, ...RENDERED_ONLY_DIRS] : CLASS_DIRS) {
      const abs = path.join(base, dir);
      if (!fs.existsSync(abs)) continue;
      for (const name of fs.readdirSync(abs).sort()) {
        if (!name.endsWith(".png")) continue;
        const key = name.replace(/\.png$/, "");
        if (SKIP_ATLAS_KEYS.has(key)) continue;
        byKey.set(key, { key, path: path.join(abs, name), rendered: base === RENDERED });
      }
    }
  }
  return [...byKey.values()];
}

/** Alpha bounding box; null when fully transparent. */
export function alphaBounds(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function loadFrame(file) {
  const { data, info } = await sharp(file.path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bounds = alphaBounds(data, info.width, info.height) ?? {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  };
  const trimmed = await sharp(data, { raw: info })
    .extract({ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h })
    .extend({
      top: EXTRUDE,
      bottom: EXTRUDE,
      left: EXTRUDE,
      right: EXTRUDE,
      extendWith: "copy",
    })
    .png()
    .toBuffer();
  return {
    ...file,
    sourceW: info.width,
    sourceH: info.height,
    trim: bounds,
    buffer: trimmed,
    // Slot size on the page including extrusion + padding.
    slotW: bounds.w + EXTRUDE * 2 + PADDING,
    slotH: bounds.h + EXTRUDE * 2 + PADDING,
  };
}

/** Shelf-pack into fixed-size pages. Returns [{items, usedW, usedH}]. */
export function packPages(items, pageSize = PAGE) {
  const sorted = [...items].sort(
    (a, b) => b.slotH - a.slotH || b.slotW - a.slotW || a.key.localeCompare(b.key),
  );
  const pages = [];
  let page = null;
  let x = 0;
  let shelfY = 0;
  let shelfH = 0;
  const newPage = () => {
    page = { items: [], usedW: 0, usedH: 0 };
    pages.push(page);
    x = 0;
    shelfY = 0;
    shelfH = 0;
  };
  newPage();
  for (const item of sorted) {
    if (item.slotW > pageSize || item.slotH > pageSize) {
      throw new Error(`${item.key} (${item.slotW}x${item.slotH}) exceeds ${pageSize}px page`);
    }
    if (x + item.slotW > pageSize) {
      shelfY += shelfH;
      x = 0;
      shelfH = 0;
    }
    if (shelfY + item.slotH > pageSize) {
      newPage();
    }
    item.page = pages.length - 1;
    item.x = x;
    item.y = shelfY;
    x += item.slotW;
    shelfH = Math.max(shelfH, item.slotH);
    page.items.push(item);
    page.usedW = Math.max(page.usedW, item.x + item.slotW);
    page.usedH = Math.max(page.usedH, item.y + item.slotH);
  }
  return pages;
}

function nextPow2(n) {
  return 2 ** Math.ceil(Math.log2(Math.max(1, n)));
}

function collectAnims(packedKeys) {
  const dir = path.join(RENDERED, "anims");
  if (!fs.existsSync(dir)) return [];
  const anims = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const anim of doc.anims ?? []) {
      const missing = anim.frames.filter((f) => !packedKeys.has(f));
      if (missing.length > 0) {
        console.warn(`skip anim ${anim.key}: missing ${missing.join(", ")}`);
        continue;
      }
      anims.push(anim);
    }
  }
  return anims;
}

async function main() {
  const files = collectPngs();
  if (files.length === 0) {
    throw new Error("No PNGs found under public/assets/{player,creatures,world}");
  }
  const items = [];
  for (const file of files) {
    items.push(await loadFrame(file));
  }
  const pages = packPages(items);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const stale of fs.readdirSync(OUT_DIR)) {
    if (/^imagine(-\d+)?\.png$/.test(stale)) fs.rmSync(path.join(OUT_DIR, stale));
  }

  const textures = [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const last = i === pages.length - 1;
    const w = last ? nextPow2(page.usedW) : PAGE;
    const h = last ? nextPow2(page.usedH) : PAGE;
    const image = `imagine-${i}.png`;
    await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(page.items.map((it) => ({ input: it.buffer, left: it.x, top: it.y })))
      // 256-color quantized pages (libimagequant, deterministic): ~70% smaller
      // with no visible change on toon renders; keeps the atlas budget (#361).
      .png({ palette: true, quality: 95, effort: 10, dither: 0.6, compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, image));
    textures.push({
      image,
      format: "RGBA8888",
      size: { w, h },
      scale: 1,
      frames: page.items
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((it) => ({
          filename: it.key,
          rotated: false,
          trimmed:
            it.trim.w !== it.sourceW || it.trim.h !== it.sourceH,
          frame: { x: it.x + EXTRUDE, y: it.y + EXTRUDE, w: it.trim.w, h: it.trim.h },
          spriteSourceSize: { x: it.trim.x, y: it.trim.y, w: it.trim.w, h: it.trim.h },
          sourceSize: { w: it.sourceW, h: it.sourceH },
        })),
    });
  }

  const atlas = {
    textures,
    meta: {
      app: "ivyward/scripts/pack-imagine-atlas.mjs",
      version: "2.0",
    },
  };
  fs.writeFileSync(path.join(OUT_DIR, "imagine.json"), `${JSON.stringify(atlas)}\n`);

  const packedKeys = new Set(items.map((it) => it.key));
  const anims = collectAnims(packedKeys);
  fs.writeFileSync(
    path.join(OUT_DIR, "imagine-anims.json"),
    `${JSON.stringify({ anims }, null, 2)}\n`,
  );

  const rendered = items.filter((it) => it.rendered).length;
  console.log(
    `Packed ${items.length} frames (${rendered} rendered) into ${pages.length} page(s): ${textures
      .map((t) => `${t.image} ${t.size.w}x${t.size.h}`)
      .join(", ")}; ${anims.length} anim(s)`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
