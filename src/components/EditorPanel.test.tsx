import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPanel from './EditorPanel';
import { useNoteStore } from '../store/useNoteStore';
import { useUIStore } from '../store/useUIStore';
import type { PublicNoteRow } from '../services/notesService';

// NoteEditor.tsx is where ADR-002's TransformPopup actually mounts
// (alongside the real TipTap EditorContent) — stubbing it here, rather than
// letting a real TipTap editor construct in jsdom, keeps this test focused
// on the one thing it needs to prove: whether NoteEditor (and therefore
// TransformPopup, which only ever exists as its child) is placed in the
// render tree at all for a locked note. useNoteEditor.test.ts already
// avoids constructing a real editor in jsdom for the same reason.
vi.mock('../editor/NoteEditor', () => ({
  default: () => <div data-testid="note-editor-mounted" />,
}));
vi.mock('../editor/useNoteEditor', () => ({
  useNoteEditor: vi.fn(() => null),
}));

function note(overrides: Partial<PublicNoteRow> = {}): PublicNoteRow {
  return {
    id: 1,
    title: 'Bank & account recovery codes',
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

beforeEach(() => {
  useUIStore.setState({ view: 'sidebar', isNoteDetailOpen: false });
  useNoteStore.setState({
    notes: [],
    activeNoteId: null,
    filter: 'active',
    unlockedNoteIds: new Set(),
    error: null,
  });
});

describe('the transform popup is unreachable on a locked note (ADR-002)', () => {
  it('does not mount the editor (or its TransformPopup child) for a locked, not-yet-unlocked note', () => {
    const lockedNote = note({ id: 1, is_locked: 1 });
    useNoteStore.setState({ notes: [lockedNote], activeNoteId: 1, unlockedNoteIds: new Set() });

    render(<EditorPanel />);

    // LockedNotePanel is shown instead — no selectable text ever reaches
    // the DOM, so there is nothing for a bubble-menu selection popup to
    // attach to.
    expect(screen.getByText(/this note is locked/i)).toBeInTheDocument();
    expect(screen.queryByTestId('note-editor-mounted')).not.toBeInTheDocument();
  });

  it('mounts the editor once the same note is unlocked this session', () => {
    const note1 = note({ id: 1, is_locked: 1 });
    useNoteStore.setState({ notes: [note1], activeNoteId: 1, unlockedNoteIds: new Set([1]) });

    render(<EditorPanel />);

    expect(screen.queryByText(/this note is locked/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('note-editor-mounted')).toBeInTheDocument();
  });

  it('mounts the editor normally for a note that was never locked', () => {
    const note1 = note({ id: 1, is_locked: 0 });
    useNoteStore.setState({ notes: [note1], activeNoteId: 1 });

    render(<EditorPanel />);

    expect(screen.getByTestId('note-editor-mounted')).toBeInTheDocument();
  });
});
