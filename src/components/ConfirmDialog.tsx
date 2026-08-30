interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Generic confirm/cancel modal — matches the reference's .modal-overlay/.modal
// styling. Used for delete and permanent-delete confirmations (Phase 3); the
// lock/set-password modal in the UI reference is Phase 8's own component.
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(15,23,42,0.45)]"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-[340px] rounded-xl border border-[#E2E5EA] bg-white p-[22px] shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="m-0 mb-1 text-[15px] font-semibold text-[#14181F]">
          {title}
        </h3>
        <p className="m-0 mb-4 text-[12.5px] text-[#8992A0]">{message}</p>
        <div className="mt-1.5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#E2E5EA] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#5B6472] transition-colors hover:bg-[#EBEEF2]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors ${
              isDanger ? 'bg-[#DC2626] hover:bg-[#B91C1C]' : 'bg-[#2563EB] hover:bg-[#1D4ED8]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
