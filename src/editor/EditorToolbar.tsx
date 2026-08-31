import type { Editor } from '@tiptap/react';
import { BulletListIcon, NumberedListIcon, TableIcon } from '../components/icons';

interface EditorToolbarProps {
  editor: Editor;
}

interface ToolbarButtonProps {
  label: React.ReactNode;
  title: string;
  isActive?: boolean;
  onClick: () => void;
}

function ToolbarButton({
  label,
  title,
  isActive = false,
  onClick,
}: ToolbarButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-[26px] min-w-[26px] items-center justify-center rounded px-1.5 text-[12.5px] font-semibold transition-colors ${
        isActive
          ? 'bg-[var(--bg-active)] text-[var(--accent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </button>
  );
}

function Divider(): React.JSX.Element {
  return <span className="mx-1.5 h-[18px] w-px shrink-0 bg-[var(--border)]" />;
}

// Matches the UI reference's .editor-toolbar (text style select, bold/
// italic/strike, lists, table). Row/column editing controls (not shown in
// the static reference) appear only while the cursor is inside a table —
// per Phase 4's "table insertion + row/column editing" checklist item.
//
// The toolbar's "Heading 1"/"Heading 2" options map to TipTap heading
// levels 2/3, not 1/2 — matching the UI reference's own .note-body h2/h3
// convention, since level-1 headings are reserved for the note's title
// input rather than in-content headings (useNoteEditor.ts constrains
// StarterKit to exactly these two levels for the same reason).
function EditorToolbar({ editor }: EditorToolbarProps): React.JSX.Element {
  const currentTextStyle = editor.isActive('heading', { level: 2 })
    ? 'h1'
    : editor.isActive('heading', { level: 3 })
      ? 'h2'
      : 'paragraph';

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--border)] bg-[var(--bg-surface-raised)] px-3.5 py-1.5">
      <select
        title="Text style"
        value={currentTextStyle}
        onChange={(event) => {
          const value = event.target.value;
          const chain = editor.chain().focus();
          if (value === 'h1') chain.toggleHeading({ level: 2 }).run();
          else if (value === 'h2') chain.toggleHeading({ level: 3 }).run();
          else chain.setParagraph().run();
        }}
        className="mr-1 rounded border border-[var(--border)] bg-transparent px-1.5 py-1 text-xs text-[var(--text-secondary)]"
      >
        <option value="paragraph">Paragraph</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
      </select>

      <Divider />

      <ToolbarButton
        label={<b>B</b>}
        title="Bold (Ctrl+B)"
        isActive={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label={<i>I</i>}
        title="Italic (Ctrl+I)"
        isActive={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label={<s>S</s>}
        title="Strikethrough"
        isActive={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />

      <Divider />

      <ToolbarButton
        label={<BulletListIcon className="h-[15px] w-[15px]" />}
        title="Bulleted list"
        isActive={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label={<NumberedListIcon className="h-[15px] w-[15px]" />}
        title="Numbered list"
        isActive={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <Divider />

      <ToolbarButton
        label={<TableIcon className="h-[15px] w-[15px]" />}
        title="Insert table"
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />

      {editor.isActive('table') && (
        <>
          <Divider />
          <ToolbarButton
            label="+Row"
            title="Add row below"
            onClick={() => editor.chain().focus().addRowAfter().run()}
          />
          <ToolbarButton
            label="+Col"
            title="Add column after"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          />
          <ToolbarButton
            label="-Row"
            title="Delete current row"
            onClick={() => editor.chain().focus().deleteRow().run()}
          />
          <ToolbarButton
            label="-Col"
            title="Delete current column"
            onClick={() => editor.chain().focus().deleteColumn().run()}
          />
          <ToolbarButton
            label="⊠"
            title="Delete table"
            onClick={() => editor.chain().focus().deleteTable().run()}
          />
        </>
      )}
    </div>
  );
}

export default EditorToolbar;
