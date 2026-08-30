import { app, shell, BrowserWindow, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import type Database from 'better-sqlite3-multiple-ciphers';
import icon from '../resources/icon.png?asset';
import { openDatabase } from './db/index';
import { PasswordRequiredError, resolveEncryptionKey } from './db/keys';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';

let db: Database.Database | undefined;

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Opens the encrypted database and registers every IPC handler against it.
// Returns false (having already shown the user a clear error and quit) if
// the database can't be opened, so callers know not to proceed to
// createWindow().
function initializeDatabase(): boolean {
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
    return false;
  }

  registerIpcHandlers(db);
  return true;
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.storynote.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  if (!initializeDatabase()) {
    app.quit();
    return;
  }

  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  db?.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
