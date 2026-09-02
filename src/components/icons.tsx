// Icon components used throughout the app, re-exported under this file's
// own names from react-icons rather than hand-rolled SVGs — one place to
// see/change the whole icon set, matching this module's original "bundled
// together, not one-per-file" reasoning. Feather (react-icons/fi) is the
// primary set: a 2px-stroke, minimalist style closest to
// .claude/ui/storynote-ui-reference.html's own icons. Tabler (react-icons/tb)
// fills in a few Feather doesn't cover (numbered lists, a literal table
// grid, dedicated sidebar-collapse/expand glyphs) in the same stroke style.
// Font Awesome (react-icons/fa) supplies the one deliberately *solid* icon
// (PinIcon) — neither Feather nor Tabler ships filled variants.
export {
  FiSun as SunIcon,
  FiMoon as MoonIcon,
  FiFileText as AllNotesIcon,
  FiArchive as ArchivedIcon,
  FiTrash2 as TrashNavIcon,
  FiTrash2 as DeleteIcon,
  FiPlus as NewNoteIcon,
  FiMoreHorizontal as MoreOptionsIcon,
  FiDownload as ExportIcon,
  FiList as BulletListIcon,
  FiArrowLeft as BackIcon,
  FiEdit2 as EditIcon,
  FiSearch as SearchIcon,
  FiLock as LockIcon,
  FiMinimize2 as CompactIcon,
  FiSettings as SettingsIcon,
  FiCheck as CheckIcon,
  FiGrid as GridViewIcon,
  FiSidebar as SidebarViewIcon,
  FiBold as BoldIcon,
  FiItalic as ItalicIcon,
  FiX as CloseIcon,
  FiChevronUp as ChevronUpIcon,
  FiChevronDown as ChevronDownIcon,
  FiUpload as ImportIcon,
  FiAlertCircle as ErrorToastIcon,
  FiSend as SendIcon,
  FiRefreshCw as RegenerateIcon,
  FiFileText as SaveAsNoteIcon,
  FiAlignLeft as SummarizeIcon,
  FiList as FormatIcon,
} from 'react-icons/fi';

export {
  TbListNumbers as NumberedListIcon,
  TbTable as TableIcon,
  TbList as ListViewIcon,
  TbColumns as LargeGridViewIcon,
  TbLayoutSidebarLeftCollapse as SidebarCollapseIcon,
  TbLayoutSidebarLeftExpand as SidebarExpandIcon,
  TbStrikethrough as StrikethroughIcon,
  TbRowInsertBottom as AddRowIcon,
  TbColumnInsertRight as AddColumnIcon,
  TbRowRemove as DeleteRowIcon,
  TbColumnRemove as DeleteColumnIcon,
  TbTableOff as DeleteTableIcon,
  // ADR-002 — shared "AI" visual marker (chat header, badge, Ask AI entry
  // point, transform popup accent) and the Polish transform action.
  TbSparkles as AiSparkleIcon,
  TbSparkle as PolishIcon,
} from 'react-icons/tb';

// storynote-ui-reference.html's .pin-icon / editor topbar "Pin note" button
// — a solid (fill, not stroke) thumbtack, unlike every other icon here.
export { FaThumbtack as PinIcon } from 'react-icons/fa';
