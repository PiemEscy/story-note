import { useState } from 'react';
import { useAppLockStore } from '../store/useAppLockStore';
import { LockIcon } from './icons';

// The whole-app equivalent of LockedNotePanel.tsx, shown instead of <App />
// when the database itself is in ADR-001's password mode and hasn't been
// unlocked yet this run — main.ts registers no notes/labels/settings/search
// IPC handlers at all until this succeeds, so nothing else in the app can
// meaningfully render before it does. No UI reference markup exists for
// this screen (the static reference only demonstrates per-note lock/unlock,
// not a startup master-password prompt) — styled to match LockedNotePanel's
// own established pattern instead of inventing a new visual language.
function UnlockScreen(): React.JSX.Element {
  const unlock = useAppLockStore((state) => state.unlock);
  const error = useAppLockStore((state) => state.error);
  const clearError = useAppLockStore((state) => state.clearError);

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!password) return;
    clearError();
    setIsSubmitting(true);
    const succeeded = await unlock(password);
    setIsSubmitting(false);
    if (!succeeded) {
      setPassword('');
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-[var(--bg-app)]">
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col items-center gap-3.5 p-10"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[var(--bg-hover)] text-[var(--text-secondary)]">
          <LockIcon className="h-[22px] w-[22px]" />
        </div>
        <h3 className="m-0 text-[15px] font-semibold text-[var(--text-primary)]">StoryNote</h3>
        <p className="m-0 max-w-[280px] text-center text-[12.5px] text-[var(--text-tertiary)]">
          This database is protected by a master password. Enter it to continue.
        </p>
        <div className="mt-1.5 flex w-60 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2">
          <LockIcon className="h-[13px] w-[13px] shrink-0 text-[var(--text-tertiary)]" />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter master password"
            autoFocus
            className="w-full border-0 bg-transparent font-mono text-sm tracking-[2px] text-[var(--text-primary)] outline-none"
          />
        </div>
        {error && (
          <p className="m-0 max-w-[280px] text-center text-[12px] text-[#DC2626]" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!password || isSubmitting}
          className="w-60 rounded-md bg-[var(--accent)] px-4.5 py-2 text-[12.5px] font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

export default UnlockScreen;
