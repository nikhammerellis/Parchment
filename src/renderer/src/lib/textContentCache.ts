import type { PDFPageProxy } from 'pdfjs-dist';

// pdf.js doesn't re-export TextContent from the package root, so we pin the
// cached value type to the return type of PDFPageProxy.getTextContent().
export type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

/*
 * Per-(sourceKey, srcIndex) cache of pdf.js text content. Text content is heavy
 * (tens of kilobytes per page for text-dense docs) and is consumed by the text
 * layer, find, and snap-to-text — all of which can share a single fetch.
 *
 * The cache lives outside Zustand because these blobs don't need reactivity
 * and keeping them out of the store avoids unnecessary re-renders.
 */

const cache = new Map<string, Promise<PdfTextContent>>();

function cacheKey(sourceKey: string, srcIndex: number): string {
  return `${sourceKey}:${srcIndex}`;
}

export async function getTextContent(
  pdfPage: PDFPageProxy,
  sourceKey: string,
  srcIndex: number
): Promise<PdfTextContent> {
  const key = cacheKey(sourceKey, srcIndex);
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = pdfPage.getTextContent();
  cache.set(key, pending);
  try {
    return await pending;
  } catch (err) {
    // Don't cache failures — allow retry next time.
    cache.delete(key);
    throw err;
  }
}

export function clearTextContentCache(sourceKey?: string): void {
  if (!sourceKey) {
    cache.clear();
    return;
  }
  const prefix = `${sourceKey}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
