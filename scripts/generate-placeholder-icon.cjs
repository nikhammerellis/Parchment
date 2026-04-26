/* eslint-disable @typescript-eslint/no-var-requires */
/*
 * Generates build/icon.png — a 1024×1024 placeholder app icon.
 *
 * Mark: a stylized "P." — vertical paper-tone stem + ring-shaped bowl, with
 * an accent-orange period disc to the right at the baseline. Drawn from
 * geometric primitives (rect / disc / annulus) so we don't need a font stack
 * or native canvas dep — pngjs only.
 *
 * The polished mark (italic serif Instrument Serif P) lives in a future
 * pass; this placeholder keeps the wordmark silhouette readable at 16×16
 * without bundling typography.
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const SIZE = 1024;

// CSS palette — matches index.css :root.
const BG = { r: 17, g: 17, b: 17 };       // --panel
const PAPER = { r: 245, g: 243, b: 239 }; // --paper
const ACCENT = { r: 245, g: 158, b: 11 }; // --accent

// P stem — vertical bar.
const STEM = { x: 230, y: 195, w: 145, h: 630 };

// P bowl — annulus that overlaps the stem at the top.
const BOWL = { cx: 480, cy: 405, rOuter: 240, rInner: 125 };

// Trailing accent period — sits at the baseline to the right of the bowl.
const PERIOD = { cx: 820, cy: 800, r: 90 };

function clamp(value, lo, hi) {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

function blendPixel(data, idx, color, coverage) {
  if (coverage <= 0) return;
  const a = clamp(coverage, 0, 1);
  const inv = 1 - a;
  data[idx]     = Math.round(color.r * a + data[idx]     * inv);
  data[idx + 1] = Math.round(color.g * a + data[idx + 1] * inv);
  data[idx + 2] = Math.round(color.b * a + data[idx + 2] * inv);
  data[idx + 3] = 255;
}

function fillBackground(data, color) {
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (SIZE * y + x) << 2;
      data[idx]     = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 255;
    }
  }
}

function paintRect(data, rect, color) {
  // 1px AA on each edge — coverage = distance to nearest edge.
  const x0 = rect.x;
  const y0 = rect.y;
  const x1 = rect.x + rect.w;
  const y1 = rect.y + rect.h;
  const minX = clamp(Math.floor(x0 - 1), 0, SIZE - 1);
  const maxX = clamp(Math.ceil(x1 + 1), 0, SIZE - 1);
  const minY = clamp(Math.floor(y0 - 1), 0, SIZE - 1);
  const maxY = clamp(Math.ceil(y1 + 1), 0, SIZE - 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Distance into the rect (negative = outside, positive = inside).
      const dx = Math.min(px - x0, x1 - px);
      const dy = Math.min(py - y0, y1 - py);
      const inside = Math.min(dx, dy);
      const coverage = clamp(inside + 0.5, 0, 1);
      if (coverage <= 0) continue;
      blendPixel(data, (SIZE * y + x) << 2, color, coverage);
    }
  }
}

function paintDisc(data, disc, color) {
  const { cx, cy, r } = disc;
  const minX = clamp(Math.floor(cx - r - 1), 0, SIZE - 1);
  const maxX = clamp(Math.ceil(cx + r + 1), 0, SIZE - 1);
  const minY = clamp(Math.floor(cy - r - 1), 0, SIZE - 1);
  const maxY = clamp(Math.ceil(cy + r + 1), 0, SIZE - 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const coverage = clamp(r - dist + 0.5, 0, 1);
      if (coverage <= 0) continue;
      blendPixel(data, (SIZE * y + x) << 2, color, coverage);
    }
  }
}

function paintAnnulus(data, annulus, color) {
  const { cx, cy, rOuter, rInner } = annulus;
  const minX = clamp(Math.floor(cx - rOuter - 1), 0, SIZE - 1);
  const maxX = clamp(Math.ceil(cx + rOuter + 1), 0, SIZE - 1);
  const minY = clamp(Math.floor(cy - rOuter - 1), 0, SIZE - 1);
  const maxY = clamp(Math.ceil(cy + rOuter + 1), 0, SIZE - 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // Coverage = inside outer edge AND outside inner edge.
      const outerCov = clamp(rOuter - dist + 0.5, 0, 1);
      const innerCov = clamp(dist - rInner + 0.5, 0, 1);
      const coverage = Math.min(outerCov, innerCov);
      if (coverage <= 0) continue;
      blendPixel(data, (SIZE * y + x) << 2, color, coverage);
    }
  }
}

function buildIcon() {
  const png = new PNG({ width: SIZE, height: SIZE, colorType: 6 });
  fillBackground(png.data, BG);
  // Z-order: stem first, then bowl annulus on top (so the overlap reads as a
  // single P silhouette), then the accent period.
  paintRect(png.data, STEM, PAPER);
  paintAnnulus(png.data, BOWL, PAPER);
  paintDisc(png.data, PERIOD, ACCENT);
  return png;
}

function main() {
  const outDir = path.resolve(__dirname, '..', 'build');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'icon.png');
  const png = buildIcon();
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(outPath, buffer);
  process.stdout.write(`Wrote ${outPath} (${SIZE}x${SIZE})\n`);
}

main();
