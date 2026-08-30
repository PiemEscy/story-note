import { NOTE_SORT_FIELDS, SORT_DIRECTIONS } from '../db/notes';
import type { NoteSortField, SortDirection } from '../db/notes';

// Every function here throws on invalid input; handlers wrap their whole
// body in toIpcResult() (electron/ipc/types.ts), so a thrown validation
// error becomes a clean { ok: false, message } response, never a raw
// SQLite error from a malformed query (per the Phase 1 review note this
// item exists to close).

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  return value;
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireString(value, field);
}

export function optionalNullableString(value: unknown, field: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return requireString(value, field);
}

// Distinguishes "not provided" (undefined — leave the label unchanged) from
// "explicitly cleared" (null) from anything else (invalid) — matches
// notes.ts's updateNote/labels.ts's assignLabelToNote semantics.
export function optionalNullableNumber(value: unknown, field: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return requireNumber(value, field);
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

export function optionalSortField(value: unknown): NoteSortField | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !(NOTE_SORT_FIELDS as readonly string[]).includes(value)) {
    throw new Error(`sortBy must be one of: ${NOTE_SORT_FIELDS.join(', ')}`);
  }
  return value as NoteSortField;
}

export function optionalSortDirection(value: unknown): SortDirection | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !(SORT_DIRECTIONS as readonly string[]).includes(value)) {
    throw new Error(`sortDirection must be one of: ${SORT_DIRECTIONS.join(', ')}`);
  }
  return value as SortDirection;
}
