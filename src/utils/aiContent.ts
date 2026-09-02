import type { JSONContent } from '@tiptap/react';

// notes.content stores TipTap/ProseMirror JSON (schema.md) — an AI reply is
// plain text, so each non-empty line becomes its own paragraph node. Shared
// by useAiChatStore.ts's "Save as note" and TransformPopup.tsx's Replace/
// Insert below, which otherwise duplicated this exact conversion.
export function textToParagraphNodes(text: string): JSONContent[] {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.length > 0
    ? lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }))
    : [{ type: 'paragraph' }];
}

export function textToTipTapDocJson(text: string): string {
  return JSON.stringify({ type: 'doc', content: textToParagraphNodes(text) });
}
