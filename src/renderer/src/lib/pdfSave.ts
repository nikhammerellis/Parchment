import { PDFDocument, degrees, LineCapStyle, rgb } from 'pdf-lib';
import type { PageEntry, PdfSource } from '../types';
import { hexToRgb } from './hexToRgb';
import { pointsToSvgPath } from './svgPath';

export interface BuildSavedPdfParams {
  sources: Record<string, PdfSource>;
  pages: PageEntry[];
}

/*
 * Annotations are in page-native pt (top-left origin, y-down). pdf-lib uses
 * bottom-left origin, so each draw call y-flips against the native page
 * height. The page's rotation is written with setRotation; annotations are
 * stored rotation-independent so they don't need a transform here.
 */

export async function buildSavedPdf(params: BuildSavedPdfParams): Promise<Uint8Array> {
  const { sources, pages } = params;

  const loaded: Record<string, PDFDocument> = {};
  for (const key of Object.keys(sources)) {
    loaded[key] = await PDFDocument.load(sources[key].bytes);
  }

  const out = await PDFDocument.create();

  for (const p of pages) {
    const srcDoc = loaded[p.sourceKey];
    if (!srcDoc) {
      throw new Error(`Source document missing for key ${p.sourceKey}`);
    }

    const [copied] = await out.copyPages(srcDoc, [p.srcIndex]);

    if (p.rotation) {
      const existing = copied.getRotation().angle || 0;
      copied.setRotation(degrees((existing + p.rotation) % 360));
    }

    // Use the unrotated page height: annotations were captured in page-native
    // space, which is defined against the 0° orientation.
    const nativeSize = srcDoc.getPage(p.srcIndex).getSize();
    const pageHeight = nativeSize.height;

    for (const ann of p.annotations) {
      const col = hexToRgb(ann.color);
      const color = rgb(col[0], col[1], col[2]);
      if (ann.type === 'highlight') {
        const y = pageHeight - (ann.y + ann.h);
        copied.drawRectangle({
          x: ann.x,
          y,
          width: ann.w,
          height: ann.h,
          color,
          opacity: 0.4
        });
      } else if (ann.points.length >= 2) {
        const path = pointsToSvgPath(ann.points);
        // drawSvgPath translates to (x, y), then y-scales by -1 — so SVG
        // coords in y-down page-native space map to PDF bottom-left coords
        // when we anchor the SVG origin to the page's top edge.
        copied.drawSvgPath(path, {
          x: 0,
          y: pageHeight,
          scale: 1,
          borderColor: color,
          borderWidth: ann.size,
          borderLineCap: LineCapStyle.Round
        });
      }
    }

    out.addPage(copied);
  }

  return out.save();
}
