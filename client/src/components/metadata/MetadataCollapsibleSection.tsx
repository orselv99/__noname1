/**
 * ==========================================================================
 * MetadataCollapsibleSection.tsx - 접을 수 있는 섹션 컴포넌트
 * ==========================================================================
 * 
 * 메타데이터 패널에서 사용되는 공통 접이식 섹션 래퍼입니다.
 * Summary, Tags, Links, Resources 등 여러 섹션에서 재사용됩니다.
 * ==========================================================================
 */

import { memo, ReactNode } from 'react';
import { ChevronUp, ChevronDown, LucideIcon } from 'lucide-react';

/**
 * MetadataCollapsibleSection 컴포넌트 Props
 */
interface MetadataCollapsibleSectionProps {
  /** 섹션 제목 */
  title: string;
  /** 섹션 아이콘 (Lucide 아이콘) */
  icon: LucideIcon;
  /** 항목 수 (괄호 안에 표시) */
  count?: number;
  /** 펼침 상태 */
  isExpanded: boolean;
  /** 토글 핸들러 */
  onToggle: () => void;
  /** 자식 요소 */
  children: ReactNode;
  /** 추가 CSS 클래스 */
  className?: string;
}

/**
 * 접을 수 있는 섹션 컴포넌트
 * 
 * 헤더 클릭 시 펼침/접힘 토글
 * - 아이콘 + 제목 + 항목 수 + 화살표 표시
 */
export const MetadataCollapsibleSection = memo(({
  title,
  icon: Icon,
  count,
  isExpanded,
  onToggle,
  children,
  className = ''
}: MetadataCollapsibleSectionProps) => {
  return (
    <div className={`mb-6 ${className}`}>
      {/* 섹션 헤더 - 클릭 가능 */}
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={onToggle}
      >
        <Icon size={12} />
        <h3 className="text-xs font-medium flex-1">
          {title}
          {count !== undefined && ` (${count})`}
        </h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {/* 섹션 콘텐츠 - 펼쳐진 경우에만 표시 */}
      {isExpanded && children}
    </div>
  );
});

MetadataCollapsibleSection.displayName = 'MetadataCollapsibleSection';
