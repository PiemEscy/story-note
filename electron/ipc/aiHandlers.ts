import { ipcMain } from 'electron';
import type Database from 'better-sqlite3-multiple-ciphers';
import { clearApiKey, getApiKey, hasApiKey, setApiKey } from '../db/aiCredentials';
import type { CredentialIdentity } from '../db/keys';
import { getBooleanSetting } from '../db/settings';
import { createAnthropicClient } from '../ai/anthropicClient';
import type { AnthropicClient, ChatMessage } from '../ai/anthropicClient';
import { IPC_CHANNELS } from './channels';
import { toIpcResult, toIpcResultAsync } from './types';
import type { IpcResult } from './types';
import { isRecord, requireString } from './validation';

export type TransformAction = 'summarize' | 'polish' | 'format';
const TRANSFORM_ACTIONS: readonly TransformAction[] = ['summarize', 'polish', 'format'];

export interface AiStatus {
  enabled: boolean;
  hasApiKey: boolean;
}

// Injectable so tests can supply a fake AnthropicClient instead of hitting
// the real Anthropic API (testing.md) — mirrors notesHandlers.ts's
// ExportDeps pattern for the native save dialog.
export type AnthropicClientFactory = (apiKey: string) => AnthropicClient;

function requireMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('messages must be a non-empty array');
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`messages[${index}] must be an object`);
    }
    const role = requireString(entry.role, `messages[${index}].role`);
    if (role !== 'user' && role !== 'assistant') {
      throw new Error(`messages[${index}].role must be "user" or "assistant"`);
    }
    const content = requireString(entry.content, `messages[${index}].content`);
    if (content.trim().length === 0) {
      throw new Error(`messages[${index}].content cannot be empty`);
    }
    return { role, content };
  });
}

function requireTransformAction(value: unknown): TransformAction {
  const action = requireString(value, 'action');
  if (!(TRANSFORM_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(`action must be one of: ${TRANSFORM_ACTIONS.join(', ')}`);
  }
  return action as TransformAction;
}

// ADR-002: "instructions is required when action = format, optional/ignored
// otherwise" — Summarize/Polish need no extra input and run immediately.
function buildTransformPrompt(
  selectedText: string,
  action: TransformAction,
  instructions: string | undefined,
): string {
  switch (action) {
    case 'summarize':
      return `Summarize the following text concisely, preserving its key meaning:\n\n${selectedText}`;
    case 'polish':
      return `Rewrite the following text for clarity and tone, keeping its meaning intact:\n\n${selectedText}`;
    case 'format':
      return `Reformat the following text according to these instructions: "${instructions}"\n\nText:\n${selectedText}`;
  }
}

// Both surfaces are gated on the same two conditions (ADR-002's Network
// boundary) — settings.ai_enabled and a stored API key. Neither alone is
// enough: ai_enabled with no key has nothing to call, and a stored key with
// ai_enabled off must not fire a network call just because a key happens to
// exist (e.g. right after it's entered, before the toggle is switched on).
function requireAiAvailable(
  db: Database.Database,
  identity: CredentialIdentity | undefined,
): string {
  if (!getBooleanSetting(db, 'ai_enabled')) {
    throw new Error('AI features are turned off. Enable AI in Settings to use this.');
  }
  const apiKey = getApiKey(identity);
  if (!apiKey) {
    throw new Error('No Anthropic API key is set. Add one in Settings to use AI features.');
  }
  return apiKey;
}

export function handleGetStatus(
  db: Database.Database,
  identity?: CredentialIdentity,
): IpcResult<AiStatus> {
  return toIpcResult(() => ({
    enabled: getBooleanSetting(db, 'ai_enabled'),
    hasApiKey: hasApiKey(identity),
  }));
}

export function handleSetApiKey(input: unknown, identity?: CredentialIdentity): IpcResult<void> {
  return toIpcResult(() => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const apiKey = requireString(input.apiKey, 'apiKey').trim();
    if (apiKey.length === 0) {
      throw new Error('API key cannot be empty');
    }
    setApiKey(apiKey, identity);
  });
}

export function handleClearApiKey(identity?: CredentialIdentity): IpcResult<void> {
  return toIpcResult(() => clearApiKey(identity));
}

export async function handleChat(
  db: Database.Database,
  input: unknown,
  identity?: CredentialIdentity,
  clientFactory: AnthropicClientFactory = createAnthropicClient,
): Promise<IpcResult<{ reply: string }>> {
  return toIpcResultAsync(async () => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const messages = requireMessages(input.messages);
    const apiKey = requireAiAvailable(db, identity);
    const reply = await clientFactory(apiKey).sendChat(messages);
    return { reply };
  });
}

export async function handleTransform(
  db: Database.Database,
  input: unknown,
  identity?: CredentialIdentity,
  clientFactory: AnthropicClientFactory = createAnthropicClient,
): Promise<IpcResult<{ result: string }>> {
  return toIpcResultAsync(async () => {
    if (!isRecord(input)) {
      throw new Error('input must be an object');
    }
    const selectedText = requireString(input.selectedText, 'selectedText');
    if (selectedText.trim().length === 0) {
      throw new Error('selectedText cannot be empty');
    }
    const action = requireTransformAction(input.action);
    const instructions =
      input.instructions === undefined
        ? undefined
        : requireString(input.instructions, 'instructions');
    if (action === 'format' && (!instructions || instructions.trim().length === 0)) {
      throw new Error('instructions are required for the format action');
    }

    const apiKey = requireAiAvailable(db, identity);
    const prompt = buildTransformPrompt(selectedText, action, instructions);
    const result = await clientFactory(apiKey).sendTransform(prompt);
    return { result };
  });
}

export function registerAiHandlers(
  db: Database.Database,
  identity?: CredentialIdentity,
  clientFactory?: AnthropicClientFactory,
): void {
  ipcMain.handle(IPC_CHANNELS.ai.getStatus, () => handleGetStatus(db, identity));
  ipcMain.handle(IPC_CHANNELS.ai.setApiKey, (_event, input) => handleSetApiKey(input, identity));
  ipcMain.handle(IPC_CHANNELS.ai.clearApiKey, () => handleClearApiKey(identity));
  ipcMain.handle(IPC_CHANNELS.ai.chat, (_event, input) =>
    handleChat(db, input, identity, clientFactory),
  );
  ipcMain.handle(IPC_CHANNELS.ai.transform, (_event, input) =>
    handleTransform(db, input, identity, clientFactory),
  );
}
