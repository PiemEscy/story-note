import { EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/react';

interface NoteEditorProps {
  editor: Editor | null;
}

// Renders the TipTap ProseMirror content area. The editor instance itself
// is created by useNoteEditor (src/editor/useNoteEditor.ts) and shared with
// EditorToolbar, so both stay in sync with the same document — this
// component is purely presentational.
function NoteEditor({ editor }: NoteEditorProps): React.JSX.Element | null {
  if (!editor) return null;

  return (
    <EditorContent
      editor={editor}
      className="text-[16.5px] leading-[1.75] text-[var(--text-primary)] [&_.tiptap]:min-h-[40vh] [&_.tiptap]:outline-none"
    />
  );
}

export default NoteEditor;
