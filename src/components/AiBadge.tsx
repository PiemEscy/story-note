import { AiSparkleIcon } from './icons';

interface AiBadgeProps {
  className?: string;
}

// Shared "AI" visual marker (ADR-002) — storynote-ui-reference.html's
// .ai-badge, used wherever AI-touched content needs to stay visually
// distinct from the user's own writing: the transform popup's result
// preview and any note originated via the chat modal's "Save as note".
function AiBadge({ className = '' }: AiBadgeProps): React.JSX.Element {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#2563EB] py-[2px] pr-[7px] pl-[5px] text-[10px] font-bold text-white ${className}`}
    >
      <AiSparkleIcon className="h-[10px] w-[10px]" />
      AI
    </span>
  );
}

export default AiBadge;
