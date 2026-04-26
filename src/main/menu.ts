import { app, BrowserWindow, dialog, Menu, MenuItemConstructorOptions, shell } from 'electron';
import { clearRecents, getRecents, removeRecent, type RecentFile } from './store';
import { promises as fs } from 'fs';

function showAboutDialog(window: BrowserWindow): void {
  const detail = [
    `Version ${app.getVersion()}`,
    `Electron ${process.versions.electron}`,
    `Chromium ${process.versions.chrome}`,
    '',
    '© 2026 Nik Hammer-Ellis'
  ].join('\n');
  void dialog.showMessageBox(window, {
    type: 'info',
    title: 'About Parchment',
    message: 'Parchment',
    detail,
    buttons: ['OK'],
    defaultId: 0
  });
}

export type MenuCommand =
  | 'file:open'
  | 'file:merge'
  | 'file:save'
  | 'file:save-as'
  | 'file:export-annotations'
  | 'file:open-path'
  | 'edit:undo'
  | 'edit:redo'
  | 'edit:delete-annotation'
  | 'edit:find'
  | 'view:zoom-in'
  | 'view:zoom-out'
  | 'view:zoom-reset'
  | 'view:zoom-fit-width'
  | 'view:zoom-fit-page'
  | 'view:zoom-actual'
  | 'view:command-palette'
  | 'view:toggle-notes'
  | 'view:toggle-focus-mode'
  | 'page:rotate'
  | 'page:delete'
  | 'page:next'
  | 'page:prev';

export interface MenuCommandPayload {
  command: MenuCommand;
  arg?: string;
}

function send(window: BrowserWindow, command: MenuCommand, arg?: string): void {
  const payload: MenuCommandPayload = { command, arg };
  window.webContents.send('menu:command', payload);
}

function buildRecentSubmenu(window: BrowserWindow): MenuItemConstructorOptions[] {
  const recents = getRecents();
  if (recents.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }];
  }
  const items: MenuItemConstructorOptions[] = recents.map((r: RecentFile) => ({
    label: r.name,
    click: async (): Promise<void> => {
      try {
        await fs.access(r.path);
        send(window, 'file:open-path', r.path);
      } catch {
        removeRecent(r.path);
        rebuildMenu(window);
      }
    }
  }));
  items.push({ type: 'separator' });
  items.push({
    label: 'Clear Recent',
    click: (): void => {
      clearRecents();
      rebuildMenu(window);
    }
  });
  return items;
}

export function buildMenu(window: BrowserWindow): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: (): void => send(window, 'file:open')
        },
        {
          label: 'Open Recent',
          submenu: buildRecentSubmenu(window)
        },
        {
          label: 'Merge PDF…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: (): void => send(window, 'file:merge')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: (): void => send(window, 'file:save')
        },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: (): void => send(window, 'file:save-as')
        },
        {
          label: 'Export Annotations…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: (): void => send(window, 'file:export-annotations')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: (): void => send(window, 'edit:undo')
        },
        {
          // Windows/Linux convention also accepts Ctrl+Y — the renderer handles
          // that accelerator directly (Electron menu items only support a
          // single accelerator).
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: (): void => send(window, 'edit:redo')
        },
        { type: 'separator' },
        {
          label: 'Delete Annotation',
          accelerator: 'Delete',
          click: (): void => send(window, 'edit:delete-annotation')
        },
        { type: 'separator' },
        {
          label: 'Find…',
          accelerator: 'CmdOrCtrl+F',
          click: (): void => send(window, 'edit:find')
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: (): void => send(window, 'view:zoom-in')
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: (): void => send(window, 'view:zoom-out')
        },
        {
          label: 'Fit Page',
          accelerator: 'CmdOrCtrl+0',
          click: (): void => send(window, 'view:zoom-fit-page')
        },
        {
          label: 'Fit Width',
          click: (): void => send(window, 'view:zoom-fit-width')
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+1',
          click: (): void => send(window, 'view:zoom-actual')
        },
        { type: 'separator' },
        {
          label: 'Notes Panel',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: (): void => send(window, 'view:toggle-notes')
        },
        {
          label: 'Focus Mode',
          accelerator: 'F',
          click: (): void => send(window, 'view:toggle-focus-mode')
        },
        { type: 'separator' },
        {
          label: 'Next Page',
          accelerator: 'CmdOrCtrl+Right',
          click: (): void => send(window, 'page:next')
        },
        {
          label: 'Previous Page',
          accelerator: 'CmdOrCtrl+Left',
          click: (): void => send(window, 'page:prev')
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Page',
      submenu: [
        {
          label: 'Rotate 90°',
          accelerator: 'CmdOrCtrl+R',
          click: (): void => send(window, 'page:rotate')
        },
        {
          label: 'Delete Page',
          accelerator: 'CmdOrCtrl+Backspace',
          click: (): void => send(window, 'page:delete')
        }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: (): void => send(window, 'view:command-palette')
        },
        { type: 'separator' },
        {
          label: 'Learn More',
          click: async (): Promise<void> => {
            await shell.openExternal('https://github.com/nikhammerellis/parchment');
          }
        },
        // Win/Linux only — macOS uses the app-menu `role: 'about'` item instead.
        ...(isMac
          ? []
          : ([
              { type: 'separator' as const },
              {
                label: 'About Parchment',
                click: (): void => showAboutDialog(window)
              }
            ] as MenuItemConstructorOptions[]))
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

export function rebuildMenu(window: BrowserWindow): void {
  buildMenu(window);
}
