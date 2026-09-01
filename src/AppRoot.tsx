import { useEffect } from 'react';
import App from './App';
import UnlockScreen from './components/UnlockScreen';
import { useAppLockStore } from './store/useAppLockStore';

// The real entry point rendered by main.tsx (App itself is not — its own
// mount effect fires loadNotes/loadLabels/settings reads that would just
// fail with "no handler registered" if the database is still in ADR-001's
// password mode and hasn't been unlocked yet this run; every one of those
// IPC channels only exists once electron/main.ts's completeStartup() has
// run, which might not happen until UnlockScreen submits the right
// password). Renders nothing while the lock state itself is still being
// checked, to avoid a flash of the wrong screen either way.
function AppRoot(): React.JSX.Element | null {
  const isLocked = useAppLockStore((state) => state.isLocked);
  const checkLockState = useAppLockStore((state) => state.checkLockState);

  useEffect(() => {
    void checkLockState();
  }, [checkLockState]);

  if (isLocked === null) return null;
  return isLocked ? <UnlockScreen /> : <App />;
}

export default AppRoot;
