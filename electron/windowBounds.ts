import type Database from 'better-sqlite3-multiple-ciphers';
import { getSetting, setSetting } from './db/settings';

// Matches BrowserWindow's own minWidth/minHeight (electron/main.ts) — a
// persisted value smaller than these (e.g. from a corrupted/hand-edited
// settings row) would otherwise reach the BrowserWindow constructor and get
// silently clamped up on some platforms, silently ignored on others; simpler
// to just distrust that value at the source and fall back to the default.
const MIN_WIDTH = 760;
const MIN_HEIGHT = 360;

export interface WindowBounds {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export const DEFAULT_WINDOW_BOUNDS: WindowBounds = { width: 1200, height: 800 };

function isValidBounds(value: unknown): value is WindowBounds {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.width !== 'number' || candidate.width < MIN_WIDTH) return false;
  if (typeof candidate.height !== 'number' || candidate.height < MIN_HEIGHT) return false;
  if (candidate.x !== undefined && typeof candidate.x !== 'number') return false;
  if (candidate.y !== undefined && typeof candidate.y !== 'number') return false;
  return true;
}

// Reads settings.window_bounds (schema.md) — falls back to
// DEFAULT_WINDOW_BOUNDS for a missing, corrupt, or implausibly small
// persisted value rather than letting a bad row wedge the window at an
// unusable size on next launch.
export function getSavedWindowBounds(db: Database.Database): WindowBounds {
  const raw = getSetting(db, 'window_bounds');
  if (!raw) return DEFAULT_WINDOW_BOUNDS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_WINDOW_BOUNDS;
  }

  return isValidBounds(parsed) ? parsed : DEFAULT_WINDOW_BOUNDS;
}

export function saveWindowBounds(db: Database.Database, bounds: WindowBounds): void {
  setSetting(db, 'window_bounds', JSON.stringify(bounds));
}
