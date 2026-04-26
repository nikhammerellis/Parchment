import { useEffect } from 'react';
import { usePdfStore } from '../state/pdfStore';
import { computeFitScale } from '../lib/zoom';
import { ZOOM_DEFAULT } from '../constants';

/*
 * Whenever zoomMode is non-custom and viewport or focal page dimensions
 * change, recompute scale. We key off the focal page's cached nativeSize +
 * rotation so that continuous scrolling through same-sized pages does not
 * cause scale thrashing — only real size changes trigger a recompute.
 */
export function useFitZoom(): void {
  const zoomMode = usePdfStore((s) => s.zoomMode);
  const viewport = usePdfStore((s) => s.viewport);
  const page = usePdfStore((s) => s.pages[s.currentPage]);
  const nativeW = page?.nativeSize.width ?? 0;
  const nativeH = page?.nativeSize.height ?? 0;
  const rotation = page?.rotation ?? 0;

  useEffect(() => {
    if (!page) return;
    if (zoomMode === 'custom') return;
    if (nativeW === 0 || nativeH === 0) return;
    const state = usePdfStore.getState();
    let next: number;
    if (zoomMode === 'actual') {
      next = 1;
    } else if (zoomMode === 'fit-width') {
      next = computeFitScale(
        'width',
        viewport,
        { width: nativeW, height: nativeH },
        rotation
      );
    } else if (zoomMode === 'fit-page') {
      next = computeFitScale(
        'page',
        viewport,
        { width: nativeW, height: nativeH },
        rotation
      );
    } else {
      next = ZOOM_DEFAULT;
    }
    if (Math.abs(next - state.scale) < 0.0001) return;
    // bypass setScale so we keep the zoomMode (setScale flips to custom)
    usePdfStore.setState({ scale: next });
  }, [zoomMode, viewport, nativeW, nativeH, rotation, page]);
}
