// ... imports
import { useState } from 'react';
import { safeInvoke } from '../../utils/safeInvoke';
import { X, FileText, FileCode, Table, PenLine, Presentation, BookOpen, ClipboardList, Search, ChevronDown, ChevronRight, Building2, FolderKanban, Folder, FolderPlus, Sparkles, Globe, Loader2, Database, CheckSquare, Square, ExternalLink } from 'lucide-react';
import { ThinkingAccordion, ThinkingState } from '../ui/ThinkingAccordion';
// import { useDocumentStore } from '../../stores/documentStore';

interface FolderItem {
  id: string;
  name: string;
  expanded: boolean;
  children?: FolderItem[];
}

interface NewDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate?: (data: { groupId: string; groupType: 'department' | 'project'; folderId?: string; template: string; title: string }) => void;
  onCreateFolder?: (groupId: string, parentFolderId?: string) => void;
  onToggleGroup?: (groupId: string) => void;
  onToggleFolder?: (groupId: string, folderId: string) => void;
  groups: {
    id: string;
    name: string;
    type: 'department' | 'project';
    expanded: boolean;
    folders: FolderItem[];
  }[];
}

interface WebSearchResult {
  id: string;
  title: string;
  snippet: string;
  url: string;
  selected: boolean;
  score?: number; // Add score for display
  source?: 'local' | 'server'; // Add source tag
}

interface RagSearchResult {
  document_id: string;
  distance: number;
  similarity: number;
  content: string;
  summary: string | null;
  title: string | null;
  tags: string[];
  group_name?: string;
}

const frequentTemplates = [
  { id: 'blank', name: 'Blank', icon: FileText },
  { id: 'note', name: 'Note', icon: PenLine },
  { id: 'meeting', name: 'Meeting', icon: Table },
  { id: 'code', name: 'Code', icon: FileCode },
  { id: 'presentation', name: 'Presentation', icon: Presentation },
];

const allTemplates = [
  { id: 'blank', name: 'Blank', icon: FileText, description: '빈 문서' },
  { id: 'note', name: 'Note', icon: PenLine, description: '간단한 메모' },
  { id: 'meeting', name: 'Meeting', icon: Table, description: '회의록 템플릿' },
  { id: 'code', name: 'Code', icon: FileCode, description: '코드 문서' },
  { id: 'presentation', name: 'Presentation', icon: Presentation, description: '프레젠테이션' },
  { id: 'wiki', name: 'Wiki', icon: BookOpen, description: '위키 문서' },
  { id: 'checklist', name: 'Checklist', icon: ClipboardList, description: '체크리스트' },
];

const getBadgeColor = (source: string | undefined) => {
  switch (source) {
    case 'local': return 'bg-purple-900/30 text-purple-400 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide';
    case 'server': return 'bg-blue-900/30 text-blue-400 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide';
    default: return 'bg-zinc-800 text-zinc-500 text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide';
  }
};

export const NewDocumentDialog = ({ isOpen, onClose, onCreate, onCreateFolder, onToggleGroup, onToggleFolder, groups }: NewDocumentDialogProps) => {
  //   const { documents } = useDocumentStore();
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || '');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Modes
  const [creationMode, setCreationMode] = useState<'blank' | 'ai'>('blank');

  // Blank Mode States
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [title, setTitle] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');

  // AI Mode States
  const [webSearchQuery, setWebSearchQuery] = useState('');
  //   const [sourceDocIds, setSourceDocIds] = useState<string[]>([]); // Keep for counting

  // Doc Search States
  const [docSearchQuery, setDocSearchQuery] = useState('');
  const [docSearchResults, setDocSearchResults] = useState<WebSearchResult[]>([]);
  const [isSearchingDocs, setIsSearchingDocs] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSearchingWeb, setIsSearchingWeb] = useState(false);
  const [webSearchResults, setWebSearchResults] = useState<WebSearchResult[]>([]);
  const [thinkingState, setThinkingState] = useState<ThinkingState | null>(null);

  // Accordion States (AI Mode)
  const [accordionState, setAccordionState] = useState({
    title: true,
    template: true,
    docs: true,
    web: true
  });

  const toggleAccordion = (section: 'title' | 'template' | 'docs' | 'web') => {
    setAccordionState(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleDocSearch = async () => {
    if (!docSearchQuery.trim()) return;
    setIsSearchingDocs(true);

    try {
      // Parallel execution of local and server search
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

      // Combine results
      const allResults = [
        ...localResults.map(r => ({ ...r, source: 'local' as const })),
        ...serverResults.map(r => ({ ...r, source: 'server' as const }))
      ];

      // Deduplicate by ID (taking the one with higher similarity if duplicate)
      const uniqueMap = new Map<string, typeof allResults[0]>();
      allResults.forEach(item => {
        const existing = uniqueMap.get(item.document_id);
        if (!existing || item.similarity > existing.similarity) {
          uniqueMap.set(item.document_id, item);
        }
      });

      const uniqueResults = Array.from(uniqueMap.values());

      // Sort by similarity (descending)
      uniqueResults.sort((a, b) => b.similarity - a.similarity);

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
      if (!accordionState.docs) setAccordionState(prev => ({ ...prev, docs: true }));
    }
  };

  const toggleDocResult = (id: string) => {
    setDocSearchResults(prev => {
      const next = prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r);
      // setSourceDocIds(next.filter(r => r.selected).map(r => r.id));
      return next;
    });
  };

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
        source: 'server' // 'server' implies remote/web context here or I can add 'web' to types if needed, but 'server' badge is blue. 
        // Actually, let's use a specific logic or re-use 'server' but maybe user wants it distinct? 
        // The mock had 'url' property.
        // Let's stick to the interface.
      }));

      // Pre-select top 2
      const withSelection = mappedResults.map((r, i) => i < 2 ? { ...r, selected: true } : r);
      setWebSearchResults(withSelection);
    } catch (error) {
      console.error("Web search failed", error);
    } finally {
      setIsSearchingWeb(false);
      // Auto-expand web accordion if closed to show results
      if (!accordionState.web) setAccordionState(prev => ({ ...prev, web: true }));
    }
  };

  const toggleWebResult = (id: string) => {
    setWebSearchResults(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  };

  const simulateAiGeneration = async () => {
    setIsGenerating(true);
    setThinkingState({
      local: { status: 'pending', logs: [] },
      server: { status: 'pending', logs: [] },
      web: { status: 'pending', logs: [] }
    });

    // 1. Local Docs (Mock)
    const selectedDocs = docSearchResults.filter(r => r.selected);
    if (selectedDocs.length > 0) {
      setThinkingState(prev => prev ? ({ ...prev, local: { status: 'running', logs: [{ message: `선택된 문서 ${selectedDocs.length}건 분석 중...` }] } }) : null);
      await new Promise(r => setTimeout(r, 800));
      setThinkingState(prev => prev ? ({ ...prev, local: { status: 'done', logs: [{ message: `핵심 내용 추출 완료`, subItems: selectedDocs.map(d => d.title) }] } }) : null);
    } else {
      setThinkingState(prev => prev ? ({ ...prev, local: { status: 'idle', logs: [{ message: '참조 문서 미사용' }] } }) : null);
    }

    // 2. Web Search Processing (using selected results)
    const selectedWebResults = webSearchResults.filter(r => r.selected);
    if (selectedWebResults.length > 0) {
      setThinkingState(prev => prev ? ({ ...prev, web: { status: 'running', logs: [{ message: `선택된 웹 검색 결과 ${selectedWebResults.length}건 분석 중...` }] } }) : null);
      await new Promise(r => setTimeout(r, 1000));
      setThinkingState(prev => prev ? ({ ...prev, web: { status: 'done', logs: [{ message: '핵심 정보 추출 완료', subItems: selectedWebResults.map(r => r.title) }] } }) : null);
    } else {
      setThinkingState(prev => prev ? ({ ...prev, web: { status: 'idle', logs: [{ message: '웹 검색 결과 미사용' }] } }) : null);
    }

    // 3. Drafting
    setThinkingState(prev => prev ? ({ ...prev, server: { status: 'running', logs: [{ message: '초안 작성 중...' }] } }) : null);
    await new Promise(r => setTimeout(r, 1500));
    setThinkingState(prev => prev ? ({ ...prev, server: { status: 'done', logs: [{ message: '초안 생성 완료' }] } }) : null);

    setIsGenerating(false);
    return "AI로 생성된 문서 내용입니다...";
  };

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

    // Reset States
    setTitle('');
    setSelectedTemplate('blank');
    setTemplateSearch('');
    setCreationMode('blank');
    setWebSearchQuery('');
    setWebSearchResults([]);

    // Doc Reset
    setDocSearchQuery('');
    setDocSearchResults([]);
    // setSourceDocIds([]);

    setThinkingState(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent Enter submission in Web Search input
    if (e.target instanceof HTMLInputElement && e.target.placeholder.includes('Web search')) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleWebSearch();
      }
      return;
    }

    // Prevent Enter submission in Web Search input (Korean Check)
    if (e.target instanceof HTMLInputElement && (e.target.placeholder.includes('검색어') || e.target.placeholder.includes('문서'))) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.target.placeholder.includes('문서')) handleDocSearch();
        else handleWebSearch();
      }
      return;
    }

    if (e.key === 'Enter' && title.trim() && !isGenerating) {
      handleCreate();
    } else if (e.key === 'Escape' && !isGenerating) {
      onClose();
    }
  };

  const toggleExpand = (id: string, e: React.MouseEvent, type: 'group' | 'folder', groupId?: string) => {
    e.stopPropagation();
    if (type === 'group') {
      onToggleGroup?.(id);
    } else {
      if (groupId) onToggleFolder?.(groupId, id);
    }
  };

  const filteredTemplates = allTemplates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.description.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const renderFolders = (folders: FolderItem[], groupId: string, depth: number) => {
    return folders.map(folder => (
      <div key={folder.id}>
        <div
          className={`w-full flex items-center group/folder relative pr-2 py-1.5 text-sm transition-colors cursor-pointer ${selectedFolderId === folder.id && selectedGroupId === groupId
            ? creationMode === 'ai'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-blue-500/20 text-blue-400'
            : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          style={{ paddingLeft: `${depth * 16 + 28}px` }}
          onClick={() => {
            setSelectedGroupId(groupId);
            setSelectedFolderId(folder.id);
          }}
        >
          {folder.children && folder.children.length > 0 && (
            <button
              onClick={(e) => toggleExpand(folder.id, e, 'folder', groupId)}
              className="absolute left-0 p-1 hover:text-zinc-200"
              style={{ left: `${depth * 16 + 12}px` }}
            >
              {folder.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          <Folder size={14} className="text-yellow-600 shrink-0 mr-2" />
          <span className="truncate flex-1">{folder.name}</span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder?.(groupId, folder.id);
            }}
            className="hidden group-hover/folder:flex p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 rounded"
            title="Create Folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
        {folder.expanded && folder.children && (
          <div>
            {renderFolders(folder.children, groupId, depth + 1)}
          </div>
        )}
      </div>
    ));
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
        {/* Header with Tabs */}
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

          {/* Tabs */}
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

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Group/Folder Tree */}
          <div className="w-56 border-r border-zinc-800 overflow-y-auto shrink-0 bg-zinc-900/50">
            <div className="p-2 text-xs text-zinc-500 font-medium uppercase">위치 선택</div>
            {groups.map(group => (
              <div key={group.id}>
                <div
                  className={`w-full flex items-center group/group relative pr-2 py-1.5 text-sm transition-colors cursor-pointer ${selectedGroupId === group.id && !selectedFolderId
                    ? creationMode === 'ai'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-blue-500/20 text-blue-400'
                    : 'text-zinc-400 hover:bg-zinc-800'
                    }`}
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setSelectedFolderId(null);
                    if (!group.expanded) {
                      onToggleGroup?.(group.id);
                    }
                  }}
                >
                  <button
                    onClick={(e) => toggleExpand(group.id, e, 'group')}
                    className="p-1 mx-1 hover:text-zinc-200 text-zinc-500"
                  >
                    {group.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {group.type === 'department' ? (
                    <Building2 size={14} className={` shrink-0 mr-2 ${creationMode === 'ai' ? 'text-purple-400' : 'text-blue-400'}`} />
                  ) : (
                    <FolderKanban size={14} className="text-purple-400 shrink-0 mr-2" />
                  )}
                  <span className="truncate flex-1 font-medium">{group.name}</span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateFolder?.(group.id);
                    }}
                    className="hidden group-hover/group:flex p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 rounded"
                    title="Create Folder"
                  >
                    <FolderPlus size={14} />
                  </button>
                </div>

                {group.expanded && renderFolders(group.folders, group.id, 0)}
              </div>
            ))}
          </div>

          {/* Right: Inputs Content */}
          <div className="flex-1 flex flex-col min-h-0 bg-white/5">
            {/* Scrollable Main Content */}
            <div className="flex-1 overflow-y-scroll custom-scrollbar p-5">

              {/* 1. Template Section (Blank Mode Only) */}
              {creationMode === 'blank' && (
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
              )}

              {/* 2. Middle Content (Mode Specific) */}
              <div>
                {creationMode === 'blank' ? (
                  /* Blank Mode: Template Search */
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
                ) : (
                  /* AI Mode: Accordion Inputs */
                  <div className="space-y-4 animate-in fade-in duration-300">

                    {/* Accordion 1: Title (Subject) */}
                    <div className="border border-zinc-800 rounded-lg bg-zinc-900/50 overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between p-3 text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
                        onClick={() => toggleAccordion('title')}
                      >
                        <div className="flex items-center gap-2">
                          <PenLine size={16} className="text-zinc-500" />
                          문서 제목
                        </div>
                        {accordionState.title ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
                      </button>

                      {accordionState.title && (
                        <div className="p-3 border-t border-zinc-800/50 bg-black/20 animate-in fade-in slide-in-from-top-1">
                          <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="작성할 문서의 주제나 제목을 입력하세요..."
                            className="w-full bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-zinc-600"
                            autoFocus
                            disabled={isGenerating}
                          />
                        </div>
                      )}
                    </div>

                    {/* Accordion 2: Output Template */}
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

                    {/* Accordion 3: Reference Docs */}
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
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text"
                              value={docSearchQuery}
                              onChange={(e) => setDocSearchQuery(e.target.value)}
                              placeholder="문서 검색어 입력... (Enter로 검색)"
                              className="flex-1 bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-zinc-600"
                              disabled={isGenerating}
                              onKeyDown={handleKeyDown}
                            />
                            <button
                              onClick={handleDocSearch}
                              disabled={isGenerating || isSearchingDocs || !docSearchQuery}
                              className="px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors"
                            >
                              {isSearchingDocs ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                            </button>
                          </div>

                          {/* Doc Results */}
                          {docSearchResults.length > 0 && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                              <div className="text-xs text-zinc-500 px-1 flex justify-between items-center">
                                <span>검색 결과 ({docSearchResults.filter(r => r.selected).length}개 선택)</span>
                              </div>
                              <div className="space-y-2 max-h-60 overflow-y-scroll custom-scrollbar pr-1">
                                {docSearchResults.map(result => (
                                  <div
                                    key={result.id}
                                    onClick={() => toggleDocResult(result.id)}
                                    className={`w-[356px] p-3 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-3 group ${result.selected
                                      ? 'bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20'
                                      : 'bg-zinc-950/50 border-zinc-800 hover:bg-zinc-900/50 hover:border-zinc-700'
                                      }`}
                                  >
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
                        </div>
                      )}
                    </div>

                    {/* Accordion 2: Web Search */}
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
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text"
                              value={webSearchQuery}
                              onChange={(e) => setWebSearchQuery(e.target.value)}
                              placeholder="검색어 입력... (Enter로 검색)"
                              className="flex-1 bg-zinc-800 border border-zinc-700/80 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-purple-500 transition-colors placeholder-zinc-600"
                              disabled={isGenerating}
                              onKeyDown={handleKeyDown}
                            />
                            <button
                              onClick={handleWebSearch}
                              disabled={isGenerating || isSearchingWeb || !webSearchQuery}
                              className="px-3.5 py-2 bg-zinc-800 border border-zinc-700 rounded-lg hover:bg-zinc-700 text-zinc-300 disabled:opacity-50 transition-colors"
                            >
                              {isSearchingWeb ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                            </button>
                          </div>

                          {/* Search Results */}
                          {webSearchResults.length > 0 && (
                            <div className="space-y-2 animate-in fade-in slide-in-from-top-2 w-full overflow-hidden">
                              <div className="text-xs text-zinc-500 px-1 flex justify-between items-center">
                                <span>검색 결과 ({webSearchResults.filter(r => r.selected).length}개 선택)</span>
                              </div>
                              <div className="space-y-2 max-h-60 overflow-y-scroll custom-scrollbar pr-1">
                                {webSearchResults.map(result => (
                                  <div
                                    key={result.id}
                                    onClick={() => toggleWebResult(result.id)}
                                    className={`w-[356px] p-3 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-3 group overflow-hidden ${result.selected
                                      ? 'bg-purple-500/10 border-purple-500/30 ring-1 ring-purple-500/20'
                                      : 'bg-zinc-950/50 border-zinc-800 hover:bg-zinc-900/50 hover:border-zinc-700'
                                      }`}
                                  >
                                    <div className={`mt-0.5 shrink-0 ${result.selected ? 'text-purple-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}>
                                      {result.selected ? <CheckSquare size={16} /> : <Square size={16} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between gap-2 mb-1">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <span className={`text-sm font-medium truncate ${result.selected ? 'text-purple-200' : 'text-zinc-300'}`}>
                                            {result.title}
                                          </span>
                                        </div>
                                        {result.score !== undefined && (
                                          <span className="text-[9px] text-zinc-500 font-mono shrink-0">
                                            {result.score}%
                                          </span>
                                        )}
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                              const { openUrl } = await import('@tauri-apps/plugin-opener');
                                              await openUrl(result.url);
                                            } catch (err) {
                                              console.error('Failed to open URL:', err);
                                              window.open(result.url, '_blank');
                                            }
                                          }}
                                          className="text-zinc-500 hover:text-purple-500 shrink-0 flex cursor-pointer"
                                        >
                                          <ExternalLink size={14} />
                                        </button>
                                      </div>
                                      <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed break-all">
                                        {result.snippet}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Thinking Process UI */}
                    {thinkingState && (
                      <div className="pt-2">
                        <ThinkingAccordion state={thinkingState} status="AI Drafting Process" defaultExpanded={true} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Title Section (Fixed Bottom) - Only for Blank Mode now */}
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

        {/* Footer */}
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
