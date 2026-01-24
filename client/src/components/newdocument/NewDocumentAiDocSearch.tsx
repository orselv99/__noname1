/**
 * ==========================================================================
 * NewDocumentAiDocSearch.tsx - AI 참조 문서 검색 컴포넌트
 * ==========================================================================
 * 
 * RAG(검색 증강 생성)를 위해 내부 문서를 검색하고 선택하는 영역입니다.
 * 로컬/서버 검색을 동시에 수행하고 유사도 순으로 결과를 표시합니다.
 * ==========================================================================
 */

import { Search, Loader2, CheckSquare, Square, FileText, ExternalLink } from 'lucide-react';
import { WebSearchResult } from './types';

/**
 * AiDocSearch 컴포넌트 Props
 */
interface NewDocumentAiDocSearchProps {
  /** 검색어 */
  searchQuery: string;
  /** 검색어 변경 핸들러 */
  setSearchQuery: (text: string) => void;
  /** 검색 결과 목록 */
  results: WebSearchResult[];
  /** 검색 실행 핸들러 */
  onSearch: () => void;
  /** 검색 결과 선택 토글 핸들러 */
  onToggleResult: (id: string) => void;
  /** 검색 중 여부 */
  isSearching: boolean;
  /** AI 생성 중 여부 (입력 비활성화용) */
  isGenerating: boolean;
  /** 키보드 이벤트 핸들러 */
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * 뱃지 색상 결정 헬퍼 함수
 */
const getBadgeColor = (source: string | undefined) => {
  switch (source) {
    case 'local': return 'bg-purple-900/30 text-purple-400 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide';
    case 'server': return 'bg-blue-900/30 text-blue-400 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide';
    default: return 'bg-zinc-800 text-zinc-500 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide';
  }
};

/**
 * 참조 문서 검색 컴포넌트
 */
export const NewDocumentAiDocSearch = ({
  searchQuery,
  setSearchQuery,
  results,
  onSearch,
  onToggleResult,
  isSearching,
  isGenerating,
  onKeyDown
}: NewDocumentAiDocSearchProps) => {

  const selectedCount = results.filter(r => r.selected).length;

  return (
    <>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="문서 검색어 입력... (Enter로 검색)"
          className="flex-1 bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-zinc-600"
          disabled={isGenerating}
          onKeyDown={onKeyDown}
        />
        <button
          onClick={onSearch}
          disabled={isGenerating || isSearching || !searchQuery}
          className="px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors"
        >
          {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
        </button>
      </div>

      {/* 검색 결과 목록 */}
      {results.length > 0 && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
          <div className="text-xs text-zinc-500 px-1 flex justify-between items-center">
            <span>검색 결과 ({selectedCount}개 선택)</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-scroll custom-scrollbar pr-1">
            {results.map(result => (
              <div
                key={result.id}
                onClick={() => onToggleResult(result.id)}
                className={`w-[356px] p-3 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-3 group ${result.selected
                  ? 'bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20'
                  : 'bg-zinc-950/50 border-zinc-800 hover:bg-zinc-900/50 hover:border-zinc-700'
                  }`}
              >
                {/* 체크박스 */}
                <div className={`mt-0.5 shrink-0 ${result.selected ? 'text-purple-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                  {result.selected ? <CheckSquare size={16} /> : <Square size={16} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {result.url ? <ExternalLink size={14} className="text-zinc-500" /> : <FileText size={14} className="text-zinc-500" />}
                      <span className={`text-sm font-medium truncate ${result.selected ? 'text-purple-200' : 'text-zinc-300'}`}>
                        {result.title}
                      </span>
                      {result.source && (
                        <span className={getBadgeColor(result.source)}>
                          {result.source}
                        </span>
                      )}
                    </div>
                    {/* 유사도 점수 */}
                    {result.score !== undefined && (
                      <span className="text-[9px] text-zinc-500 font-mono shrink-0">
                        {result.score}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
                    {result.snippet}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

NewDocumentAiDocSearch.displayName = 'NewDocumentAiDocSearch';