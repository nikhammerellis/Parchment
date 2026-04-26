import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { promises as fs } from 'fs';
import { basename } from 'path';
import {
  addRecent,
  clearRecents,
  getRecents,
  removeRecent,
  type RecentFile
} from './store';
import { rebuildMenu } from './menu';

export interface OpenPdfResult {
  canceled: boolean;
  filePath: string | null;
  fileName: string | null;
  bytes: Uint8Array | null;
}

export interface SavePdfResult {
  canceled: boolean;
  filePath: string | null;
}

export interface SavePdfRequest {
  defaultName: string;
  bytes: Uint8Array;
}

export interface SaveMarkdownRequest {
  defaultName: string;
  content: string;
}

export interface SaveMarkdownResult {
  canceled: boolean;
  filePath: string | null;
}

export interface OpenPathRequest {
  path: string;
}

function window_(event: {
  sender: Electron.WebContents;
}): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender);
}

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:open-pdf', async (event): Promise<OpenPdfResult> => {
    const window = window_(event);
    if (!window) {
      return { canceled: true, filePath: null, fileName: null, bytes: null };
    }

    const result = await dialog.showOpenDialog(window, {
      title: 'Open PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, filePath: null, fileName: null, bytes: null };
    }

    const filePath = result.filePaths[0];
    try {
      const buffer = await fs.readFile(filePath);
      const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const name = basename(filePath);
      addRecent({ path: filePath, name, openedAt: Date.now() });
      rebuildMenu(window);
      return {
        canceled: false,
        filePath,
        fileName: name,
        bytes
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read PDF at ${filePath}: ${message}`);
    }
  });

  ipcMain.handle(
    'fs:open-path',
    async (event, request: OpenPathRequest): Promise<OpenPdfResult> => {
      const window = window_(event);
      try {
        const buffer = await fs.readFile(request.path);
        const bytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
        const name = basename(request.path);
        addRecent({ path: request.path, name, openedAt: Date.now() });
        if (window) rebuildMenu(window);
        return { canceled: false, filePath: request.path, fileName: name, bytes };
      } catch (err) {
        // If the file is gone, prune it from recents and surface a canceled result.
        removeRecent(request.path);
        if (window) rebuildMenu(window);
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to read PDF at ${request.path}: ${message}`);
      }
    }
  );

  ipcMain.handle(
    'dialog:save-pdf',
    async (event, request: SavePdfRequest): Promise<SavePdfResult> => {
      const window = window_(event);
      if (!window) {
        return { canceled: true, filePath: null };
      }

      const result = await dialog.showSaveDialog(window, {
        title: 'Save PDF',
        defaultPath: request.defaultName,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true, filePath: null };
      }

      try {
        await fs.writeFile(result.filePath, Buffer.from(request.bytes));
        return { canceled: false, filePath: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to write PDF to ${result.filePath}: ${message}`);
      }
    }
  );

  ipcMain.handle(
    'dialog:save-markdown',
    async (event, request: SaveMarkdownRequest): Promise<SaveMarkdownResult> => {
      const window = window_(event);
      if (!window) {
        return { canceled: true, filePath: null };
      }

      const result = await dialog.showSaveDialog(window, {
        title: 'Export Annotations',
        defaultPath: request.defaultName,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true, filePath: null };
      }

      try {
        await fs.writeFile(result.filePath, request.content, 'utf8');
        return { canceled: false, filePath: result.filePath };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to write markdown to ${result.filePath}: ${message}`);
      }
    }
  );

  ipcMain.handle('recents:get', async (): Promise<RecentFile[]> => {
    return getRecents();
  });

  ipcMain.handle('recents:clear', async (event): Promise<RecentFile[]> => {
    const window = window_(event);
    const next = clearRecents();
    if (window) rebuildMenu(window);
    return next;
  });

  ipcMain.handle(
    'shell:open-external',
    async (_event, url: string): Promise<boolean> => {
      if (typeof url !== 'string') return false;
      const lower = url.toLowerCase();
      if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
        return false;
      }
      await shell.openExternal(url);
      return true;
    }
  );

  ipcMain.handle('dialog:confirm-discard', async (event): Promise<boolean> => {
    const window = window_(event);
    if (!window) return false;
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Discard & Open', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'You have unsaved changes. Discard and open the new file?'
    });
    return choice === 0;
  });

  ipcMain.on('window:set-dirty', (event, dirty: boolean) => {
    const window = window_(event);
    if (!window) return;
    window.setDocumentEdited(Boolean(dirty));
    // Expose it to the main process so the close guard can read it.
    (window as BrowserWindow & { __parchmentDirty?: boolean }).__parchmentDirty = Boolean(dirty);
  });

  ipcMain.on('window:save-complete', (event, ok: boolean) => {
    const window = window_(event);
    if (!window) return;
    const flagged = window as BrowserWindow & {
      __parchmentSaveResolve?: (ok: boolean) => void;
    };
    flagged.__parchmentSaveResolve?.(Boolean(ok));
    flagged.__parchmentSaveResolve = undefined;
  });
}
