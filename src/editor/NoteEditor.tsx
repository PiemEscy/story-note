import { EditorContent } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import TransformPopup from './TransformPopup';

interface NoteEditorProps {
  editor: Editor | null;
}

// Renders the TipTap ProseMirror content area. The editor instance itself
// is created by useNoteEditor (src/editor/useNoteEditor.ts) and shared with
// EditorToolbar, so both stay in sync with the same document. Also mounts
// ADR-002's selection transform popup — only ever reachable here, alongside
// a real, unlocked note's editor: NoteEditorForm renders LockedNotePanel
// instead of this component while a note is locked, so a locked note's
// content is never selectable and this popup can never appear for it.
function NoteEditor({ editor }: NoteEditorProps): React.JSX.Element | null {
  if (!editor) return null;

  // Font family/size, content width, and zoom all come from .tiptap's own
  // CSS rule (main.css) and the .note-content-frame wrapper (EditorPanel.tsx)
  // now — driven by useUIStore's note-content settings — rather than fixed
  // Tailwind classes here.
  return (
    <>
      <EditorContent
        editor={editor}
        className="[&_.tiptap]:min-h-[40vh] [&_.tiptap]:outline-none"
      />
      <TransformPopup editor={editor} />
    </>
  );
}

export default NoteEditor;
