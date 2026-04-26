/*
 * Catmull-Rom → cubic bezier path. The "1/6" form is the standard smoothing
 * control for uniform Catmull-Rom with tension = 0.5.
 *
 * Endpoints are duplicated: p_{-1} := p_0 and p_{N} := p_{N-1}. This keeps the
 * curve anchored at the start and end without a straight tail.
 */

export function pointsToSvgPath(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const [x, y] = points[0];
    return `M ${fmt(x)} ${fmt(y)}`;
  }
  if (points.length === 2) {
    const [[x0, y0], [x1, y1]] = points;
    return `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)}`;
  }

  const segments: string[] = [];
  segments.push(`M ${fmt(points[0][0])} ${fmt(points[0][1])}`);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    segments.push(
      `C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2[0])} ${fmt(p2[1])}`
    );
  }

  return segments.join(' ');
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '0';
}
