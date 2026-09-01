import { useToastStore } from '../store/useToastStore';
import { CheckIcon, CloseIcon, ErrorToastIcon } from './icons';

// Renders useToastStore's stack — bottom-right so it never collides with
// App.tsx's centered error banner, which is a separate, older feedback
// mechanism (persistent until dismissed, for action failures) rather than
// this one (self-clearing, for success/partial-failure confirmations like
// note import).
function ToastContainer(): React.JSX.Element | null {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-2.5 rounded-md border bg-[var(--bg-surface-raised)] px-3.5 py-2.5 text-[12.5px] shadow-[0_4px_16px_rgba(15,23,42,0.12)] ${
            toast.variant === 'error'
              ? 'border-[#DC2626]/30 text-[#DC2626]'
              : 'border-[var(--border)] text-[var(--text-primary)]'
          }`}
        >
          {toast.variant === 'error' ? (
            <ErrorToastIcon className="h-4 w-4 shrink-0" />
          ) : (
            <CheckIcon className="h-4 w-4 shrink-0 text-[var(--accent)]" />
          )}
          <span className="flex-1">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
