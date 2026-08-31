import { useState } from 'react';
import { useLabelStore } from '../store/useLabelStore';
import { useNoteStore } from '../store/useNoteStore';
import type { LabelRow } from '../services/labelsService';
import { CheckIcon } from './icons';

interface LabelModalProps {
  // Omitted/null = create mode; a LabelRow = edit mode, pre-filled and with
  // a delete option.
  label?: LabelRow | null;
  onClose: () => void;
}

// Matches storynote-ui-reference.html's --label-* palette (main.css defines
// the same values as CSS variables for display; these are the literal hex
// values actually persisted to labels.color per schema.md).
const LABEL_SWATCHES = ['#2563EB', '#16A34A', '#D97706', '#E11D48', '#7C3AED', '#64748B'];

function LabelModal({ label = null, onClose }: LabelModalProps): React.JSX.Element {
  const createLabel = useLabelStore((state) => state.createLabel);
  const updateLabel = useLabelStore((state) => state.updateLabel);
  const deleteLabel = useLabelStore((state) => state.deleteLabel);
  const labelError = useLabelStore((state) => state.error);
  const clearLabelError = useLabelStore((state) => state.clearError);
  const loadNotes = useNoteStore((state) => state.loadNotes);

  const [name, setName] = useState(label?.name ?? '');
  const [color, setColor] = useState<string | null>(label?.color ?? null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = label !== null;

  const handleClose = (): void => {
    clearLabelError();
    onClose();
  };

  const handleSave = async (): Promise<void> => {
    const trimmed = name.trim();
    if (!trimmed) return;
    clearLabelError();
    setIsSaving(true);
    const succeeded = isEditing
      ? await updateLabel(label.id, { name: trimmed, color })
      : await createLabel({ name: trimmed, color });
    setIsSaving(false);
    if (succeeded) onClose();
  };

  const handleDelete = async (): Promise<void> => {
    if (!isEditing) return;
    clearLabelError();
    const succeeded = await deleteLabel(label.id);
    if (succeeded) {
      // Deleting a label clears label_id on any note that had it (ON DELETE
      // SET NULL, schema.md) — reload so notes already in memory don't keep
      // pointing at a label_id that no longer exists.
      void loadNotes();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--scrim)]"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-modal-title"
        className="w-[340px] rounded-xl border border-[var(--border)] bg-[var(--bg-surface-raised)] p-[22px] shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3
          id="label-modal-title"
          className="m-0 mb-1 text-[15px] font-semibold text-[var(--text-primary)]"
        >
          {isEditing ? 'Edit label' : 'New label'}
        </h3>
        <p className="m-0 mb-4 text-[12.5px] text-[var(--text-tertiary)]">
          Labels help you organize and color-code your notes.
        </p>

        <label
          htmlFor="label-name"
          className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]"
        >
          Name
        </label>
        <input
          id="label-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Label name"
          className="mb-3.5 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] outline-none"
        />

        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]">
          Color
        </span>
        <div className="mb-3.5 flex flex-wrap gap-2">
          {LABEL_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              title={swatch}
              onClick={() => setColor(swatch)}
              style={{ background: swatch }}
              className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                color === swatch ? 'border-[var(--text-primary)]' : 'border-transparent'
              }`}
            >
              {color === swatch && <CheckIcon className="h-3 w-3 text-white" />}
            </button>
          ))}
        </div>

        {labelError && (
          <p className="m-0 mb-3 text-[12px] text-[#DC2626]" role="alert">
            {labelError}
          </p>
        )}

        {isConfirmingDelete ? (
          <div className="mb-1 rounded-md border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] p-2.5">
            <p className="m-0 mb-2 text-[12px] text-[#DC2626]">
              Delete this label? Notes using it keep their content but lose the label.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="rounded-md bg-[#DC2626] px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-[#B91C1C]"
              >
                Delete
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center justify-between gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-[#DC2626] transition-colors hover:bg-[rgba(220,38,38,0.08)]"
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md border border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!name.trim() || isSaving}
                onClick={() => void handleSave()}
                className="rounded-md bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LabelModal;
