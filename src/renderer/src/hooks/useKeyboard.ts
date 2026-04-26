import { useEffect } from 'react';
import { usePdfStore } from '../state/pdfStore';

export interface UseKeyboardParams {
  onSave: () => void | Promise<void>;
}

export function useKeyboard(params: UseKeyboardParams): void {
  const { onSave } = params;

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const mod = e.metaKey || e.ctrlKey;

      // Command palette: always available, even with no pages and inside inputs we
      // only bail on text editing that's not the palette itself (handled by the
      // palette's own Esc close path).
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const state = usePdfStore.getState();
        state.setCommandPaletteOpen(!state.commandPaletteOpen);
        return;
      }

      if (usePdfStore.getState().commandPaletteOpen) {
        // let the palette handle its own keys
        return;
      }

      if (inEditable) return;

      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const state = usePdfStore.getState();
        if (state.pages.length > 0) {
          void onSave();
        }
        return;
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const state = usePdfStore.getState();
        if (e.shiftKey) state.redo();
        else state.undo();
        return;
      }

      // Windows/Linux redo alias — Ctrl+Y. Menu accelerator can only bind one
      // shortcut, so we wire the secondary here.
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        usePdfStore.getState().redo();
        return;
      }

      if (mod && e.key === '0') {
        e.preventDefault();
        usePdfStore.getState().setZoomMode('fit-page');
        return;
      }

      if (mod && e.key === '1') {
        e.preventDefault();
        usePdfStore.getState().setZoomMode('actual');
        return;
      }

      if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const s = usePdfStore.getState();
        if (s.pages.length === 0) return;
        if (s.findState.isOpen) s.closeFind();
        else s.openFind();
        return;
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        usePdfStore.getState().toggleMarginNotes();
        return;
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const s = usePdfStore.getState();
        if (s.pages.length > 0) void s.exportAnnotations();
        return;
      }

      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const s = usePdfStore.getState();
        if (s.pages.length === 0) return;
        if (!s.findState.isOpen) {
          s.openFind();
          return;
        }
        if (e.shiftKey) s.prevMatch();
        else s.nextMatch();
        return;
      }

      const state = usePdfStore.getState();
      if (state.pages.length === 0) return;

      // Sidebar-scoped: Delete/Backspace deletes the page selection (if any),
      // Escape clears it. We check focus container so these don't fire while
      // editing in the page area.
      const ae = document.activeElement as HTMLElement | null;
      const inSidebar = !!ae?.closest('.sidebar-body');
      if (inSidebar && (e.key === 'Delete' || e.key === 'Backspace')) {
        if (state.selectedPages.size > 0) {
          e.preventDefault();
          state.deleteSelectedPages();
          return;
        }
      }
      if (inSidebar && e.key === 'Escape') {
        if (state.selectedPages.size > 0) {
          e.preventDefault();
          state.clearPageSelection();
          return;
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedAnnotation) {
          e.preventDefault();
          state.deleteSelectedAnnotation();
          return;
        }
      }

      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown'
      ) {
        // Leave arrow keys alone when focus is inside an ARIA widget that owns
        // its own arrow-key navigation (sidebar tree/listbox/tablist).
        // The main page-scroll area used to be excluded too — but in Wave 4
        // its arrow/page keys drive page-to-page jumps, so we let them through.
        const ae = document.activeElement as HTMLElement | null;
        const inWidget = ae?.closest(
          '.sidebar-body, [role="tree"], [role="listbox"], [role="tablist"]'
        );
        if (inWidget) return;
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          state.prevPage();
        } else {
          e.preventDefault();
          state.nextPage();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
          state.setTool('select');
          break;
        case 'h':
          state.setTool('highlight');
          break;
        case 'd':
          state.setTool('draw');
          break;
        case 'e':
          state.setTool('erase');
          break;
        case 'f':
          state.toggleFocusMode();
          break;
        case 'r':
          state.rotatePage(state.currentPage);
          break;
        case 'escape':
          if (state.selectedAnnotation) state.selectAnnotation(null);
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return (): void => {
      document.removeEventListener('keydown', handler);
    };
  }, [onSave]);
}
