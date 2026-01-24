/**
 * ==========================================================================
 * AiMode.tsx - AI 생성 모드 컴포넌트
 * ==========================================================================
 * 
 * AI를 활용하여 문서를 생성하는 메인 뷰입니다.
 * Accordion UI를 사용하여 단계별 입력(제목, 템플릿, 문맥 정보)을 관리합니다.
 * ==========================================================================
 */

import { PenLine, ChevronRight, ChevronDown, FileText, Database, Globe } from 'lucide-react';
import { ThinkingAccordion, ThinkingState } from '../ui/ThinkingAccordion';
import { frequentTemplates, WebSearchResult } from './types';
import { NewDocumentAiDocSearch } from './NewDocumentAiDocSearch';
import { NewDocumentAiWebSearch } from './NewDocumentAiWebSearch';

/**
 * Accordion 상태 인터페이스
 */
export interface AccordionState {
  title: boolean;
  template: boolean;
  docs: boolean;
  web: boolean;
}

/**
 * AiMode 컴포넌트 Props
 */
interface NewDocumentAiModeProps {
  /** 제목 입력값 */
  title: string;
  /** 제목 변경 핸들러 */
  setTitle: (text: string) => void;
  /** 선택된 템플릿 ID */
  selectedTemplate: string;
  /** 템플릿 선택 핸들러 */
  setSelectedTemplate: (id: string) => void;
  /** 아코디언 상태 */
  accordionState: AccordionState;
  /** 아코디언 토글 핸들러 */
  toggleAccordion: (section: keyof AccordionState) => void;

  // 문서 검색 관련
  docSearchQuery: string;
  setDocSearchQuery: (text: string) => void;
  docSearchResults: WebSearchResult[];
  handleDocSearch: () => void;
  toggleDocResult: (id: string) => void;
  isSearchingDocs: boolean;

  // 웹 검색 관련
  webSearchQuery: string;
  setWebSearchQuery: (text: string) => void;
  webSearchResults: WebSearchResult[];
  handleWebSearch: () => void;
  toggleWebResult: (id: string) => void;
  isSearchingWeb: boolean;

  // 공통 상태
  isGenerating: boolean;
  thinkingState: ThinkingState | null;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * AI 생성 모드 컨테이너
 */
export const NewDocumentAiMode = ({
  title,
  setTitle,
  selectedTemplate,
  setSelectedTemplate,
  accordionState,
  toggleAccordion,
  docSearchQuery,
  setDocSearchQuery,
  docSearchResults,
  handleDocSearch,
  toggleDocResult,
  isSearchingDocs,
  webSearchQuery,
  setWebSearchQuery,
  webSearchResults,
  handleWebSearch,
  toggleWebResult,
  isSearchingWeb,
  isGenerating,
  thinkingState,
  onKeyDown
}: NewDocumentAiModeProps) => {
  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* 1. 문서 정보 (제목) 섹션 */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          onClick={() => toggleAccordion('title')}
        >
          <div className="flex items-center gap-2">
            <PenLine size={16} className="text-zinc-500" />
            문서 정보
          </div>
          {accordionState.title ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {accordionState.title && (
          <div className="p-3 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="작성할 문서의 주제나 제목을 입력하세요..."
              className="w-full bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-zinc-600"
              autoFocus
              disabled={isGenerating}
            />
          </div>
        )}
      </div>

      {/* 2. 출력 템플릿 선택 섹션 */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          onClick={() => toggleAccordion('template')}
        >
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-zinc-500" />
            템플릿
            {selectedTemplate && (() => {
              const template = frequentTemplates.find(t => t.id === selectedTemplate);
              return template ? (
                <span className="flex items-center gap-1 text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-mono">
                  <template.icon size={10} />
                  {template.name}
                </span>
              ) : null;
            })()}
          </div>
          {accordionState.template ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {accordionState.template && (
          <div className="p-3 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1">
            <div className="flex flex-wrap gap-2">
              {frequentTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${selectedTemplate === template.id
                    ? 'border-purple-500 bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/50'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800'
                    }`}
                >
                  <template.icon size={14} />
                  <span>{template.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. 참조 문서 검색 섹션 */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          onClick={() => toggleAccordion('docs')}
        >
          <div className="flex items-center gap-2">
            <Database size={16} className="text-zinc-500" />
            참조 문서 선택
            {docSearchResults.filter(r => r.selected).length > 0 && (
              <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-mono">
                {docSearchResults.filter(r => r.selected).length}
              </span>
            )}
          </div>
          {accordionState.docs ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {accordionState.docs && (
          <div className="p-3 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1">
            <NewDocumentAiDocSearch
              searchQuery={docSearchQuery}
              setSearchQuery={setDocSearchQuery}
              results={docSearchResults}
              onSearch={handleDocSearch}
              onToggleResult={toggleDocResult}
              isSearching={isSearchingDocs}
              isGenerating={isGenerating}
              onKeyDown={onKeyDown}
            />
          </div>
        )}
      </div>

      {/* 4. 웹 검색 섹션 */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          onClick={() => toggleAccordion('web')}
        >
          <div className="flex items-center gap-2">
            <Globe size={16} className="text-zinc-500" />
            웹 검색
            {webSearchResults.filter(r => r.selected).length > 0 && (
              <span className="text-xs bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full font-mono">
                {webSearchResults.filter(r => r.selected).length}
              </span>
            )}
          </div>
          {accordionState.web ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {accordionState.web && (
          <div className="p-3 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1">
            <NewDocumentAiWebSearch
              searchQuery={webSearchQuery}
              setSearchQuery={setWebSearchQuery}
              results={webSearchResults}
              onSearch={handleWebSearch}
              onToggleResult={toggleWebResult}
              isSearching={isSearchingWeb}
              isGenerating={isGenerating}
              onKeyDown={onKeyDown}
            />
          </div>
        )}
      </div>

      {/* 생각 과정 UI (AI 생성 시 표시) */}
      {thinkingState && (
        <div className="pt-2">
          <ThinkingAccordion state={thinkingState} status="AI Drafting Process" defaultExpanded={true} />
        </div>
      )}
    </div>
  );
};

NewDocumentAiMode.displayName = 'NewDocumentAiMode';