import { useState } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

// Props 인터페이스 정의: 컴포넌트가 받을 데이터의 타입을 명시합니다.
interface RagCollapsibleSectionProps {
  title: string;          // 섹션의 제목
  icon: LucideIcon;       // 섹션 아이콘 (Lucide 아이콘 컴포넌트)
  children: React.ReactNode; // 섹션 내부에 표시될 내용
  count?: number;         // 항목의 개수 (선택 사항)
  colorClass: string;     // 텍스트 색상을 위한 CSS 클래스
  defaultExpanded?: boolean; // 초기 펼침 상태 (기본값: true)
}

/**
 * RagCollapsibleSection 컴포넌트
 * 
 * 검색 결과의 각 카테고리(로컬 문서, 서버 문서 등)를 접거나 펼칠 수 있게 해주는 UI 컴포넌트입니다.
 * 사용자는 제목을 클릭하여 내용을 숨기거나 볼 수 있습니다.
 */
export function RagCollapsibleSection({
  title,
  icon: Icon,
  children,
  count,
  colorClass,
  defaultExpanded = true
}: RagCollapsibleSectionProps) {
  // 섹션의 열림/닫힘 상태를 관리하는 state입니다.
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  // count가 undefined거나 null일 경우 0으로 처리합니다.
  const displayCount = (count === undefined || count === null) ? 0 : count;

  return (
    <div className="mb-4">
      {/* 
        섹션 헤더 버튼 
        클릭 시 isOpen 상태를 반전시켜 섹션을 열거나 닫습니다.
      */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 w-full text-left mb-2 text-[11px] font-bold uppercase tracking-wider ${colorClass} hover:opacity-80 transition-opacity select-none`}
      >
        {/* 아이콘 표시 */}
        <Icon size={12} />

        {/* 제목 표시 */}
        <span className="flex-1">{title}</span>

        {/* 개수가 0보다 클 경우 배지 형태로 표시 */}
        {displayCount > 0 && (
          <span className="text-[10px] opacity-70 bg-zinc-800/50 px-1.5 rounded-full">
            {displayCount}
          </span>
        )}

        {/* 
          화살표 아이콘 
          isOpen 상태에 따라 회전하여 열림/닫힘 상태를 시각적으로 보여줍니다.
        */}
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
        />
      </button>

      {/* 
        isOpen이 true일 때만 children(내용)을 렌더링합니다.
        애니메이션 효과를 주어 부드럽게 나타나게 합니다.
      */}
      {isOpen && (
        <div className="space-y-1 px-1 animate-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
