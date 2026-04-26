/*
 * Rotation-aware coord conversion.
 *
 * Annotations are stored in page-native space:
 *   - origin = top-left of the page at 0° rotation
 *   - units = PDF points (1pt = 1/72")
 *   - y-axis points down (SVG convention), Y-flip happens at save time
 *
 * Display space is the annotation-canvas pixel space:
 *   - origin = top-left of the rotated viewport
 *   - units = CSS pixels at the current display scale
 *
 * The viewport the renderer hands us already has rotation baked in, so
 * display-space width/height swap on 90°/270°. The transform below
 * accounts for that.
 */

export interface PageNativeSize {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  const r = ((rotation % 360) + 360) % 360;
  if (r === 0 || r === 90 || r === 180 || r === 270) {
    return r as 0 | 90 | 180 | 270;
  }
  return 0;
}

export function displayToPageNative(
  point: Point,
  pageSize: PageNativeSize,
  rotation: number,
  displayScale: number
): Point {
  const r = normalizeRotation(rotation);
  const px = point.x / displayScale;
  const py = point.y / displayScale;
  const { width: w, height: h } = pageSize;
  switch (r) {
    case 0:
      return { x: px, y: py };
    case 90:
      return { x: py, y: w - px };
    case 180:
      return { x: w - px, y: h - py };
    case 270:
      return { x: h - py, y: px };
  }
}

export function pageNativeToDisplay(
  point: Point,
  pageSize: PageNativeSize,
  rotation: number,
  displayScale: number
): Point {
  const r = normalizeRotation(rotation);
  const { width: w, height: h } = pageSize;
  const { x: nx, y: ny } = point;
  let dx: number;
  let dy: number;
  switch (r) {
    case 0:
      dx = nx;
      dy = ny;
      break;
    case 90:
      dx = w - ny;
      dy = nx;
      break;
    case 180:
      dx = w - nx;
      dy = h - ny;
      break;
    case 270:
      dx = ny;
      dy = h - nx;
      break;
  }
  return { x: dx * displayScale, y: dy * displayScale };
}

export function pageNativeBboxToDisplayRect(
  rect: Rect,
  pageSize: PageNativeSize,
  rotation: number,
  displayScale: number
): Rect {
  const r = normalizeRotation(rotation);
  const { width: w, height: h } = pageSize;
  let x1: number;
  let y1: number;
  let x2: number;
  let y2: number;
  switch (r) {
    case 0:
      x1 = rect.x;
      y1 = rect.y;
      x2 = rect.x + rect.w;
      y2 = rect.y + rect.h;
      break;
    case 90:
      x1 = w - (rect.y + rect.h);
      y1 = rect.x;
      x2 = w - rect.y;
      y2 = rect.x + rect.w;
      break;
    case 180:
      x1 = w - (rect.x + rect.w);
      y1 = h - (rect.y + rect.h);
      x2 = w - rect.x;
      y2 = h - rect.y;
      break;
    case 270:
      x1 = rect.y;
      y1 = h - (rect.x + rect.w);
      x2 = rect.y + rect.h;
      y2 = h - rect.x;
      break;
  }
  return {
    x: x1 * displayScale,
    y: y1 * displayScale,
    w: (x2 - x1) * displayScale,
    h: (y2 - y1) * displayScale
  };
}
