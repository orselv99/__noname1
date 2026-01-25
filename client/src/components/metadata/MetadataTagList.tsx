/**
 * ==========================================================================
 * TagList.tsx - 태그 목록 컴포넌트
 * ==========================================================================
 * 
 * 문서에 연결된 태그들을 표시하고 관리합니다.
 * 태그 hover 시 Evidence 툴팁을 표시합니다.
 * ==========================================================================
 */

import { useState, memo } from 'react';
import { Tag, ChevronUp, ChevronDown } from 'lucide-react';
import { useContentStore } from '../../stores/contentStore';

/**
 * 태그 아이템 인터페이스
 */
interface MetadataTagItem {
  tag: string;
  evidence?: string;
}

/**
 * TagList Props
 */
interface MetadataTagListProps {
  /** 문서 ID */
  docId: string;
  /** 태그 배열 */
  tags: MetadataTagItem[];
  /** 펼침 상태 */
  isExpanded: boolean;
  /** 토글 핸들러 */
  onToggle: () => void;
}

/**
 * 태그 목록 컴포넌트
 * 
 * - 태그 배지 형태로 표시
 * - hover 시 Evidence 툴팁
 * - 삭제 버튼
 */
export const MetadataTagList = memo(({
  docId,
  tags,
  isExpanded,
  onToggle }: MetadataTagListProps) => {
  // 선택된 태그 인덱스 (동일한 evidence를 가진 태그들 구분용)
  const [selectedTagIndex, setSelectedTagIndex] = useState<number | null>(null);

  return (
    <div className="mb-6">
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={onToggle}
      >
        <Tag size={12} />
        <h3 className="text-xs font-medium flex-1">Tags ({tags?.length || 0})</h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {/* 태그 목록 */}
      {isExpanded && (
        <>
          {(!tags || tags.length === 0) ? (
            <p className="text-xs text-zinc-600 italic">No tags</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full cursor-pointer transition-colors ${selectedTagIndex === i
                      ? 'bg-blue-500/30 text-blue-300'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    onClick={() => {
                      const isDeselecting = selectedTagIndex === i;
                      setSelectedTagIndex(isDeselecting ? null : i);
                      // 에디터에 evidence 하이라이트 요청
                      useContentStore.getState().setHighlightedEvidence(
                        isDeselecting ? null : (t.evidence || null)
                      );
                    }}
                  >
                    <span className="truncate">{t.tag}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        useContentStore.getState().removeTagFromDocument(docId, i);
                      }}
                      className="ml-1 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Evidence 툴팁 - 태그 섹션 아래 가운데 정렬 */}
              {selectedTagIndex !== null && tags[selectedTagIndex]?.evidence && (
                <div className="mt-3 w-full bg-zinc-950/95 backdrop-blur border border-zinc-700 rounded-lg shadow-xl p-3 animate-in fade-in zoom-in-95 duration-200">
                  <div className="font-bold mb-1 text-zinc-400 text-[10px] uppercase tracking-wider">Evidence</div>
                  <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar">
                    {tags[selectedTagIndex].evidence}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
});

MetadataTagList.displayName = 'MetadataTagList';
