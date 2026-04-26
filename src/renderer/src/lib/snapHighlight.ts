import type { Rect } from './rotation';
import type { PdfTextContent } from './textContentCache';

/*
 * Snap a highlight drag rect (in page-native coords, origin top-left, y-down)
 * to the union of text-item bboxes intersected by the drag.
 *
 * Text items come from pdf.js's getTextContent() and carry:
 *   - transform[4]/[5]: x/y of the baseline origin in PDF points, bottom-left
 *   - width / height:   glyph run dimensions in PDF points (height is the
 *                       font size, near enough)
 *
 * Page-native space is top-left y-down, so we flip y: the top of the run is
 * (pageHeight - transform[5] - height) and the bottom is (pageHeight - transform[5]).
 */

const MIN_OVERLAP = 2;

type TextContentItem = PdfTextContent['items'][number];

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

function isTextItem(item: TextContentItem): item is TextContentItem & PdfTextItem {
  const candidate = item as Partial<PdfTextItem>;
  return (
    typeof candidate.str === 'string' &&
    Array.isArray(candidate.transform) &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  );
}

export function textItemToPageNativeRect(
  item: PdfTextItem,
  pageHeight: number
): Rect | null {
  if (item.transform.length < 6) return null;
  const x = Number(item.transform[4]);
  const yBaseline = Number(item.transform[5]);
  const w = item.width;
  const h = item.height > 0 ? item.height : 0;
  if (!Number.isFinite(x) || !Number.isFinite(yBaseline)) return null;
  return {
    x,
    y: pageHeight - yBaseline - h,
    w,
    h
  };
}

function intersects(a: Rect, b: Rect): boolean {
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return xOverlap >= MIN_OVERLAP && yOverlap >= MIN_OVERLAP;
}

export interface SnapResult {
  rect: Rect;
  snapped: boolean;
}

export function snapRectToText(
  dragRect: Rect,
  textContent: PdfTextContent,
  pageHeight: number
): SnapResult {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hit = false;

  for (const item of textContent.items) {
    if (!isTextItem(item)) continue;
    if (item.str.length === 0) continue;
    const itemRect = textItemToPageNativeRect(item, pageHeight);
    if (!itemRect) continue;
    if (!intersects(dragRect, itemRect)) continue;
    hit = true;
    if (itemRect.x < minX) minX = itemRect.x;
    if (itemRect.y < minY) minY = itemRect.y;
    if (itemRect.x + itemRect.w > maxX) maxX = itemRect.x + itemRect.w;
    if (itemRect.y + itemRect.h > maxY) maxY = itemRect.y + itemRect.h;
  }

  if (!hit) return { rect: dragRect, snapped: false };
  return {
    rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    snapped: true
  };
}

// Re-export for find.ts
export type { PdfTextItem };
