import { join } from 'path';

const KEY_METADATA_FILENAME = 'storynote.keymeta.json';

// Small unencrypted sidecar file (see ADR-001, "Key metadata bootstrap"):
// key_mode and key_derivation_salt must be readable *before* the SQLCipher
// database can be opened, so they can't live inside the encrypted db itself.
export function getKeyMetadataPath(userDataPath: string): string {
  return join(userDataPath, KEY_METADATA_FILENAME);
}
