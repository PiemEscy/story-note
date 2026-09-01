// Tracks which locked notes have been unlocked *for the current app run*
// ("reveal content for that session/view" — Phase 8's checklist). Deliberately
// in-memory only, never persisted anywhere (settings, disk, or otherwise):
// every note re-locks on the next launch, which is the secure default and
// exactly what "session" means here.
//
// This is the main process's own authoritative record, not a mirror of
// whatever the renderer believes — every handler that returns or acts on a
// locked note's content (notesHandlers.ts, labelsHandlers.ts, searchHandlers.ts)
// consults this rather than trusting an "already unlocked" flag the renderer
// might send, per code-style.md's "don't trust renderer input" rule. A real
// Electron app run creates exactly one of these (electron/ipc/
// registerIpcHandlers.ts); tests create their own per-test instance so
// nothing leaks between them.
// A wrong-password attempt against one note doesn't touch any other note's
// counter or lockout state, and a successful unlock clears it — this exists
// to blunt someone sitting at an already-unlocked machine scripting guesses
// against one specific note (a security-audit review flagged the absence of
// any limit here as a gap against this app's own documented threat model),
// not to defend against a network-scale attack this single-user local app
// was never exposed to in the first place. Argon2's own cost is deliberately
// left at the library's fast defaults for this reason (see notes.ts) — this
// counter is what actually bounds repeated guessing, not per-attempt cost.
const MAX_FAILED_ATTEMPTS = 10;

export interface LockSession {
  isUnlocked: (noteId: number) => boolean;
  unlock: (noteId: number) => void;
  recordFailedAttempt: (noteId: number) => void;
  isLockedOut: (noteId: number) => boolean;
  // Phase 10's "quick-lock" global shortcut — re-locks every note unlocked
  // this session at once (a panic button, not a per-note action), without
  // touching is_locked/password_hash for any of them. Failed-attempt counts
  // are left alone: this isn't a response to a wrong guess, so it shouldn't
  // reset anyone's lockout progress.
  lockAll: () => void;
}

export function createLockSession(): LockSession {
  const unlockedIds = new Set<number>();
  const failedAttempts = new Map<number, number>();
  return {
    isUnlocked: (noteId) => unlockedIds.has(noteId),
    unlock: (noteId) => {
      unlockedIds.add(noteId);
      failedAttempts.delete(noteId);
    },
    recordFailedAttempt: (noteId) => {
      failedAttempts.set(noteId, (failedAttempts.get(noteId) ?? 0) + 1);
    },
    isLockedOut: (noteId) => (failedAttempts.get(noteId) ?? 0) >= MAX_FAILED_ATTEMPTS,
    lockAll: () => {
      unlockedIds.clear();
    },
  };
}
