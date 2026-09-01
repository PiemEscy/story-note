import { ipcMain } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { assignLabelToNote, createLabel, deleteLabel, listLabels, updateLabel } from '../db/labels';
import type { LockSession } from '../db/lockSession';
import type { LabelRow } from '../db/types';
import { IPC_CHANNELS } from './channels';
import { toIpcResult } from './types';
import type { IpcResult } from './types';
import { toPublicNote } from './notesHandlers';
import type { PublicNoteRow } from './notesHandlers';
import {
  isRecord,
  optionalNullableNumber,
  optionalNullableString,
  optionalString,
  requireNumber,
  requireString,
} from './validation';

export function handleCreate(db: Database.Database, input: unknown): IpcResult<LabelRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    return createLabel(db, {
      name: requireString(input.name, 'name'),
      color: optionalNullableString(input.color, 'color'),
    });
  });
}

export function handleList(db: Database.Database): IpcResult<LabelRow[]> {
  return toIpcResult(() => listLabels(db));
}

export function handleUpdate(db: Database.Database, input: unknown): IpcResult<LabelRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const id = requireNumber(input.id, 'id');
    return updateLabel(db, id, {
      name: optionalString(input.name, 'name'),
      color: optionalNullableString(input.color, 'color'),
    });
  });
}

export function handleDelete(db: Database.Database, input: unknown): IpcResult<void> {
  return toIpcResult(() => deleteLabel(db, requireNumber(input, 'id')));
}

export function handleAssign(
  db: Database.Database,
  lockSession: LockSession,
  input: unknown,
): IpcResult<PublicNoteRow> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const noteId = requireNumber(input.noteId, 'noteId');
    const labelId = optionalNullableNumber(input.labelId, 'labelId');
    if (labelId === undefined) {
      throw new Error('labelId must be a number or null');
    }
    // Organizational, not content — assignable without unlocking (same
    // carve-out schema.md documents for archive/soft-delete on a locked
    // note). The response is still redacted per the usual lock rule if the
    // note isn't unlocked this session.
    const updated = assignLabelToNote(db, noteId, labelId);
    return toPublicNote(updated, lockSession.isUnlocked(noteId));
  });
}

export function registerLabelsHandlers(db: Database.Database, lockSession: LockSession): void {
  ipcMain.handle(IPC_CHANNELS.labels.create, (_event, input) => handleCreate(db, input));
  ipcMain.handle(IPC_CHANNELS.labels.list, () => handleList(db));
  ipcMain.handle(IPC_CHANNELS.labels.update, (_event, input) => handleUpdate(db, input));
  ipcMain.handle(IPC_CHANNELS.labels.delete, (_event, input) => handleDelete(db, input));
  ipcMain.handle(IPC_CHANNELS.labels.assign, (_event, input) =>
    handleAssign(db, lockSession, input),
  );
}
