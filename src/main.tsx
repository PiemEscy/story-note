import './assets/main.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useUIStore } from './store/useUIStore';

// Applied synchronously, before the first paint, from useUIStore's
// already-resolved-at-module-load theme (best guess: the persisted
// preference isn't known yet, so this uses the system preference) — avoids
// a flash of the wrong theme while App's effect loads and corrects it from
// the persisted settings.theme value.
document.documentElement.dataset.theme = useUIStore.getState().resolvedTheme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
