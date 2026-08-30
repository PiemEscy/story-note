// Structured IPC result envelope — errors are caught in the main process and
// returned this way, never as a raw thrown exception/stack trace crossing
// into the renderer (code-style.md, architecture.md's Data Flow section).
export type IpcResult<T> = { ok: true; data: T } | { ok: false; message: string };

export function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

export function err(message: string): IpcResult<never> {
  return { ok: false, message };
}

// Wraps a handler body so any thrown error (validation, "not found", a raw
// SQLite/SQLCipher error, ...) is translated into { ok: false, message }
// instead of propagating verbatim to the renderer.
export function toIpcResult<T>(run: () => T): IpcResult<T> {
  try {
    return ok(run());
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Unknown error');
  }
}

// Async counterpart — for handlers that need a native dialog or filesystem
// write (e.g. export-as-.txt), which toIpcResult's synchronous body can't do.
export async function toIpcResultAsync<T>(run: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return ok(await run());
  } catch (error) {
    return err(error instanceof Error ? error.message : 'Unknown error');
  }
}
