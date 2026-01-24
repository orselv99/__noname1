/**
 * ==========================================================================
 * MetadataFootnoteList.tsx - 각주 목록 컴포넌트
 * ==========================================================================
 * 
 * 문서 콘텐츠에서 각주(footnote)를 추출하여 표시합니다.
 * HTML 콘텐츠에서 id="fn-*" 패턴의 요소를 파싱합니다.
 * ==========================================================================
 */

import { useState, useEffect, useMemo, memo } from 'react';
import { Quote, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * MetadataFootnoteList Props
 */
interface MetadataFootnoteListProps {
  /** 저장된 문서 콘텐츠 (HTML) */
  content: string;
  /** 실시간 편집 중인 콘텐츠 (있으면 우선 사용) */
  liveContent?: string | null;
  /** 외부에서 강제로 펼침 상태 제어 */
  forceExpanded?: boolean;
}

/**
 * 각주 아이템
 */
interface FootnoteItem {
  id: string;
  text: string;
}

/**
 * 각주 목록 컴포넌트
 * 
 * - 문서 콘텐츠에서 각주 자동 추출
 * - 접을 수 있는 섹션으로 표시
 * - [N] 형식의 번호를 강조 표시
 */
export const MetadataFootnoteList = memo(({
  content,
  liveContent,
  forceExpanded
}: MetadataFootnoteListProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 외부에서 강제로 펼침 상태를 변경할 때 동기화
  useEffect(() => {
    if (forceExpanded !== undefined) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  // 실시간 콘텐츠가 있으면 그것을 사용, 없으면 저장된 콘텐츠 사용
  const effectiveContent = liveContent ?? content;

  // HTML에서 각주 파싱 (두 가지 패턴 지원: 'fn-*' (툴바), 'footnote-*' (컨텍스트메뉴))
  const footnotes = useMemo((): FootnoteItem[] => {
    if (!effectiveContent) return [];
    try {
      const doc = new DOMParser().parseFromString(effectiveContent, 'text/html');
      // id="fn-*" 또는 id="footnote-*" 패턴의 p 태그 찾기
      const fnElements = Array.from(doc.querySelectorAll('p[id^="fn-"], p[id^="footnote-"]'));
      return fnElements.map(el => ({
        id: el.id,
        text: el.textContent?.trim() || ''
      })).filter(f => f.text);
    } catch (e) {
      return [];
    }
  }, [effectiveContent]);

  // 각주가 없으면 렌더링하지 않음
  if (footnotes.length === 0) return null;

  return (
    <div className="mb-6">
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Quote size={12} />
        <h3 className="text-xs font-medium flex-1">Footnotes ({footnotes.length})</h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {/* 각주 목록 */}
      {isExpanded && (
        <div className="space-y-2 pl-1">
          {footnotes.map((fn) => (
            <div
              key={fn.id}
              className="group flex flex-col gap-1 text-xs bg-zinc-900/50 p-2 rounded border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              <div className="text-zinc-400 leading-relaxed wrap-break-word whitespace-pre-wrap">
                {/* [N] 부분 강조 표시 */}
                {fn.text.startsWith('[') ? (
                  <>
                    <span className="text-blue-400 font-medium mr-1">
                      {fn.text.split(']')[0] + ']'}
                    </span>
                    {fn.text.substring(fn.text.indexOf(']') + 1).trim()}
                  </>
                ) : fn.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

MetadataFootnoteList.displayName = 'MetadataFootnoteList';
