import type { PageEntry, PdfSource } from '../types';
import type { Rect } from './rotation';
import { getTextContent, type PdfTextContent } from './textContentCache';
import { textItemToPageNativeRect, type PdfTextItem } from './snapHighlight';

/*
 * Linear scan for case-insensitive substring matches across all pages, in
 * display order. For each page we concatenate text items into a normalized
 * string, remembering per-char back-pointers into the original items so we
 * can reconstruct bboxes for spans of the match.
 *
 * Matches that straddle multiple text items produce multiple bboxes — one per
 * item the match touches — which the highlight layer renders as a union of
 * rectangles.
 */

type TextContentItem = PdfTextContent['items'][number];

function isTextItem(item: TextContentItem): item is TextContentItem & PdfTextItem {
  const candidate = item as Partial<PdfTextItem>;
  return (
    typeof candidate.str === 'string' &&
    Array.isArray(candidate.transform) &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number'
  );
}

export interface FindMatch {
  pageIndex: number;
  bboxes: Rect[]; // page-native PDF points
}

interface PageCharMap {
  // normalized lowercase page text, used for substring search
  text: string;
  // for each char in `text`, the originating item index and the offset within
  // that item's normalized str
  itemIndex: Int32Array;
  charInItem: Int32Array;
  items: PdfTextItem[];
  itemNormalizedLen: Int32Array;
}

function buildPageCharMap(textContent: PdfTextContent): PageCharMap {
  const items: PdfTextItem[] = [];
  for (const item of textContent.items) {
    if (!isTextItem(item)) continue;
    items.push(item);
  }
  const normalizedLens = new Int32Array(items.length);
  const parts = new Array<string>(items.length);
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    const s = items[i].str.toLowerCase();
    parts[i] = s;
    normalizedLens[i] = s.length;
    total += s.length;
  }
  const combined = parts.join('');
  const itemIndex = new Int32Array(total);
  const charInItem = new Int32Array(total);
  let cursor = 0;
  for (let i = 0; i < items.length; i++) {
    const len = normalizedLens[i];
    for (let j = 0; j < len; j++) {
      itemIndex[cursor + j] = i;
      charInItem[cursor + j] = j;
    }
    cursor += len;
  }
  return {
    text: combined,
    itemIndex,
    charInItem,
    items,
    itemNormalizedLen: normalizedLens
  };
}

function bboxesForMatch(
  map: PageCharMap,
  start: number,
  end: number,
  pageHeight: number
): Rect[] {
  if (end <= start) return [];
  const rects: Rect[] = [];
  let cursor = start;
  while (cursor < end) {
    const itemIdx = map.itemIndex[cursor];
    const item = map.items[itemIdx];
    const itemLen = map.itemNormalizedLen[itemIdx];
    const startInItem = map.charInItem[cursor];
    let endInItem = startInItem;
    while (
      cursor < end &&
      map.itemIndex[cursor] === itemIdx &&
      map.charInItem[cursor] === endInItem
    ) {
      cursor++;
      endInItem++;
    }
    const itemRect = textItemToPageNativeRect(item, pageHeight);
    if (!itemRect || itemLen <= 0) continue;
    // Slice the item rect proportionally to the matched char range. This is an
    // approximation — glyphs aren't uniform width — but it's close enough for
    // a highlight, and the accurate per-glyph path would need font metrics.
    const startFrac = startInItem / itemLen;
    const endFrac = endInItem / itemLen;
    rects.push({
      x: itemRect.x + itemRect.w * startFrac,
      y: itemRect.y,
      w: Math.max(1, itemRect.w * (endFrac - startFrac)),
      h: itemRect.h
    });
  }
  return rects;
}

async function findInPage(
  page: PageEntry,
  sources: Record<string, PdfSource>,
  pageIndex: number,
  needle: string
): Promise<FindMatch[]> {
  const source = sources[page.sourceKey];
  if (!source) return [];
  const pdfPage = await source.pdfjsDoc.getPage(page.srcIndex + 1);
  const textContent = await getTextContent(pdfPage, page.sourceKey, page.srcIndex);
  const native = pdfPage.getViewport({ scale: 1, rotation: 0 });
  const map = buildPageCharMap(textContent);
  if (map.text.length === 0 || needle.length === 0) return [];
  const matches: FindMatch[] = [];
  let searchFrom = 0;
  while (searchFrom <= map.text.length - needle.length) {
    const idx = map.text.indexOf(needle, searchFrom);
    if (idx === -1) break;
    const bboxes = bboxesForMatch(map, idx, idx + needle.length, native.height);
    if (bboxes.length > 0) matches.push({ pageIndex, bboxes });
    searchFrom = idx + needle.length;
  }
  return matches;
}

export async function findInDocument(
  pages: PageEntry[],
  sources: Record<string, PdfSource>,
  rawQuery: string,
  signal: AbortSignal
): Promise<FindMatch[]> {
  const query = rawQuery.trim().toLowerCase();
  if (query.length === 0) return [];
  const results: FindMatch[] = [];
  const YIELD_EVERY = 10;
  for (let i = 0; i < pages.length; i++) {
    if (signal.aborted) return [];
    try {
      const pageMatches = await findInPage(pages[i], sources, i, query);
      results.push(...pageMatches);
    } catch {
      // Skip unreadable pages — they just contribute no matches.
    }
    if ((i + 1) % YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (signal.aborted) return [];
    }
  }
  return results;
}
