import { useEffect, useRef, useState } from 'react';
import { usePdfStore } from '../state/pdfStore';
import { useZoomToCursor } from '../hooks/useZoomToCursor';
import {
  setScrollController,
  type ScrollBlock
} from '../lib/scrollController';
import { PageStackItem } from './PageStackItem';

/*
 * Continuous-scroll host. Renders every page in the document as a
 * <PageStackItem/> inside a vertical scroll container. Each item virtualizes
 * its own raster via an IntersectionObserver; this component's job is:
 *
 *   1. Own the scroll container (so children can use it as IO root).
 *   2. Track which page has the largest visible area and feed it back to the
 *      store as `currentPage` (the "focal page") — but only on user-driven
 *      scrolls, not programmatic ones.
 *   3. Expose a scrollToPage(index, block) handler through the module-level
 *      scrollController so thumbnails, keyboard nav, find, and the store
 *      itself can smooth-scroll to any page without prop drilling.
 */

// Window during which focal detection is suppressed after a programmatic
// scroll. Long enough for `scroll-behavior: smooth` to settle on most pages.
const FOCAL_SUPPRESS_MS = 400;

export function PageView(): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);

  const pagesLength = usePdfStore((s) => s.pages.length);
  const setViewport = usePdfStore((s) => s.setViewport);
  const setFocalPage = usePdfStore((s) => s.setFocalPage);

  useZoomToCursor(scrollRef);

  // Capture scroll root as state so child IntersectionObservers can consume it.
  useEffect(() => {
    setScrollRoot(scrollRef.current);
  }, [pagesLength]);

  // Register the smooth-scroll handler with the module-level controller. All
  // consumers (store next/prev/match/delete/rotate, thumbnail clicks) reach
  // us through this single channel.
  const suppressFocalUntilRef = useRef<number>(0);
  useEffect(() => {
    const handler = (pageIndex: number, block: ScrollBlock): void => {
      const root = scrollRef.current;
      if (!root) return;
      const wrap = root.querySelector<HTMLElement>(
        `[data-page-index="${pageIndex}"]`
      );
      if (!wrap) return;
      suppressFocalUntilRef.current =
        performance.now() + FOCAL_SUPPRESS_MS;
      wrap.scrollIntoView({ behavior: 'smooth', block });
    };
    setScrollController(handler);
    return (): void => setScrollController(null);
  }, []);

  // Focal-page detection. One IntersectionObserver watches every page wrap.
  // Visible area = intersectionRatio * targetHeight. We keep a map and
  // recompute the max on each entry batch, throttled to one rAF.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || pagesLength === 0) return;
    const ratios = new Map<number, { ratio: number; height: number }>();
    let rafHandle: number | null = null;

    const recompute = (): void => {
      rafHandle = null;
      if (performance.now() < suppressFocalUntilRef.current) return;
      let bestIdx = -1;
      let bestArea = -1;
      ratios.forEach((entry, idx) => {
        const area = entry.ratio * entry.height;
        if (area > bestArea) {
          bestArea = area;
          bestIdx = idx;
        }
      });
      if (bestIdx < 0 || bestArea <= 0) return;
      setFocalPage(bestIdx);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const raw = target.getAttribute('data-page-index');
          if (raw === null) continue;
          const idx = Number.parseInt(raw, 10);
          if (!Number.isFinite(idx)) continue;
          if (entry.isIntersecting) {
            ratios.set(idx, {
              ratio: entry.intersectionRatio,
              height: entry.boundingClientRect.height
            });
          } else {
            ratios.delete(idx);
          }
        }
        if (rafHandle === null) {
          rafHandle = requestAnimationFrame(recompute);
        }
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    // Observe every existing wrap (pages-length-keyed mount + re-mount on count
    // change picks up inserts/removals without us needing a MutationObserver).
    const wraps = root.querySelectorAll<HTMLElement>('[data-page-index]');
    wraps.forEach((w) => io.observe(w));

    return (): void => {
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      io.disconnect();
      ratios.clear();
    };
  }, [pagesLength, setFocalPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = (): void => {
      setViewport({ width: el.clientWidth, height: el.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return (): void => observer.disconnect();
  }, [setViewport]);

  if (pagesLength === 0) {
    return <></>;
  }

  const items: JSX.Element[] = [];
  for (let i = 0; i < pagesLength; i++) {
    items.push(<PageStackItem key={i} pageIndex={i} scrollRoot={scrollRoot} />);
  }

  return (
    <div className="page-scroll" ref={scrollRef}>
      <div className="page-stack">{items}</div>
    </div>
  );
}
