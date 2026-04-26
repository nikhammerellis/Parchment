import type { Annotation, PageEntry, PdfSource } from '../types';
import { COLORS } from '../constants';
import { getTextContent } from './textContentCache';
import { textUnderHighlight } from './highlightText';

/*
 * Build a markdown sidecar of every annotation in the document. Highlights
 * include the underlying text (via per-page text-content + bbox intersection);
 * drawings appear as a labelled bullet. Optional notes attach as prose under
 * each annotation.
 */

function colorName(hex: string): string {
  const found = COLORS.find((c) => c.value.toLowerCase() === hex.toLowerCase());
  return found ? found.name : hex;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeQuoteLine(text: string): string {
  // Collapse newlines so a single highlight stays on one quoted line.
  return text.replace(/\s+/g, ' ').trim();
}

function highlightCount(annotations: Annotation[]): number {
  let n = 0;
  for (const a of annotations) if (a.type === 'highlight') n += 1;
  return n;
}

async function pageHighlightTexts(
  page: PageEntry,
  source: PdfSource | undefined
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!source) return result;
  if (highlightCount(page.annotations) === 0) return result;
  let textContent;
  try {
    const pdfPage = await source.pdfjsDoc.getPage(page.srcIndex + 1);
    textContent = await getTextContent(pdfPage, page.sourceKey, page.srcIndex);
  } catch {
    return result;
  }
  const pageHeight = page.nativeSize.height;
  for (const ann of page.annotations) {
    if (ann.type !== 'highlight') continue;
    const text = textUnderHighlight(
      { x: ann.x, y: ann.y, w: ann.w, h: ann.h },
      textContent,
      pageHeight
    );
    result.set(ann.id, text);
  }
  return result;
}

function renderHighlight(
  ann: Annotation & { type: 'highlight' },
  text: string
): string[] {
  const lines: string[] = [];
  const colorLabel = `${colorName(ann.color)} highlight`;
  if (text.length > 0) {
    lines.push(`> "${escapeQuoteLine(text)}"`);
    lines.push(`> — ${colorLabel}`);
  } else {
    lines.push(`> (non-text region) — ${colorLabel}`);
  }
  if (ann.note && ann.note.trim().length > 0) {
    lines.push('>');
    const noteLines = ann.note.trim().split(/\r?\n/);
    for (const nl of noteLines) {
      lines.push(`> ${nl}`);
    }
  }
  return lines;
}

function renderDrawing(ann: Annotation & { type: 'draw' }): string[] {
  const lines: string[] = [];
  lines.push(`- **Drawing** (${colorName(ann.color).toLowerCase()})`);
  if (ann.note && ann.note.trim().length > 0) {
    const noteLines = ann.note.trim().split(/\r?\n/);
    for (const nl of noteLines) {
      lines.push(`  ${nl}`);
    }
  }
  return lines;
}

export async function annotationsToMarkdown(
  fileName: string,
  pages: PageEntry[],
  sources: Record<string, PdfSource>
): Promise<string> {
  const title = fileName.replace(/\.pdf$/i, '') || 'document';
  const lines: string[] = [];
  lines.push(`# ${title} — Annotations`);
  lines.push('');
  lines.push(`Exported ${todayIso()}`);
  lines.push('');

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (page.annotations.length === 0) continue;
    const highlightTexts = await pageHighlightTexts(page, sources[page.sourceKey]);
    lines.push(`## Page ${i + 1} (${page.annotations.length} annotation${page.annotations.length === 1 ? '' : 's'})`);
    lines.push('');
    for (let j = 0; j < page.annotations.length; j++) {
      const ann = page.annotations[j];
      if (ann.type === 'highlight') {
        const text = highlightTexts.get(ann.id) ?? '';
        for (const l of renderHighlight(ann, text)) lines.push(l);
      } else {
        for (const l of renderDrawing(ann)) lines.push(l);
      }
      lines.push('');
    }
  }

  // Trim trailing blank lines, keep a single newline at end-of-file.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return `${lines.join('\n')}\n`;
}
