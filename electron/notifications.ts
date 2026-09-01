import { Notification } from 'electron';

export interface NotificationOptions {
  title: string;
  body: string;
}

// isSupported/create injected (rather than calling electron.Notification
// directly) for the same reason as ExportDeps/ShortcutsDeps/TrayDeps —
// `electron` resolves to a non-functional stub under Vitest.
export interface NotificationsDeps {
  isSupported: () => boolean;
  create: (options: NotificationOptions) => { show: () => void };
}

const defaultDeps: NotificationsDeps = {
  isSupported: () => Notification.isSupported(),
  create: (options) => new Notification(options),
};

// Some Linux desktop environments and CI/headless machines have no
// notification backend at all (Electron's own docs call this out) — a
// missing backend is a silent no-op here, not a scattered guard at every
// call site.
export function showNotification(
  options: NotificationOptions,
  deps: NotificationsDeps = defaultDeps,
): void {
  if (!deps.isSupported()) return;
  deps.create(options).show();
}
