import { randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { clearApiKey, getApiKey, hasApiKey, setApiKey } from './aiCredentials';
import type { CredentialIdentity } from './keys';

// A distinct, per-test OS-credential identity — never the real app's
// 'storynote'/'anthropic-api-key' entry (mirrors testHelpers.ts's
// createTestCredentialIdentity for the SQLCipher key).
function testIdentity(): CredentialIdentity {
  return {
    service: 'storynote-test',
    account: `anthropic-api-key-${randomBytes(8).toString('hex')}`,
  };
}

describe('AI API key credential storage', () => {
  let identity: CredentialIdentity;

  afterEach(() => {
    if (identity) clearApiKey(identity);
  });

  it('has no key stored by default', () => {
    identity = testIdentity();
    expect(hasApiKey(identity)).toBe(false);
    expect(getApiKey(identity)).toBeNull();
  });

  it('stores and retrieves a key', () => {
    identity = testIdentity();
    setApiKey('sk-ant-test-key', identity);
    expect(hasApiKey(identity)).toBe(true);
    expect(getApiKey(identity)).toBe('sk-ant-test-key');
  });

  it('overwrites a previously stored key', () => {
    identity = testIdentity();
    setApiKey('sk-ant-first', identity);
    setApiKey('sk-ant-second', identity);
    expect(getApiKey(identity)).toBe('sk-ant-second');
  });

  it('clears a stored key', () => {
    identity = testIdentity();
    setApiKey('sk-ant-test-key', identity);
    clearApiKey(identity);
    expect(hasApiKey(identity)).toBe(false);
    expect(getApiKey(identity)).toBeNull();
  });
});
