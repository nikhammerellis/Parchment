import {
  CSSProperties,
  DragEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useRef,
  useState
} from 'react';
/*
 * The .thumb wrapper acts as a button (Enter/Space = go to page) but is kept
 * as a <div role="button"> rather than a real <button>. Why: nested <button>
 * elements are invalid HTML, and the thumb hosts inner action buttons (move
 * up/down, rotate, delete). `role="button"` + `tabIndex={0}` + explicit
 * keyboard handler gives us the same a11y without the nesting.
 */
import { usePdfStore } from '../state/pdfStore';
import { renderPage } from '../lib/pdfRender';
import { THUMB_SCALE } from '../constants';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';

export interface ThumbnailProps {
  index: number;
}

const DRAG_TYPE = 'application/parchment-page';
const DRAG_TYPE_MULTI = 'application/parchment-page-multi';

/*
 * Build a small canvas snapshot of the dragged thumbnail with a count badge
 * baked in. We render the underlying thumb canvas (if it has rasterized) into
 * a downscaled box plus an accent badge in the corner. Returned canvas must
 * stay in the DOM long enough for the browser to capture it (one frame). We
 * append it off-screen and clean up after a microtask.
 */
function makeMultiDragImage(
  source: HTMLElement,
  count: number
): HTMLCanvasElement | null {
  const baseCanvas = source.querySelector<HTMLCanvasElement>('canvas');
  // Cap the synthetic image so it doesn't dwarf the cursor.
  const targetWidth = 140;
  const targetHeight = baseCanvas
    ? Math.round((baseCanvas.height / baseCanvas.width) * targetWidth)
    : 180;
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Background — same panel-2 the thumbnail uses while it's loading.
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  if (baseCanvas && baseCanvas.width > 0 && baseCanvas.height > 0) {
    try {
      ctx.drawImage(baseCanvas, 0, 0, targetWidth, targetHeight);
    } catch {
      // Tainted/unrasterized — silent fallback to the panel-2 backdrop.
    }
  }

  // Border in accent so the snapshot reads as "selected".
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, targetWidth - 2, targetHeight - 2);

  // Count badge — accent pill, bottom-right.
  const label = String(count);
  ctx.font = '600 12px -apple-system, "Segoe UI", system-ui, sans-serif';
  const padX = 8;
  const badgeH = 20;
  const labelWidth = ctx.measureText(label).width;
  const badgeW = Math.max(badgeH, labelWidth + padX * 2);
  const badgeX = targetWidth - badgeW - 6;
  const badgeY = targetHeight - badgeH - 6;
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  const radius = badgeH / 2;
  ctx.moveTo(badgeX + radius, badgeY);
  ctx.lineTo(badgeX + badgeW - radius, badgeY);
  ctx.quadraticCurveTo(badgeX + badgeW, badgeY, badgeX + badgeW, badgeY + radius);
  ctx.lineTo(badgeX + badgeW, badgeY + badgeH - radius);
  ctx.quadraticCurveTo(
    badgeX + badgeW,
    badgeY + badgeH,
    badgeX + badgeW - radius,
    badgeY + badgeH
  );
  ctx.lineTo(badgeX + radius, badgeY + badgeH);
  ctx.quadraticCurveTo(badgeX, badgeY + badgeH, badgeX, badgeY + badgeH - radius);
  ctx.lineTo(badgeX, badgeY + radius);
  ctx.quadraticCurveTo(badgeX, badgeY, badgeX + radius, badgeY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0a0a0a';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

  // Mount briefly off-screen so the browser snapshots it; remove next tick.
  canvas.style.position = 'fixed';
  canvas.style.top = '-1000px';
  canvas.style.left = '-1000px';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);
  setTimeout(() => {
    canvas.remove();
  }, 0);
  return canvas;
}

export function Thumbnail(props: ThumbnailProps): JSX.Element {
  const { index } = props;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dropHint, setDropHint] = useState<'above' | 'below' | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  const dpr = useDevicePixelRatio();
  const page = usePdfStore((s) => s.pages[index]);
  const source = usePdfStore((s) => (page ? s.sources[page.sourceKey] : null));
  const isActive = usePdfStore((s) => s.currentPage === index);
  const isSelected = usePdfStore((s) => s.selectedPages.has(index));
  const selectionSize = usePdfStore((s) => s.selectedPages.size);
  const movePage = usePdfStore((s) => s.movePage);
  const rotatePage = usePdfStore((s) => s.rotatePage);
  const deletePage = usePdfStore((s) => s.deletePage);
  const selectPage = usePdfStore((s) => s.selectPage);
  const deleteSelectedPages = usePdfStore((s) => s.deleteSelectedPages);
  const rotateSelectedPages = usePdfStore((s) => s.rotateSelectedPages);
  const moveSelectedPagesTo = usePdfStore((s) => s.moveSelectedPagesTo);

  // Multi-only when the hovered thumb is part of a >1 selection.
  const multiActiveOnThis = isSelected && selectionSize > 1;

  // Approximate the pre-render placeholder size from page-native dims so
  // unrendered thumbnails don't collapse to 0 height (which would confuse
  // IntersectionObserver — everything would trigger at once).
  const [placeholderRatio, setPlaceholderRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!source || !page) return;
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const pdfPage = await source.pdfjsDoc.getPage(page.srcIndex + 1);
        if (cancelled) return;
        const vp = pdfPage.getViewport({ scale: 1, rotation: page.rotation });
        setPlaceholderRatio(vp.height / vp.width);
      } catch {
        // ignore — placeholder will use fallback ratio
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [source, page]);

  // Defer actual raster render until the thumbnail scrolls near the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || shouldRender) return;
    const root = el.closest('.sidebar-body');
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShouldRender(true);
            io.disconnect();
            return;
          }
        }
      },
      { root: root ?? null, rootMargin: '200px' }
    );
    io.observe(el);
    return (): void => io.disconnect();
  }, [shouldRender]);

  useEffect(() => {
    if (!shouldRender) return;
    const canvas = canvasRef.current;
    if (!canvas || !page || !source) return;
    let cancelled = false;
    (async (): Promise<void> => {
      try {
        const pdfPage = await source.pdfjsDoc.getPage(page.srcIndex + 1);
        if (cancelled) return;
        await renderPage(canvas, pdfPage, page.rotation, THUMB_SCALE, dpr);
      } catch {
        // thumbnail render failures are non-fatal
      }
    })();
    return (): void => {
      cancelled = true;
    };
  }, [page, source, shouldRender, dpr]);

  const stop = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    fn();
  };

  const onClick = (e: MouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    if (e.shiftKey) selectPage(index, 'range');
    else if (e.metaKey || e.ctrlKey) selectPage(index, 'toggle');
    else selectPage(index, 'replace');
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>): void => {
    e.dataTransfer.setData(DRAG_TYPE, String(index));
    if (multiActiveOnThis) {
      e.dataTransfer.setData(DRAG_TYPE_MULTI, String(selectionSize));
      // Browsers snapshot the source element as the drag image at dragstart;
      // `::after`-injected content isn't always captured reliably, so we
      // build a small canvas with the count badge baked in and hand it to
      // setDragImage. The element still gets the .dragging-multi class so
      // its in-place styling (faded opacity) remains.
      const el = wrapRef.current;
      if (el) {
        el.dataset.dragCount = String(selectionSize);
        el.classList.add('dragging-multi');
        const dragImage = makeMultiDragImage(el, selectionSize);
        if (dragImage) {
          // Anchor the cursor near the top-left corner of the synthetic image.
          e.dataTransfer.setDragImage(dragImage, 16, 16);
        }
      }
    }
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragEnd = (): void => {
    const el = wrapRef.current;
    if (el) {
      el.classList.remove('dragging-multi');
      delete el.dataset.dragCount;
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const below = e.clientY - rect.top > rect.height / 2;
    setDropHint(below ? 'below' : 'above');
  };

  const onDragLeave = (): void => {
    setDropHint(null);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    const isMulti = e.dataTransfer.getData(DRAG_TYPE_MULTI).length > 0;
    setDropHint(null);
    if (!raw) return;
    e.preventDefault();
    const from = Number.parseInt(raw, 10);
    if (!Number.isFinite(from)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const below = e.clientY - rect.top > rect.height / 2;
    if (isMulti) {
      // Drop the whole selected block at the slot under the cursor.
      const target = below ? index + 1 : index;
      moveSelectedPagesTo(target);
      return;
    }
    if (from === index) return;
    let to = below ? index + 1 : index;
    if (from < to) to -= 1;
    movePage(from, to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectPage(index, 'replace');
    }
  };

  if (!page) return <></>;

  const hintClass = dropHint === 'above'
    ? 'drop-above'
    : dropHint === 'below'
      ? 'drop-below'
      : '';

  // When the raster hasn't been produced yet, give the canvas an aspect-ratio
  // driven height + stretch-to-wrap width so scroll heights stay stable
  // during lazy render-in. Once shouldRender flips, renderPage sets explicit
  // CSS width/height inline on the element and these styles are ignored.
  const canvasStyle: CSSProperties = !shouldRender && placeholderRatio
    ? { width: '100%', aspectRatio: `${1} / ${placeholderRatio}` }
    : {};

  // Bulk-aware action handlers / labels — when the hovered page is part of a
  // multi-selection the rotate/delete buttons operate on the whole selection.
  const rotateLabel = multiActiveOnThis
    ? `Rotate ${selectionSize} selected pages`
    : `Rotate page ${index + 1}`;
  const deleteLabel = multiActiveOnThis
    ? `Delete ${selectionSize} selected pages`
    : `Delete page ${index + 1}`;
  const rotateTitle = multiActiveOnThis ? `Rotate ${selectionSize} pages` : 'Rotate';
  const deleteTitle = multiActiveOnThis ? `Delete ${selectionSize} pages` : 'Delete';
  const rotateAction = (): void => {
    if (multiActiveOnThis) rotateSelectedPages();
    else rotatePage(index);
  };
  const deleteAction = (): void => {
    if (multiActiveOnThis) deleteSelectedPages();
    else deletePage(index);
  };

  const selectedClass = isSelected ? 'selected' : '';

  return (
    <div
      ref={wrapRef}
      role="option"
      tabIndex={0}
      aria-selected={isSelected}
      className={`thumb ${isActive ? 'active' : ''} ${selectedClass} ${hintClass}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      onKeyDown={onKeyDown}
      aria-label={`Page ${index + 1}${isActive ? ', current page' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <canvas ref={canvasRef} style={canvasStyle} />
      <div className="thumb-num">{index + 1}</div>
      {multiActiveOnThis && <div className="thumb-select-badge" aria-hidden="true">{selectionSize}</div>}
      <div className="thumb-actions">
        {!multiActiveOnThis && (
          <button
            type="button"
            title="Move up"
            aria-label={`Move page ${index + 1} up`}
            onClick={stop(() => movePage(index, index - 1))}
          >
            ↑
          </button>
        )}
        <button
          type="button"
          title={rotateTitle}
          aria-label={rotateLabel}
          onClick={stop(rotateAction)}
        >
          ↻
        </button>
        <button
          type="button"
          className="delete"
          title={deleteTitle}
          aria-label={deleteLabel}
          onClick={stop(deleteAction)}
        >
          ✕
        </button>
        {!multiActiveOnThis && (
          <button
            type="button"
            title="Move down"
            aria-label={`Move page ${index + 1} down`}
            onClick={stop(() => movePage(index, index + 1))}
          >
            ↓
          </button>
        )}
      </div>
    </div>
  );
}
