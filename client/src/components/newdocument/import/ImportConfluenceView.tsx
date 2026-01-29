import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Loader2, Globe, File, Search } from 'lucide-react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

export interface ConfluencePage {
  id: string;
  title: string;
  space_key: string;
}

export interface ImportConfluenceViewHandle {
  executeImport: () => Promise<void>;
}

interface ImportConfluenceViewProps {
  onImportSelected?: (content: string) => void;
  onClose?: () => void;
  onSelectionChange?: (hasSelection: boolean) => void;
}

const ImportConfluenceView = forwardRef<ImportConfluenceViewHandle, ImportConfluenceViewProps>(({
  onImportSelected,
  onClose,
  onSelectionChange
}, ref) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [spaces, setSpaces] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [pages, setPages] = useState<ConfluencePage[]>([]);
  const [selectedPage, setSelectedPage] = useState<ConfluencePage | null>(null);

  // Check auth on mount or deep link
  useEffect(() => {
    const unlisten = listen<any>('confluence-auth-success', (event) => {
      console.log('Confluence auth success:', event.payload);
      setIsAuthenticated(true);
      // Automatically load something?
    });

    // Also listen to general deep link event if we manual handle it
    const unlistenDeep = listen<any>('deep-link-auth', (event) => {
      if (event.payload.type === 'confluence') {
        finishAuth(event.payload.code);
      }
    });

    return () => {
      unlisten.then(f => f());
      unlistenDeep.then(f => f());
    };
  }, []);

  useEffect(() => {
    onSelectionChange?.(!!selectedPage);
  }, [selectedPage, onSelectionChange]);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await invoke('init_confluence_auth');
    } catch (e) {
      console.error('Init auth failed', e);
      setIsLoading(false);
    }
  };

  const finishAuth = async (code: string) => {
    try {
      await invoke('finish_confluence_auth', { code });
      setIsAuthenticated(true);
    } catch (e) {
      console.error('Finish auth failed', e);
      alert('Confluence Authectication Failed: ' + e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    // setSelectedPage(null); // Keep selection or clear?
    try {
      const result = await invoke<ConfluencePage[]>('search_confluence_pages', { query: searchQuery });
      setPages(result);
    } catch (e) {
      console.error('Search pages failed', e);
      alert('검색 실패: ' + String(e));
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedPage) return;
    setIsLoading(true);
    try {
      const content = await invoke<string>('import_confluence_page', { pageId: selectedPage.id });
      onImportSelected?.(content);
      onClose?.();
    } catch (e) {
      console.error('Import failed', e);
      alert('Import failed: ' + e);
    } finally {
      setIsLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    executeImport: handleImport
  }));

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 animate-in fade-in slide-in-from-bottom-5">
        <div className="text-center space-y-3">
          <div className="bg-emerald-500/10 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
            <Globe className="w-10 h-10 text-emerald-500" />
          </div>
          <h3 className="text-xl font-bold text-white">Confluence 연결</h3>
          <p className="text-sm text-zinc-400 max-w-xs mx-auto">
            Atlassian 계정으로 로그인하여<br />Confluence 문서를 바로 가져오세요.
          </p>
        </div>
        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2"
        >
          {isLoading && <Loader2 className="animate-spin w-4 h-4" />}
          {isLoading ? '연결 중...' : 'Confluence 로그인'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-4 p-4 animate-in fade-in">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="페이지 제목 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-md pl-3 pr-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition-colors placeholder:text-zinc-500"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Search size={16} />
          검색
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 border border-zinc-700 bg-zinc-900/50 rounded-md overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
          {pages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
              <File className="w-8 h-8 opacity-20" />
              <span className="text-sm">검색 결과가 없습니다.</span>
            </div>
          )}

          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <span className="text-sm">검색 중...</span>
            </div>
          )}

          <div className="space-y-1">
            {pages.map(page => (
              <div
                key={page.id}
                className={`
                        flex items-center p-3 rounded-lg cursor-pointer transition-colors border
                        ${selectedPage?.id === page.id
                    ? 'bg-emerald-500/20 border-emerald-500/50'
                    : 'hover:bg-zinc-800 border-transparent'}
                    `}
                onClick={() => setSelectedPage(page)}
              >
                <File className={`w-5 h-5 mr-3 shrink-0 ${selectedPage?.id === page.id ? 'text-emerald-400' : 'text-zinc-500'}`} />
                <div className="flex-1 overflow-hidden min-w-0">
                  <div className={`truncate font-medium text-sm ${selectedPage?.id === page.id ? 'text-emerald-100' : 'text-zinc-300'}`}>
                    {page.title}
                  </div>
                  <div className="text-xs text-zinc-500 truncate mt-0.5 flex items-center gap-1">
                    <span>Space Key:</span>
                    <span className="text-zinc-400">{page.space_key}</span>
                  </div>
                </div>
                {selectedPage?.id === page.id && <div className="w-2 h-2 rounded-full bg-emerald-500 ml-2"></div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-500 px-1">
        {selectedPage ? (
          <span className="text-emerald-400">선택됨: {selectedPage.title}</span>
        ) : (
          '가져올 페이지를 선택하세요.'
        )}
      </div>
    </div>
  );
});

ImportConfluenceView.displayName = 'ImportConfluenceView';

export default ImportConfluenceView;
