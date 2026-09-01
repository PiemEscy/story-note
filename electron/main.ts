import { app, shell, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import type Database from 'better-sqlite3-multiple-ciphers';
import icon from '../resources/icon.png?asset';
import { openDatabase } from './db/index';
import { PasswordRequiredError, resolveEncryptionKey } from './db/keys';
import { getBooleanSetting, setSetting } from './db/settings';
import type { LockSession } from './db/lockSession';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { getSavedWindowBounds, saveWindowBounds } from './windowBounds';
import { createTray } from './tray';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';
import { syncLoginItemSetting } from './loginItem';
import { showNotification } from './notifications';

let db: Database.Database | undefined;
// Set only by the app's own before-quit (fired for every real quit path —
// the tray's Quit item, Alt+F4-then-confirm equivalents, app.quit() calls,
// OS shutdown/logoff) — the window's own 'close' handler checks this to
// decide whether a close is "hide to tray" or "actually quit".
let isQuitting = false;
// Shown once per app run, not once per hide — repeatedly telling the user
// "still running in the background" every time they close the window would
// be noise, not information, after the first time.
let hasShownTrayNotification = false;

// Debounced (not on every intermediate resize/move frame — that's dozens of
// writes/sec while dragging) persistence of settings.window_bounds.
const BOUNDS_SAVE_DELAY_MS = 500;

function createWindow(): void {
  const bounds = db ? getSavedWindowBounds(db) : undefined;
  const startMinimized = db ? getBooleanSetting(db, 'start_minimized') : false;
  const alwaysOnTop = db ? getBooleanSetting(db, 'always_on_top') : false;

  const window = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 800,
    x: bounds?.x,
    y: bounds?.y,
    // Sidebar view's three panes each have their own min-width floor now
    // (Sidebar.tsx 180px, NoteList.tsx's Sidebar-view branch 240px,
    // EditorPanel.tsx 300px) — genuinely shrinkable down to those floors
    // rather than permanently rigid or (EditorPanel's original bug) able to
    // collapse to 0 width via flex-basis:0% before its siblings even
    // reached their own floors. 180+240+300 = 720px combined; below that,
    // no CSS reflow strategy keeps the 3-pane desktop layout usable without
    // clipping content with no way to see it (a mobile-style single-pane
    // layout would be a different app, not "responsive" for this one).
    // 760x360 keeps a small usable margin above that floor. windowBounds.ts's
    // own validation already refuses to persist/return anything smaller.
    minWidth: 760,
    minHeight: 360,
    alwaysOnTop,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.on('ready-to-show', () => {
    // Start minimized (settings.start_minimized) — skips the initial show()
    // rather than showing then immediately hiding, so there's no visible
    // flash on launch (architecture.md: "Custom flag checked on
    // app.whenReady(), skips initial show()").
    if (!startMinimized) {
      window.show();
    }
  });

  let saveBoundsTimeout: ReturnType<typeof setTimeout> | null = null;
  const scheduleSaveBounds = (): void => {
    if (!db) return;
    if (saveBoundsTimeout) clearTimeout(saveBoundsTimeout);
    saveBoundsTimeout = setTimeout(() => {
      if (!db || window.isDestroyed()) return;
      saveWindowBounds(db, window.getBounds());
    }, BOUNDS_SAVE_DELAY_MS);
  };
  window.on('resize', scheduleSaveBounds);
  window.on('move', scheduleSaveBounds);

  // System tray's "restore from tray" (Phase 10) only means something if
  // closing the window doesn't end the app run — the X button hides to tray
  // instead of quitting, same as most tray-resident Windows apps. Only a
  // real quit (isQuitting, set by the app's own before-quit below) lets the
  // close proceed normally.
  window.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    window.hide();
    if (!hasShownTrayNotification) {
      hasShownTrayNotification = true;
      showNotification({
        title: 'StoryNote',
        body: 'Still running in the background — click the tray icon to reopen.',
      });
    }
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
}

// Opens the encrypted database and registers every IPC handler against it.
// Returns the LockSession registerIpcHandlers created (shared with the
// quick-lock global shortcut below) on success, or undefined (having
// already shown the user a clear error and quit) if the database can't be
// opened, so callers know not to proceed to createWindow().
function initializeDatabase(): LockSession | undefined {
  const userDataPath = app.getPath('userData');

  try {
    const key = resolveEncryptionKey(userDataPath);
    db = openDatabase({ userDataPath, key });
  } catch (error) {
    if (error instanceof PasswordRequiredError) {
      // No master-password unlock screen exists yet (Phase 11) — this can
      // only be reached once Settings adds a way to enable password mode,
      // which it doesn't yet. Fail loudly and clearly rather than silently
      // proceeding with no database.
      dialog.showErrorBox(
        'StoryNote',
        'This database is protected by a master password, but the unlock screen is not implemented yet.',
      );
    } else {
      console.error('[main] failed to open database', error);
      dialog.showErrorBox(
        'StoryNote',
        'Failed to open the local database. Check the logs for details.',
      );
    }
    return undefined;
  }

  return registerIpcHandlers(db);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.storynote.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const lockSession = initializeDatabase();
  if (!lockSession || !db) {
    app.quit();
    return;
  }

  createWindow();
  // Custom deps rather than tray.ts's default: its own defaultDeps has no
  // way to persist a toggle (it only knows about BrowserWindow, not this
  // module's `db`) — without this, "Always on Top" would change the live
  // window but silently revert on the next launch, only ever matching
  // whatever settings.always_on_top happened to already say.
  createTray({
    getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
    isAlwaysOnTop: () => BrowserWindow.getAllWindows()[0]?.isAlwaysOnTop() ?? false,
    setAlwaysOnTop: (value) => {
      BrowserWindow.getAllWindows()[0]?.setAlwaysOnTop(value);
      if (db) setSetting(db, 'always_on_top', String(value));
    },
    quit: () => app.quit(),
  });
  syncLoginItemSetting(db);
  registerGlobalShortcuts(lockSession);

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  unregisterGlobalShortcuts();
  db?.close();
});

app.on('window-all-closed', () => {
  // Deliberately not calling app.quit() here anymore: with the tray active
  // the app is meant to keep running with no visible window (that's the
  // point of "restore from tray") — the tray's own Quit item (or any other
  // real quit path) is what sets isQuitting and lets window-close proceed
  // to actually destroy the window, which is what triggers this event in
  // the first place; there's nothing left to additionally quit for here.
});
