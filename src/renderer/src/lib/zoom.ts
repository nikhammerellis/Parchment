import type { ViewportSize } from '../types';

/*
 * Page-native size is in PDF points. Display scale is the same units the
 * pdf.js viewport uses, so fit math is a plain ratio.
 */

const FIT_PADDING = 80;
const MIN_FIT = 0.2;

export function computeFitScale(
  mode: 'width' | 'page',
  viewport: ViewportSize,
  pageNative: { width: number; height: number },
  rotation: number
): number {
  if (viewport.width <= 0 || viewport.height <= 0) return 1;
  const rotated = rotation % 180 !== 0;
  const w = rotated ? pageNative.height : pageNative.width;
  const h = rotated ? pageNative.width : pageNative.height;
  const availableW = Math.max(100, viewport.width - FIT_PADDING);
  const availableH = Math.max(100, viewport.height - FIT_PADDING);
  if (mode === 'width') return Math.max(MIN_FIT, availableW / w);
  return Math.max(MIN_FIT, Math.min(availableW / w, availableH / h));
}
