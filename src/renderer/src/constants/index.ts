import type { Color } from '../types';

export const COLORS: Array<{ value: Color; name: string }> = [
  { value: '#fde047', name: 'Yellow' },
  { value: '#86efac', name: 'Green' },
  { value: '#f9a8d4', name: 'Pink' },
  { value: '#93c5fd', name: 'Blue' },
  { value: '#000000', name: 'Black' },
  { value: '#ef4444', name: 'Red' }
];

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.2;
export const ZOOM_DEFAULT = 1.2;

export const RENDER_SCALE = 1.5;
// Thumbnail base render scale, picked to cover the sidebar's ~210px
// content-width for a standard letter page (612pt × 0.4 ≈ 245 CSS px)
// with a small margin before downscale kicks in. DPR is multiplied in at
// render time — this number is the CSS-space zoom only.
export const THUMB_SCALE = 0.4;
export const DRAW_SIZE = 2;
