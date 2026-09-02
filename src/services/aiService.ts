import type { AiStatus, TransformAction } from '../../electron/ipc/aiHandlers';
import type { IpcResult } from '../../electron/ipc/types';

export type { AiStatus, TransformAction };

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Unwraps the { ok, data } / { ok: false, message } envelope every IPC call
// returns, throwing on failure — mirrors notesService.ts's unwrap().
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.data;
}

export const aiService = {
  getStatus: () => window.storyNoteAPI.ai.getStatus().then(unwrap),
  setApiKey: (apiKey: string) => window.storyNoteAPI.ai.setApiKey(apiKey).then(unwrap),
  clearApiKey: () => window.storyNoteAPI.ai.clearApiKey().then(unwrap),
  chat: (messages: AiChatMessage[]) => window.storyNoteAPI.ai.chat(messages).then(unwrap),
  transform: (input: { selectedText: string; action: TransformAction; instructions?: string }) =>
    window.storyNoteAPI.ai.transform(input).then(unwrap),
};
