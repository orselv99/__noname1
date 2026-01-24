/**
 * ==========================================================================
 * MetadataLinkList.tsx - 링크 목록 컴포넌트
 * ==========================================================================
 * 
 * 문서 콘텐츠에서 하이퍼링크(a 태그)를 추출하여 표시합니다.
 * 외부 링크 클릭 시 새 탭에서 열립니다.
 * ==========================================================================
 */

import { useState, useEffect, useMemo, memo } from 'react';
import { Link as LinkIcon, ExternalLink, ChevronUp, ChevronDown } from 'lucide-react';

/**
 * MetadataLinkList Props
 */
interface MetadataLinkListProps {
  /** 저장된 문서 콘텐츠 (HTML) */
  content: string;
  /** 실시간 편집 중인 콘텐츠 (있으면 우선 사용) */
  liveContent?: string | null;
  /** 외부에서 강제로 펼침 상태 제어 */
  forceExpanded?: boolean;
}

/**
 * 링크 아이템
 */
interface LinkItem {
  text: string;
  href: string;
}

/**
 * 링크 목록 컴포넌트
 * 
 * - 문서 콘텐츠에서 모든 하이퍼링크 추출
 * - 접을 수 있는 섹션으로 표시
 * - 클릭 시 새 탭에서 열림
 */
export const MetadataLinkList = memo(({
  content,
  liveContent,
  forceExpanded }: MetadataLinkListProps) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // 외부에서 강제로 펼침 상태를 변경할 때 동기화
  useEffect(() => {
    if (forceExpanded !== undefined) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  // 실시간 콘텐츠가 있으면 그것을 사용, 없으면 저장된 콘텐츠 사용
  const effectiveContent = liveContent ?? content;

  // HTML에서 링크 파싱
  const links = useMemo((): LinkItem[] => {
    if (!effectiveContent) return [];
    try {
      const doc = new DOMParser().parseFromString(effectiveContent, 'text/html');
      const anchors = Array.from(doc.getElementsByTagName('a'));
      return anchors.map(a => ({
        text: a.textContent || a.href,
        href: a.getAttribute('href') || ''
      })).filter(l => l.href);
    } catch (e) {
      return [];
    }
  }, [effectiveContent]);

  // 링크가 없으면 렌더링하지 않음
  if (links.length === 0) return null;

  return (
    <div className="mb-6">
      {/* 섹션 헤더 */}
      <div
        className="flex items-center gap-2 mb-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <LinkIcon size={12} />
        <h3 className="text-xs font-medium flex-1">Linked Mentions ({links.length})</h3>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </div>

      {/* 링크 목록 */}
      {isExpanded && (
        <div className="space-y-1 pl-1">
          {/* TODO: 현재는 content의 href만 보여주는데, grouping (RAG, href) 하거나 새 컴포넌트로 만들기 */}
          {links.map((link, i) => (
            <a
              key={i}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-0.5 text-xs bg-zinc-900/50 p-2 rounded border border-zinc-800 text-blue-400 hover:bg-zinc-900 transition-colors group"
            >
              <span className="font-medium truncate flex items-center gap-1">
                {link.text}
                <ExternalLink size={10} className="opacity-50" />
              </span>
              <span className="text-[10px] text-zinc-600 truncate">{link.href}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
});

MetadataLinkList.displayName = 'MetadataLinkList';
