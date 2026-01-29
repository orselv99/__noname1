/**
 * ==========================================================================
 * AiMode.tsx - AI 생성 모드 컴포넌트
 * ==========================================================================
 * 
 * AI를 활용하여 문서를 생성하는 메인 뷰입니다.
 * Accordion UI를 사용하여 단계별 입력(제목, 템플릿, 문맥 정보)을 관리합니다.
 * ==========================================================================
 */

import { PenLine, ChevronRight, ChevronDown, FileText, Database, Globe, Paperclip, Image as ImageIcon, Mic } from 'lucide-react';
import { DraftThinkingAccordion, DraftThinkingState } from './DraftThinkingAccordion';
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
  resources: boolean; // 리소스 첨부 섹션
}

/**
 * AiMode 컴포넌트 Props
 */
interface NewDocumentAiModeProps {
  /** 제목 입력값 */
  title: string;
  /** 제목 변경 핸들러 */
  setTitle: (text: string) => void;

  /** 태그 입력값 (콤마 구분) */
  tags: string;
  /** 태그 변경 핸들러 */
  setTags: (text: string) => void;

  /** 요약/개요 입력값 */
  summary: string;
  /** 요약 변경 핸들러 */
  setSummary: (text: string) => void;

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
  thinkingState: DraftThinkingState | null;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * AI 생성 모드 컨테이너
 */
export const NewDocumentAiMode = ({
  title,
  setTitle,
  tags,
  setTags,
  summary,
  setSummary,
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

      {/* 1. 문서 정보 (제목, 태그, 요약) 섹션 */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          onClick={() => toggleAccordion('title')}
        >
          <div className="flex items-center gap-2">
            <PenLine size={16} className="text-zinc-500" />
            문서 정보 및 요약
          </div>
          {accordionState.title ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {accordionState.title && (
          <div className="p-4 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1 space-y-4">

            {/* 섹션 설명 */}
            <div className="bg-purple-500/20 p-3 rounded border border-blue-500/10 mb-2">
              <p className="text-xs text-purple-400 leading-relaxed">
                문서의 기본 정보와 개요를 작성해주세요.<br />
                이 내용은 AI가 문서의 방향성과 문맥을 이해하는 데 중요한 단서가 됩니다.
              </p>
            </div>

            {/* 제목 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">문서 제목</label>
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

            {/* 태그 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">태그</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="관련된 키워드를 콤마(,)로 구분하여 입력하세요 (예: 기획, 회의록, Q1)"
                className="w-full bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-zinc-600"
                disabled={isGenerating}
              />
            </div>

            {/* 요약/개요 입력 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500">문서 개요 및 요청사항</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="문서에 포함되어야 할 핵심 내용이나 AI에게 요청할 구체적인 지시사항을 적어주세요."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-zinc-600 resize-none"
                disabled={isGenerating}
              />
            </div>

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
          <div className="p-4 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1 space-y-3">

            {/* 섹션 설명 */}
            <div className="bg-zinc-800/50 p-2.5 rounded border border-zinc-700/50">
              <p className="text-xs text-zinc-400">
                생성할 문서의 형식을 선택하세요. 선택한 템플릿에 맞춰 구조가 자동으로 잡힙니다.
              </p>
            </div>

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
          <div className="p-4 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1 space-y-3">

            {/* 섹션 설명 */}
            <div className="bg-zinc-800/50 p-2.5 rounded border border-zinc-700/50">
              <p className="text-xs text-zinc-400">
                작성에 참고할 내부 문서를 검색하고 선택하세요. AI가 해당 문서의 내용을 분석하여 반영합니다.
              </p>
            </div>

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
          <div className="p-4 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1 space-y-3">

            {/* 섹션 설명 */}
            <div className="bg-zinc-800/50 p-2.5 rounded border border-zinc-700/50">
              <p className="text-xs text-zinc-400">
                최신 정보가 필요하다면 웹 검색을 활용하세요. 검색 결과를 선택하면 AI가 이를 바탕으로 문서를 작성합니다.
              </p>
            </div>

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

      {/* 5. [NEW] 리소스 첨부 섹션 */}
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          onClick={() => toggleAccordion('resources')}
        >
          <div className="flex items-center gap-2">
            <Paperclip size={16} className="text-zinc-500" />
            리소스 첨부 (이미지/음성)
          </div>
          {accordionState.resources ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        </button>

        {accordionState.resources && (
          <div className="p-4 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1 space-y-3">

            {/* 섹션 설명 */}
            <div className="bg-zinc-800/50 p-2.5 rounded border border-zinc-700/50">
              <p className="text-xs text-zinc-400">
                문서 작성에 필요한 이미지나 회의 녹음 파일 등 멀티미디어 자료를 첨부해주세요.
              </p>
            </div>

            {/* 파일 업로드 Placeholder UI */}
            <div className="grid grid-cols-2 gap-3">
              <button
                className="flex flex-col items-center justify-center p-4 border border-dashed border-zinc-700 rounded-lg hover:bg-zinc-800/50 hover:border-zinc-600 transition-all group"
                onClick={() => alert("이미지 첨부 기능 준비 중")}
              >
                <div className="p-2 bg-zinc-800 rounded-full mb-2 group-hover:bg-zinc-700 transition-colors">
                  <ImageIcon size={18} className="text-blue-400" />
                </div>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-300">이미지 추가</span>
              </button>

              <button
                className="flex flex-col items-center justify-center p-4 border border-dashed border-zinc-700 rounded-lg hover:bg-zinc-800/50 hover:border-zinc-600 transition-all group"
                onClick={() => alert("음성 파일 첨부 기능 준비 중")}
              >
                <div className="p-2 bg-zinc-800 rounded-full mb-2 group-hover:bg-zinc-700 transition-colors">
                  <Mic size={18} className="text-rose-400" />
                </div>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-300">음성 파일 추가</span>
              </button>
            </div>

          </div>
        )}
      </div>

      {/* 생각 과정 UI (AI 생성 시 표시) */}
      {thinkingState && (
        <div className="pt-2">
          <DraftThinkingAccordion state={thinkingState} status="AI Drafting Process" defaultExpanded={true} />
        </div>
      )}
    </div>
  );
};


NewDocumentAiMode.displayName = 'NewDocumentAiMode';