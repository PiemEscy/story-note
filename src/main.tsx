import './assets/main.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppRoot from './AppRoot';
import { useUIStore } from './store/useUIStore';

// Applied synchronously, before the first paint, from useUIStore's
// already-resolved-at-module-load theme (best guess: the persisted
// preference isn't known yet, so this uses the system preference) — avoids
// a flash of the wrong theme while App's effect loads and corrects it from
// the persisted settings.theme value. Applies regardless of lock state
// (AppRoot) so UnlockScreen isn't left unstyled — though while the database
// is still locked, this can only ever be the OS-preference guess: the
// settings IPC channel isn't registered yet (electron/main.ts), so the
// user's actual persisted theme choice isn't reachable until after unlock.
document.documentElement.dataset.theme = useUIStore.getState().resolvedTheme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
