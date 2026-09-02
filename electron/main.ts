import { app, shell, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import type Database from 'better-sqlite3-multiple-ciphers';
import icon from '../resources/icon.png?asset';
import { openDatabase } from './db/index';
import { PasswordRequiredError, resolveEncryptionKey } from './db/keys';
import { getBooleanSetting, setSetting } from './db/settings';
import { registerAppHandlers } from './ipc/appHandlers';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';
import { registerKeyModeHandlers } from './ipc/keyModeHandlers';
import { registerWindowHandlers } from './ipc/windowHandlers';
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
    // Set unconditionally, not just on Linux — a packaged Windows/macOS
    // build gets its icon from the embedded build/icon.ico|icns instead, so
    // this line is redundant there, but without it an unpackaged dev-mode
    // run (npm run dev) shows Electron's own default icon in the title bar
    // and taskbar instead of StoryNote's.
    icon,
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

// Finishes startup once the database is open — whether that happened
// immediately below (OS mode, the common case) or only later, once the
// renderer's unlock screen submitted the correct master password
// (tryUnlock). Registers every IPC handler that needs `db`, the tray,
// login-item sync, and global shortcuts. tryUnlock guards against calling
// this twice in one run — ipcMain.handle throws if a channel is registered
// a second time.
function completeStartup(database: Database.Database): void {
  db = database;
  const lockSession = registerIpcHandlers(db);
  registerKeyModeHandlers(db, app.getPath('userData'));
  registerWindowHandlers(db);
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

  // Password mode (ADR-001): createWindow() below may already have run with
  // no `db` yet available (to show the unlock screen at all — see
  // app.whenReady()'s try/catch), so it fell back to default bounds and
  // always-on-top=false. Now that the settings table is reachable, reconcile
  // that already-created window with whatever was actually persisted. In the
  // common OS-mode path this is a no-op: completeStartup() finishes before
  // createWindow() is ever called there, so there's no window yet to
  // correct. start_minimized is deliberately not reapplied here — the window
  // has to be visible for the user to type their password in the first
  // place, and no tray exists yet at that point to restore it from if it
  // were hidden now.
  const existingWindow = BrowserWindow.getAllWindows()[0];
  if (existingWindow) {
    existingWindow.setBounds(getSavedWindowBounds(db));
    existingWindow.setAlwaysOnTop(getBooleanSetting(db, 'always_on_top'));
  }
}

// Called once from app.whenReady() below, then again from tryUnlock() if
// the first attempt found the database in password mode. Throws
// PasswordRequiredError in that case — the caller treats that as "show the
// unlock screen instead", not a real failure.
function openWithOsKey(): Database.Database {
  const userDataPath = app.getPath('userData');
  const key = resolveEncryptionKey(userDataPath);
  return openDatabase({ userDataPath, key });
}

// Wired to appHandlers.ts's storynote:app:unlock, called by the renderer's
// unlock screen (ADR-001's password mode — ipc/keyModeHandlers.ts is the
// other half, switching *into* this mode from an already-running app).
// Throws 'Incorrect password' on any failure — a wrong password fails
// inside openDatabase() itself (SQLCipher rejects a mis-keyed file) as some
// raw SQLite error, not something worth showing verbatim to the user. The
// real error is still logged first (rather than swallowed, code-style.md):
// most failures here really are a wrong password, but a corrupt
// storynote.keymeta.json or a disk-level problem would surface identically
// to the user otherwise, with no way to tell it apart from "you forgot your
// password" — which ADR-001 makes explicit has no recovery path.
function tryUnlock(password: string): void {
  if (db) return; // already unlocked — a stale/duplicate submit, not an error
  const userDataPath = app.getPath('userData');
  let database: Database.Database;
  try {
    const key = resolveEncryptionKey(userDataPath, password);
    database = openDatabase({ userDataPath, key });
  } catch (error) {
    console.error('[main] failed to unlock database', error);
    throw new Error('Incorrect password');
  }
  completeStartup(database);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.storynote.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Registered unconditionally, before we know whether the database needs a
  // password — every other IPC channel (notes, labels, settings, search,
  // key mode) only exists once completeStartup() has run, which might not
  // happen until the renderer submits the correct password below.
  registerAppHandlers({
    isLocked: () => db === undefined,
    unlock: tryUnlock,
  });

  try {
    completeStartup(openWithOsKey());
  } catch (error) {
    if (!(error instanceof PasswordRequiredError)) {
      console.error('[main] failed to open database', error);
      dialog.showErrorBox(
        'StoryNote',
        'Failed to open the local database. Check the logs for details.',
      );
      app.quit();
      return;
    }
    // Password mode is active — createWindow() below still runs; the
    // renderer sees storynote:app:is-locked -> true and shows the unlock
    // screen instead of the normal app until tryUnlock() succeeds.
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  unregisterGlobalShortcuts();
  db?.close();
  // Every other guard in this file (scheduleSaveBounds's `if (!db) return`,
  // createWindow's `db ? ... : undefined`) assumes `db` goes falsy once
  // closed — without this, a debounced saveBoundsTimeout already scheduled
  // by a resize/move in the last BOUNDS_SAVE_DELAY_MS still fires after
  // db.close() above, finds `db` truthy (just no longer open), and crashes
  // the main process trying to write to a closed connection.
  db = undefined;
});

app.on('window-all-closed', () => {
  // Deliberately not calling app.quit() here anymore: with the tray active
  // the app is meant to keep running with no visible window (that's the
  // point of "restore from tray") — the tray's own Quit item (or any other
  // real quit path) is what sets isQuitting and lets window-close proceed
  // to actually destroy the window, which is what triggers this event in
  // the first place; there's nothing left to additionally quit for here.
});
