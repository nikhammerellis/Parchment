import type { Annotation, DrawAnnotation, HighlightAnnotation } from '../types';
import type { PageNativeSize, Point } from './rotation';
import { pageNativeBboxToDisplayRect, pageNativeToDisplay } from './rotation';

export interface HitTestContext {
  pageSize: PageNativeSize;
  rotation: number;
  displayScale: number;
}

const HIGHLIGHT_PAD = 2;
const DRAW_THRESHOLD = 6;

export function hitHighlight(
  ann: HighlightAnnotation,
  point: Point,
  ctx: HitTestContext
): boolean {
  const rect = pageNativeBboxToDisplayRect(
    { x: ann.x, y: ann.y, w: ann.w, h: ann.h },
    ctx.pageSize,
    ctx.rotation,
    ctx.displayScale
  );
  return (
    point.x >= rect.x - HIGHLIGHT_PAD &&
    point.x <= rect.x + rect.w + HIGHLIGHT_PAD &&
    point.y >= rect.y - HIGHLIGHT_PAD &&
    point.y <= rect.y + rect.h + HIGHLIGHT_PAD
  );
}

export function hitDraw(ann: DrawAnnotation, point: Point, ctx: HitTestContext): boolean {
  const displayPts = ann.points.map(([x, y]) =>
    pageNativeToDisplay({ x, y }, ctx.pageSize, ctx.rotation, ctx.displayScale)
  );
  const threshold = DRAW_THRESHOLD + ann.size * ctx.displayScale * 0.5;
  for (let i = 1; i < displayPts.length; i++) {
    if (pointToSegmentDistance(point, displayPts[i - 1], displayPts[i]) <= threshold) {
      return true;
    }
  }
  return false;
}

export function hitAnnotation(
  ann: Annotation,
  point: Point,
  ctx: HitTestContext
): boolean {
  return ann.type === 'highlight' ? hitHighlight(ann, point, ctx) : hitDraw(ann, point, ctx);
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const qx = p.x - a.x;
    const qy = p.y - a.y;
    return Math.sqrt(qx * qx + qy * qy);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return Math.sqrt(ex * ex + ey * ey);
}
