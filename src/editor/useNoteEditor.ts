import { useEffect } from 'react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor, JSONContent } from '@tiptap/react';
import { ContentShortcuts } from './contentShortcuts';
import { SearchHighlight } from './searchHighlight';

// notes.content stores a JSON-stringified TipTap document (schema.md /
// development-plan.md Phase 4). Notes created before this phase have plain
// text in that column instead — not valid JSON, so JSON.parse throws and we
// fall back to treating it as a plain string, which TipTap accepts directly
// as initial content (wrapped into a paragraph).
export function parseStoredContent(raw: string): JSONContent | string {
  if (!raw) return '';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as JSONContent;
    }
  } catch {
    // not JSON — legacy plain-text note, or genuinely just plain text
  }
  return raw;
}

export interface UseNoteEditorOptions {
  content: string;
  onUpdate: (content: string, contentPlain: string) => void;
  spellCheckEnabled: boolean;
}

// Wraps TipTap's useEditor: parses the stored content column, wires
// onUpdate to serialize both the JSON doc (-> notes.content) and the plain
// text extract (-> notes.content_plain) on every change, per Phase 4's
// "Serialize to notes.content (TipTap JSON) + derive notes.content_plain on
// save" checklist item.
export function useNoteEditor({
  content,
  onUpdate,
  spellCheckEnabled,
}: UseNoteEditorOptions): Editor | null {
  const editor = useEditor({
    editorProps: {
      attributes: { spellcheck: String(spellCheckEnabled) },
    },
    extensions: [
      // Constrained to levels 2-3 (labeled "Heading 1"/"Heading 2" in the
      // toolbar, matching .claude/ui/storynote-ui-reference.html's own
      // .note-body h2/h3 convention — h1 is reserved for the note's title
      // input, not in-content headings). Left unconfigured, StarterKit
      // defaults to levels 1-6 with Mod-Alt-3..6 shortcuts and ###-######
      // markdown input rules reachable even with no toolbar button for
      // them, producing headings main.css has no dedicated styling for
      // (a code review caught this).
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: 'Start writing…' }),
      ContentShortcuts,
      SearchHighlight,
    ],
    content: parseStoredContent(content),
    onUpdate: ({ editor }) => {
      onUpdate(JSON.stringify(editor.getJSON()), editor.getText());
    },
  });

  // editorProps.attributes above only seeds the DOM once, at creation — the
  // Settings toggle needs to apply to an already-open note immediately, with
  // no restart, so keep the live DOM attribute in sync on every change too.
  useEffect(() => {
    editor?.view.dom.setAttribute('spellcheck', String(spellCheckEnabled));
  }, [editor, spellCheckEnabled]);

  return editor;
}
