// Small SVG icon components matching .claude/ui/storynote-ui-reference.html.
// Bundled together rather than split one-per-file (code-style.md's usual
// rule) because each is a few lines of static path data with no logic of
// its own — splitting them would be ten near-empty files for no benefit.
interface IconProps {
  className?: string;
}

// SunIcon/MoonIcon have no equivalent in the UI reference — theme switching
// there is only a "reference-doc chrome" demo, explicitly marked "not part
// of the app itself" (storynote-ui-reference.html line ~99). Same situation
// Phase 4 hit for table row/column controls: no reference to match, so a
// small, plainly-styled control was added instead of leaving the feature
// unreachable.
export function SunIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

export function AllNotesIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function ArchivedIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 13h4" />
    </svg>
  );
}

// storynote-ui-reference.html's own nav "Trash" icon is actually an
// abstract 3-line/2-dot glyph (M3 6h18M8 12h13M8 18h13M3 12h.01M3 18h.01 —
// still used as-is for ListViewIcon below, where that shape reads
// correctly as "list") that doesn't read as a trash can. Deliberately
// deviates from the reference here, reusing the same recognizable
// trash-can shape (lid + can body) already used for the note context
// menu's "Delete" action (DeleteIcon) instead.
export function TrashNavIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}

export function NewNoteIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MoreOptionsIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export function ExportIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M12 5v10m0 0-4-4m4 4 4-4M4 19h16" />
    </svg>
  );
}

export function DeleteIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6" />
    </svg>
  );
}

export function BulletListIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

export function NumberedListIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 10v2h1M4 16h1.5l-1.5 2h2" />
    </svg>
  );
}

export function BackIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

// No reference equivalent — the reference's sidebar label-item has no
// scripted click behavior at all (it's a static demo), so there's nothing
// to match for "edit a label without it eating the filter click."
export function EditIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// storynote-ui-reference.html's .sidebar-search magnifying glass.
export function SearchIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// storynote-ui-reference.html's .lock-icon / .locked-icon svg / .password-field
// svg — a single padlock shape reused for the list-row/grid-card indicator,
// the locked panel, and the "Lock note"/"Remove lock" menu item.
export function LockIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function TableIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 10h18M3 16h18M9 4v16" />
    </svg>
  );
}

// View-switcher icons. The reference's own view switcher is "reference-doc
// chrome... not part of the app itself" (plain text buttons, no icons) — no
// equivalent to match, so these are new. TableIcon (above) doubles as the
// Details-view icon since Details literally is a table.
export function SidebarViewIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M9 4v16" />
    </svg>
  );
}

export function ListViewIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path d="M3 6h18M8 12h13M8 18h13M3 12h.01M3 18h.01" />
    </svg>
  );
}

export function GridViewIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

export function LargeGridViewIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <rect x="3" y="3" width="8" height="18" rx="1" />
      <rect x="13" y="3" width="8" height="18" rx="1" />
    </svg>
  );
}
