/**
 * ==========================================================================
 * BlankMode.tsx - 기본 생성 모드 컴포넌트
 * ==========================================================================
 * 
 * AI 지원 없이 템플릿 기반으로 문서를 생성하는 화면입니다.
 * 자주 사용하는 템플릿과 전체 템플릿 검색 기능을 제공합니다.
 * ==========================================================================
 */

import { Search } from 'lucide-react';
import { frequentTemplates, allTemplates } from './types';

/**
 * BlankMode 컴포넌트 Props
 */
interface NewDocumentBlankModeProps {
  /** 선택된 템플릿 ID */
  selectedTemplate: string;
  /** 템플릿 선택 핸들러 */
  setSelectedTemplate: (id: string) => void;
  /** 템플릿 검색어 */
  templateSearch: string;
  /** 템플릿 검색어 변경 핸들러 */
  setTemplateSearch: (text: string) => void;
}

/**
 * 기본 생성 모드
 */
export const NewDocumentBlankMode = ({
  selectedTemplate,
  setSelectedTemplate,
  templateSearch,
  setTemplateSearch
}: NewDocumentBlankModeProps) => {

  /** 검색어로 필터링된 템플릿 목록 */
  const filteredTemplates = allTemplates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.description?.toLowerCase().includes(templateSearch.toLowerCase())
  );

  return (
    <>
      {/* 1. 자주 사용하는 템플릿 섹션 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-zinc-400 mb-3">
          자주 사용하는 템플릿
        </label>
        <div className="flex flex-wrap gap-2">
          {frequentTemplates.map(template => (
            <button
              key={template.id}
              onClick={() => setSelectedTemplate(template.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${selectedTemplate === template.id
                ? 'border-blue-500 bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/50'
                : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-700'
                }`}
            >
              <template.icon size={16} />
              <span>{template.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. 템플릿 검색 섹션 */}
      <div className="animate-in fade-in duration-300">
        <label className="block text-sm font-medium text-zinc-400 mb-3">템플릿 검색</label>
        <div className="relative group">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            value={templateSearch}
            onChange={(e) => setTemplateSearch(e.target.value)}
            placeholder="템플릿을 검색하세요..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-zinc-600"
          />
        </div>

        {/* 검색 결과 표시 (검색어가 있을 때만) */}
        {templateSearch && (
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto custom-scrollbar border border-zinc-700/50 rounded-lg p-1 bg-zinc-900/50">
            {filteredTemplates.map(template => (
              <button
                key={template.id}
                onClick={() => {
                  setSelectedTemplate(template.id);
                  setTemplateSearch('');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${selectedTemplate === template.id
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-zinc-400 hover:bg-zinc-800'
                  }`}
              >
                <template.icon size={18} />
                <div className="flex-1">
                  <div className="font-medium">{template.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{template.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

NewDocumentBlankMode.displayName = 'NewDocumentBlankMode';