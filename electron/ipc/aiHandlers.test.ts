import { randomBytes } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from '../db/testHelpers';
import { clearApiKey, setApiKey } from '../db/aiCredentials';
import { setSetting } from '../db/settings';
import type { AnthropicClient } from '../ai/anthropicClient';
import type { CredentialIdentity } from '../db/keys';
import {
  handleChat,
  handleClearApiKey,
  handleGetStatus,
  handleSetApiKey,
  handleTransform,
} from './aiHandlers';

function testIdentity(): CredentialIdentity {
  return {
    service: 'storynote-test',
    account: `anthropic-api-key-${randomBytes(8).toString('hex')}`,
  };
}

function fakeClient(overrides: Partial<AnthropicClient> = {}): AnthropicClient {
  return {
    sendChat: vi.fn().mockResolvedValue('a reply'),
    sendTransform: vi.fn().mockResolvedValue('a result'),
    ...overrides,
  };
}

describe('AI IPC handlers — status and API key management', () => {
  let identity: CredentialIdentity;

  afterEach(() => {
    if (identity) clearApiKey(identity);
  });

  it('reports disabled/no-key by default', () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      expect(handleGetStatus(db, identity)).toEqual({
        ok: true,
        data: { enabled: false, hasApiKey: false },
      });
    } finally {
      close();
    }
  });

  it('sets and clears the API key without ever returning it in plain text', () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      const setResult = handleSetApiKey({ apiKey: 'sk-ant-test' }, identity);
      expect(setResult).toEqual({ ok: true, data: undefined });
      expect(JSON.stringify(setResult)).not.toContain('sk-ant-test');

      setSetting(db, 'ai_enabled', 'true');
      expect(handleGetStatus(db, identity)).toEqual({
        ok: true,
        data: { enabled: true, hasApiKey: true },
      });

      const clearResult = handleClearApiKey(identity);
      expect(clearResult).toEqual({ ok: true, data: undefined });
      expect(handleGetStatus(db, identity)).toEqual({
        ok: true,
        data: { enabled: true, hasApiKey: false },
      });
    } finally {
      close();
    }
  });

  it('rejects an empty API key', () => {
    identity = testIdentity();
    expect(handleSetApiKey({ apiKey: '' }, identity).ok).toBe(false);
    expect(handleSetApiKey({ apiKey: '   ' }, identity).ok).toBe(false);
  });

  it('rejects malformed set-api-key input', () => {
    identity = testIdentity();
    expect(handleSetApiKey('not-an-object', identity).ok).toBe(false);
    expect(handleSetApiKey({ apiKey: 42 }, identity).ok).toBe(false);
  });
});

describe('storynote:ai:chat', () => {
  let identity: CredentialIdentity;

  afterEach(() => {
    if (identity) clearApiKey(identity);
  });

  it('calls the Anthropic client and returns its reply when AI is enabled with a key set', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const client = fakeClient({ sendChat: vi.fn().mockResolvedValue('Hello there') });
      const clientFactory = vi.fn().mockReturnValue(client);

      const result = await handleChat(
        db,
        { messages: [{ role: 'user', content: 'Hi' }] },
        identity,
        clientFactory,
      );

      expect(result).toEqual({ ok: true, data: { reply: 'Hello there' } });
      expect(clientFactory).toHaveBeenCalledWith('sk-ant-test');
      expect(client.sendChat).toHaveBeenCalledWith([{ role: 'user', content: 'Hi' }]);
    } finally {
      close();
    }
  });

  it('sends only the session message history, never full note content implicitly', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const client = fakeClient();
      const clientFactory = vi.fn().mockReturnValue(client);
      const messages = [
        { role: 'user' as const, content: 'What did I write yesterday?' },
        { role: 'assistant' as const, content: 'I have no access to your notes.' },
        { role: 'user' as const, content: 'OK, never mind.' },
      ];

      await handleChat(db, { messages }, identity, clientFactory);

      expect(client.sendChat).toHaveBeenCalledWith(messages);
      expect(client.sendChat).toHaveBeenCalledTimes(1);
    } finally {
      close();
    }
  });

  it('does not call the Anthropic client when ai_enabled is false, even with a key set', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setApiKey('sk-ant-test', identity);
      const client = fakeClient();
      const clientFactory = vi.fn().mockReturnValue(client);

      const result = await handleChat(
        db,
        { messages: [{ role: 'user', content: 'Hi' }] },
        identity,
        clientFactory,
      );

      expect(result.ok).toBe(false);
      expect(clientFactory).not.toHaveBeenCalled();
      expect(client.sendChat).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('fails gracefully with no API key configured, even when ai_enabled is true', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      const clientFactory = vi.fn();

      const result = await handleChat(
        db,
        { messages: [{ role: 'user', content: 'Hi' }] },
        identity,
        clientFactory,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/API key/i);
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('surfaces an Anthropic API error as { ok: false, message } instead of throwing', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const client = fakeClient({
        sendChat: vi.fn().mockRejectedValue(new Error('Anthropic API rate limit reached')),
      });
      const clientFactory = vi.fn().mockReturnValue(client);

      const result = await handleChat(
        db,
        { messages: [{ role: 'user', content: 'Hi' }] },
        identity,
        clientFactory,
      );

      expect(result).toEqual({ ok: false, message: 'Anthropic API rate limit reached' });
    } finally {
      close();
    }
  });

  it('rejects malformed message input gracefully', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const clientFactory = vi.fn();

      expect((await handleChat(db, {}, identity, clientFactory)).ok).toBe(false);
      expect((await handleChat(db, { messages: [] }, identity, clientFactory)).ok).toBe(false);
      expect(
        (
          await handleChat(
            db,
            { messages: [{ role: 'system', content: 'x' }] },
            identity,
            clientFactory,
          )
        ).ok,
      ).toBe(false);
      expect(
        (
          await handleChat(
            db,
            { messages: [{ role: 'user', content: '' }] },
            identity,
            clientFactory,
          )
        ).ok,
      ).toBe(false);
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });
});

describe('chat history is never persisted (ADR-002: session-only, renderer memory only)', () => {
  let identity: CredentialIdentity;

  afterEach(() => {
    if (identity) clearApiKey(identity);
  });

  it('leaves no new table and no new row in any table after a multi-turn chat session', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const clientFactory = vi
        .fn()
        .mockReturnValue(fakeClient({ sendChat: vi.fn().mockResolvedValue('reply') }));

      const tablesBefore = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[];
      const rowCountsBefore = Object.fromEntries(
        tablesBefore.map((table) => [
          table.name,
          (db.prepare(`SELECT count(*) as n FROM "${table.name}"`).get() as { n: number }).n,
        ]),
      );

      // A short multi-turn "session" — mirrors a real chat modal exchange.
      await handleChat(
        db,
        { messages: [{ role: 'user', content: 'Hi' }] },
        identity,
        clientFactory,
      );
      await handleChat(
        db,
        {
          messages: [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'reply' },
            { role: 'user', content: 'Tell me more' },
          ],
        },
        identity,
        clientFactory,
      );

      const tablesAfter = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[];
      expect(tablesAfter.map((table) => table.name).sort()).toEqual(
        tablesBefore.map((table) => table.name).sort(),
      );

      for (const table of tablesAfter) {
        const count = (
          db.prepare(`SELECT count(*) as n FROM "${table.name}"`).get() as { n: number }
        ).n;
        expect(count).toBe(rowCountsBefore[table.name]);
      }
    } finally {
      close();
    }
  });
});

describe('storynote:ai:transform', () => {
  let identity: CredentialIdentity;

  afterEach(() => {
    if (identity) clearApiKey(identity);
  });

  it('summarizes selected text and sends only that text, never the full note', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const client = fakeClient({ sendTransform: vi.fn().mockResolvedValue('Summary.') });
      const clientFactory = vi.fn().mockReturnValue(client);

      const result = await handleTransform(
        db,
        { selectedText: 'A long paragraph about deployment steps.', action: 'summarize' },
        identity,
        clientFactory,
      );

      expect(result).toEqual({ ok: true, data: { result: 'Summary.' } });
      const [prompt] = (client.sendTransform as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('A long paragraph about deployment steps.');
    } finally {
      close();
    }
  });

  it('polish does not require instructions', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const clientFactory = vi.fn().mockReturnValue(fakeClient());

      const result = await handleTransform(
        db,
        { selectedText: 'text to polish', action: 'polish' },
        identity,
        clientFactory,
      );

      expect(result.ok).toBe(true);
    } finally {
      close();
    }
  });

  it('rejects the format action when instructions are missing, without calling the client', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const clientFactory = vi.fn();

      const noInstructions = await handleTransform(
        db,
        { selectedText: 'text', action: 'format' },
        identity,
        clientFactory,
      );
      const blankInstructions = await handleTransform(
        db,
        { selectedText: 'text', action: 'format', instructions: '   ' },
        identity,
        clientFactory,
      );

      expect(noInstructions.ok).toBe(false);
      expect(blankInstructions.ok).toBe(false);
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('accepts the format action once instructions are provided', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const client = fakeClient({ sendTransform: vi.fn().mockResolvedValue('- a\n- b') });
      const clientFactory = vi.fn().mockReturnValue(client);

      const result = await handleTransform(
        db,
        { selectedText: 'a and b', action: 'format', instructions: 'as a bulleted list' },
        identity,
        clientFactory,
      );

      expect(result).toEqual({ ok: true, data: { result: '- a\n- b' } });
      const [prompt] = (client.sendTransform as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(prompt).toContain('as a bulleted list');
    } finally {
      close();
    }
  });

  it('does not call the client when ai_enabled is false', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setApiKey('sk-ant-test', identity);
      const clientFactory = vi.fn();

      const result = await handleTransform(
        db,
        { selectedText: 'text', action: 'summarize' },
        identity,
        clientFactory,
      );

      expect(result.ok).toBe(false);
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('fails gracefully with no API key configured', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      const clientFactory = vi.fn();

      const result = await handleTransform(
        db,
        { selectedText: 'text', action: 'summarize' },
        identity,
        clientFactory,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/API key/i);
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });

  it('surfaces an API error as { ok: false, message } instead of throwing', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const client = fakeClient({
        sendTransform: vi.fn().mockRejectedValue(new Error("Couldn't reach Anthropic's API.")),
      });
      const clientFactory = vi.fn().mockReturnValue(client);

      const result = await handleTransform(
        db,
        { selectedText: 'text', action: 'summarize' },
        identity,
        clientFactory,
      );

      expect(result).toEqual({ ok: false, message: "Couldn't reach Anthropic's API." });
    } finally {
      close();
    }
  });

  it('rejects malformed input gracefully', async () => {
    identity = testIdentity();
    const { db, close } = createTestDatabase();
    try {
      setSetting(db, 'ai_enabled', 'true');
      setApiKey('sk-ant-test', identity);
      const clientFactory = vi.fn();

      expect((await handleTransform(db, {}, identity, clientFactory)).ok).toBe(false);
      expect((await handleTransform(db, { selectedText: '' }, identity, clientFactory)).ok).toBe(
        false,
      );
      expect(
        (
          await handleTransform(
            db,
            { selectedText: 'text', action: 'invalid-action' },
            identity,
            clientFactory,
          )
        ).ok,
      ).toBe(false);
      expect(clientFactory).not.toHaveBeenCalled();
    } finally {
      close();
    }
  });
});
