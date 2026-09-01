import { describe, expect, it, vi } from 'vitest';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import type { ShortcutsDeps } from './shortcuts';
import { createLockSession } from './db/lockSession';
import type { BrowserWindow } from 'electron';

interface FakeWindow {
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  webContents: { send: ReturnType<typeof vi.fn> };
}

function fakeWindow(): FakeWindow {
  return {
    show: vi.fn(),
    focus: vi.fn(),
    webContents: { send: vi.fn() },
  };
}

// Captures every (accelerator, callback) pair `register` receives, keyed by
// accelerator, so a test can invoke a specific shortcut's callback directly
// — exactly how these fire for real once Electron's globalShortcut calls
// back into this code, but without needing the real (unavailable-under-
// Vitest) electron module.
function fakeDeps(window: FakeWindow | null): {
  deps: ShortcutsDeps;
  callbacks: Map<string, () => void>;
} {
  const callbacks = new Map<string, () => void>();
  return {
    callbacks,
    deps: {
      register: vi.fn((accelerator: string, callback: () => void) => {
        callbacks.set(accelerator, callback);
        return true;
      }),
      unregisterAll: vi.fn(),
      getWindow: vi.fn(() => window as unknown as BrowserWindow | null),
    },
  };
}

describe('registerGlobalShortcuts', () => {
  it('registers Ctrl+Shift+N/F/L for new-note/focus-search/quick-lock', () => {
    const { deps, callbacks } = fakeDeps(fakeWindow());
    registerGlobalShortcuts(createLockSession(), deps);

    expect(callbacks.has('CommandOrControl+Shift+N')).toBe(true);
    expect(callbacks.has('CommandOrControl+Shift+F')).toBe(true);
    expect(callbacks.has('CommandOrControl+Shift+L')).toBe(true);
  });

  it('new-note brings the window forward and sends the new-note action', () => {
    const window = fakeWindow();
    const { deps, callbacks } = fakeDeps(window);
    registerGlobalShortcuts(createLockSession(), deps);

    callbacks.get('CommandOrControl+Shift+N')!();

    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(window.webContents.send).toHaveBeenCalledWith('storynote:shortcuts:trigger', 'new-note');
  });

  it('focus-search sends the focus-search action', () => {
    const window = fakeWindow();
    const { deps, callbacks } = fakeDeps(window);
    registerGlobalShortcuts(createLockSession(), deps);

    callbacks.get('CommandOrControl+Shift+F')!();

    expect(window.webContents.send).toHaveBeenCalledWith(
      'storynote:shortcuts:trigger',
      'focus-search',
    );
  });

  it('quick-lock clears the LockSession before notifying the renderer', () => {
    const window = fakeWindow();
    const { deps, callbacks } = fakeDeps(window);
    const lockSession = createLockSession();
    lockSession.unlock(1);
    lockSession.unlock(2);
    registerGlobalShortcuts(lockSession, deps);

    callbacks.get('CommandOrControl+Shift+L')!();

    expect(lockSession.isUnlocked(1)).toBe(false);
    expect(lockSession.isUnlocked(2)).toBe(false);
    expect(window.webContents.send).toHaveBeenCalledWith(
      'storynote:shortcuts:trigger',
      'quick-lock',
    );
  });

  it('does nothing (no throw) if no window exists when a shortcut fires', () => {
    const { deps, callbacks } = fakeDeps(null);
    registerGlobalShortcuts(createLockSession(), deps);

    expect(() => callbacks.get('CommandOrControl+Shift+N')!()).not.toThrow();
  });
});

describe('unregisterGlobalShortcuts', () => {
  it('calls unregisterAll', () => {
    const { deps } = fakeDeps(fakeWindow());
    unregisterGlobalShortcuts(deps);
    expect(deps.unregisterAll).toHaveBeenCalled();
  });
});
