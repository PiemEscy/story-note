import { useEffect, useState } from 'react';
import { useAiStore } from '../store/useAiStore';
import {
  useUIStore,
  NOTE_FONT_SIZE_MIN,
  NOTE_FONT_SIZE_MAX,
  NOTE_FONT_SIZE_STEP,
  NOTE_CONTENT_WIDTH_MIN,
  NOTE_CONTENT_WIDTH_MAX,
  NOTE_CONTENT_WIDTH_STEP,
  NOTE_ZOOM_MIN,
  NOTE_ZOOM_MAX,
  NOTE_ZOOM_STEP,
  NOTE_ZOOM_DEFAULT,
  NOTE_LINE_HEIGHT_MIN,
  NOTE_LINE_HEIGHT_MAX,
  NOTE_LINE_HEIGHT_STEP,
} from '../store/useUIStore';
import type { ThemeMode, NoteFontFamily } from '../store/useUIStore';
import { useLabelStore } from '../store/useLabelStore';
import { keyModeService } from '../services/keyModeService';
import type { KeyMode } from '../services/keyModeService';
import { CONTENT_SHORTCUTS } from '../editor/contentShortcuts';
import { LockIcon } from './icons';

interface SettingsModalProps {
  onClose: () => void;
}

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const NOTE_FONT_FAMILY_OPTIONS: { value: NoteFontFamily; label: string }[] = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans-serif' },
  { value: 'mono', label: 'Monospace' },
  { value: 'palatino', label: 'Palatino' },
  { value: 'verdana', label: 'Verdana' },
  { value: 'courier', label: 'Courier' },
];

// GLOBAL_SHORTCUTS mirrors electron/shortcuts.ts's real accelerators
// (registered main-process side) and Sidebar.tsx's local Ctrl+K — listed
// here purely for display, not re-implemented; this file never registers a
// shortcut itself.
const GLOBAL_SHORTCUTS: { action: string; keybinding: string }[] = [
  { action: 'New note', keybinding: 'Ctrl+Shift+N' },
  { action: 'Focus search', keybinding: 'Ctrl+Shift+F / Ctrl+K' },
  { action: 'Lock all unlocked notes', keybinding: 'Ctrl+Shift+L' },
];

function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  onReset,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (value: number) => void;
  onReset?: () => void;
}): React.JSX.Element {
  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{displayValue}</span>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-[11px] font-semibold text-[var(--accent)] hover:underline"
            >
              Reset
            </button>
          )}
        </span>
      </div>
      <span className="mb-1.5 block text-[11.5px] text-[var(--text-tertiary)]">{description}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </div>
  );
}

// storynote-ui-reference.html has no Settings panel markup to match (its own
// footer only demos the "Settings" button that opens one) — this modal
// reuses LabelModal.tsx's established dialog styling instead of inventing a
// new visual language.
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): React.JSX.Element {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-2">
      <span>
        <span className="block text-[12.5px] font-medium text-[var(--text-primary)]">{label}</span>
        <span className="block text-[11.5px] text-[var(--text-tertiary)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

function SettingsModal({ onClose }: SettingsModalProps): React.JSX.Element {
  const theme = useUIStore((state) => state.theme);
  const setTheme = useUIStore((state) => state.setTheme);
  const compactMode = useUIStore((state) => state.compactMode);
  const setCompactMode = useUIStore((state) => state.setCompactMode);
  const startMinimized = useUIStore((state) => state.startMinimized);
  const setStartMinimized = useUIStore((state) => state.setStartMinimized);
  const launchOnStartup = useUIStore((state) => state.launchOnStartup);
  const setLaunchOnStartup = useUIStore((state) => state.setLaunchOnStartup);
  const alwaysOnTop = useUIStore((state) => state.alwaysOnTop);
  const setAlwaysOnTop = useUIStore((state) => state.setAlwaysOnTop);
  const spellCheckEnabled = useUIStore((state) => state.spellCheckEnabled);
  const setSpellCheckEnabled = useUIStore((state) => state.setSpellCheckEnabled);
  const noteFontFamily = useUIStore((state) => state.noteFontFamily);
  const setNoteFontFamily = useUIStore((state) => state.setNoteFontFamily);
  const noteFontSize = useUIStore((state) => state.noteFontSize);
  const setNoteFontSize = useUIStore((state) => state.setNoteFontSize);
  const noteContentWidth = useUIStore((state) => state.noteContentWidth);
  const setNoteContentWidth = useUIStore((state) => state.setNoteContentWidth);
  const noteZoom = useUIStore((state) => state.noteZoom);
  const setNoteZoom = useUIStore((state) => state.setNoteZoom);
  const resetNoteZoom = useUIStore((state) => state.resetNoteZoom);
  const noteLineHeight = useUIStore((state) => state.noteLineHeight);
  const setNoteLineHeight = useUIStore((state) => state.setNoteLineHeight);
  const defaultLabelId = useUIStore((state) => state.defaultLabelId);
  const setDefaultLabelId = useUIStore((state) => state.setDefaultLabelId);
  const labels = useLabelStore((state) => state.labels);

  const [keyMode, setKeyMode] = useState<KeyMode | null>(null);
  const [isEnablingPassword, setIsEnablingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [keyModeError, setKeyModeError] = useState<string | null>(null);
  const [keyModeLoadFailed, setKeyModeLoadFailed] = useState(false);
  const [isSavingKeyMode, setIsSavingKeyMode] = useState(false);

  const aiEnabled = useAiStore((state) => state.enabled);
  const setAiEnabled = useAiStore((state) => state.setEnabled);
  const hasApiKey = useAiStore((state) => state.hasApiKey);
  const isSavingApiKey = useAiStore((state) => state.isSavingApiKey);
  const apiKeyError = useAiStore((state) => state.apiKeyError);
  const saveApiKey = useAiStore((state) => state.saveApiKey);
  const removeApiKey = useAiStore((state) => state.removeApiKey);
  const clearApiKeyError = useAiStore((state) => state.clearApiKeyError);
  const [apiKeyDraft, setApiKeyDraft] = useState('');

  const handleSaveApiKey = async (): Promise<void> => {
    if (!apiKeyDraft.trim()) return;
    const succeeded = await saveApiKey(apiKeyDraft.trim());
    if (succeeded) setApiKeyDraft('');
  };

  useEffect(() => {
    keyModeService
      .get()
      .then(setKeyMode)
      .catch((error: unknown) => {
        console.error('[SettingsModal] failed to load key mode', error);
        setKeyModeLoadFailed(true);
      });
  }, []);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleEnablePassword = async (): Promise<void> => {
    if (!password || password !== confirmPassword) return;
    setKeyModeError(null);
    setIsSavingKeyMode(true);
    try {
      await keyModeService.setPassword(password);
      setKeyMode('password');
      setIsEnablingPassword(false);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setKeyModeError(error instanceof Error ? error.message : 'Failed to enable master password');
    } finally {
      setIsSavingKeyMode(false);
    }
  };

  // No current-password re-entry needed: the app is already running with
  // the database decrypted, so whoever is at the keyboard already has that
  // access — matching ADR-001's design.
  const handleDisablePassword = async (): Promise<void> => {
    setKeyModeError(null);
    setIsSavingKeyMode(true);
    try {
      await keyModeService.setOs();
      setKeyMode('os');
    } catch (error) {
      setKeyModeError(error instanceof Error ? error.message : 'Failed to disable master password');
    } finally {
      setIsSavingKeyMode(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--scrim)]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        className="max-h-[88vh] w-[520px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-surface-raised)] p-[26px] shadow-[0_12px_32px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3
          id="settings-modal-title"
          className="m-0 mb-4 text-[15px] font-semibold text-[var(--text-primary)]"
        >
          Settings
        </h3>

        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]">
          Theme
        </span>
        <div className="mb-4 flex gap-1.5">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={`flex-1 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                theme === option.value
                  ? 'border-[var(--accent)] bg-[var(--bg-active)] text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]">
          Note content
        </span>
        <div className="mb-4 grid grid-cols-3 gap-1.5">
          {NOTE_FONT_FAMILY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setNoteFontFamily(option.value)}
              className={`rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                noteFontFamily === option.value
                  ? 'border-[var(--accent)] bg-[var(--bg-active)] text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mb-4 divide-y divide-[var(--border)] border-t border-b border-[var(--border)] px-0.5">
          <SliderRow
            label="Font size"
            description="Size of note content text"
            value={noteFontSize}
            min={NOTE_FONT_SIZE_MIN}
            max={NOTE_FONT_SIZE_MAX}
            step={NOTE_FONT_SIZE_STEP}
            displayValue={`${noteFontSize}px`}
            onChange={setNoteFontSize}
          />
          <SliderRow
            label="Zoom"
            description="Scales the whole content view, not just the text"
            value={noteZoom}
            min={NOTE_ZOOM_MIN}
            max={NOTE_ZOOM_MAX}
            step={NOTE_ZOOM_STEP}
            displayValue={`${Math.round(noteZoom * 100)}%`}
            onChange={setNoteZoom}
            onReset={noteZoom !== NOTE_ZOOM_DEFAULT ? resetNoteZoom : undefined}
          />
          <SliderRow
            label="Content width"
            description="Narrower means more empty space on either side"
            value={noteContentWidth}
            min={NOTE_CONTENT_WIDTH_MIN}
            max={NOTE_CONTENT_WIDTH_MAX}
            step={NOTE_CONTENT_WIDTH_STEP}
            displayValue={`${noteContentWidth}px`}
            onChange={setNoteContentWidth}
          />
          <SliderRow
            label="Line spacing"
            description="Vertical space between lines of note content"
            value={noteLineHeight}
            min={NOTE_LINE_HEIGHT_MIN}
            max={NOTE_LINE_HEIGHT_MAX}
            step={NOTE_LINE_HEIGHT_STEP}
            displayValue={noteLineHeight.toFixed(2)}
            onChange={setNoteLineHeight}
          />
        </div>
        <div className="mb-4 divide-y divide-[var(--border)] border-t border-b border-[var(--border)]">
          <ToggleRow
            label="Spell check"
            description="Underline misspelled words while typing in note content"
            checked={spellCheckEnabled}
            onChange={setSpellCheckEnabled}
          />
        </div>

        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]">
          Default label
        </span>
        <p className="mb-1.5 text-[11.5px] text-[var(--text-tertiary)]">
          Applied automatically to new notes and .txt imports
        </p>
        <select
          value={defaultLabelId ?? ''}
          onChange={(event) =>
            setDefaultLabelId(event.target.value === '' ? null : Number(event.target.value))
          }
          className="mb-4 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2 text-[12.5px] text-[var(--text-primary)] outline-none"
        >
          <option value="">None</option>
          {labels.map((label) => (
            <option key={label.id} value={label.id}>
              {label.name}
            </option>
          ))}
        </select>

        <div className="mb-4 divide-y divide-[var(--border)] border-t border-b border-[var(--border)]">
          <ToggleRow
            label="Compact mode"
            description="Reduced padding on the list toolbar and note rows"
            checked={compactMode}
            onChange={setCompactMode}
          />
          <ToggleRow
            label="Always on top"
            description="Keep the StoryNote window above other windows"
            checked={alwaysOnTop}
            onChange={(value) => void setAlwaysOnTop(value)}
          />
          <ToggleRow
            label="Launch at startup"
            description="Start StoryNote automatically when you sign in to Windows"
            checked={launchOnStartup}
            onChange={(value) => void setLaunchOnStartup(value)}
          />
          <ToggleRow
            label="Start minimized"
            description="Launch straight to the tray instead of showing the window"
            checked={startMinimized}
            onChange={setStartMinimized}
          />
        </div>

        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]">
          Keyboard shortcuts
        </span>
        <div className="mb-4 flex flex-col gap-1 rounded-md border border-[var(--border)] p-2.5">
          {CONTENT_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action} className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[var(--text-secondary)]">{shortcut.action}</span>
              <kbd className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--text-tertiary)]">
                {shortcut.keybinding}
              </kbd>
            </div>
          ))}
          <div className="my-1 h-px bg-[var(--border)]" />
          {GLOBAL_SHORTCUTS.map((shortcut) => (
            <div key={shortcut.action} className="flex items-center justify-between gap-2">
              <span className="text-[12px] text-[var(--text-secondary)]">{shortcut.action}</span>
              <kbd className="shrink-0 rounded border border-[var(--border)] bg-[var(--bg-hover)] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--text-tertiary)]">
                {shortcut.keybinding}
              </kbd>
            </div>
          ))}
        </div>

        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]">
          AI features
        </span>
        <p className="mb-2 text-[11.5px] text-[var(--text-tertiary)]">
          Using the AI chat or the selection transform popup sends the relevant chat message or
          selected text to Anthropic&apos;s API. No note content is sent automatically otherwise.
        </p>
        <div className="mb-2.5 divide-y divide-[var(--border)] border-t border-b border-[var(--border)]">
          <ToggleRow
            label="Enable AI features"
            description="Turns on the Ask AI chat modal and the selection transform popup"
            checked={aiEnabled}
            onChange={setAiEnabled}
          />
        </div>
        <div className="mb-4 rounded-md border border-[var(--border)] p-2.5">
          {hasApiKey ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] text-[var(--text-secondary)]">
                Anthropic API key saved.
              </span>
              <button
                type="button"
                disabled={isSavingApiKey}
                onClick={() => void removeApiKey()}
                className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyDraft}
                onChange={(event) => {
                  setApiKeyDraft(event.target.value);
                  if (apiKeyError) clearApiKeyError();
                }}
                placeholder="sk-ant-…"
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2 text-[12.5px] text-[var(--text-primary)] outline-none"
              />
              <button
                type="button"
                disabled={!apiKeyDraft.trim() || isSavingApiKey}
                onClick={() => void handleSaveApiKey()}
                className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}
          {apiKeyError && (
            <p className="m-0 mt-2 text-[11.5px] text-[#DC2626]" role="alert">
              {apiKeyError}
            </p>
          )}
          <p className="m-0 mt-2 text-[11px] text-[var(--text-tertiary)]">
            Stored securely via Windows Credential Manager — never written to StoryNote&apos;s
            database or logs.
          </p>
        </div>

        <span className="mb-1.5 block text-[11.5px] font-semibold text-[var(--text-secondary)]">
          Master password
        </span>

        {keyMode === 'password' && !isEnablingPassword && (
          <div className="mb-1 flex items-center justify-between gap-2 rounded-md border border-[var(--border)] p-2.5">
            <div className="flex items-center gap-2 text-[12.5px] text-[var(--text-secondary)]">
              <LockIcon className="h-3.5 w-3.5 shrink-0" />
              StoryNote is protected by a master password.
            </div>
            <button
              type="button"
              disabled={isSavingKeyMode}
              onClick={() => void handleDisablePassword()}
              className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
            >
              Disable
            </button>
          </div>
        )}

        {keyMode === 'os' && !isEnablingPassword && (
          <div className="mb-1 flex items-center justify-between gap-2 rounded-md border border-[var(--border)] p-2.5">
            <p className="m-0 text-[12.5px] text-[var(--text-secondary)]">
              No master password set — StoryNote unlocks automatically.
            </p>
            <button
              type="button"
              onClick={() => setIsEnablingPassword(true)}
              className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Enable
            </button>
          </div>
        )}

        {keyModeLoadFailed && keyMode === null && (
          <p className="m-0 mb-1 text-[12px] text-[#DC2626]" role="alert">
            Couldn&apos;t load the current master password status.
          </p>
        )}

        {isEnablingPassword && (
          <div className="mb-1 rounded-md border border-[var(--border)] p-2.5">
            <p
              role="alert"
              className="m-0 mb-2.5 rounded-md border border-[rgba(220,38,38,0.3)] bg-[rgba(220,38,38,0.06)] p-2 text-[12px] text-[#DC2626]"
            >
              There is no way to recover your notes if you forget this password — StoryNote stores
              no recovery option, by design.
            </p>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New master password"
              autoFocus
              className="mb-2 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] outline-none"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm password"
              className="mb-1 w-full rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-2 text-[13px] text-[var(--text-primary)] outline-none"
            />
            {passwordsMismatch && (
              <p className="m-0 mb-1 text-[11.5px] text-[#DC2626]">Passwords do not match.</p>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEnablingPassword(false);
                  setPassword('');
                  setConfirmPassword('');
                  setKeyModeError(null);
                }}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!password || password !== confirmPassword || isSavingKeyMode}
                onClick={() => void handleEnablePassword()}
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
              >
                Enable
              </button>
            </div>
          </div>
        )}

        {keyModeError && (
          <p className="m-0 mt-2 text-[12px] text-[#DC2626]" role="alert">
            {keyModeError}
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--border)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
