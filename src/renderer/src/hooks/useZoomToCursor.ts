import { RefObject, useEffect } from 'react';
import { usePdfStore } from '../state/pdfStore';
import { ZOOM_MAX, ZOOM_MIN } from '../constants';

/*
 * Ctrl/Cmd+wheel zooms toward the cursor. macOS trackpad pinch fires wheel
 * with ctrlKey set by the OS, so the same handler covers both.
 *
 * Invariant we preserve: the content-space point under the cursor before
 * zooming is still under the cursor after. That works out to:
 *   newScroll = pointer * (newScale / oldScale) - (pointer - oldScroll)
 *            = oldScroll + pointer * (newScale / oldScale - 1)
 * measured in the scroll container's client coords.
 */

const WHEEL_FACTOR = 0.0015;

export function useZoomToCursor(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const state = usePdfStore.getState();
      if (state.pages.length === 0) return;

      const rect = el.getBoundingClientRect();
      const pointerX = e.clientX - rect.left + el.scrollLeft;
      const pointerY = e.clientY - rect.top + el.scrollTop;
      const oldScale = state.scale;
      const factor = Math.exp(-e.deltaY * WHEEL_FACTOR);
      let newScale = oldScale * factor;
      newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
      if (Math.abs(newScale - oldScale) < 0.0001) return;

      state.setScale(newScale);

      requestAnimationFrame(() => {
        const ratio = newScale / oldScale;
        const scrollX = pointerX * ratio - (e.clientX - rect.left);
        const scrollY = pointerY * ratio - (e.clientY - rect.top);
        el.scrollLeft = scrollX;
        el.scrollTop = scrollY;
      });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return (): void => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref]);
}
