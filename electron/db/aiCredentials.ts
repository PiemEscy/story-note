import { Entry } from '@napi-rs/keyring';
import type { CredentialIdentity } from './keys';

// Mirrors keys.ts's OS-credential-storage mechanism (ADR-001's precedent),
// but under a distinct service/account so this never collides with the
// SQLCipher key's own entry — losing/rotating one must never affect the
// other. ADR-002: "stored via OS credential storage (same mechanism as the
// SQLCipher key in ADR-001) — never written to SQLite, a config file, or
// logs."
const CREDENTIAL_SERVICE = 'storynote';
const CREDENTIAL_ACCOUNT = 'anthropic-api-key';

function getCredentialEntry(identity: CredentialIdentity = {}): Entry {
  return new Entry(identity.service ?? CREDENTIAL_SERVICE, identity.account ?? CREDENTIAL_ACCOUNT);
}

// null (not throwing) for "no key stored" — keys.ts's own doc comment on
// @napi-rs/keyring notes getPassword() returns null rather than throwing
// for a missing entry, so this mirrors that rather than inventing a
// different convention for this one credential.
export function getApiKey(identity?: CredentialIdentity): string | null {
  return getCredentialEntry(identity).getPassword();
}

export function hasApiKey(identity?: CredentialIdentity): boolean {
  return getApiKey(identity) !== null;
}

export function setApiKey(apiKey: string, identity?: CredentialIdentity): void {
  getCredentialEntry(identity).setPassword(apiKey);
}

export function clearApiKey(identity?: CredentialIdentity): void {
  getCredentialEntry(identity).deletePassword();
}
