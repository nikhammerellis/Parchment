import { useEffect } from 'react';
import { usePdfStore } from '../state/pdfStore';

export interface UseDropZoneParams {
  onFile: (bytes: Uint8Array, fileName: string) => void | Promise<void>;
}

export function useDropZone(params: UseDropZoneParams): void {
  const { onFile } = params;

  useEffect(() => {
    const setDragClasses = (dragging: boolean): void => {
      const emptyState = document.getElementById('empty-state');
      const hasPages = usePdfStore.getState().pages.length > 0;
      if (dragging) {
        if (hasPages) {
          document.body.classList.add('drag-over-loaded');
          emptyState?.classList.remove('drag-over');
        } else {
          emptyState?.classList.add('drag-over');
          document.body.classList.remove('drag-over-loaded');
        }
      } else {
        emptyState?.classList.remove('drag-over');
        document.body.classList.remove('drag-over-loaded');
      }
    };

    const onDragEnter = (e: DragEvent): void => {
      e.preventDefault();
      setDragClasses(true);
    };
    const onDragOver = (e: DragEvent): void => {
      e.preventDefault();
      setDragClasses(true);
    };
    const onDragLeave = (e: DragEvent): void => {
      e.preventDefault();
      setDragClasses(false);
    };
    const onDrop = async (e: DragEvent): Promise<void> => {
      e.preventDefault();
      setDragClasses(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (file.type !== 'application/pdf') {
        usePdfStore.getState().showToast('Only PDF files are supported', true);
        return;
      }
      if (usePdfStore.getState().dirty) {
        const confirmed = await window.api.confirmDiscard();
        if (!confirmed) return;
      }
      const buffer = await file.arrayBuffer();
      await onFile(new Uint8Array(buffer), file.name);
    };
    const onDropWrapper = (e: DragEvent): void => {
      void onDrop(e);
    };

    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDropWrapper);

    return (): void => {
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDropWrapper);
      document.body.classList.remove('drag-over-loaded');
    };
  }, [onFile]);
}
