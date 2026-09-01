import { useState } from 'react';
import { useNoteStore } from '../store/useNoteStore';
import { LockIcon } from './icons';

interface LockNoteModalProps {
  noteId: number;
  // 'lock' sets a brand-new password (storynote-ui-reference.html's
  // #lockModal — Password + Confirm password). 'remove' re-verifies the
  // existing one before permanently clearing it ("Remove lock after
  // successful verification" — development-plan.md Phase 8) — no reference
  // markup for this one since the static reference only demonstrates
  // setting a lock, not removing one.
  mode: 'lock' | 'remove';
  onClose: () => void;
}

function LockNoteModal({ noteId, mode, onClose }: LockNoteModalProps): React.JSX.Element {
  const lockNote = useNoteStore((state) => state.lockNote);
  const removeNoteLock = useNoteStore((state) => state.removeNoteLock);
  const error = useNoteStore((state) => state.error);
  const clearError = useNoteStore((state) => state.clearError);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = (): void => {
    clearError();
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!password) return;
    if (mode === 'lock' && password !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    clearError();
    setIsSubmitting(true);
    const succeeded =
      mode === 'lock' ? await lockNote(noteId, password) : await removeNoteLock(noteId, password);
    setIsSubmitting(false);
    if (succeeded) {
      onClose();
    } else if (mode === 'remove') {
      setPassword('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--scrim)]"
      onClick={handleClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-modal-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void handleSubmit(event)}
        className="w-[340px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-raised)] p-[22px] shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
      >
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
          <LockIcon className="h-[18px] w-[18px]" />
        </div>
        <h3
          id="lock-modal-title"
          className="m-0 mb-1 text-[15px] font-semibold text-[var(--text-primary)]"
        >
          {mode === 'lock' ? 'Lock this note' : 'Remove lock'}
        </h3>
        <p className="m-0 mb-4 text-[12.5px] text-[var(--text-tertiary)]">
          {mode === 'lock'
            ? "Set a password to hide this note's content until unlocked. This password is separate from any app-level settings."
            : 'Enter the password to permanently remove the lock from this note.'}
        </p>

        <label
          htmlFor="lock-modal-password"
          className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]"
        >
          Password
        </label>
        <input
          id="lock-modal-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={mode === 'lock' ? 'Enter a password' : 'Enter the password'}
          autoFocus
          className="mb-3.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] outline-none"
        />

        {mode === 'lock' && (
          <>
            <label
              htmlFor="lock-modal-confirm"
              className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]"
            >
              Confirm password
            </label>
            <input
              id="lock-modal-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter password"
              className="mb-3.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] outline-none"
            />
          </>
        )}

        {mismatch && (
          <p className="m-0 mb-3 text-[12px] text-[#DC2626]" role="alert">
            Passwords don&apos;t match.
          </p>
        )}
        {error && (
          <p className="m-0 mb-3 text-[12px] text-[#DC2626]" role="alert">
            {error}
          </p>
        )}

        <div className="mt-1.5 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!password || isSubmitting || (mode === 'lock' && !confirmPassword)}
            className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {mode === 'lock' ? 'Lock note' : 'Remove lock'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default LockNoteModal;
