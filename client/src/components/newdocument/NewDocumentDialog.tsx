/**
 * ==========================================================================
 * NewDocumentDialog.tsx - 새 문서 만들기 다이얼로그
 * ==========================================================================
 * 
 * 사용자가 새로운 문서를 생성할 수 있는 모달 다이얼로그입니다.
 * 두 가지 모드를 지원합니다:
 * 1. 기본 생성 (Blank Mode): 템플릿 선택 및 제목 입력
 * 2. AI 초안 작성 (AI Mode): 주제, 템플릿, 참조 문서, 웹 검색을 통한 AI 자동 생성
 * 
 * 주요 기능:
 * - 그룹 및 폴더 위치 선택 (Sidebar)
 * - 모드 전환 (Tabs)
 * - 모드별 입력 UI (BlankMode / AiMode)
 * - 문서 생성 실행
 * ==========================================================================
 */

import { useState } from 'react';
import { safeInvoke } from '../../utils/safeInvoke';
import { X, FileText, Sparkles, Loader2 } from 'lucide-react';
import { ThinkingState } from '../ui/ThinkingAccordion';
import { FolderItem, WebSearchResult, RagSearchResult } from './types';
import { NewDocumentSidebar } from './NewDocumentSidebar';
import { NewDocumentBlankMode } from './NewDocumentBlankMode';
import { NewDocumentAiMode } from './NewDocumentAiMode';

/**
 * NewDocumentDialog Props 정의
 */
interface NewDocumentDialogProps {
  /** 다이얼로그 표시 여부 */
  isOpen: boolean;
  /** 닫기 핸들러 */
  onClose: () => void;
  /** 생성 핸들러 */
  onCreate?: (data: { groupId: string; groupType: 'department' | 'project'; folderId?: string; template: string; title: string }) => void;
  /** 폴더 생성 핸들러 */
  onCreateFolder?: (groupId: string, parentFolderId?: string) => void;
  /** 그룹 토글 핸들러 */
  onToggleGroup?: (groupId: string) => void;
  /** 폴더 토글 핸들러 */
  onToggleFolder?: (groupId: string, folderId: string) => void;
  /** 그룹 데이터 목록 */
  groups: {
    id: string;
    name: string;
    type: 'department' | 'project';
    expanded: boolean;
    folders: FolderItem[];
  }[];
}

/**
 * 새 문서 만들기 다이얼로그 컴포넌트
 */
export const NewDocumentDialog = ({ isOpen, onClose, onCreate, onCreateFolder, onToggleGroup, onToggleFolder, groups }: NewDocumentDialogProps) => {
  // 위치 선택 상태
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || '');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // 모드 상태 ('blank' | 'ai')
  const [creationMode, setCreationMode] = useState<'blank' | 'ai'>('blank');

  // 기본 모드 상태
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [title, setTitle] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');

  // AI 모드 상태
  const [webSearchQuery, setWebSearchQuery] = useState('');

  // 문서 검색 상태
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docSearchResults, setDocSearchResults] = useState<WebSearchResult[]>([]);
  const [isSearchingDocs, setIsSearchingDocs] = useState(false);

  // AI 생성 및 웹 검색 상태
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [webSearchResults, setWebSearchResults] = useState<WebSearchResult[]>([]);
  const [thinkingState, setThinkingState] = useState<ThinkingState | null>(null);

  // 아코디언 상태 (AI 모드)
  const [accordionState, setAccordionState] = useState({
    title: true,
    template: true,
    docs: true,
    web: true
  });

  /** 아코디언 토글 */
  const toggleAccordion = (section: 'title' | 'template' | 'docs' | 'web') => {
    setAccordionState(prev => ({ ...prev, [section]: !prev[section] }));
  };

  /**
   * 문서 검색 핸들러
   * - 로컬 및 서버 검색을 병렬로 수행하고 결과를 병합합니다.
   */
  const handleDocSearch = async () => {
    if (!docSearchQuery.trim()) return;
    setIsSearchingDocs(true);

    try {
      // 로컬/서버 검색 병렬 실행
      const [localResults, serverResults] = await Promise.all([
        safeInvoke<RagSearchResult[]>('search_local', { query: docSearchQuery, limit: 5 })
          .catch(e => {
            console.error("Local search failed:", e);
            return [];
          }),
        safeInvoke<RagSearchResult[]>('search_server', { query: docSearchQuery, limit: 5 })
          .catch(e => {
            console.error("Server search failed:", e);
            return [];
          })
      ]);

      // 결과 병합 및 소스 태깅
      const allResults = [
        ...localResults.map(r => ({ ...r, source: 'local' as const })),
        ...serverResults.map(r => ({ ...r, source: 'server' as const }))
      ];

      // 중복 제거 (ID 기준, 높은 유사도 우선)
      const uniqueMap = new Map<string, typeof allResults[0]>();
      allResults.forEach(item => {
        const existing = uniqueMap.get(item.document_id);
        if (!existing || item.similarity > existing.similarity) {
          uniqueMap.set(item.document_id, item);
        }
      });

      const uniqueResults = Array.from(uniqueMap.values());

      // 유사도 내림차순 정렬
      uniqueResults.sort((a, b) => b.similarity - a.similarity);

      // UI 포맷으로 변환
      const results: WebSearchResult[] = uniqueResults.map(doc => ({
        id: doc.document_id,
        title: doc.title || 'Untitled',
        snippet: doc.summary || (doc.content ? doc.content.substring(0, 100) + '...' : '내용 없음'),
        url: '',
        selected: false,
        score: Math.round(doc.similarity),
        source: doc.source
      }));

      setDocSearchResults(results);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setIsSearchingDocs(false);
      // 검색 완료 시 아코디언 자동 열기
      if (!accordionState.docs) setAccordionState(prev => ({ ...prev, docs: true }));
    }
  };

  /** 문서 검색 결과 선택 토글 */
  const toggleDocResult = (id: string) => {
    setDocSearchResults(prev => {
      const next = prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r);
      return next;
    });
  };

  /**
   * 웹 검색 핸들러
   */
  const handleWebSearch = async () => {
    if (!webSearchQuery.trim()) return;
    setIsSearchingWeb(true);

    try {
      const results = await safeInvoke<RagSearchResult[]>('search_web', { query: webSearchQuery });

      const mappedResults: WebSearchResult[] = results.map(r => ({
        id: r.document_id, // backend sends URL as id
        title: r.title || 'Untitled',
        snippet: r.content || '',
        url: r.document_id,
        selected: false,
        score: Math.round(r.similarity),
        source: 'server'
      }));

      // 상위 2개 자동 선택
      const withSelection = mappedResults.map((r, i) => i < 2 ? { ...r, selected: true } : r);
      setWebSearchResults(withSelection);
    } catch (error) {
      console.error("Web search failed", error);
    } finally {
      setIsSearchingWeb(false);
      if (!accordionState.web) setAccordionState(prev => ({ ...prev, web: true }));
    }
  };

  /** 웹 검색 결과 선택 토글 */
  const toggleWebResult = (id: string) => {
    setWebSearchResults(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  /**
   * AI 생성 시뮬레이션
   * - 단계별 진행 상태(ThinkingState)를 업데이트하며 생성을 흉내냅니다.
   */
  const simulateAiGeneration = async () => {
    setIsGenerating(true);
    setThinkingState({
      local: { status: 'pending', logs: [] },
      server: { status: 'pending', logs: [] },
      web: { status: 'pending', logs: [] }
    });

    // 1. 참조 문서 분석
    const selectedDocs = docSearchResults.filter(r => r.selected);
    if (selectedDocs.length > 0) {
      setThinkingState(prev => prev ? ({ ...prev, local: { status: 'running', logs: [{ message: `선택된 문서 ${selectedDocs.length}건 분석 중...` }] } }) : null);
      await new Promise(r => setTimeout(r, 800));
      setThinkingState(prev => prev ? ({ ...prev, local: { status: 'done', logs: [{ message: `핵심 내용 추출 완료`, subItems: selectedDocs.map(d => d.title) }] } }) : null);
    } else {
      setThinkingState(prev => prev ? ({ ...prev, local: { status: 'idle', logs: [{ message: '참조 문서 미사용' }] } }) : null);
    }

    // 2. 웹 검색 결과 분석
    const selectedWebResults = webSearchResults.filter(r => r.selected);
    if (selectedWebResults.length > 0) {
      setThinkingState(prev => prev ? ({ ...prev, web: { status: 'running', logs: [{ message: `선택된 웹 검색 결과 ${selectedWebResults.length}건 분석 중...` }] } }) : null);
      await new Promise(r => setTimeout(r, 1000));
      setThinkingState(prev => prev ? ({ ...prev, web: { status: 'done', logs: [{ message: '핵심 정보 추출 완료', subItems: selectedWebResults.map(r => r.title) }] } }) : null);
    } else {
      setThinkingState(prev => prev ? ({ ...prev, web: { status: 'idle', logs: [{ message: '웹 검색 결과 미사용' }] } }) : null);
    }

    // 3. 초안 작성
    setThinkingState(prev => prev ? ({ ...prev, server: { status: 'running', logs: [{ message: '초안 작성 중...' }] } }) : null);
    await new Promise(r => setTimeout(r, 1500));
    setThinkingState(prev => prev ? ({ ...prev, server: { status: 'done', logs: [{ message: '초안 생성 완료' }] } }) : null);

    setIsGenerating(false);
    return "AI로 생성된 문서 내용입니다...";
  };

  /**
   * 문서 생성 핸들러
   */
  const handleCreate = async () => {
    if (!title.trim() || !selectedGroupId) return;
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return;

    if (creationMode === 'ai') {
      await simulateAiGeneration();
    }

    onCreate?.({
      groupId: group.id,
      groupType: group.type,
      folderId: selectedFolderId || undefined,
      template: creationMode === 'ai' ? 'blank' : selectedTemplate,
      title: title.trim()
    });

    // 상태 초기화
    setTitle('');
    setSelectedTemplate('blank');
    setTemplateSearch('');
    setCreationMode('blank');
    setWebSearchQuery('');
    setWebSearchResults([]);

    // 문서 검색 초기화
    setDocSearchQuery('');
    setDocSearchResults([]);

    setThinkingState(null);
    onClose();
  };

  /**
   * 키보드 이벤트 핸들러 (Enter, Escape)
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 웹 검색 입력에서의 Enter 처리
    if (e.target instanceof HTMLInputElement && e.target.placeholder.includes('Web search')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleWebSearch();
      }
      return;
    }

    // 한글 플레이스홀더 체크하여 검색 실행
    if (e.target instanceof HTMLInputElement && (e.target.placeholder.includes('검색어') || e.target.placeholder.includes('문서'))) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target.placeholder.includes('문서')) handleDocSearch();
        else handleWebSearch();
      }
      return;
    }

    // 일반 생성 실행
    if (e.key === 'Enter' && title.trim() && !isGenerating) {
      handleCreate();
    } else if (e.key === 'Escape' && !isGenerating) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={!isGenerating ? onClose : undefined}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col h-[80vh] min-h-[600px] transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 및 탭 */}
        <div className="flex flex-col border-b border-zinc-800 shrink-0 bg-zinc-900/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-lg font-semibold text-white">새 문서 만들기</h2>
            <button
              onClick={onClose}
              disabled={isGenerating}
              className="text-zinc-500 hover:text-zinc-300 p-1 disabled:opacity-50"
            >
              <X size={18} />
            </button>
          </div>

          {/* 모드 전환 탭 */}
          <div className="flex px-4 gap-6">
            <button
              onClick={() => setCreationMode('blank')}
              disabled={isGenerating}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${creationMode === 'blank'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              <FileText size={16} />
              기본 생성
            </button>
            <button
              onClick={() => setCreationMode('ai')}
              disabled={isGenerating}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${creationMode === 'ai'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
            >
              <Sparkles size={16} />
              AI 초안 작성
            </button>
          </div>
        </div>

        {/* 메인 콘텐츠 영역 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 좌측 사이드바: 그룹/폴더 트리 */}
          <NewDocumentSidebar
            groups={groups}
            selectedGroupId={selectedGroupId}
            selectedFolderId={selectedFolderId}
            creationMode={creationMode}
            onSelectGroup={(id) => {
              setSelectedGroupId(id);
              setSelectedFolderId(null);
            }}
            onSelectFolder={(groupId, folderId) => {
              setSelectedGroupId(groupId);
              setSelectedFolderId(folderId);
            }}
            onCreateFolder={onCreateFolder}
            onToggleGroup={onToggleGroup}
            onToggleFolder={onToggleFolder}
          />

          {/* 우측 콘텐츠: 입력 폼 */}
          <div className="flex-1 flex flex-col min-h-0 bg-white/5">
            {/* 스크롤 가능한 메인 입력 영역 */}
            <div className="flex-1 overflow-y-scroll custom-scrollbar p-5">

              {/* 모드별 콘텐츠 렌더링 */}
              {creationMode === 'blank' ? (
                <NewDocumentBlankMode
                  selectedTemplate={selectedTemplate}
                  setSelectedTemplate={setSelectedTemplate}
                  templateSearch={templateSearch}
                  setTemplateSearch={setTemplateSearch}
                />
              ) : (
                <NewDocumentAiMode
                  title={title}
                  setTitle={setTitle}
                  selectedTemplate={selectedTemplate}
                  setSelectedTemplate={setSelectedTemplate}
                  accordionState={accordionState}
                  toggleAccordion={toggleAccordion}
                  docSearchQuery={docSearchQuery}
                  setDocSearchQuery={setDocSearchQuery}
                  docSearchResults={docSearchResults}
                  handleDocSearch={handleDocSearch}
                  toggleDocResult={toggleDocResult}
                  isSearchingDocs={isSearchingDocs}
                  webSearchQuery={webSearchQuery}
                  setWebSearchQuery={setWebSearchQuery}
                  webSearchResults={webSearchResults}
                  handleWebSearch={handleWebSearch}
                  toggleWebResult={toggleWebResult}
                  isSearchingWeb={isSearchingWeb}
                  isGenerating={isGenerating}
                  thinkingState={thinkingState}
                  onKeyDown={handleKeyDown}
                />
              )}
            </div>

            {/* 기본 모드 하단 제목 입력 (고정) */}
            {creationMode === 'blank' && (
              <div className="px-5 py-4 border-t border-zinc-800 bg-zinc-900/50 backdrop-blur-sm z-10 shrink-0">
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  문서 제목
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="제목을 입력하세요..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-blue-500 transition-colors placeholder-zinc-600 shadow-inner"
                  autoFocus
                  disabled={isGenerating}
                />
              </div>
            )}
          </div>
        </div>

        {/* 다이얼로그 푸터 (액션 버튼) */}
        <div className="flex gap-3 px-4 py-3 border-t border-zinc-800 shrink-0 bg-zinc-900">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="flex-1 py-2.5 px-4 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm font-medium disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isGenerating}
            className={`flex-1 py-2.5 px-4 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2 ${creationMode === 'ai'
              ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/20'
              : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'
              }`}
          >
            {isGenerating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                작성 중...
              </>
            ) : (
              creationMode === 'ai' ? <>
                <Sparkles size={16} /> AI로 초안 작성
              </> : '문서 생성'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

NewDocumentDialog.displayName = 'NewDocumentDialog';