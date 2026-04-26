import { app, shell, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { registerIpcHandlers } from './ipc';
import { buildMenu } from './menu';

let mainWindow: BrowserWindow | null = null;
// Path captured from launch argv / open-file event before the renderer is
// mounted. Drained once 'did-finish-load' fires.
let pendingOpenPath: string | null = null;

function pickPdfFromArgv(argv: readonly string[]): string | null {
  // Walk backwards: in packaged Win/Linux launches, the file path is the last
  // argument (after the exe). Skip flags and the exe path itself.
  for (let i = argv.length - 1; i > 0; i--) {
    const a = argv[i];
    if (!a || a.startsWith('-')) continue;
    if (a.toLowerCase().endsWith('.pdf')) return a;
  }
  return null;
}

function dispatchOpenPath(window: BrowserWindow, path: string): void {
  window.webContents.send('menu:command', { command: 'file:open-path', arg: path });
}

interface ParchmentWindow extends BrowserWindow {
  __parchmentDirty?: boolean;
  __parchmentSaveResolve?: (ok: boolean) => void;
  __parchmentForceClose?: boolean;
}

function attachCloseGuard(window: ParchmentWindow): void {
  window.on('close', (e) => {
    if (window.__parchmentForceClose) return;
    if (!window.__parchmentDirty) return;
    e.preventDefault();
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Save', 'Discard changes', 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Unsaved changes',
      message: 'You have unsaved changes. Save before closing?'
    });
    if (choice === 2) return; // Cancel

    if (choice === 1) {
      // Don't Save — discard and close.
      window.__parchmentForceClose = true;
      window.close();
      return;
    }

    // Save — ask the renderer to save, then close on confirmation.
    const saveDone = new Promise<boolean>((resolve) => {
      window.__parchmentSaveResolve = resolve;
      window.webContents.send('menu:command', { command: 'file:save' });
    });

    void saveDone.then((ok) => {
      if (!ok) return;
      window.__parchmentForceClose = true;
      window.close();
    });
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: false,
    backgroundColor: '#0a0a0a',
    title: 'Parchment',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  }) as ParchmentWindow;
  mainWindow = window;

  window.on('ready-to-show', () => {
    window.show();
  });

  // Drain any path captured before the renderer mounted. Slight delay so the
  // renderer's onMenuCommand handler is wired up by the time we send.
  window.webContents.on('did-finish-load', () => {
    if (!pendingOpenPath) return;
    const path = pendingOpenPath;
    pendingOpenPath = null;
    setTimeout(() => dispatchOpenPath(window, path), 100);
  });

  window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  buildMenu(window);
  attachCloseGuard(window);
}

// Single-instance lock — when the OS launches Parchment with a PDF while a
// copy is already running, route through 'second-instance' instead of spawning
// a new process. Without this, "Open with Parchment" on a second file would
// spin up a second window on Win/Linux.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const path = pickPdfFromArgv(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (path) dispatchOpenPath(mainWindow, path);
    } else if (path) {
      pendingOpenPath = path;
    }
  });
}

// Capture launch-time path (Win/Linux Open With → app launches with file in argv).
pendingOpenPath = pickPdfFromArgv(process.argv);

// macOS: paths arrive via the open-file event, possibly before app is ready.
app.on('open-file', (event, path) => {
  event.preventDefault();
  if (!path.toLowerCase().endsWith('.pdf')) return;
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    dispatchOpenPath(mainWindow, path);
  } else {
    pendingOpenPath = path;
  }
});

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.nikhammerellis.parchment');

  // macOS About panel — Win/Linux fall through to a manual dialog from the
  // Help menu (see `menu.ts`).
  if (process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: 'Parchment',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: '© 2026 Nik Hammer-Ellis'
    });
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Keep a reference so electron doesn't GC the window.
void mainWindow;
