import { useCallback, useEffect } from 'react';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { PageView } from './components/PageView';
import { EmptyState } from './components/EmptyState';
import { Toast } from './components/Toast';
import { CommandPalette } from './components/CommandPalette';
import { FindBar } from './components/FindBar';
import { MarginNotes } from './components/MarginNotes';
import { usePdfStore } from './state/pdfStore';
import { useKeyboard } from './hooks/useKeyboard';
import { useDropZone } from './hooks/useDropZone';
import { useFitZoom } from './hooks/useFitZoom';
import { useFocusModeIdle } from './hooks/useFocusModeIdle';
import { useWindowTitle } from './hooks/useWindowTitle';
import { buildSavedPdf } from './lib/pdfSave';

export function App(): JSX.Element {
  const hasPages = usePdfStore((s) => s.pages.length > 0);
  const loadPdf = usePdfStore((s) => s.loadPdf);
  const mergePdf = usePdfStore((s) => s.mergePdf);
  const showToast = usePdfStore((s) => s.showToast);
  const marginNotesOpen = usePdfStore((s) => s.marginNotesOpen);
  const focusMode = usePdfStore((s) => s.focusMode);

  useFitZoom();
  useFocusModeIdle();
  useWindowTitle();

  useEffect(() => {
    document.body.classList.toggle('focus-mode', focusMode);
  }, [focusMode]);

  const openPdf = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.openPdf();
      if (result.canceled || !result.bytes || !result.fileName) return;
      await loadPdf(result.bytes, result.fileName, result.filePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Couldn't open: ${message}`, true);
    }
  }, [loadPdf, showToast]);

  const openPath = useCallback(
    async (path: string): Promise<void> => {
      try {
        const result = await window.api.openPath({ path });
        if (result.canceled || !result.bytes || !result.fileName) return;
        await loadPdf(result.bytes, result.fileName, result.filePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        showToast(`Couldn't open: ${message}`, true);
      }
    },
    [loadPdf, showToast]
  );

  const mergePdfAction = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.openPdf();
      if (result.canceled || !result.bytes || !result.fileName) return;
      await mergePdf(result.bytes, result.fileName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Couldn't merge: ${message}`, true);
    }
  }, [mergePdf, showToast]);

  const savePdf = useCallback(async (): Promise<void> => {
    const state = usePdfStore.getState();
    if (state.pages.length === 0) {
      window.api.saveComplete(false);
      return;
    }
    showToast('Building PDF…');
    try {
      const bytes = await buildSavedPdf({
        sources: state.sources,
        pages: state.pages
      });
      const base = (state.fileName ?? 'document').replace(/\.pdf$/i, '');
      const result = await window.api.savePdf({
        defaultName: `${base}.edited.pdf`,
        bytes
      });
      if (result.canceled) {
        showToast('Save canceled');
        window.api.saveComplete(false);
        return;
      }
      usePdfStore.getState().markSaved();
      showToast(`Saved to ${result.filePath}`);
      window.api.saveComplete(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      showToast(`Couldn't save: ${message}`, true);
      window.api.saveComplete(false);
    }
  }, [showToast]);

  useKeyboard({ onSave: savePdf });
  useDropZone({ onFile: (bytes, name) => loadPdf(bytes, name, null) });

  useEffect(() => {
    const unsubscribe = window.api.onMenuCommand((command, arg) => {
      const store = usePdfStore.getState();
      switch (command) {
        case 'file:open':
          void openPdf();
          break;
        case 'file:open-path':
          if (arg) void openPath(arg);
          break;
        case 'file:merge':
          if (store.pages.length > 0) void mergePdfAction();
          break;
        case 'file:save':
        case 'file:save-as':
          void savePdf();
          break;
        case 'view:zoom-in':
          store.zoomIn();
          break;
        case 'view:zoom-out':
          store.zoomOut();
          break;
        case 'view:zoom-reset':
        case 'view:zoom-actual':
          store.setZoomMode('actual');
          break;
        case 'view:zoom-fit-width':
          store.setZoomMode('fit-width');
          break;
        case 'view:zoom-fit-page':
          store.setZoomMode('fit-page');
          break;
        case 'view:command-palette':
          store.setCommandPaletteOpen(!store.commandPaletteOpen);
          break;
        case 'view:toggle-notes':
          store.toggleMarginNotes();
          break;
        case 'view:toggle-focus-mode':
          store.toggleFocusMode();
          break;
        case 'file:export-annotations':
          if (store.pages.length > 0) void store.exportAnnotations();
          break;
        case 'page:next':
          store.nextPage();
          break;
        case 'page:prev':
          store.prevPage();
          break;
        case 'page:rotate':
          if (store.pages.length > 0) store.rotatePage(store.currentPage);
          break;
        case 'page:delete':
          if (store.pages.length > 0) store.deletePage(store.currentPage);
          break;
        case 'edit:undo':
          store.undo();
          break;
        case 'edit:redo':
          store.redo();
          break;
        case 'edit:delete-annotation':
          if (store.selectedAnnotation) store.deleteSelectedAnnotation();
          break;
        case 'edit:find':
          if (store.pages.length > 0) {
            if (store.findState.isOpen) store.closeFind();
            else store.openFind();
          }
          break;
      }
    });
    return unsubscribe;
  }, [openPdf, openPath, mergePdfAction, savePdf]);

  return (
    <div id="app" className={marginNotesOpen ? 'with-margin-notes' : ''}>
      <a href="#main" className="skip-link">Skip to content</a>
      <TopBar onOpen={openPdf} onMerge={mergePdfAction} onSave={savePdf} />
      <Toolbar />
      <Sidebar />
      <main id="main">
        <FindBar />
        <PageView />
      </main>
      <MarginNotes />
      {!hasPages && <EmptyState onOpen={openPdf} onOpenPath={openPath} />}
      <Toast />
      <CommandPalette
        onOpen={openPdf}
        onMerge={mergePdfAction}
        onSave={savePdf}
        onOpenPath={openPath}
      />
    </div>
  );
}
