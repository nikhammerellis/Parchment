import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { OutlineNode } from '../types';

interface RawOutlineItem {
  title: string;
  bold?: boolean;
  italic?: boolean;
  color?: Uint8ClampedArray;
  dest?: string | unknown[] | null;
  url?: string | null;
  unsafeUrl?: string | null;
  newWindow?: boolean;
  count?: number;
  items: RawOutlineItem[];
}

export async function buildOutline(pdfjsDoc: PDFDocumentProxy): Promise<OutlineNode[]> {
  let raw: RawOutlineItem[] | null = null;
  try {
    raw = (await pdfjsDoc.getOutline()) as RawOutlineItem[] | null;
  } catch {
    return [];
  }
  if (!raw || raw.length === 0) return [];
  return Promise.all(raw.map((item) => resolveNode(pdfjsDoc, item)));
}

async function resolveNode(
  pdfjsDoc: PDFDocumentProxy,
  item: RawOutlineItem
): Promise<OutlineNode> {
  const pageIndex = await resolveDestination(pdfjsDoc, item.dest ?? null);
  const children = await Promise.all(
    (item.items ?? []).map((child) => resolveNode(pdfjsDoc, child))
  );
  return {
    title: item.title || '(untitled)',
    pageIndex,
    children
  };
}

async function resolveDestination(
  pdfjsDoc: PDFDocumentProxy,
  dest: string | unknown[] | null
): Promise<number | null> {
  if (!dest) return null;
  try {
    let resolved: unknown[] | null;
    if (typeof dest === 'string') {
      resolved = (await pdfjsDoc.getDestination(dest)) as unknown[] | null;
    } else {
      resolved = dest;
    }
    if (!resolved || resolved.length === 0) return null;
    const ref = resolved[0];
    const pageIndex = await pdfjsDoc.getPageIndex(ref as never);
    return typeof pageIndex === 'number' ? pageIndex : null;
  } catch {
    return null;
  }
}
