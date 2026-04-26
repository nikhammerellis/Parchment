import { create } from 'zustand';
import type {
  Annotation,
  AnnotationSelection,
  Color,
  FindMatch,
  FindState,
  OutlineNode,
  PageEntry,
  PdfSource,
  Tool,
  ToastMessage,
  ViewportSize,
  ZoomMode
} from '../types';
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '../constants';
import { loadPdfDocument } from '../lib/pdfjs';
import { buildOutline } from '../lib/outline';
import { findInDocument } from '../lib/find';
import { clearTextContentCache } from '../lib/textContentCache';
import { scrollToPage as scrollToPageChannel } from '../lib/scrollController';
import {
  cloneSnapshot,
  emptyHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type HistorySnapshot,
  type HistoryState
} from './history';

/*
 * State shape, preserved from the prototype:
 *   sources: Record<sourceKey, { bytes, pdfjsDoc }>
 *   pages: Array<{ sourceKey, srcIndex, rotation, annotations }>
 *
 * Pages reference their source by key + original index so that merge,
 * reorder, rotate, and save can all operate against the raw source bytes
 * without intermediate re-encoding.
 *
 * Wave 2 adds: history, dirty flag, annotation selection, zoom mode/viewport,
 * outline cache, command-palette visibility.
 */

export type SelectMode = 'replace' | 'toggle' | 'range';

export interface PdfState {
  sources: Record<string, PdfSource>;
  pages: PageEntry[];
  currentPage: number;
  scale: number;
  zoomMode: ZoomMode;
  viewport: ViewportSize;
  tool: Tool;
  color: Color;
  fileName: string | null;
  filePath: string | null;
  toast: ToastMessage | null;
  history: HistoryState;
  dirty: boolean;
  selectedAnnotation: AnnotationSelection | null;
  selectedPages: Set<number>;
  selectionAnchor: number | null;
  outline: OutlineNode[];
  commandPaletteOpen: boolean;
  marginNotesOpen: boolean;
  focusMode: boolean;
  findState: FindState;

  loadPdf: (bytes: Uint8Array, fileName: string, filePath: string | null) => Promise<void>;
  mergePdf: (bytes: Uint8Array, fileName: string) => Promise<void>;
  movePage: (from: number, to: number) => void;
  rotatePage: (index: number) => void;
  deletePage: (index: number) => void;
  selectPage: (index: number, mode: SelectMode) => void;
  clearPageSelection: () => void;
  deleteSelectedPages: () => void;
  rotateSelectedPages: () => void;
  moveSelectedPagesTo: (targetIndex: number) => void;
  addAnnotation: (pageIndex: number, annotation: Annotation) => void;
  clearAnnotations: (pageIndex: number) => void;
  deleteSelectedAnnotation: () => void;
  deleteAnnotationById: (pageIndex: number, id: string) => void;
  updateAnnotationNote: (pageIndex: number, id: string, note: string) => void;
  selectAnnotation: (selection: AnnotationSelection | null) => void;
  selectAnnotationById: (pageIndex: number, id: string) => void;
  setTool: (tool: Tool) => void;
  setColor: (color: Color) => void;
  setScale: (scale: number) => void;
  setZoomMode: (mode: ZoomMode) => void;
  setViewport: (viewport: ViewportSize) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  goToPage: (index: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  // Reaction-only focal page setter, called by PageView's scroll IO. Unlike
  // goToPage/next/prev it does NOT request a programmatic scroll.
  setFocalPage: (index: number) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setMarginNotesOpen: (open: boolean) => void;
  toggleMarginNotes: () => void;
  setFocusMode: (on: boolean) => void;
  toggleFocusMode: () => void;
  exportAnnotations: () => Promise<void>;
  openFind: () => void;
  closeFind: () => void;
  setFindQuery: (query: string) => void;
  nextMatch: () => void;
  prevMatch: () => void;
  showToast: (text: string, isError?: boolean, duration?: number) => void;
  dismissToast: (id: number) => void;
  reset: () => void;
}

const initialFindState: FindState = {
  isOpen: false,
  query: '',
  matches: [],
  currentMatch: -1,
  isSearching: false
};

let toastCounter = 0;
let findDebounceHandle: number | null = null;
let findAbort: AbortController | null = null;

function cancelFindInFlight(): void {
  if (findDebounceHandle !== null) {
    window.clearTimeout(findDebounceHandle);
    findDebounceHandle = null;
  }
  if (findAbort) {
    findAbort.abort();
    findAbort = null;
  }
}

function firstMatchOnOrAfter(matches: FindMatch[], pageIndex: number): number {
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].pageIndex >= pageIndex) return i;
  }
  return matches.length > 0 ? 0 : -1;
}

function isPasswordException(err: unknown): boolean {
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name?: unknown }).name;
    if (typeof name === 'string' && name === 'PasswordException') return true;
  }
  return false;
}

function takeSnapshot(state: PdfState): HistorySnapshot {
  return {
    sourceKeys: Object.keys(state.sources),
    pages: state.pages,
    currentPage: state.currentPage,
    fileName: state.fileName,
    filePath: state.filePath,
    selectedAnnotation: state.selectedAnnotation
  };
}

function applySnapshot(
  state: PdfState,
  snap: HistorySnapshot
): Partial<PdfState> {
  const available = state.sources;
  const validSources: Record<string, PdfSource> = {};
  for (const key of snap.sourceKeys) {
    if (available[key]) validSources[key] = available[key];
  }
  const pages = snap.pages.filter((p) => validSources[p.sourceKey]);
  const currentPage = Math.min(snap.currentPage, Math.max(0, pages.length - 1));
  return {
    sources: validSources,
    pages,
    currentPage,
    fileName: snap.fileName,
    filePath: snap.filePath,
    selectedAnnotation: snap.selectedAnnotation
  };
}

// Remap a selection set after a sorted-ascending list of indices have been
// spliced out of `pages`. Indices below a deleted slot stay; the deleted
// slot itself drops out; indices above shift down by the count of deleted
// indices below them.
function remapSelectionAfterDeletes(
  selection: Set<number>,
  deletedSorted: number[]
): Set<number> {
  if (selection.size === 0 || deletedSorted.length === 0) return selection;
  const deletedSet = new Set(deletedSorted);
  const next = new Set<number>();
  for (const idx of selection) {
    if (deletedSet.has(idx)) continue;
    let shift = 0;
    for (const d of deletedSorted) {
      if (d < idx) shift += 1;
      else break;
    }
    next.add(idx - shift);
  }
  return next;
}

function remapAnchorAfterDeletes(
  anchor: number | null,
  deletedSorted: number[]
): number | null {
  if (anchor === null) return null;
  if (deletedSorted.includes(anchor)) return null;
  let shift = 0;
  for (const d of deletedSorted) {
    if (d < anchor) shift += 1;
    else break;
  }
  return anchor - shift;
}

function remapSelectionAfterMove(
  selection: Set<number>,
  from: number,
  to: number
): Set<number> {
  if (selection.size === 0) return selection;
  const next = new Set<number>();
  for (const idx of selection) next.add(remapIndexAfterMove(idx, from, to));
  return next;
}

function remapAnchorAfterMove(
  anchor: number | null,
  from: number,
  to: number
): number | null {
  if (anchor === null) return null;
  return remapIndexAfterMove(anchor, from, to);
}

function remapIndexAfterMove(idx: number, from: number, to: number): number {
  if (idx === from) return to;
  if (from < to) {
    // Item moved down: indices in (from, to] shift up by 1.
    if (idx > from && idx <= to) return idx - 1;
    return idx;
  }
  // from > to — item moved up: indices in [to, from) shift down by 1.
  if (idx >= to && idx < from) return idx + 1;
  return idx;
}

function pushDirtySnapshot(get: () => PdfState, set: (partial: Partial<PdfState>) => void): void {
  const s = get();
  const snapshot = cloneSnapshot(takeSnapshot(s));
  const history = pushHistory(s.history, snapshot);
  set({ history, dirty: true, selectedAnnotation: null });
  // Notify main of dirty flag for close-guard + macOS edited dot.
  window.api.setDirty(true);
}

export const usePdfStore = create<PdfState>((set, get) => ({
  sources: {},
  pages: [],
  currentPage: 0,
  scale: ZOOM_DEFAULT,
  zoomMode: 'custom',
  viewport: { width: 0, height: 0 },
  tool: 'select',
  color: '#fde047',
  fileName: null,
  filePath: null,
  toast: null,
  history: emptyHistory(),
  dirty: false,
  selectedAnnotation: null,
  selectedPages: new Set<number>(),
  selectionAnchor: null,
  outline: [],
  commandPaletteOpen: false,
  marginNotesOpen: false,
  focusMode: false,
  findState: initialFindState,

  async loadPdf(bytes, fileName, filePath) {
    try {
      const pdfjsDoc = await loadPdfDocument(bytes);
      if (pdfjsDoc.numPages === 0) {
        get().showToast('PDF has no pages', true);
        return;
      }
      const key = `src_${Date.now()}`;
      const pages: PageEntry[] = [];
      for (let i = 0; i < pdfjsDoc.numPages; i++) {
        // Pre-compute native size (no rasterization — just viewport math) so
        // the continuous-scroll placeholder boxes render at the right dims.
        const p = await pdfjsDoc.getPage(i + 1);
        const vp = p.getViewport({ scale: 1, rotation: 0 });
        pages.push({
          sourceKey: key,
          srcIndex: i,
          rotation: 0,
          annotations: [],
          nativeSize: { width: vp.width, height: vp.height }
        });
      }
      cancelFindInFlight();
      clearTextContentCache();
      set({
        sources: { [key]: { bytes, pdfjsDoc } },
        pages,
        currentPage: 0,
        fileName,
        filePath,
        history: emptyHistory(),
        dirty: false,
        selectedAnnotation: null,
        selectedPages: new Set<number>(),
        selectionAnchor: null,
        outline: [],
        findState: initialFindState
      });
      window.api.setDirty(false);
      void buildOutline(pdfjsDoc)
        .then((outline) => set({ outline }))
        .catch(() => set({ outline: [] }));
      get().showToast(`Loaded ${pdfjsDoc.numPages} pages`);
    } catch (err) {
      if (isPasswordException(err)) {
        get().showToast("Password-protected PDFs aren't supported yet", true);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      get().showToast(`Couldn't open this PDF: ${message}`, true);
    }
  },

  async mergePdf(bytes, fileName) {
    try {
      const pdfjsDoc = await loadPdfDocument(bytes);
      const key = `src_${Date.now()}`;
      const added: PageEntry[] = [];
      for (let i = 0; i < pdfjsDoc.numPages; i++) {
        const p = await pdfjsDoc.getPage(i + 1);
        const vp = p.getViewport({ scale: 1, rotation: 0 });
        added.push({
          sourceKey: key,
          srcIndex: i,
          rotation: 0,
          annotations: [],
          nativeSize: { width: vp.width, height: vp.height }
        });
      }
      if (get().findState.isOpen) get().closeFind();
      pushDirtySnapshot(get, (partial) => set(partial));
      set((state) => ({
        sources: { ...state.sources, [key]: { bytes, pdfjsDoc } },
        pages: [...state.pages, ...added]
      }));
      get().showToast(`Merged ${pdfjsDoc.numPages} pages from ${fileName}`);
    } catch (err) {
      if (isPasswordException(err)) {
        get().showToast("Password-protected PDFs aren't supported yet", true);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      get().showToast(`Couldn't merge: ${message}`, true);
    }
  },

  movePage(from, to) {
    const pages = [...get().pages];
    if (to < 0 || to >= pages.length) return;
    if (from < 0 || from >= pages.length) return;
    if (from === to) return;
    if (get().findState.isOpen) get().closeFind();
    pushDirtySnapshot(get, (partial) => set(partial));
    const [removed] = pages.splice(from, 1);
    pages.splice(to, 0, removed);
    set((state) => ({
      pages,
      currentPage: state.currentPage === from ? to : state.currentPage,
      selectedPages: remapSelectionAfterMove(state.selectedPages, from, to),
      selectionAnchor: remapAnchorAfterMove(state.selectionAnchor, from, to)
    }));
  },

  rotatePage(index) {
    const pages = [...get().pages];
    const target = pages[index];
    if (!target) return;
    pushDirtySnapshot(get, (partial) => set(partial));
    pages[index] = {
      ...target,
      rotation: (target.rotation + 90) % 360
      // annotations stay put — they're rotation-independent now.
    };
    set({ pages });
    // Rotation changes the page's on-screen height, which reflows the stack
    // below. Give layout a frame to settle, then re-anchor on the rotated page.
    requestAnimationFrame(() => {
      setTimeout(() => scrollToPageChannel(index, 'start'), 50);
    });
  },

  deletePage(index) {
    const pages = [...get().pages];
    if (pages.length <= 1) {
      get().showToast('Cannot delete the last page', true);
      return;
    }
    if (get().findState.isOpen) get().closeFind();
    pushDirtySnapshot(get, (partial) => set(partial));
    pages.splice(index, 1);
    set((state) => ({
      pages,
      currentPage: state.currentPage >= pages.length ? pages.length - 1 : state.currentPage,
      selectedPages: remapSelectionAfterDeletes(state.selectedPages, [index]),
      selectionAnchor: remapAnchorAfterDeletes(state.selectionAnchor, [index])
    }));
    const focal = get().currentPage;
    requestAnimationFrame(() => {
      setTimeout(() => scrollToPageChannel(focal, 'start'), 50);
    });
  },

  selectPage(index, mode) {
    const state = get();
    if (state.pages.length === 0) return;
    if (index < 0 || index >= state.pages.length) return;
    if (mode === 'replace') {
      const next = new Set<number>([index]);
      set({ selectedPages: next, selectionAnchor: index });
      // Single click also drives the focal page (existing behavior).
      if (state.currentPage !== index) {
        set({ currentPage: index, selectedAnnotation: null });
        scrollToPageChannel(index, 'start');
      }
      return;
    }
    if (mode === 'toggle') {
      const next = new Set(state.selectedPages);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      // Anchor + currentPage unchanged on toggle (per Wave 7 selection model).
      set({ selectedPages: next });
      return;
    }
    // mode === 'range'
    const anchor = state.selectionAnchor ?? index;
    const lo = Math.min(anchor, index);
    const hi = Math.max(anchor, index);
    const next = new Set<number>();
    for (let i = lo; i <= hi; i++) next.add(i);
    // Anchor + currentPage unchanged on shift-extend.
    set({ selectedPages: next });
  },

  clearPageSelection() {
    if (get().selectedPages.size === 0 && get().selectionAnchor === null) return;
    set({ selectedPages: new Set<number>(), selectionAnchor: null });
  },

  deleteSelectedPages() {
    const state = get();
    const sel = state.selectedPages;
    if (sel.size === 0) return;
    if (sel.size >= state.pages.length) {
      state.showToast('Cannot delete all pages', true);
      return;
    }
    if (state.findState.isOpen) state.closeFind();
    pushDirtySnapshot(get, (partial) => set(partial));
    const sortedAsc = Array.from(sel).sort((a, b) => a - b);
    const pages = [...get().pages];
    // Splice descending so indices stay valid as we go.
    for (let i = sortedAsc.length - 1; i >= 0; i--) pages.splice(sortedAsc[i], 1);
    // Pick the next focal: the first surviving page at-or-after the lowest
    // deleted index, clamped to the new tail.
    const focal = Math.min(sortedAsc[0], pages.length - 1);
    set((s) => ({
      pages,
      currentPage: s.currentPage >= pages.length ? pages.length - 1 : s.currentPage,
      selectedPages: new Set<number>(),
      selectionAnchor: null
    }));
    // If the prior focal was inside the deletion, jump to the recovered focal.
    if (sel.has(state.currentPage)) {
      set({ currentPage: focal, selectedAnnotation: null });
      requestAnimationFrame(() => {
        setTimeout(() => scrollToPageChannel(focal, 'start'), 50);
      });
    }
  },

  rotateSelectedPages() {
    const state = get();
    const sel = state.selectedPages;
    if (sel.size === 0) return;
    pushDirtySnapshot(get, (partial) => set(partial));
    const pages = [...get().pages];
    for (const idx of sel) {
      const target = pages[idx];
      if (!target) continue;
      pages[idx] = { ...target, rotation: (target.rotation + 90) % 360 };
    }
    set({ pages });
    const focal = get().currentPage;
    requestAnimationFrame(() => {
      setTimeout(() => scrollToPageChannel(focal, 'start'), 50);
    });
  },

  moveSelectedPagesTo(targetIndex) {
    const state = get();
    const sel = state.selectedPages;
    if (sel.size === 0) return;
    const pages = [...state.pages];
    const total = pages.length;
    const clampedTarget = Math.max(0, Math.min(targetIndex, total));
    const sortedAsc = Array.from(sel).sort((a, b) => a - b);
    // Drops anywhere inside the selected block (between the first selected
    // index and one past the last selected index) are no-ops — the block
    // is "already there." Matches the v1 selection model.
    if (clampedTarget >= sortedAsc[0] && clampedTarget <= sortedAsc[sortedAsc.length - 1] + 1) {
      return;
    }
    if (state.findState.isOpen) state.closeFind();
    pushDirtySnapshot(get, (partial) => set(partial));
    // Extract in original order; descending splice keeps source indices valid.
    const removed: PageEntry[] = [];
    for (let i = sortedAsc.length - 1; i >= 0; i--) {
      const [r] = pages.splice(sortedAsc[i], 1);
      removed.unshift(r);
    }
    // Each removed index < target shifts the insert point down by 1.
    const removedBeforeTarget = sortedAsc.filter((i) => i < clampedTarget).length;
    const adjustedTarget = clampedTarget - removedBeforeTarget;
    pages.splice(adjustedTarget, 0, ...removed);
    const newSelection = new Set<number>();
    for (let i = 0; i < removed.length; i++) newSelection.add(adjustedTarget + i);
    set({
      pages,
      selectedPages: newSelection,
      selectionAnchor: adjustedTarget,
      currentPage: adjustedTarget,
      selectedAnnotation: null
    });
    requestAnimationFrame(() => {
      setTimeout(() => scrollToPageChannel(adjustedTarget, 'start'), 50);
    });
  },

  addAnnotation(pageIndex, annotation) {
    const pages = [...get().pages];
    const target = pages[pageIndex];
    if (!target) return;
    pushDirtySnapshot(get, (partial) => set(partial));
    pages[pageIndex] = {
      ...target,
      annotations: [...target.annotations, annotation]
    };
    set({ pages });
  },

  clearAnnotations(pageIndex) {
    const pages = [...get().pages];
    const target = pages[pageIndex];
    if (!target || target.annotations.length === 0) return;
    pushDirtySnapshot(get, (partial) => set(partial));
    pages[pageIndex] = { ...target, annotations: [] };
    set({ pages });
    get().showToast('Cleared annotations — Ctrl+Z to undo');
  },

  deleteSelectedAnnotation() {
    const sel = get().selectedAnnotation;
    if (!sel) return;
    const pages = [...get().pages];
    const target = pages[sel.pageIndex];
    if (!target) return;
    if (sel.index < 0 || sel.index >= target.annotations.length) return;
    pushDirtySnapshot(get, (partial) => set(partial));
    const annotations = target.annotations.filter((_, i) => i !== sel.index);
    pages[sel.pageIndex] = { ...target, annotations };
    set({ pages, selectedAnnotation: null });
  },

  deleteAnnotationById(pageIndex, id) {
    const pages = [...get().pages];
    const target = pages[pageIndex];
    if (!target) return;
    const idx = target.annotations.findIndex((a) => a.id === id);
    if (idx < 0) return;
    pushDirtySnapshot(get, (partial) => set(partial));
    const annotations = target.annotations.filter((_, i) => i !== idx);
    pages[pageIndex] = { ...target, annotations };
    set({ pages, selectedAnnotation: null });
  },

  updateAnnotationNote(pageIndex, id, note) {
    const pages = [...get().pages];
    const target = pages[pageIndex];
    if (!target) return;
    const idx = target.annotations.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const ann = target.annotations[idx];
    const trimmed = note.trim();
    const currentNote = ann.note ?? '';
    if (currentNote === trimmed) return;
    pushDirtySnapshot(get, (partial) => set(partial));
    const updated: Annotation =
      ann.type === 'highlight'
        ? {
            type: 'highlight',
            id: ann.id,
            color: ann.color,
            x: ann.x,
            y: ann.y,
            w: ann.w,
            h: ann.h,
            ...(trimmed.length > 0 ? { note: trimmed } : {})
          }
        : {
            type: 'draw',
            id: ann.id,
            color: ann.color,
            size: ann.size,
            points: ann.points.map((pt): [number, number] => [pt[0], pt[1]]),
            ...(trimmed.length > 0 ? { note: trimmed } : {})
          };
    const annotations = target.annotations.slice();
    annotations[idx] = updated;
    pages[pageIndex] = { ...target, annotations };
    set({ pages });
  },

  selectAnnotation(selection) {
    set({ selectedAnnotation: selection });
  },

  selectAnnotationById(pageIndex, id) {
    const target = get().pages[pageIndex];
    if (!target) return;
    const idx = target.annotations.findIndex((a) => a.id === id);
    if (idx < 0) return;
    set({ selectedAnnotation: { pageIndex, index: idx } });
  },

  setTool(tool) {
    set({ tool, selectedAnnotation: tool === 'select' ? get().selectedAnnotation : null });
  },

  setColor(color) {
    set({ color });
  },

  setScale(scale) {
    set({ scale: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale)), zoomMode: 'custom' });
  },

  setZoomMode(mode) {
    set({ zoomMode: mode });
  },

  setViewport(viewport) {
    set({ viewport });
  },

  zoomIn() {
    set((state) => ({
      scale: Math.min(ZOOM_MAX, state.scale + ZOOM_STEP),
      zoomMode: 'custom'
    }));
  },

  zoomOut() {
    set((state) => ({
      scale: Math.max(ZOOM_MIN, state.scale - ZOOM_STEP),
      zoomMode: 'custom'
    }));
  },

  resetZoom() {
    set({ scale: ZOOM_DEFAULT, zoomMode: 'custom' });
  },

  goToPage(index) {
    const state = get();
    if (state.pages.length === 0) return;
    const clamped = Math.max(0, Math.min(index, state.pages.length - 1));
    set({ currentPage: clamped, selectedAnnotation: null });
    scrollToPageChannel(clamped, 'start');
  },

  nextPage() {
    const { currentPage, pages } = get();
    if (currentPage < pages.length - 1) {
      const next = currentPage + 1;
      set({ currentPage: next, selectedAnnotation: null });
      scrollToPageChannel(next, 'start');
    }
  },

  prevPage() {
    const { currentPage } = get();
    if (currentPage > 0) {
      const prev = currentPage - 1;
      set({ currentPage: prev, selectedAnnotation: null });
      scrollToPageChannel(prev, 'start');
    }
  },

  setFocalPage(index) {
    const state = get();
    if (state.pages.length === 0) return;
    const clamped = Math.max(0, Math.min(index, state.pages.length - 1));
    if (clamped === state.currentPage) return;
    // Reaction-only: no selection drop, no scroll. Just update the focal idx.
    set({ currentPage: clamped });
  },

  undo() {
    const s = get();
    const current = takeSnapshot(s);
    const { state, snapshot } = undoHistory(s.history, current);
    if (!snapshot) {
      s.showToast('Nothing to undo', false, 1500);
      return;
    }
    const applied = applySnapshot(s, snapshot);
    set({ ...applied, history: state, dirty: state.past.length > 0 });
    window.api.setDirty(state.past.length > 0);
  },

  redo() {
    const s = get();
    const current = takeSnapshot(s);
    const { state, snapshot } = redoHistory(s.history, current);
    if (!snapshot) {
      s.showToast('Nothing to redo', false, 1500);
      return;
    }
    const applied = applySnapshot(s, snapshot);
    set({ ...applied, history: state, dirty: true });
    window.api.setDirty(true);
  },

  markSaved() {
    set({ dirty: false });
    window.api.setDirty(false);
  },

  setCommandPaletteOpen(open) {
    set({ commandPaletteOpen: open });
  },

  setMarginNotesOpen(open) {
    set({ marginNotesOpen: open });
  },

  toggleMarginNotes() {
    set((state) => ({ marginNotesOpen: !state.marginNotesOpen }));
  },

  setFocusMode(on) {
    const wasOn = get().focusMode;
    set({ focusMode: on });
    if (on && !wasOn) get().showToast('Focus mode on — press F to exit');
  },

  toggleFocusMode() {
    const next = !get().focusMode;
    set({ focusMode: next });
    if (next) get().showToast('Focus mode on — press F to exit');
  },

  async exportAnnotations() {
    const state = get();
    if (state.pages.length === 0) return;
    const total = state.pages.reduce((acc, p) => acc + p.annotations.length, 0);
    if (total === 0) {
      state.showToast('No annotations to export', false);
      return;
    }
    const baseName = (state.fileName ?? 'document').replace(/\.pdf$/i, '') || 'document';
    const defaultName = `${baseName}.annotations.md`;
    try {
      const { annotationsToMarkdown } = await import('../lib/exportMarkdown');
      const content = await annotationsToMarkdown(
        state.fileName ?? 'document',
        state.pages,
        state.sources
      );
      const result = await window.api.exportMarkdown(defaultName, content);
      if (result.canceled) {
        get().showToast('Export canceled');
        return;
      }
      get().showToast(`Annotations exported to ${result.filePath}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      get().showToast(`Couldn't export: ${message}`, true);
    }
  },

  openFind() {
    const state = get();
    if (state.pages.length === 0) return;
    set({ findState: { ...state.findState, isOpen: true } });
  },

  closeFind() {
    cancelFindInFlight();
    set({ findState: initialFindState });
  },

  setFindQuery(query) {
    const state = get();
    const trimmed = query;
    // Update the displayed query immediately; the actual search trails behind.
    set({
      findState: {
        ...state.findState,
        query: trimmed,
        isSearching: trimmed.trim().length > 0
      }
    });

    cancelFindInFlight();

    if (trimmed.trim().length === 0) {
      set({
        findState: {
          ...get().findState,
          matches: [],
          currentMatch: -1,
          isSearching: false
        }
      });
      return;
    }

    findDebounceHandle = window.setTimeout(() => {
      findDebounceHandle = null;
      const latest = get();
      if (!latest.findState.isOpen) return;
      const queryAtSearch = latest.findState.query;
      if (queryAtSearch.trim().length === 0) {
        set({
          findState: {
            ...latest.findState,
            matches: [],
            currentMatch: -1,
            isSearching: false
          }
        });
        return;
      }
      const controller = new AbortController();
      findAbort = controller;
      const snapshotPages = latest.pages;
      const snapshotSources = latest.sources;
      const currentPageAtSearch = latest.currentPage;
      void findInDocument(snapshotPages, snapshotSources, queryAtSearch, controller.signal)
        .then((matches) => {
          if (controller.signal.aborted) return;
          const next = get();
          // Ignore stale results if the query changed while searching.
          if (next.findState.query !== queryAtSearch) return;
          const currentMatch =
            matches.length === 0
              ? -1
              : firstMatchOnOrAfter(matches, currentPageAtSearch);
          set({
            findState: {
              ...next.findState,
              matches,
              currentMatch,
              isSearching: false
            }
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          const next = get();
          if (next.findState.query !== queryAtSearch) return;
          set({
            findState: {
              ...next.findState,
              matches: [],
              currentMatch: -1,
              isSearching: false
            }
          });
        });
    }, 200);
  },

  nextMatch() {
    const state = get();
    const { matches, currentMatch } = state.findState;
    if (matches.length === 0) return;
    const next = currentMatch < 0 ? 0 : (currentMatch + 1) % matches.length;
    set({ findState: { ...state.findState, currentMatch: next } });
    const target = matches[next];
    if (!target) return;
    if (target.pageIndex !== state.currentPage) {
      set({ currentPage: target.pageIndex, selectedAnnotation: null });
    }
    scrollToPageChannel(target.pageIndex, 'center');
  },

  prevMatch() {
    const state = get();
    const { matches, currentMatch } = state.findState;
    if (matches.length === 0) return;
    const prev =
      currentMatch < 0
        ? matches.length - 1
        : (currentMatch - 1 + matches.length) % matches.length;
    set({ findState: { ...state.findState, currentMatch: prev } });
    const target = matches[prev];
    if (!target) return;
    if (target.pageIndex !== state.currentPage) {
      set({ currentPage: target.pageIndex, selectedAnnotation: null });
    }
    scrollToPageChannel(target.pageIndex, 'center');
  },

  showToast(text, isError = false, duration) {
    toastCounter += 1;
    set({ toast: { id: toastCounter, text, isError, duration } });
  },

  dismissToast(id) {
    set((state) => (state.toast && state.toast.id === id ? { toast: null } : {}));
  },

  reset() {
    cancelFindInFlight();
    clearTextContentCache();
    set({
      sources: {},
      pages: [],
      currentPage: 0,
      scale: ZOOM_DEFAULT,
      zoomMode: 'custom',
      tool: 'select',
      color: '#fde047',
      fileName: null,
      filePath: null,
      toast: null,
      history: emptyHistory(),
      dirty: false,
      selectedAnnotation: null,
      selectedPages: new Set<number>(),
      selectionAnchor: null,
      outline: [],
      commandPaletteOpen: false,
      marginNotesOpen: false,
      focusMode: false,
      findState: initialFindState
    });
    window.api.setDirty(false);
  }
}));
