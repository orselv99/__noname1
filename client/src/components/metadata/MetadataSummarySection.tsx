/**
 * ==========================================================================
 * SummarySection.tsx - 요약 섹션 컴포넌트
 * ==========================================================================
 * 
 * 문서의 요약(Summary)을 표시하는 접이식 섹션입니다.
 * ==========================================================================
 */

import { memo } from 'react';
import { AlignLeft, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * SummarySection Props
 */
interface MetadataSummarySectionProps {
  /** 요약 텍스트 */
  summary: string | null | undefined;
  /** 펼침 상태 */
  isExpanded: boolean;
  /** 토글 핸들러 */
  onToggle: () => void;
}

/**
 * 요약 섹션 컴포넌트
 */
export const MetadataSummarySection = memo(({
  summary,
  isExpanded,
  onToggle }: MetadataSummarySectionProps) => {
  return (
    <div className="mb-6">
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={onToggle}
      >
        <AlignLeft size={12} />
        <h3 className="text-xs font-medium flex-1">Summary</h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {/* 요약 내용 */}
      {isExpanded && (
        <p className="text-xs text-zinc-400 leading-relaxed wrap-break-word">
          {summary || <span className="text-zinc-600 italic">No summary</span>}
        </p>
      )}
    </div>
  );
});

MetadataSummarySection.displayName = 'MetadataSummarySection';
