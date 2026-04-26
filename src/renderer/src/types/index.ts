import type { PDFDocumentProxy } from 'pdfjs-dist';

export type Tool = 'select' | 'highlight' | 'draw' | 'erase';

export type Color = '#fde047' | '#86efac' | '#f9a8d4' | '#93c5fd' | '#000000' | '#ef4444';

/*
 * Annotations are stored in page-native coordinates (PDF points, origin
 * top-left at 0° rotation, y-down). Render + save both convert at use-time.
 *
 * `id` is a UUID stamped at creation; the margin notes panel uses it to track
 * annotations across reorders/edits without depending on array index. `note`
 * is an optional user-attached text note (set via the panel).
 */
export interface AnnotationBase {
  id: string;
  note?: string;
}

export interface HighlightAnnotation extends AnnotationBase {
  type: 'highlight';
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawAnnotation extends AnnotationBase {
  type: 'draw';
  color: string;
  size: number;
  points: Array<[number, number]>;
}

export type Annotation = HighlightAnnotation | DrawAnnotation;

export interface InProgressHighlight {
  type: 'highlight';
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  _startX: number;
  _startY: number;
}

export interface InProgressDraw {
  type: 'draw';
  color: string;
  size: number;
  points: Array<[number, number]>;
}

export type InProgressAnnotation = InProgressHighlight | InProgressDraw;

export interface PdfSource {
  bytes: Uint8Array;
  pdfjsDoc: PDFDocumentProxy;
}

export interface PageEntry {
  sourceKey: string;
  srcIndex: number;
  rotation: number;
  annotations: Annotation[];
  // Native page size in PDF points, at rotation=0. Cached at load/merge time
  // so placeholder .page-wrap boxes can be sized without rasterizing.
  nativeSize: { width: number; height: number };
}

export interface ToastMessage {
  id: number;
  text: string;
  isError: boolean;
  duration?: number;
}

export interface AnnotationSelection {
  pageIndex: number;
  index: number;
}

export type ZoomMode = 'custom' | 'fit-width' | 'fit-page' | 'actual';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export interface OutlineNode {
  title: string;
  pageIndex: number | null;
  children: OutlineNode[];
}

export interface FindBbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FindMatch {
  pageIndex: number;
  bboxes: FindBbox[];
}

export interface FindState {
  isOpen: boolean;
  query: string;
  matches: FindMatch[];
  currentMatch: number; // -1 when no matches
  isSearching: boolean;
}
