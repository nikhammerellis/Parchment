import { TextLayer } from 'pdfjs-dist';
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';

/*
 * Renders pdf.js's selectable text layer into `container`. The caller owns the
 * container's DOM lifetime; this helper only writes text spans into it.
 *
 * Cancellation contract:
 *   - The returned handle exposes `cancel()` which aborts the in-flight render.
 *   - Before starting a new render on the same container, the caller must
 *     cancel the previous handle and empty the container — otherwise pdf.js
 *     will layer a new run of spans on top of the old ones.
 */

export interface TextLayerHandle {
  readonly container: HTMLDivElement;
  cancel: () => void;
}

export async function renderTextLayer(
  container: HTMLDivElement,
  page: PDFPageProxy,
  viewport: PageViewport
): Promise<TextLayerHandle> {
  // Text layer sizing mirrors the canvas: CSS px dimensions match the viewport
  // so text spans overlay exactly. pdf.js 4.x reads these from CSS custom
  // properties on the container.
  container.style.setProperty('--scale-factor', String(viewport.scale));
  container.style.width = `${viewport.width}px`;
  container.style.height = `${viewport.height}px`;

  const textContentSource = page.streamTextContent();
  const layer = new TextLayer({
    textContentSource,
    container,
    viewport
  });

  const handle: TextLayerHandle = {
    container,
    cancel: (): void => {
      try {
        layer.cancel();
      } catch {
        // cancel() on a completed layer can throw in some pdf.js builds — ignore.
      }
    }
  };

  await layer.render();
  return handle;
}
