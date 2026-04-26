import type { AnnotationSelection, PageEntry } from '../types';

/*
 * Bounded history of snapshot-able store state. `sources` is a live reference
 * to pdf.js documents — we never snapshot it; on undo the store keeps the
 * existing sources map and only restores the snapshotted plain fields.
 */

export interface HistorySnapshot {
  sourceKeys: string[];
  pages: PageEntry[];
  currentPage: number;
  fileName: string | null;
  filePath: string | null;
  selectedAnnotation: AnnotationSelection | null;
}

export interface HistoryState {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
}

const MAX_HISTORY = 50;

export function cloneSnapshot(snap: HistorySnapshot): HistorySnapshot {
  return {
    sourceKeys: [...snap.sourceKeys],
    pages: snap.pages.map((p) => ({
      sourceKey: p.sourceKey,
      srcIndex: p.srcIndex,
      rotation: p.rotation,
      nativeSize: { width: p.nativeSize.width, height: p.nativeSize.height },
      annotations: p.annotations.map((a) =>
        a.type === 'highlight'
          ? {
              type: 'highlight',
              id: a.id,
              note: a.note,
              color: a.color,
              x: a.x,
              y: a.y,
              w: a.w,
              h: a.h
            }
          : {
              type: 'draw',
              id: a.id,
              note: a.note,
              color: a.color,
              size: a.size,
              points: a.points.map((pt): [number, number] => [pt[0], pt[1]])
            }
      )
    })),
    currentPage: snap.currentPage,
    fileName: snap.fileName,
    filePath: snap.filePath,
    selectedAnnotation: snap.selectedAnnotation ? { ...snap.selectedAnnotation } : null
  };
}

export function emptyHistory(): HistoryState {
  return { past: [], future: [] };
}

export function pushHistory(history: HistoryState, snapshot: HistorySnapshot): HistoryState {
  const past = [...history.past, cloneSnapshot(snapshot)];
  if (past.length > MAX_HISTORY) past.shift();
  return { past, future: [] };
}

export function undoHistory(
  history: HistoryState,
  current: HistorySnapshot
): { state: HistoryState; snapshot: HistorySnapshot | null } {
  if (history.past.length === 0) return { state: history, snapshot: null };
  const past = [...history.past];
  const snapshot = past.pop() as HistorySnapshot;
  const future = [cloneSnapshot(current), ...history.future];
  if (future.length > MAX_HISTORY) future.pop();
  return { state: { past, future }, snapshot };
}

export function redoHistory(
  history: HistoryState,
  current: HistorySnapshot
): { state: HistoryState; snapshot: HistorySnapshot | null } {
  if (history.future.length === 0) return { state: history, snapshot: null };
  const future = [...history.future];
  const snapshot = future.shift() as HistorySnapshot;
  const past = [...history.past, cloneSnapshot(current)];
  if (past.length > MAX_HISTORY) past.shift();
  return { state: { past, future }, snapshot };
}
