import { app, BrowserWindow, Menu, Tray } from 'electron';
import icon from '../resources/icon.png?asset';

export interface TrayDeps {
  getWindow: () => BrowserWindow | null;
  isAlwaysOnTop: () => boolean;
  setAlwaysOnTop: (value: boolean) => void;
  quit: () => void;
}

// Shared by the tray's own click handler and its "Open StoryNote" menu item
// — a plain, dependency-injected function (same ExportDeps/ShortcutsDeps
// pattern as elsewhere in electron/) so the restore logic itself is
// unit-testable even though Electron's Tray class has no way to simulate an
// OS-level click from a test (testing.md: tray/menu wiring beyond a basic
// smoke check is "hard to meaningfully unit test" — this is that basic
// check, just isolated from the untestable OS chrome around it).
export function restoreWindow(deps: Pick<TrayDeps, 'getWindow'>): void {
  const window = deps.getWindow();
  if (!window) return;
  window.show();
  window.focus();
}

export function buildTrayMenu(deps: TrayDeps): Menu {
  return Menu.buildFromTemplate([
    { label: 'Open StoryNote', click: () => restoreWindow(deps) },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: deps.isAlwaysOnTop(),
      click: (item) => deps.setAlwaysOnTop(item.checked),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => deps.quit() },
  ]);
}

const defaultDeps: TrayDeps = {
  getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
  isAlwaysOnTop: () => BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop() ?? false,
  setAlwaysOnTop: (value) => BrowserWindow.getAllWindows()[0]?.setAlwaysOnTop(value),
  quit: () => app.quit(),
};

// Creates the real OS tray icon — window-hide-instead-of-close (so there's
// something to restore from) is wired in main.ts, not here, since it's a
// property of the window's own 'close' handler, not of the tray itself.
export function createTray(deps: TrayDeps = defaultDeps): Tray {
  const tray = new Tray(icon);
  tray.setToolTip('StoryNote');
  tray.setContextMenu(buildTrayMenu(deps));
  tray.on('click', () => restoreWindow(deps));
  return tray;
}
