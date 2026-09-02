import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAiStore } from './useAiStore';

interface MockAiApi {
  getStatus: ReturnType<typeof vi.fn>;
  setApiKey: ReturnType<typeof vi.fn>;
  clearApiKey: ReturnType<typeof vi.fn>;
  chat: ReturnType<typeof vi.fn>;
  transform: ReturnType<typeof vi.fn>;
}

// Installs a mocked window.storyNoteAPI.ai/.settings — the store's only IPC
// dependencies (via services/aiService.ts and services/settingsService.ts)
// — mirrors useUIStore.test.ts's installMockApi.
function installMockApi(overrides: Record<string, unknown> = {}): MockAiApi {
  const aiApi: MockAiApi = {
    getStatus: vi.fn().mockResolvedValue({ ok: true, data: { enabled: false, hasApiKey: false } }),
    setApiKey: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    clearApiKey: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    chat: vi.fn(),
    transform: vi.fn(),
    ...overrides,
  };
  const settingsApi = {
    get: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    getAll: vi.fn().mockResolvedValue({ ok: true, data: {} }),
    set: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
  // @ts-expect-error partial mock is sufficient — the store only touches `ai`/`settings`
  window.storyNoteAPI = { ai: aiApi, settings: settingsApi };
  return aiApi;
}

beforeEach(() => {
  useAiStore.setState({
    enabled: false,
    hasApiKey: false,
    isLoaded: false,
    isSavingApiKey: false,
    apiKeyError: null,
  });
});

describe('useAiStore.loadStatus', () => {
  it('loads enabled/hasApiKey from the main process', async () => {
    installMockApi({
      getStatus: vi.fn().mockResolvedValue({ ok: true, data: { enabled: true, hasApiKey: true } }),
    });
    await useAiStore.getState().loadStatus();
    expect(useAiStore.getState()).toMatchObject({ enabled: true, hasApiKey: true, isLoaded: true });
  });

  it('leaves isLoaded true but state unchanged on failure, without throwing', async () => {
    installMockApi({ getStatus: vi.fn().mockResolvedValue({ ok: false, message: 'boom' }) });
    await expect(useAiStore.getState().loadStatus()).resolves.toBeUndefined();
    expect(useAiStore.getState()).toMatchObject({
      enabled: false,
      hasApiKey: false,
      isLoaded: true,
    });
  });
});

describe('useAiStore.isAvailable', () => {
  it('is only true when both enabled and hasApiKey are true', () => {
    useAiStore.setState({ enabled: true, hasApiKey: false });
    expect(useAiStore.getState().isAvailable()).toBe(false);

    useAiStore.setState({ enabled: false, hasApiKey: true });
    expect(useAiStore.getState().isAvailable()).toBe(false);

    useAiStore.setState({ enabled: true, hasApiKey: true });
    expect(useAiStore.getState().isAvailable()).toBe(true);
  });
});

describe('useAiStore.saveApiKey / removeApiKey', () => {
  it('saves a key and reflects hasApiKey', async () => {
    const aiApi = installMockApi();
    const succeeded = await useAiStore.getState().saveApiKey('sk-ant-test');
    expect(succeeded).toBe(true);
    expect(aiApi.setApiKey).toHaveBeenCalledWith('sk-ant-test');
    expect(useAiStore.getState().hasApiKey).toBe(true);
  });

  it('surfaces a save failure via apiKeyError without throwing', async () => {
    installMockApi({
      setApiKey: vi.fn().mockResolvedValue({ ok: false, message: 'API key cannot be empty' }),
    });
    const succeeded = await useAiStore.getState().saveApiKey('');
    expect(succeeded).toBe(false);
    expect(useAiStore.getState().apiKeyError).toBe('API key cannot be empty');
    expect(useAiStore.getState().hasApiKey).toBe(false);
  });

  it('removes a key and reflects hasApiKey', async () => {
    useAiStore.setState({ hasApiKey: true });
    const aiApi = installMockApi();
    const succeeded = await useAiStore.getState().removeApiKey();
    expect(succeeded).toBe(true);
    expect(aiApi.clearApiKey).toHaveBeenCalled();
    expect(useAiStore.getState().hasApiKey).toBe(false);
  });
});
