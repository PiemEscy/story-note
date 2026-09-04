// Extends Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.)
// for every renderer component test — testing.md names React Testing
// Library as this project's component-testing tool.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's own automatic per-test cleanup only self-registers when it detects
// a global `afterEach` (vitest.config.ts doesn't set test.globals: true, and
// every test file here imports afterEach/describe/it explicitly from
// 'vitest' rather than relying on globals) — without this, DOM from one
// test's render() stays mounted into the next test in the same file.
afterEach(cleanup);
