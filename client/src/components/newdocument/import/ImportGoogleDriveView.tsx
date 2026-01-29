import { useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Loader2, AlertCircle, Cloud, HardDrive, Folder, ChevronLeft, CheckSquare, Square, X, FileText } from 'lucide-react';
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
        <button
          onClick={handleGoogleDriveAuth}
          disabled={isGoogleAuthLoading}
          className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-blue-500/50 transition-all text-left group w-full"
        >
          <div className="p-3 bg-zinc-700 rounded-full group-hover:bg-blue-900/30 transition-colors">
            <HardDrive size={24} className="text-blue-400" />
          </div>
          <div>
            <div className="font-medium text-white">Google Drive</div>
            <div className="text-xs text-zinc-400 mt-0.5">여러 파일을 한 번에 가져오기</div>
          </div>
          {isGoogleAuthLoading && <Loader2 size={16} className="ml-auto animate-spin text-zinc-500" />}
        </button>
      );
    }

    return (
      <div className="flex flex-col h-full animate-in fade-in duration-300 bg-zinc-950 absolute inset-0 z-20">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <button
              onClick={() => setIsGoogleDriveOpen(false)}
              className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
              title="닫기"
            >
              <X size={20} />
            </button>
            <div className="flex items-center gap-1 text-sm font-medium text-white overflow-hidden whitespace-nowrap">
              <Cloud size={18} className="text-blue-400 shrink-0 mr-1" />
              {/* Breadcrumbs */}
              {folderStack.map((folder, idx) => (
                <span key={folder.id} className="flex items-center">
                  {idx > 0 && <span className="text-zinc-600 mx-1">/</span>}
                  <button
                    onClick={() => handleBreadcrumbClick(idx)}
                    className={`${idx === folderStack.length - 1 ? 'text-white cursor-default' : 'text-zinc-500 hover:text-blue-400 hover:underline cursor-pointer'}`}
                    disabled={idx === folderStack.length - 1}
                  >
                    {folder.name}
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 bg-zinc-900/50 border-b border-zinc-800 shrink-0">
          <button
            onClick={handleBackClick}
            disabled={folderStack.length <= 1}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            title="상위 폴더로"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="text-xs text-zinc-500 flex-1 text-right">
            {selectedFilesMap.size}개 선택됨
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && !error ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
              <Loader2 size={32} className="animate-spin text-blue-500" />
              <p className="text-sm">{statusMessage || "로딩 중..."}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-3">
              <AlertCircle size={32} className="text-red-500" />
              <p className="text-sm text-center px-4">{error}</p>
              <button onClick={handleBackClick} className="text-xs underline hover:text-white">이전으로 돌아가기</button>
            </div>
          ) : googleFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <Folder size={48} className="mb-2 opacity-20" />
              <p>폴더가 비어있습니다.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {googleFiles.map(file => {
                const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
                const isSelected = selectedFilesMap.has(file.id);

                return (
                  <div
                    key={file.id}
                    onClick={() => handleItemClick(file)}
                    className={`
                        group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all select-none
                        ${isSelected ? 'bg-blue-500/20 border border-blue-500/30' : 'hover:bg-zinc-800 border border-transparent'}
                      `}
                  >
                    {!isFolder ? (
                      <div
                        onClick={(e) => { e.stopPropagation(); toggleFileSelection(file); }}
                        className={`shrink-0 ${isSelected ? 'text-blue-400' : 'text-zinc-600 group-hover:text-zinc-500'}`}
                      >
                        {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                      </div>
                    ) : (
                      <div className="w-5 shrink-0" />
                    )}

                    <div className="shrink-0">
                      {isFolder ? (
                        <Folder size={20} className="text-yellow-500/80 fill-yellow-500/20" />
                      ) : (
                        <FileText size={20} className="text-blue-400" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className={`text-sm truncate ${isSelected ? 'text-blue-100' : 'text-zinc-300'}`}>
                        {file.name}
                      </span>
                    </div>

                    {isFolder && <div className="text-zinc-600"><ChevronLeft size={16} className="rotate-180" /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer removed: Uses main dialog button */}
      </div>
    );
  }
);
