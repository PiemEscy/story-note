import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // Standard practice for Electron e2e: each spec launches a real GUI
  // process, and running several concurrently is fragile (this sandboxed
  // dev environment saw a spurious "browser has been closed" failure under
  // 2 workers) — not worth chasing for one-off local runs, run serially.
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
});
