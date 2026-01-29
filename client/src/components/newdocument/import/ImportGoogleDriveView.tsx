import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Loader2, AlertCircle, Cloud, HardDrive, Folder, ChevronLeft, CheckSquare, Square, FileText, ChevronRight } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
}

export interface ImportGoogleDriveViewHandle {
  executeImport: () => Promise<void>;
}

interface ImportGoogleDriveViewProps {
  onImportSelected: (files: { name: string, content: string }[]) => Promise<void>;
  onClose: () => void;
  onSelectionChange?: (count: number) => void;
}

/**
 * ImportGoogleDriveView
 * - Google Drive Authentication
 * - Folder Navigation (Breadcrumbs)
 * - Multi-file Selection (Persisted across folders)
 * - Caching (Folder contents)
 */
export const ImportGoogleDriveView = forwardRef<ImportGoogleDriveViewHandle, ImportGoogleDriveViewProps>(
  ({ onImportSelected, onClose, onSelectionChange }, ref) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);

    const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
    const [googleFiles, setGoogleFiles] = useState<GoogleFile[]>([]);
    const [isGoogleAuthLoading, setIsGoogleAuthLoading] = useState(false);

    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [folderStack, setFolderStack] = useState<{ id: string, name: string }[]>([]);

    // Selection State: Persistence using Map (ID -> File Object)
    const [selectedFilesMap, setSelectedFilesMap] = useState<Map<string, GoogleFile>>(new Map());

    // Cache State: Record<FolderID | 'root', GoogleFile[]>
    const [folderCache, setFolderCache] = useState<Record<string, GoogleFile[]>>({});

    // Notify parent on selection change
    useEffect(() => {
      onSelectionChange?.(selectedFilesMap.size);
    }, [selectedFilesMap, onSelectionChange]);

    // Expose handle to parent
    useImperativeHandle(ref, () => ({
      executeImport: async () => {
        await handleImport();
      }
    }));

    // --- Actions ---

    const handleGoogleDriveAuth = async () => {
      setIsGoogleAuthLoading(true);
      setError(null);
      setStatusMessage("구글 로그인 대기 중... 브라우저를 확인해주세요.");

      try {
        await invoke('init_google_auth');

        setStatusMessage("파일 목록을 불러오는 중...");
        // Check 'root' cache
        if (folderCache['root']) {
          setGoogleFiles(folderCache['root']);
        } else {
          const files = await invoke<GoogleFile[]>('list_google_drive_files', { folderId: null });
          setGoogleFiles(files);
          setFolderCache(prev => ({ ...prev, 'root': files }));
        }

        setIsGoogleDriveOpen(true);
        setCurrentFolderId(null);
        setFolderStack([{ id: 'root', name: '내 드라이브' }]);
        setStatusMessage(null);
      } catch (err) {
        console.error("Google Auth failed:", err);
        setError("구글 인증 또는 파일 목록 조회에 실패했습니다.");
      } finally {
        setIsGoogleAuthLoading(false);
      }
    };

    const fetchFolderContents = async (folderId: string, folderName: string) => {
      setIsLoading(true);
      setStatusMessage("폴더 내용을 불러오는 중...");
      try {
        if (folderCache[folderId]) {
          setGoogleFiles(folderCache[folderId]);
        } else {
          const files = await invoke<GoogleFile[]>('list_google_drive_files', { folderId });
          setGoogleFiles(files);
          setFolderCache(prev => ({ ...prev, [folderId]: files }));
        }

        setCurrentFolderId(folderId);
        // Push only if not already top (handled by breadcrumb logic usually, but here for click down)
        setFolderStack(prev => [...prev, { id: folderId, name: folderName }]);

      } catch (err) {
        setError("폴더 열기 실패: " + String(err));
      } finally {
        setIsLoading(false);
        setStatusMessage(null);
      }
    };

    const navigateToFolder = async (folderId: string | null) => {
      setIsLoading(true);
      const cacheKey = folderId === null ? 'root' : folderId;
      const apiFolderId = folderId === 'root' ? null : folderId; // Should handle 'root' string carefully

      // In our stack 'root' is id for top level.
      // API expects null for root.
      // Cache keys: 'root' for top level, otherwise folderId string.

      const actualCacheKey = (folderId === 'root' || folderId === null) ? 'root' : folderId;
      const actualApiId = (folderId === 'root' || folderId === null) ? null : folderId;

      try {
        if (folderCache[actualCacheKey]) {
          setGoogleFiles(folderCache[actualCacheKey]);
        } else {
          const files = await invoke<GoogleFile[]>('list_google_drive_files', { folderId: actualApiId });
          setGoogleFiles(files);
          setFolderCache(prev => ({ ...prev, [actualCacheKey]: files }));
        }
        setCurrentFolderId(actualApiId);
      } catch (err) {
        setError("폴더 이동 실패");
      } finally {
        setIsLoading(false);
      }
    };

    const handleBreadcrumbClick = (index: number) => {
      const targetFolder = folderStack[index];
      const newStack = folderStack.slice(0, index + 1);
      setFolderStack(newStack);
      navigateToFolder(targetFolder.id);
    };

    const handleItemClick = (file: GoogleFile) => {
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        fetchFolderContents(file.id, file.name);
      } else {
        toggleFileSelection(file);
      }
    };

    const toggleFileSelection = (file: GoogleFile) => {
      const newMap = new Map(selectedFilesMap);
      if (newMap.has(file.id)) {
        newMap.delete(file.id);
      } else {
        newMap.set(file.id, file);
      }
      setSelectedFilesMap(newMap);
    };

    const handleBackClick = () => {
      if (folderStack.length <= 1) return;
      handleBreadcrumbClick(folderStack.length - 2);
    };

    const handleImport = async () => {
      if (selectedFilesMap.size === 0) return;

      setIsLoading(true);
      setError(null);

      let successCount = 0;
      let failCount = 0;

      const importResults: { name: string, content: string }[] = [];
      const filesToImport = Array.from(selectedFilesMap.values());

      for (const file of filesToImport) {
        setStatusMessage(`다운로드 중: ${file.name} (${successCount + 1}/${filesToImport.length})`);
        try {
          const content = await invoke<string>('download_google_drive_file', {
            fileId: file.id,
            mimeType: file.mimeType
          });
          importResults.push({ name: file.name, content });
          successCount++;
        } catch (err) {
          console.error(`Failed to download ${file.name}`, err);
          failCount++;
        }
      }

      if (importResults.length > 0) {
        setStatusMessage("문서 생성 중...");
        try {
          await onImportSelected(importResults);
        } catch (e) {
          console.error("Creation failed", e);
          setError("문서 생성 중 오류가 발생했습니다.");
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(false);
      setStatusMessage(null);

      if (failCount > 0) {
        setError(`${successCount}개 성공, ${failCount}개 실패.`);
      } else {
        onClose();
      }
    };

    if (!isGoogleDriveOpen) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-6 animate-in fade-in slide-in-from-bottom-5">
          <div className="text-center space-y-3">
            <div className="bg-green-500/20 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
              <HardDrive className="w-10 h-10 text-green-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Google Drive 연결</h3>
            <p className="text-sm text-zinc-400 max-w-xs mx-auto">
              Google 계정으로 로그인하여<br />Drive 문서를 바로 가져오세요.
            </p>
          </div>
          <button
            onClick={handleGoogleDriveAuth}
            disabled={isGoogleAuthLoading}
            className="bg-green-600 hover:bg-green-500 text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2"
          >
            {isGoogleAuthLoading && <Loader2 className="animate-spin w-4 h-4" />}
            {isGoogleAuthLoading ? '연결 중...' : 'Google 로그인'}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full space-y-4 p-4 animate-in fade-in">
        {/* Navigation Bar (Breadcrumbs style match Confluence Search bar height) */}
        <div className="flex gap-2 items-center bg-zinc-800 border border-zinc-700 rounded-md p-1 pl-3">
          <div className="flex-1 flex items-center overflow-hidden gap-1 text-sm">
            <Cloud size={16} className="text-emerald-400 shrink-0 mr-1" />
            {folderStack.map((folder, idx) => (
              <div key={folder.id} className="flex items-center whitespace-nowrap">
                {idx > 0 && <ChevronRight size={14} className="text-zinc-600 mx-1" />}
                <button
                  onClick={() => handleBreadcrumbClick(idx)}
                  className={`${idx === folderStack.length - 1
                    ? 'text-white font-medium cursor-default'
                    : 'text-zinc-400 hover:text-emerald-400 transition-colors'
                    }`}
                  disabled={idx === folderStack.length - 1}
                >
                  {folder.name}
                </button>
              </div>
            ))}
          </div>
          {folderStack.length > 1 && (
            <button
              onClick={handleBackClick}
              className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
              title="상위 폴더"
            >
              <ChevronLeft size={16} />
            </button>
          )}
        </div>

        {/* File List */}
        <div className="flex-1 border border-zinc-700 bg-zinc-900/50 rounded-md overflow-hidden relative">
          <div className="absolute inset-0 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
            {isLoading && !error && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
                <Loader2 size={32} className="animate-spin text-emerald-500" />
                <p className="text-sm">{statusMessage || "로딩 중..."}</p>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
                <AlertCircle size={32} className="text-red-500" />
                <p className="text-sm text-center px-4">{error}</p>
                <button onClick={handleBackClick} className="text-xs underline hover:text-white">이전으로 돌아가기</button>
              </div>
            )}

            {!isLoading && !error && googleFiles.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-zinc-500">
                <Folder size={48} className="mb-2 opacity-20" />
                <p>폴더가 비어있습니다.</p>
              </div>
            )}

            {!isLoading && !error && googleFiles.length > 0 && (
              <div className="space-y-1">
                {googleFiles.map(file => {
                  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                  const isSelected = selectedFilesMap.has(file.id);

                  return (
                    <div
                      key={file.id}
                      onClick={() => handleItemClick(file)}
                      className={`
                          flex items-center p-3 rounded-lg cursor-pointer transition-colors border
                          ${isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/50'
                          : 'hover:bg-zinc-800 border-transparent'}
                        `}
                    >
                      <div className="shrink-0 mr-3">
                        {isFolder ? (
                          <Folder size={20} className="text-yellow-500/80 fill-yellow-500/20" />
                        ) : (
                          <FileText size={20} className={`${isSelected ? 'text-emerald-400' : 'text-zinc-500'}`} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col">
                        <span className={`text-sm truncate ${isSelected ? 'text-emerald-100' : 'text-zinc-300'}`}>
                          {file.name}
                        </span>
                      </div>

                      {!isFolder && (
                        <div className={`shrink-0 ml-2 ${isSelected ? 'text-emerald-400' : 'text-zinc-600'}`}>
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                      )}

                      {isFolder && <div className="text-zinc-600 ml-2"><ChevronRight size={16} /></div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer info similar to Confluence view */}
        <div className="text-xs text-zinc-500 px-1">
          {selectedFilesMap.size > 0 ? (
            <span className="text-emerald-400">선택됨: {selectedFilesMap.size}개 파일</span>
          ) : (
            '가져올 파일을 선택하세요.'
          )}
        </div>
      </div>
    );
  }
);
