import Anthropic from '@anthropic-ai/sdk';

// claude-sonnet-5 — chosen over claude-opus-5 for this feature specifically:
// StoryNote's chat/summarize/polish/format calls don't need frontier
// reasoning, and the cost is spent from the user's own supplied API key, not
// the app's.
export const AI_MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 4096;

const CHAT_SYSTEM_PROMPT =
  'You are a helpful assistant embedded in StoryNote, a note-taking app. ' +
  'Keep responses concise and useful. When asked to draft a note, write it ' +
  'directly, ready to save as-is.';

const TRANSFORM_SYSTEM_PROMPT =
  'You are a writing assistant embedded in a note-taking app, acting on a ' +
  'piece of text the user selected. Respond with only the transformed text ' +
  '— no preamble, no explanation, no surrounding quotes or markdown code ' +
  'fences unless the source text itself was code.';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicClient {
  sendChat: (messages: ChatMessage[]) => Promise<string>;
  sendTransform: (prompt: string) => Promise<string>;
}

function extractText(response: Anthropic.Message): string {
  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error("The AI didn't return a usable response. Try again.");
  }
  return textBlock.text;
}

// Translates SDK failures into messages safe to show the user directly —
// callers never need to inspect the raw error themselves. The real error is
// still logged (code-style.md: never swallow silently), but a raw
// Anthropic error/stack trace never reaches the renderer (architecture.md's
// Data Flow: IPC results are { ok, ... } / { ok: false, message } only).
function describeAnthropicError(error: unknown): string {
  console.error('[anthropicClient] request failed', error);
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Your Anthropic API key was rejected. Check the key in Settings.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "You've hit Anthropic's rate limit. Try again in a moment.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Anthropic's API. Check your internet connection.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Anthropic's API returned an error (${error.status ?? 'unknown status'}). Try again.`;
  }
  return 'Something went wrong contacting the AI service.';
}

// The one place that constructs an Anthropic client and shapes a request —
// electron/ipc/aiHandlers.ts accepts this as an injectable factory
// (matching notesHandlers.ts's ExportDeps pattern) so its tests can supply a
// fake AnthropicClient instead of hitting the real API (testing.md: no real
// API calls in the test suite).
export function createAnthropicClient(apiKey: string): AnthropicClient {
  const client = new Anthropic({ apiKey });

  return {
    sendChat: async (messages) => {
      try {
        const response = await client.messages.create({
          model: AI_MODEL,
          max_tokens: MAX_TOKENS,
          system: CHAT_SYSTEM_PROMPT,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
        });
        return extractText(response);
      } catch (error) {
        throw new Error(describeAnthropicError(error));
      }
    },

    sendTransform: async (prompt) => {
      try {
        const response = await client.messages.create({
          model: AI_MODEL,
          max_tokens: MAX_TOKENS,
          system: TRANSFORM_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: prompt }],
        });
        return extractText(response);
      } catch (error) {
        throw new Error(describeAnthropicError(error));
      }
    },
  };
}
