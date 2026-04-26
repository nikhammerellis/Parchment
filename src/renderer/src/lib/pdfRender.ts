import type { PDFPageProxy } from 'pdfjs-dist';

/*
 * DPR-aware raster render. The canvas gets two sets of dimensions:
 *   - bitmap dims  (canvas.width / .height)  = displayScale * dpr * page
 *   - CSS dims     (canvas.style.width / .height) = displayScale * page
 * The browser then downsamples exactly once (bitmap → CSS) instead of the
 * older path where the canvas was bitmap-only and the layout engine
 * upscaled CSS-pixel rasters onto a high-DPR screen.
 */
export async function renderPage(
  canvas: HTMLCanvasElement,
  page: PDFPageProxy,
  rotation: number,
  displayScale: number,
  dpr: number
): Promise<void> {
  const viewport = page.getViewport({ scale: displayScale * dpr, rotation });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.round(viewport.height / dpr)}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to acquire 2D context for PDF page canvas');
  }
  await page.render({ canvasContext: ctx, viewport }).promise;
}
