// Small SVG icon components matching .claude/ui/storynote-ui-reference.html.
// Bundled together rather than split one-per-file (code-style.md's usual
// rule) because each is a few lines of static path data with no logic of
// its own — splitting them would be ten near-empty files for no benefit.
interface IconProps {
  className?: string;
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

export function TrashNavIcon({ className }: IconProps): React.JSX.Element {
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
