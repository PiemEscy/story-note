#!/usr/bin/env node
// Dev-only tool: opens the REAL StoryNote database, strictly read-only, for
// ad hoc SELECT/PRAGMA/EXPLAIN inspection — without going through the
// running app.
//
// Deliberately NOT written in TypeScript / imported from electron/db/* —
// this runs under `electron ... --run-as-node` (required so the native
// better-sqlite3-multiple-ciphers/@napi-rs/keyring modules load against the
// same ABI they were built for, same reasoning as `npm run test`), which
// has no TypeScript loader and no Electron `app` API (ELECTRON_RUN_AS_NODE
// disables it). So this intentionally re-implements the small slice of
// electron/db/keys.ts + electron/db/index.ts's connection logic it needs,
// using the exact same constants (CREDENTIAL_SERVICE/ACCOUNT, Argon2
// params, pragma sequence) — keep those in sync if keys.ts's ever change.
//
// Security posture (do not weaken any of this without re-reading ADR-001 /
// ADR-002 first):
//   - Always read-only — the SQLite connection itself is opened
//     read-only, and runStatement() rejects anything that isn't a
//     SELECT/PRAGMA/EXPLAIN before it ever reaches that connection. There
//     is no flag, mode, or code path in this file that writes to the
//     database or prints the encryption key — don't add one; if you need
//     either, that's a different, more deliberate tool.
//   - Never runs migrations — schema changes are the app's job only.
//   - Reads the *existing* OS credential entry; never creates, overwrites,
//     or deletes one.
//   - Must stay excluded from the packaged build (electron-builder.yml's
//     `files` list excludes `scripts/**` — don't remove that exclusion).
//   - This bypasses the app's own IPC-layer redaction entirely (locked
//     note content and password_hash are real columns, visible to any
//     query here) — the banner below says so on every run; treat output
//     from this tool the same as raw note content.

const path = require('path');
const readline = require('readline');
const { existsSync, readFileSync } = require('fs');
const { Entry } = require('@napi-rs/keyring');
const { hashRawSync } = require('@node-rs/argon2');
const Database = require('better-sqlite3-multiple-ciphers');

// Mirrors electron/db/keys.ts exactly — this is the app's real credential
// entry (not a test identity), because the point of this tool is to open
// the real database the running app already uses.
const CREDENTIAL_SERVICE = 'storynote';
const CREDENTIAL_ACCOUNT = 'sqlcipher-key';
const KEY_BYTE_LENGTH = 32;
const ARGON2ID = 2;
const ARGON2_MEMORY_COST_KIB = 65536;
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 1;
const HEX_KEY_PATTERN = /^[0-9a-f]{64}$/i;

const DATABASE_FILENAME = 'storynote.db';
const KEY_METADATA_FILENAME = 'storynote.keymeta.json';

function parseArgs(argv) {
  const flags = { appName: 'storynote', query: null };
  for (const arg of argv) {
    if (arg.startsWith('--app-name=')) flags.appName = arg.slice('--app-name='.length);
    else if (!arg.startsWith('--')) flags.query = arg;
  }
  return flags;
}

function getUserDataPath(appName) {
  // Electron's own getPath('userData') = join(getPath('appData'), appName);
  // getPath('appData') on Windows is process.env.APPDATA. This has to be
  // reimplemented rather than calling Electron's `app` API because
  // ELECTRON_RUN_AS_NODE=1 (required below) disables that API entirely.
  if (!process.env.APPDATA) {
    throw new Error('APPDATA is not set — this tool only knows how to resolve the Windows path.');
  }
  return path.join(process.env.APPDATA, appName);
}

function readKeyMode(userDataPath) {
  const metaPath = path.join(userDataPath, KEY_METADATA_FILENAME);
  if (!existsSync(metaPath)) return { keyMode: 'os' };
  return JSON.parse(readFileSync(metaPath, 'utf-8'));
}

function getKeyFromOs() {
  const entry = new Entry(CREDENTIAL_SERVICE, CREDENTIAL_ACCOUNT);
  const key = entry.getPassword();
  if (!key) {
    throw new Error(
      `No encryption key found in Windows Credential Manager for service "${CREDENTIAL_SERVICE}" / account "${CREDENTIAL_ACCOUNT}". ` +
        'Wrong --app-name, or the app has never actually launched with this userData folder.',
    );
  }
  return key;
}

function getKeyFromPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const derived = hashRawSync(password, {
    algorithm: ARGON2ID,
    memoryCost: ARGON2_MEMORY_COST_KIB,
    timeCost: ARGON2_TIME_COST,
    parallelism: ARGON2_PARALLELISM,
    salt,
    outputLen: KEY_BYTE_LENGTH,
  });
  return derived.toString('hex');
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

async function resolveKey(userDataPath) {
  const metadata = readKeyMode(userDataPath);
  if (metadata.keyMode === 'os') return getKeyFromOs();

  if (!metadata.keyDerivationSalt) {
    throw new Error(
      'Key metadata says password mode, but no keyDerivationSalt is stored — corrupt keymeta file?',
    );
  }
  // Visible input — this is a local dev tool run interactively by the same
  // person who already knows the app's master password; not worth adding a
  // hidden-input dependency for.
  const password = await prompt('Master password (visible while typing): ');
  return getKeyFromPassword(password, metadata.keyDerivationSalt);
}

function printBanner(dbPath) {
  console.log('='.repeat(70));
  console.log('StoryNote DB inspector — dev tool, not part of the shipped app');
  console.log(`  Database: ${dbPath}`);
  console.log('  Mode:     read-only (SELECT/PRAGMA/EXPLAIN only)');
  console.log('');
  console.log("  This bypasses the app's own IPC-layer redaction. A locked");
  console.log("  note's content and password_hash are real columns here,");
  console.log('  visible to any query — treat this output like raw note');
  console.log('  content, not like anything the app itself would show you.');
  console.log('='.repeat(70));
}

function printRows(rows) {
  if (Array.isArray(rows)) {
    if (rows.length === 0) {
      console.log('(0 rows)');
    } else {
      console.table(rows);
    }
  } else {
    console.log(rows);
  }
}

// Belt-and-suspenders alongside the read-only connection itself (which
// would also reject a write, just with a less friendly SQLite error): only
// SELECT/PRAGMA/EXPLAIN ever reach db.prepare() at all.
function runStatement(db, sql) {
  const trimmed = sql.trim();
  if (!/^(select|pragma|explain)/i.test(trimmed)) {
    throw new Error(
      'This tool is read-only — only SELECT, PRAGMA, or EXPLAIN statements are allowed.',
    );
  }
  return db.prepare(trimmed).all();
}

async function runRepl(db) {
  console.log('Enter SQL, one statement per line. ".exit" or Ctrl+D to quit.\n');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'sql> ',
  });
  rl.prompt();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed === '') {
      rl.prompt();
      return;
    }
    if (trimmed === '.exit' || trimmed === '.quit') {
      rl.close();
      return;
    }
    try {
      printRows(runStatement(db, trimmed));
    } catch (error) {
      console.error('Error:', error.message);
    }
    rl.prompt();
  });
  await new Promise((resolve) => rl.on('close', resolve));
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const userDataPath = getUserDataPath(flags.appName);
  const dbPath = path.join(userDataPath, DATABASE_FILENAME);

  if (!existsSync(dbPath)) {
    throw new Error(
      `No database found at ${dbPath}. Pass --app-name=StoryNote if you're inspecting a packaged ` +
        'install (its userData folder uses the productName, not the dev "storynote" name).',
    );
  }

  const key = await resolveKey(userDataPath);
  if (!HEX_KEY_PATTERN.test(key)) {
    throw new Error('Resolved key is not a 64-character hex string — something is wrong upstream.');
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma("cipher='sqlcipher'");
    db.pragma('legacy=4');
    db.pragma(`key='${key}'`);
    // Confirms the key actually works before handing control to the user —
    // a wrong key doesn't throw on PRAGMA key itself, only on the first
    // real read against the (still-encrypted-looking) file.
    db.prepare('SELECT count(*) FROM sqlite_master').get();

    printBanner(dbPath);

    if (flags.query) {
      printRows(runStatement(db, flags.query));
    } else {
      await runRepl(db);
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error('\nFailed:', error.message);
  process.exit(1);
});
