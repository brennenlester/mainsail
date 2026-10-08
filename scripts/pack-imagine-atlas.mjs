#!/usr/bin/env node
/**
 * Pack sprite PNGs into a Phaser multi-atlas (#360).
 *
 * Sources (later wins on the same key; none of art/ ships in dist, #361):
 *   public/assets/{creatures,world}/*.png                   still loaded directly too
 *   art/legacy/{player,creatures,world}/*.png               legacy Imagine art (pack input only)
 *   art/rendered/{player,creatures,world,npcs}/*.png        Blender renders
 *
 * Output (public/assets/atlas/):
 *   imagine-0.png, imagine-1.png, ...  power-of-two pages (mipmap friendly)
 *   imagine.json                       TexturePacker multi-atlas (trimmed frames)
 *   imagine-anims.json                 Phaser anim metadata from rendered/anims/*.json
 *
 * Usage: node scripts/pack-imagine-atlas.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "public", "assets");
// Blender source frames live outside public/ so they never ship in dist (#361).
const RENDERED = path.join(ROOT, "art", "rendered");
// Legacy Imagine PNGs that are only atlas inputs (moved out of public/, #361).
const LEGACY = path.join(ROOT, "art", "legacy");
const OUT_DIR = path.join(ASSETS, "atlas");
const PAGE = 2048;
/** Edge pixels repeated around each frame so bilinear/mip sampling never pulls neighbors. */
const EXTRUDE = 2;
/**
 * Ground tiles and shore pieces sit edge to edge and are drawn far below 1:1
 * (an Archipelago tile is ~24 px from 192 px, mip level 3), where a 2 px
 * extrusion lets mip texels mix in the transparent gutter and every tile
 * seam shows as a hairline grid (#412). They get a wider extrusion.
 */
const TILE_EXTRUDE = 12;
const TILE_KEY = /^(floor-|tile-|shore-|wall-cottage-top)/;

function extrudeFor(key) {
  return TILE_KEY.test(key) ? TILE_EXTRUDE : EXTRUDE;
}
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
  // Boss-only arena: storyBattleUi.preloadStoryArena loads these standalone
  // when the Matriarch fight starts, so they never cost atlas pages (#399).
  "arena-ember-sky",
  "arena-ember-hills",
  "arena-ember-platform",
  // Cottage zones load this standalone under per-cottage keys (PreloadScene).
  "boundary-cottage",
]);

function collectPngs() {
  const byKey = new Map();
  for (const base of [ASSETS, LEGACY, RENDERED]) {
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
  const extrude = extrudeFor(file.key);
  const trimmed = await sharp(data, { raw: info })
    .extract({ left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h })
    .extend({
      top: extrude,
      bottom: extrude,
      left: extrude,
      right: extrude,
      extendWith: "copy",
    })
    .png()
    .toBuffer();
  return {
    ...file,
    // Identical source pixels share one slot (#399: idle_00 == base pose).
    hash: crypto.createHash("sha1").update(`${info.width}x${info.height}`).update(data).digest("hex"),
    sourceW: info.width,
    sourceH: info.height,
    trim: bounds,
    buffer: trimmed,
    // Slot size on the page including extrusion + padding.
    extrude,
    slotW: bounds.w + extrude * 2 + PADDING,
    slotH: bounds.h + extrude * 2 + PADDING,
  };
}

/** Lowest skyline spot for a w x h slot (bottom-left rule), or null. */
function skylineFit(skyline, w, h, pageSize) {
  let best = null;
  for (let i = 0; i < skyline.length; i += 1) {
    const x = skyline[i].x;
    if (x + w > pageSize) break;
    let y = 0;
    let span = 0;
    for (let j = i; j < skyline.length && span < w; j += 1) {
      y = Math.max(y, skyline[j].y);
      span = skyline[j].x + skyline[j].w - x;
    }
    if (span < w || y + h > pageSize) continue;
    if (!best || y + h < best.y + best.h || (y + h === best.y + best.h && x < best.x)) {
      best = { x, y, h };
    }
  }
  return best;
}

function skylinePlace(skyline, x, y, w, h) {
  const next = [];
  for (const seg of skyline) {
    const end = seg.x + seg.w;
    if (end <= x || seg.x >= x + w) {
      next.push(seg);
      continue;
    }
    if (seg.x < x) next.push({ x: seg.x, y: seg.y, w: x - seg.x });
    if (end > x + w) next.push({ x: x + w, y: seg.y, w: end - (x + w) });
  }
  next.push({ x, y: y + h, w });
  next.sort((a, b) => a.x - b.x);
  // Merge neighbours at the same height.
  const merged = [];
  for (const seg of next) {
    const last = merged[merged.length - 1];
    if (last && last.y === seg.y && last.x + last.w === seg.x) last.w += seg.w;
    else merged.push({ ...seg });
  }
  return merged;
}

/**
 * Skyline-pack into fixed-size pages (#392; the #360 shelf packer left
 * ~30% of each page empty). Items go tallest first into the first page with
 * room, so pages stay full and the result is deterministic for a given
 * input set. Returns [{items, usedW, usedH}].
 */
export function packPages(items, pageSize = PAGE) {
  const sorted = [...items].sort(
    (a, b) => b.slotH - a.slotH || b.slotW - a.slotW || a.key.localeCompare(b.key),
  );
  const pages = [];
  for (const item of sorted) {
    if (item.slotW > pageSize || item.slotH > pageSize) {
      throw new Error(`${item.key} (${item.slotW}x${item.slotH}) exceeds ${pageSize}px page`);
    }
    let placed = false;
    for (let p = 0; p < pages.length && !placed; p += 1) {
      const page = pages[p];
      const spot = skylineFit(page.skyline, item.slotW, item.slotH, pageSize);
      if (!spot) continue;
      page.skyline = skylinePlace(page.skyline, spot.x, spot.y, item.slotW, item.slotH);
      Object.assign(item, { page: p, x: spot.x, y: spot.y });
      page.items.push(item);
      page.usedW = Math.max(page.usedW, item.x + item.slotW);
      page.usedH = Math.max(page.usedH, item.y + item.slotH);
      placed = true;
    }
    if (!placed) {
      const page = { items: [item], usedW: item.slotW, usedH: item.slotH, skyline: [] };
      page.skyline = skylinePlace([{ x: 0, y: 0, w: pageSize }], 0, 0, item.slotW, item.slotH);
      Object.assign(item, { page: pages.length, x: 0, y: 0 });
      pages.push(page);
    }
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
  // Pack each distinct image once; duplicate keys alias the same rect.
  const byHash = new Map();
  for (const it of items) {
    const prev = byHash.get(it.hash);
    if (!prev || it.key.localeCompare(prev.key) < 0) byHash.set(it.hash, it);
  }
  const unique = [...byHash.values()];
  const pages = packPages(unique);
  for (const it of items) {
    const owner = byHash.get(it.hash);
    if (owner !== it) {
      Object.assign(it, { page: owner.page, x: owner.x, y: owner.y, extrude: owner.extrude });
      pages[owner.page].items.push(it);
      it.alias = true;
    }
  }

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
      .composite(
        page.items.filter((it) => !it.alias).map((it) => ({ input: it.buffer, left: it.x, top: it.y })),
      )
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
          frame: { x: it.x + it.extrude, y: it.y + it.extrude, w: it.trim.w, h: it.trim.h },
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
    `Packed ${items.length} frames (${rendered} rendered, ${items.length - unique.length} aliased) into ${pages.length} page(s): ${textures
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
