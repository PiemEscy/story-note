import { describe, expect, it } from 'vitest';
import { previewText } from './notePreview';
import type { PublicNoteRow } from '../services/notesService';

function note(overrides: Partial<PublicNoteRow> = {}): PublicNoteRow {
  return {
    id: 1,
    title: 'Untitled',
    content: '',
    content_plain: '',
    label_id: null,
    is_pinned: 0,
    is_archived: 0,
    is_locked: 0,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    deleted_at: null,
    ...overrides,
  };
}

describe('previewText', () => {
  // FR-5.3 — a locked note's content must never appear in a list/grid/table
  // preview, regardless of what content_plain actually holds, unless it's
  // been unlocked for this app session (Phase 8).
  it('hides content for a locked, not-yet-unlocked note even if content_plain is non-empty', () => {
    expect(previewText(note({ is_locked: 1, content_plain: 'secret plans' }), false)).toBe(
      'Locked note',
    );
  });

  it('shows real content_plain for a locked note once unlocked this session', () => {
    expect(previewText(note({ is_locked: 1, content_plain: 'secret plans' }), true)).toBe(
      'secret plans',
    );
  });

  it('shows a placeholder for an unlocked note with empty content', () => {
    expect(previewText(note({ content_plain: '   ' }), false)).toBe('No additional text');
  });

  it('shows trimmed content_plain for a normal unlocked note', () => {
    expect(previewText(note({ content_plain: '  Meeting notes for Q3  ' }), false)).toBe(
      'Meeting notes for Q3',
    );
  });
});
