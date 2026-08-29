import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';

// Scaffold only — toolbar, persistence, and content_plain sync land in Phase 4.
const initialContent = '<p>StoryNote editor scaffold — TipTap is wired up.</p>';

function NoteEditor(): React.JSX.Element {
  const editor = useEditor({
    extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
    content: initialContent,
  });

  return (
    <EditorContent
      editor={editor}
      className="w-full max-w-md rounded border border-neutral-700 p-3 text-left"
    />
  );
}

export default NoteEditor;
