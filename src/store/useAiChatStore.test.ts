import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiChatStore } from './useAiChatStore';
import { useNoteStore } from './useNoteStore';
import type { PublicNoteRow } from '../services/notesService';
import type { StoryNoteAPI } from '../../electron/preloadApi';

function note(id: number, overrides: Partial<PublicNoteRow> = {}): PublicNoteRow {
  return {
    id,
    title: `Note ${id}`,
    content: '',
    content_plain: '',
    label_id: null,
    is_pinned: 0,
    is_archived: 0,
    is_locked: 0,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    deleted_at: null,
    ...overrides,
  };
}

interface MockAiApi {
  getStatus: ReturnType<typeof vi.fn>;
  setApiKey: ReturnType<typeof vi.fn>;
  clearApiKey: ReturnType<typeof vi.fn>;
  chat: ReturnType<typeof vi.fn>;
  transform: ReturnType<typeof vi.fn>;
}

// Installs a mocked window.storyNoteAPI.ai (this store's own dependency) plus
// .notes/.settings (saveAsNote goes through useNoteStore.createNote, the
// same code path plain note creation uses — see useNoteStore.test.ts's own
// installMockApi for the fuller notes/labels/search/settings shape this
// mirrors).
function installMockApi(overrides: Record<string, unknown> = {}): MockAiApi {
  const aiApi: MockAiApi = {
    getStatus: vi.fn(),
    setApiKey: vi.fn(),
    clearApiKey: vi.fn(),
    chat: vi.fn(),
    transform: vi.fn(),
    ...overrides,
  };
  const notesApi = {
    create: vi.fn().mockResolvedValue({ ok: true, data: note(1) }),
    list: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    getCounts: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { active: 0, archived: 0, trash: 0, byLabel: {} } }),
  };
  const settingsApi = {
    get: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    set: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
  window.storyNoteAPI = {
    ai: aiApi,
    notes: notesApi,
    labels: { assign: vi.fn() },
    search: { query: vi.fn().mockResolvedValue({ ok: true, data: [] }) },
    settings: settingsApi,
  } as unknown as StoryNoteAPI;
  return aiApi;
}

beforeEach(() => {
  useAiChatStore.setState({ messages: [], isSending: false, error: null });
  useNoteStore.setState({
    notes: [],
    activeNoteId: null,
    filter: 'active',
    labelFilter: null,
    noteCounts: null,
    error: null,
  });
});

describe('useAiChatStore.sendMessage', () => {
  it('appends the user message, then the assistant reply, sending the full history', async () => {
    const aiApi = installMockApi({
      chat: vi.fn().mockResolvedValue({ ok: true, data: { reply: 'Hi there' } }),
    });

    await useAiChatStore.getState().sendMessage('Hello');

    const { messages, isSending, error } = useAiChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'Hello' });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'Hi there' });
    expect(isSending).toBe(false);
    expect(error).toBeNull();
    expect(aiApi.chat).toHaveBeenCalledWith([{ role: 'user', content: 'Hello' }]);
  });

  it('does nothing for a blank message', async () => {
    const aiApi = installMockApi();
    await useAiChatStore.getState().sendMessage('   ');
    expect(useAiChatStore.getState().messages).toEqual([]);
    expect(aiApi.chat).not.toHaveBeenCalled();
  });

  it('surfaces a failure via error, keeping the user message in place', async () => {
    installMockApi({
      chat: vi.fn().mockResolvedValue({ ok: false, message: 'No Anthropic API key is set.' }),
    });

    await useAiChatStore.getState().sendMessage('Hello');

    const { messages, error } = useAiChatStore.getState();
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(error).toBe('No Anthropic API key is set.');
  });
});

describe('useAiChatStore.regenerate', () => {
  it('resends history up to the assistant message and replaces its content in place', async () => {
    const aiApi = installMockApi({
      chat: vi.fn().mockResolvedValue({ ok: true, data: { reply: 'v2' } }),
    });
    useAiChatStore.setState({
      messages: [
        { id: 'u1', role: 'user', content: 'Hi' },
        { id: 'a1', role: 'assistant', content: 'v1' },
      ],
    });

    await useAiChatStore.getState().regenerate('a1');

    expect(aiApi.chat).toHaveBeenCalledWith([{ role: 'user', content: 'Hi' }]);
    expect(useAiChatStore.getState().messages).toEqual([
      { id: 'u1', role: 'user', content: 'Hi' },
      { id: 'a1', role: 'assistant', content: 'v2' },
    ]);
  });
});

describe('useAiChatStore.saveAsNote', () => {
  it('creates a real note via the existing notes IPC, using the assistant message as content', async () => {
    const notesApi = { create: vi.fn().mockResolvedValue({ ok: true, data: note(7) }) };
    installMockApi();
    // Layer the fuller notes mock on top (create's return value matters here).
    (window.storyNoteAPI as unknown as { notes: unknown }).notes = {
      ...(window.storyNoteAPI as unknown as { notes: Record<string, unknown> }).notes,
      ...notesApi,
    };
    useAiChatStore.setState({
      messages: [{ id: 'a1', role: 'assistant', content: 'Checklist:\n1. First step' }],
    });

    const created = await useAiChatStore.getState().saveAsNote('a1');

    expect(created).toMatchObject({ id: 7 });
    expect(notesApi.create).toHaveBeenCalledTimes(1);
    const [input] = notesApi.create.mock.calls[0];
    expect(input.title).toBe('Checklist:');
    expect(input.contentPlain).toBe('Checklist:\n1. First step');
    expect(() => JSON.parse(input.content)).not.toThrow();
    expect(useNoteStore.getState().activeNoteId).toBe(7);
    expect(useAiChatStore.getState().aiOriginatedNoteIds.has(7)).toBe(true);
  });

  it('returns null for a message id that does not exist or is not an assistant message', async () => {
    installMockApi();
    useAiChatStore.setState({ messages: [{ id: 'u1', role: 'user', content: 'Hi' }] });

    expect(await useAiChatStore.getState().saveAsNote('missing')).toBeNull();
    expect(await useAiChatStore.getState().saveAsNote('u1')).toBeNull();
  });
});

describe('useAiChatStore.reset', () => {
  it('clears messages, matching ADR-002 session-only chat history', () => {
    useAiChatStore.setState({
      messages: [{ id: 'u1', role: 'user', content: 'Hi' }],
      isSending: true,
      error: 'boom',
    });

    useAiChatStore.getState().reset();

    expect(useAiChatStore.getState()).toMatchObject({
      messages: [],
      isSending: false,
      error: null,
    });
  });

  it('does not clear aiOriginatedNoteIds — a saved note stays a real note independent of the chat session', () => {
    useAiChatStore.setState({ aiOriginatedNoteIds: new Set([7]) });
    useAiChatStore.getState().reset();
    expect(useAiChatStore.getState().aiOriginatedNoteIds.has(7)).toBe(true);
  });
});
