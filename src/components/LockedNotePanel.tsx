import { useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import { LockIcon } from './icons';

interface LockedNotePanelProps {
  noteId: number;
  noteTitle: string;
}

// storynote-ui-reference.html's #lockedPanel — shown by EditorPanel.tsx in
// place of the real title/toolbar/body for a locked note that hasn't been
// unlocked yet this session (Phase 8's "Unlock flow"). The password never
// leaves this component except as an argument to unlockNote(); nothing here
// renders the note's actual content — that only exists once the store's
// notes array is replaced with the unredacted row the IPC call returns.
function LockedNotePanel({ noteId, noteTitle }: LockedNotePanelProps): React.JSX.Element {
  const unlockNote = useNoteStore((state) => state.unlockNote);
  const error = useNoteStore((state) => state.error);
  const clearError = useNoteStore((state) => state.clearError);

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!password) return;
    clearError();
    setIsSubmitting(true);
    const succeeded = await unlockNote(noteId, password);
    setIsSubmitting(false);
    if (!succeeded) {
      setPassword('');
    }
  };

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-1 flex-col items-center justify-center gap-3.5 p-10"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
        <LockIcon className="h-[22px] w-[22px]" />
      </div>
      <h3 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">
        {noteTitle || 'Untitled'}
      </h3>
      <p className="m-0 max-w-[260px] text-center text-[12.5px] text-[var(--text-tertiary)]">
        This note is locked. Enter the password to view its content.
      </p>
      <div className="mt-1.5 flex w-60 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
        <LockIcon className="h-[13px] w-[13px] shrink-0 text-[var(--text-tertiary)]" />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter password"
          autoFocus
          className="w-full border-0 bg-transparent font-mono text-sm tracking-[2px] text-[var(--text-primary)] outline-none"
        />
      </div>
      {error && (
        <p className="m-0 max-w-[260px] text-center text-[12px] text-[#DC2626]" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!password || isSubmitting}
        className="w-60 rounded-md bg-[var(--accent)] px-4.5 py-2 text-[12.5px] font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        Unlock note
      </button>
    </form>
  );
}

export default LockedNotePanel;
