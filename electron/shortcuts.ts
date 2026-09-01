import { globalShortcut, BrowserWindow } from 'electron';
import type { LockSession } from './db/lockSession';
import { IPC_CHANNELS } from './ipc/channels';

export type ShortcutAction = 'new-note' | 'focus-search' | 'quick-lock';

// Accelerator strings per Electron's own format (CommandOrControl maps to
// Ctrl on Windows/Linux, Cmd on macOS — this app targets Windows, but the
// mapping is free). Shift-prefixed to avoid colliding with a plain
// Ctrl+letter shortcut some other already-running app might have claimed —
// these fire globally, regardless of which window has focus.
const SHORTCUTS: Record<string, ShortcutAction> = {
  'CommandOrControl+Shift+N': 'new-note',
  'CommandOrControl+Shift+F': 'focus-search',
  'CommandOrControl+Shift+L': 'quick-lock',
};

// register/unregisterAll are injected (rather than calling the real
// electron.globalShortcut directly) so this is unit-testable — under
// Vitest, `electron` resolves to a path string, not the real module, same
// reasoning as notesHandlers.ts's ExportDeps. getWindow is a thunk (not a
// captured window reference) since the shortcut can fire long after
// registration, and the window it should act on is whichever one is
// current then, not whichever existed at registration time.
export interface ShortcutsDeps {
  register: (accelerator: string, callback: () => void) => boolean;
  unregisterAll: () => void;
  getWindow: () => BrowserWindow | null;
}

const defaultDeps: ShortcutsDeps = {
  register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
  unregisterAll: () => globalShortcut.unregisterAll(),
  getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
};

// Registers all three global shortcuts. Each one brings the window to the
// foreground (useful on its own if the app was minimized to tray — Phase
// 10's tray/start-minimized items — and necessary regardless, since firing
// an action the user can't see happen isn't useful feedback) before telling
// the renderer what happened. quick-lock additionally clears the
// LockSession server-side *before* notifying the renderer, so by the time
// the renderer asks for anything again every previously-unlocked note is
// already genuinely re-redacted, not just hidden client-side.
export function registerGlobalShortcuts(
  lockSession: LockSession,
  deps: ShortcutsDeps = defaultDeps,
): void {
  for (const [accelerator, action] of Object.entries(SHORTCUTS)) {
    deps.register(accelerator, () => {
      if (action === 'quick-lock') {
        lockSession.lockAll();
      }
      const window = deps.getWindow();
      if (!window) return;
      window.show();
      window.focus();
      window.webContents.send(IPC_CHANNELS.shortcuts.trigger, action);
    });
  }
}

export function unregisterGlobalShortcuts(deps: ShortcutsDeps = defaultDeps): void {
  deps.unregisterAll();
}
