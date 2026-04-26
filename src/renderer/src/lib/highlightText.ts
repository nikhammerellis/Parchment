import type { PdfTextContent } from './textContentCache';

/*
 * Extract the text under a highlight rect by walking the page's text content
 * and including every text item whose top-left bbox overlaps the rect by
 * >= 50% of the item's area.
 *
 * Coordinate system mirrors snapHighlight.ts: pdf.js text items carry baseline
 * x/y in PDF points (origin bottom-left); the highlight rect is in page-native
 * top-left y-down. We flip y the same way as in snapHighlight.ts and then
 * compute axis-aligned overlap.
 */

interface PdfTextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function isTextItem(item: unknown): item is PdfTextItemLike {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<PdfTextItemLike>;
  return (
    typeof candidate.str === 'string' &&
    Array.isArray(candidate.transform) &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  );
}

function itemBBox(item: PdfTextItemLike, pageHeight: number): BBox | null {
  if (item.transform.length < 6) return null;
  const x = Number(item.transform[4]);
  const yBaseline = Number(item.transform[5]);
  const w = item.width;
  const h = item.height > 0 ? item.height : 0;
  if (!Number.isFinite(x) || !Number.isFinite(yBaseline)) return null;
  return { x, y: pageHeight - yBaseline - h, w, h };
}

function overlapArea(a: BBox, b: BBox): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

export function textUnderHighlight(
  rect: BBox,
  textContent: PdfTextContent,
  pageHeight: number
): string {
  const parts: string[] = [];
  for (const item of textContent.items) {
    if (!isTextItem(item)) continue;
    if (item.str.length === 0) continue;
    const ib = itemBBox(item, pageHeight);
    if (!ib) continue;
    const itemArea = ib.w * ib.h;
    if (itemArea <= 0) continue;
    const overlap = overlapArea(rect, ib);
    if (overlap / itemArea < 0.5) continue;
    parts.push(item.str);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
