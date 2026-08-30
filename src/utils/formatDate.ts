// SQLite's CURRENT_TIMESTAMP produces "YYYY-MM-DD HH:MM:SS" in UTC with no
// timezone marker. Appending "Z" (after swapping the space for "T") forces
// JS to parse it as UTC rather than local time.
function parseSqliteTimestamp(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

export function formatRelativeTime(value: string): string {
  const date = parseSqliteTimestamp(value);
  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (diffSeconds < 60) return 'just now';
  const minutes = Math.floor(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatShortDate(value: string): string {
  return parseSqliteTimestamp(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
