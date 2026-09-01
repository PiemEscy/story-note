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

  // Font family/size, content width, and zoom all come from .tiptap's own
  // CSS rule (main.css) and the .note-content-frame wrapper (EditorPanel.tsx)
  // now — driven by useUIStore's note-content settings — rather than fixed
  // Tailwind classes here.
  return (
    <EditorContent editor={editor} className="[&_.tiptap]:min-h-[40vh] [&_.tiptap]:outline-none" />
  );
}

export default NoteEditor;
