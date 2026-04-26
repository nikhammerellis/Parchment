import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  OpenPdfResult,
  OpenPathRequest,
  SaveMarkdownResult,
  SavePdfResult,
  SavePdfRequest
} from '../main/ipc';
import type { MenuCommand, MenuCommandPayload } from '../main/menu';
import type { RecentFile } from '../main/store';

export interface ParchmentApi {
  openPdf(): Promise<OpenPdfResult>;
  openPath(request: OpenPathRequest): Promise<OpenPdfResult>;
  savePdf(request: SavePdfRequest): Promise<SavePdfResult>;
  exportMarkdown(defaultName: string, content: string): Promise<SaveMarkdownResult>;
  getRecents(): Promise<RecentFile[]>;
  clearRecents(): Promise<RecentFile[]>;
  openExternal(url: string): Promise<boolean>;
  confirmDiscard(): Promise<boolean>;
  setDirty(dirty: boolean): void;
  saveComplete(ok: boolean): void;
  onMenuCommand(handler: (command: MenuCommand, arg?: string) => void): () => void;
  platform: NodeJS.Platform;
}

const api: ParchmentApi = {
  openPdf: () => ipcRenderer.invoke('dialog:open-pdf'),
  openPath: (request) => ipcRenderer.invoke('fs:open-path', request),
  savePdf: (request) => ipcRenderer.invoke('dialog:save-pdf', request),
  exportMarkdown: (defaultName, content) =>
    ipcRenderer.invoke('dialog:save-markdown', { defaultName, content }),
  getRecents: () => ipcRenderer.invoke('recents:get'),
  clearRecents: () => ipcRenderer.invoke('recents:clear'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  confirmDiscard: () => ipcRenderer.invoke('dialog:confirm-discard'),
  setDirty: (dirty) => {
    ipcRenderer.send('window:set-dirty', dirty);
  },
  saveComplete: (ok) => {
    ipcRenderer.send('window:save-complete', ok);
  },
  onMenuCommand: (handler) => {
    const listener = (_event: IpcRendererEvent, payload: MenuCommandPayload): void => {
      handler(payload.command, payload.arg);
    };
    ipcRenderer.on('menu:command', listener);
    return (): void => {
      ipcRenderer.removeListener('menu:command', listener);
    };
  },
  platform: process.platform
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to expose preload API via contextBridge: ${message}`);
  }
} else {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = api;
}
