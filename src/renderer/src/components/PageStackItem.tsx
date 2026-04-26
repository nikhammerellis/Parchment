import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageViewport, PDFPageProxy } from 'pdfjs-dist';
import { usePdfStore } from '../state/pdfStore';
import { renderPage } from '../lib/pdfRender';
import { renderTextLayer, type TextLayerHandle } from '../lib/textLayer';
import { getTextContent } from '../lib/textContentCache';
import { snapRectToText } from '../lib/snapHighlight';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';
import { DRAW_SIZE } from '../constants';
import type {
  Annotation,
  DrawAnnotation,
  FindMatch,
  HighlightAnnotation,
  InProgressAnnotation
} from '../types';
import {
  displayToPageNative,
  pageNativeBboxToDisplayRect,
  pageNativeToDisplay,
  type PageNativeSize
} from '../lib/rotation';
import { hitAnnotation } from '../lib/hitTest';
import { LinkLayer } from './LinkLayer';

/*
 * Per-page stack item. The parent PageView renders one of these per entry in
 * `state.pages` inside the scroll container. Each item virtualizes its own
 * expensive render (PDF raster + text layer + link layer) via an
 * IntersectionObserver — when the page isn't near the viewport we render
 * only a placeholder div sized to the page's displayed dimensions so the
 * stack's scroll height stays stable.
 */

export interface PageStackItemProps {
  pageIndex: number;
  scrollRoot: HTMLElement | null;
}

interface PageViewContext {
  pageSize: PageNativeSize;
  rotation: number;
  displayScale: number;
}

interface InProgressOverlay {
  ann: InProgressAnnotation;
}

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  view: PageViewContext,
  selected: boolean
): void {
  if (ann.type === 'highlight') {
    const rect = pageNativeBboxToDisplayRect(
      { x: ann.x, y: ann.y, w: ann.w, h: ann.h },
      view.pageSize,
      view.rotation,
      view.displayScale
    );
    ctx.fillStyle = ann.color;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 1;
    if (selected) {
      strokeSelection(ctx, rect.x, rect.y, rect.w, rect.h);
    }
    return;
  }

  const displayPts = ann.points.map(([x, y]) =>
    pageNativeToDisplay({ x, y }, view.pageSize, view.rotation, view.displayScale)
  );
  ctx.strokeStyle = ann.color;
  ctx.lineWidth = ann.size * view.displayScale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  displayPts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.stroke();

  if (selected) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const pt of displayPts) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
    const pad = 4;
    strokeSelection(ctx, minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad);
  }
}

function strokeSelection(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.save();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawInProgress(
  ctx: CanvasRenderingContext2D,
  overlay: InProgressOverlay
): void {
  const a = overlay.ann;
  if (a.type === 'highlight') {
    ctx.fillStyle = a.color;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.strokeStyle = a.color;
  ctx.lineWidth = a.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  a.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

function drawFindMatches(
  canvas: HTMLCanvasElement,
  matches: FindMatch[],
  currentMatch: number,
  pageIndex: number,
  view: PageViewContext,
  dpr: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Clear the full bitmap; setTransform below puts subsequent draws back into
  // CSS-space coordinates that match pageNativeBboxToDisplayRect output.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (m.pageIndex !== pageIndex) continue;
    const isCurrent = i === currentMatch;
    ctx.fillStyle = isCurrent ? 'rgba(245, 158, 11, 0.5)' : 'rgba(253, 224, 71, 0.4)';
    for (const bbox of m.bboxes) {
      const dr = pageNativeBboxToDisplayRect(bbox, view.pageSize, view.rotation, view.displayScale);
      ctx.fillRect(dr.x, dr.y, dr.w, dr.h);
      if (isCurrent) {
        ctx.save();
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.lineWidth = 1;
        ctx.strokeRect(dr.x + 0.5, dr.y + 0.5, Math.max(0, dr.w - 1), Math.max(0, dr.h - 1));
        ctx.restore();
      }
    }
  }
}

function placeholderDims(
  nativeSize: PageNativeSize,
  rotation: number,
  scale: number
): { width: number; height: number } {
  const r = ((rotation % 360) + 360) % 360;
  const swap = r === 90 || r === 270;
  return {
    width: (swap ? nativeSize.height : nativeSize.width) * scale,
    height: (swap ? nativeSize.width : nativeSize.height) * scale
  };
}

export function PageStackItem(props: PageStackItemProps): JSX.Element {
  const { pageIndex, scrollRoot } = props;
  const pdfCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const findCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pageWrapRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef<InProgressAnnotation | null>(null);
  const textLayerHandleRef = useRef<TextLayerHandle | null>(null);
  const lastViewportRef = useRef<PageViewport | null>(null);

  // canvasSize holds **CSS-pixel** dimensions of the page area (viewport size
  // at the current zoom). Bitmap dims are canvasSize × dpr, managed directly
  // on each canvas inside the render effects.
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0
  });
  const [pdfJsPage, setPdfJsPage] = useState<PDFPageProxy | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const dpr = useDevicePixelRatio();

  const page = usePdfStore((s) => s.pages[pageIndex]);
  const source = usePdfStore((s) => (page ? s.sources[page.sourceKey] : null));
  const pagesLength = usePdfStore((s) => s.pages.length);
  const scale = usePdfStore((s) => s.scale);
  const tool = usePdfStore((s) => s.tool);
  const color = usePdfStore((s) => s.color);
  const annotationsKey = page
    ? `${pageIndex}:${page.annotations.length}:${page.rotation}`
    : '';
  const selectedAnnotation = usePdfStore((s) => s.selectedAnnotation);
  const findMatches = usePdfStore((s) => s.findState.matches);
  const currentMatchIndex = usePdfStore((s) => s.findState.currentMatch);
  const addAnnotation = usePdfStore((s) => s.addAnnotation);
  const clearAnnotations = usePdfStore((s) => s.clearAnnotations);
  const selectAnnotation = usePdfStore((s) => s.selectAnnotation);

  // nativeSize is cached on the PageEntry at load time; fall back to {0,0}
  // if a page is ever created without it.
  const nativeSize: PageNativeSize = page?.nativeSize ?? { width: 0, height: 0 };
  const rotation = page?.rotation ?? 0;

  const viewCtx = useMemo<PageViewContext>(
    () => ({
      pageSize: nativeSize,
      rotation,
      displayScale: scale
    }),
    [nativeSize, rotation, scale]
  );

  // Placeholder / wrap dimensions are driven by cached nativeSize so the stack
  // is sized correctly before any page has rasterized.
  const placeholder = useMemo(
    () => placeholderDims(nativeSize, rotation, scale),
    [nativeSize, rotation, scale]
  );

  // Observe this item's wrap against the scroll container. Flip isVisible
  // when the viewport (+ 800px margin) intersects this page.
  useEffect(() => {
    const el = pageWrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { root: scrollRoot, rootMargin: '800px 0px', threshold: 0 }
    );
    io.observe(el);
    return (): void => io.disconnect();
  }, [scrollRoot]);

  // Render the PDF canvas + establish size + keep the pdfjs page handle.
  // renderPage sets both bitmap dims (scale × dpr) and CSS dims (scale);
  // canvasSize mirrors the CSS dims — all downstream layers (text, find,
  // annotations, links) size themselves in CSS px.
  useEffect(() => {
    if (!isVisible) return;
    const canvas = pdfCanvasRef.current;
    if (!canvas || !page || !source) return;
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const pdfPage = await source.pdfjsDoc.getPage(page.srcIndex + 1);
        if (cancelled) return;
        await renderPage(canvas, pdfPage, page.rotation, scale, dpr);
        if (cancelled) return;
        // Cache a CSS-space viewport for the text layer (see effect below).
        lastViewportRef.current = pdfPage.getViewport({
          scale,
          rotation: page.rotation
        });
        setCanvasSize({
          width: canvas.width / dpr,
          height: canvas.height / dpr
        });
        setPdfJsPage(pdfPage);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        usePdfStore.getState().showToast(`Couldn't render this page: ${message}`, true);
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [isVisible, page, source, scale, dpr]);

  // On becoming invisible: tear down canvases + release pdf.js page handle.
  // (Don't touch nativeSize — we still need it for the placeholder.)
  useEffect(() => {
    if (isVisible) return;
    if (textLayerHandleRef.current) {
      textLayerHandleRef.current.cancel();
      textLayerHandleRef.current = null;
    }
    if (textLayerRef.current) {
      textLayerRef.current.replaceChildren();
    }
    setPdfJsPage(null);
    setCanvasSize({ width: 0, height: 0 });
    lastViewportRef.current = null;
  }, [isVisible]);

  // Text layer render — mirrors the old PageView logic, scoped to this page.
  useEffect(() => {
    if (!isVisible) return;
    const container = textLayerRef.current;
    if (!container || !pdfJsPage || !page || !source) return;
    const viewport = lastViewportRef.current;
    if (!viewport) return;
    let cancelled = false;

    if (textLayerHandleRef.current) {
      textLayerHandleRef.current.cancel();
      textLayerHandleRef.current = null;
    }
    container.replaceChildren();

    (async (): Promise<void> => {
      try {
        const handle = await renderTextLayer(container, pdfJsPage, viewport);
        if (cancelled) {
          handle.cancel();
          return;
        }
        textLayerHandleRef.current = handle;
      } catch {
        // pdf.js throws an AbortException on cancel — silent is fine.
      }
    })();

    return (): void => {
      cancelled = true;
      if (textLayerHandleRef.current) {
        textLayerHandleRef.current.cancel();
        textLayerHandleRef.current = null;
      }
    };
  }, [isVisible, pdfJsPage, page, page?.rotation, scale, canvasSize.width, canvasSize.height, source]);

  const redrawAnnotations = useCallback((): void => {
    const canvas = annCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Clear in bitmap coords, then install the DPR transform. All subsequent
    // draws use CSS-pixel coordinates from pageNativeBboxToDisplayRect; the
    // transform rescales them invisibly to the higher-resolution bitmap.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const snap = usePdfStore.getState().pages[pageIndex];
    if (!snap) return;
    const sel = usePdfStore.getState().selectedAnnotation;
    snap.annotations.forEach((ann, i) => {
      const isSelected = sel?.pageIndex === pageIndex && sel?.index === i;
      drawAnnotation(ctx, ann, viewCtx, isSelected);
    });
    if (drawingRef.current) drawInProgress(ctx, { ann: drawingRef.current });
  }, [pageIndex, viewCtx, dpr]);

  useEffect(() => {
    const annCanvas = annCanvasRef.current;
    if (!annCanvas) return;
    // Bitmap dims at DPR resolution, CSS dims at display scale.
    annCanvas.width = Math.round(canvasSize.width * dpr);
    annCanvas.height = Math.round(canvasSize.height * dpr);
    annCanvas.style.width = `${canvasSize.width}px`;
    annCanvas.style.height = `${canvasSize.height}px`;
    redrawAnnotations();
  }, [canvasSize, redrawAnnotations, annotationsKey, selectedAnnotation, dpr]);

  useEffect(() => {
    const canvas = findCanvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round(canvasSize.width * dpr);
    canvas.height = Math.round(canvasSize.height * dpr);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    drawFindMatches(canvas, findMatches, currentMatchIndex, pageIndex, viewCtx, dpr);
  }, [canvasSize, findMatches, currentMatchIndex, pageIndex, viewCtx, dpr]);

  // Select-mode annotation hit-testing. Same pattern as the old PageView but
  // scoped to this item's pageIndex. Input is kept in CSS-pixel space so
  // hitAnnotation + pageNativeBboxToDisplayRect line up regardless of DPR.
  useEffect(() => {
    if (tool !== 'select') return;
    const el = pageWrapRef.current;
    const canvas = annCanvasRef.current;
    if (!el || !canvas) return;
    const handler = (e: globalThis.MouseEvent): void => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('.link-hit')) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const snap = usePdfStore.getState().pages[pageIndex];
      if (!snap) return;
      for (let i = snap.annotations.length - 1; i >= 0; i--) {
        if (hitAnnotation(snap.annotations[i], { x, y }, viewCtx)) {
          selectAnnotation({ pageIndex, index: i });
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      if (usePdfStore.getState().selectedAnnotation) {
        selectAnnotation(null);
      }
    };
    el.addEventListener('mousedown', handler, true);
    return (): void => el.removeEventListener('mousedown', handler, true);
  }, [tool, pageIndex, viewCtx, selectAnnotation]);

  // Return CSS-pixel coords relative to the canvas. The 2d context transform
  // handles the bitmap-space scaling; nothing downstream wants bitmap coords.
  const canvasPoint = useCallback((e: MouseEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = annCanvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }, []);

  const onMouseDown = (e: MouseEvent<HTMLCanvasElement>): void => {
    if (!page) return;
    const [x, y] = canvasPoint(e);
    if (tool === 'highlight') {
      drawingRef.current = {
        type: 'highlight',
        color,
        x,
        y,
        w: 0,
        h: 0,
        _startX: x,
        _startY: y
      };
    } else if (tool === 'draw') {
      drawingRef.current = {
        type: 'draw',
        color,
        size: DRAW_SIZE,
        points: [[x, y]]
      };
    } else if (tool === 'erase') {
      clearAnnotations(pageIndex);
    }
  };

  const onMouseMove = (e: MouseEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const [x, y] = canvasPoint(e);
    const d = drawingRef.current;
    if (d.type === 'highlight') {
      d.x = Math.min(d._startX, x);
      d.y = Math.min(d._startY, y);
      d.w = Math.abs(x - d._startX);
      d.h = Math.abs(y - d._startY);
    } else {
      d.points.push([x, y]);
    }
    redrawAnnotations();
  };

  const endDraw = (): void => {
    const d = drawingRef.current;
    if (!d) return;
    if (d.type === 'highlight' && d.w > 4 && d.h > 4) {
      const nativeTopLeft = displayToPageNative(
        { x: d.x, y: d.y },
        viewCtx.pageSize,
        viewCtx.rotation,
        viewCtx.displayScale
      );
      const nativeBottomRight = displayToPageNative(
        { x: d.x + d.w, y: d.y + d.h },
        viewCtx.pageSize,
        viewCtx.rotation,
        viewCtx.displayScale
      );
      const x = Math.min(nativeTopLeft.x, nativeBottomRight.x);
      const y = Math.min(nativeTopLeft.y, nativeBottomRight.y);
      const w = Math.abs(nativeBottomRight.x - nativeTopLeft.x);
      const h = Math.abs(nativeBottomRight.y - nativeTopLeft.y);
      const color = d.color;

      const pushHighlight = (rect: { x: number; y: number; w: number; h: number }): void => {
        const ann: HighlightAnnotation = {
          type: 'highlight',
          id: crypto.randomUUID(),
          color,
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h
        };
        addAnnotation(pageIndex, ann);
      };

      if (pdfJsPage && page) {
        const sourceKey = page.sourceKey;
        const srcIndex = page.srcIndex;
        void getTextContent(pdfJsPage, sourceKey, srcIndex)
          .then((tc) => {
            const snap = snapRectToText(
              { x, y, w, h },
              tc,
              viewCtx.pageSize.height
            );
            pushHighlight(snap.rect);
          })
          .catch(() => {
            pushHighlight({ x, y, w, h });
          });
      } else {
        pushHighlight({ x, y, w, h });
      }
    } else if (d.type === 'draw' && d.points.length > 1) {
      const nativePts: Array<[number, number]> = d.points.map(([x, y]) => {
        const n = displayToPageNative(
          { x, y },
          viewCtx.pageSize,
          viewCtx.rotation,
          viewCtx.displayScale
        );
        return [n.x, n.y];
      });
      const nativeSizePt = d.size / viewCtx.displayScale;
      const ann: DrawAnnotation = {
        type: 'draw',
        id: crypto.randomUUID(),
        color: d.color,
        size: nativeSizePt,
        points: nativePts
      };
      addAnnotation(pageIndex, ann);
    }
    drawingRef.current = null;
    redrawAnnotations();
  };

  if (!page) return <></>;

  const textLayerActive = tool === 'select';

  // Sized wrap always gets `data-page-index` so scrollToPage can find it by
  // DOM query regardless of isVisible state.
  return (
    <div
      ref={pageWrapRef}
      className={`page-wrap ${isVisible ? '' : 'placeholder'}`}
      data-page-index={pageIndex}
      style={{ width: placeholder.width, height: placeholder.height }}
    >
      {isVisible && (
        <>
          <canvas
            ref={pdfCanvasRef}
            className="pdf-canvas"
            role="img"
            aria-label={`Page ${pageIndex + 1} of ${pagesLength}`}
          />
          <div
            ref={textLayerRef}
            className={`textLayer ${textLayerActive ? 'select-mode' : ''}`}
            aria-hidden="true"
          />
          <canvas
            ref={findCanvasRef}
            className="find-match-layer"
            aria-hidden="true"
          />
          <canvas
            ref={annCanvasRef}
            className={`annotation-canvas ${tool === 'select' ? 'select-mode' : ''}`}
            role="application"
            aria-label={`Annotation layer, page ${pageIndex + 1}, tool: ${tool}`}
            tabIndex={0}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
          />
          {pdfJsPage && source && tool === 'select' && (
            <LinkLayer
              page={pdfJsPage}
              pageSize={nativeSize}
              rotation={rotation}
              displayScale={scale}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              sourceDoc={source.pdfjsDoc}
              sourceKey={page.sourceKey}
            />
          )}
        </>
      )}
    </div>
  );
}
