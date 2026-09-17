#!/usr/bin/env node
/**
 * MOBI-10 spike: draws a rendered page with rectangles for ground truth and
 * one or more candidate files, so a coordinate mapping or a detector's output
 * can be checked visually rather than trusted from numbers alone.
 *
 * Truth is always green. Each --candidates file gets its own colour, in
 * order: red, blue, orange, purple (a fifth file wraps back to red).
 *
 * Run from the repo root:
 *   node scripts/spike/mobi-10/overlay.mjs --render <png> [--truth <gt.json>|none] \
 *     --candidates <a.json> [--candidates <b.json> ...] --out <png>
 *
 * If @napi-rs/canvas cannot be loaded (e.g. it fails to build on this
 * machine), this falls back to an SVG file with the PNG embedded as a
 * data URI, written to the same --out path with its extension swapped to
 * .svg, and says so on stdout.
 */

import fs from 'node:fs';
import path from 'node:path';

const CANDIDATE_COLORS = ['#ff2d2d', '#1a6dff', '#ff8c00', '#9b30ff'];
const TRUTH_COLOR = '#00b140';

function parseArgs(argv) {
  const args = { candidates: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--render') args.render = argv[(i += 1)];
    else if (flag === '--truth') args.truth = argv[(i += 1)];
    else if (flag === '--candidates') args.candidates.push(argv[(i += 1)]);
    else if (flag === '--out') args.out = argv[(i += 1)];
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!args.render || !args.out || args.candidates.length === 0) {
    throw new Error(
      'Usage: overlay.mjs --render <png> [--truth <gt.json>|none] '
      + '--candidates <a.json> [--candidates <b.json> ...] --out <png>',
    );
  }
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Truth files use CONTRACT.md's `targets`; candidate files are a bare CandidateField[]. */
function itemsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.targets)) return data.targets;
  throw new Error('Expected either a CandidateField[] or a ground-truth file with a `targets` array');
}

function drawBox(ctx, box, { x, y, width, height }, id, color, imageWidth, imageHeight) {
  const px = x * imageWidth;
  const py = y * imageHeight;
  const pw = width * imageWidth;
  const ph = height * imageHeight;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, pw, ph);
  if (id) {
    ctx.font = '9px sans-serif';
    ctx.fillStyle = color;
    // A filled backing strip keeps the id legible over dense form ink.
    const label = String(id);
    const metrics = ctx.measureText(label);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(px, Math.max(0, py - 10), metrics.width + 2, 10);
    ctx.fillStyle = color;
    ctx.fillText(label, px + 1, Math.max(9, py - 1));
  }
}

async function renderWithCanvas(args) {
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const image = await loadImage(fs.readFileSync(args.render));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  if (args.truth && args.truth !== 'none') {
    const truth = itemsOf(readJson(args.truth));
    for (const target of truth) {
      drawBox(ctx, canvas, target.bounds, target.id, TRUTH_COLOR, image.width, image.height);
    }
  }

  args.candidates.forEach((file, fileIndex) => {
    const color = CANDIDATE_COLORS[fileIndex % CANDIDATE_COLORS.length];
    const candidates = itemsOf(readJson(file));
    for (const candidate of candidates) {
      drawBox(ctx, canvas, candidate.bounds, candidate.id, color, image.width, image.height);
    }
  });

  fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  fs.writeFileSync(args.out, await canvas.encode('png'));
  return args.out;
}

/** Fallback: an SVG with the render embedded as a data URI plus <rect>s on top. */
function renderWithSvg(args) {
  const pngBytes = fs.readFileSync(args.render);
  const base64 = pngBytes.toString('base64');
  // Need the pixel size; without a decoder, read it out of the PNG IHDR chunk.
  const width = pngBytes.readUInt32BE(16);
  const height = pngBytes.readUInt32BE(20);

  const rects = [];
  const boxSvg = (bounds, id, color) => {
    const x = bounds.x * width;
    const y = bounds.y * height;
    const w = bounds.width * width;
    const h = bounds.height * height;
    rects.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="1.5"/>`
      + (id ? `<text x="${x + 1}" y="${Math.max(9, y - 1)}" font-size="9" fill="${color}">${id}</text>` : ''),
    );
  };

  if (args.truth && args.truth !== 'none') {
    for (const target of itemsOf(readJson(args.truth))) boxSvg(target.bounds, target.id, TRUTH_COLOR);
  }
  args.candidates.forEach((file, fileIndex) => {
    const color = CANDIDATE_COLORS[fileIndex % CANDIDATE_COLORS.length];
    for (const candidate of itemsOf(readJson(file))) boxSvg(candidate.bounds, candidate.id, color);
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `
    + `viewBox="0 0 ${width} ${height}">`
    + `<image href="data:image/png;base64,${base64}" width="${width}" height="${height}"/>`
    + `${rects.join('')}</svg>\n`;

  const outPath = args.out.replace(/\.png$/i, '.svg');
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, svg);
  return outPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const out = await renderWithCanvas(args);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${out}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`@napi-rs/canvas unavailable (${error.message}); falling back to SVG`);
    const out = renderWithSvg(args);
    // eslint-disable-next-line no-console
    console.log(`Wrote ${out} (SVG fallback, PNG embedded as data URI)`);
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
