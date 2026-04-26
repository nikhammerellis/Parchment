import { useEffect } from 'react';
import { usePdfStore } from '../state/pdfStore';

/*
 * Mirrors the active document into `document.title`. Electron picks this up
 * automatically and reflects it as the BrowserWindow title (no IPC needed).
 *
 * Format: `${fileName}${dirty ? ' • ' : ''} — Parchment`. With no document:
 * just `Parchment`.
 */

export function useWindowTitle(): void {
  const fileName = usePdfStore((s) => s.fileName);
  const dirty = usePdfStore((s) => s.dirty);

  useEffect(() => {
    if (!fileName) {
      document.title = 'Parchment';
      return;
    }
    document.title = `${fileName}${dirty ? ' • ' : ''} — Parchment`;
  }, [fileName, dirty]);
}
