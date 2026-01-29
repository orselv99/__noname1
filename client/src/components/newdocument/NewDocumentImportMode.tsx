import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, HardDrive, FileText, ChevronLeft, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import { FolderItem } from './types';
import { ImportGoogleDriveView, ImportGoogleDriveViewHandle } from './import/ImportGoogleDriveView';
import ImportConfluenceView, { ImportConfluenceViewHandle } from './import/ImportConfluenceView';

interface NewDocumentImportModeProps {
  onCreate?: (data: {
    groupId: string;
    groupType: 'department' | 'project' | 'private';
    folderId?: string;
    template: string;
    title: string;
    content?: string;
  }) => Promise<void> | void;
  groups: {
    id: string;
    name: string;
    type: 'department' | 'project' | 'private';
    expanded: boolean;
    folders: FolderItem[];
  }[];
  selectedGroupId: string;
  selectedFolderId: string | null;
  onClose: () => void;
  registerSubmitHandler?: (handler: () => Promise<void>) => void;
  setSubmitEnabled?: (enabled: boolean) => void;
  setSubmitLabel?: (label: string) => void;
}

function LoadingOverlay({ message }: { message: string }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 rounded-xl">
      <div className="flex flex-col items-center gap-2">
        <Loader2 size={32} className="animate-spin text-emerald-500" />
        <p className="text-white font-medium">{message}</p>
      </div>
    </div>
  );
}

export function NewDocumentImportMode({
  onCreate,
  groups,
  selectedGroupId,
  selectedFolderId,
  onClose,
  registerSubmitHandler,
  setSubmitEnabled,
  setSubmitLabel
}: NewDocumentImportModeProps) {
  const [activeMode, setActiveMode] = useState<"menu" | "google-drive" | "confluence">("menu");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const driveRef = useRef<ImportGoogleDriveViewHandle>(null);
  const confluenceRef = useRef<ImportConfluenceViewHandle>(null);


  // Initialize state
  useEffect(() => {
    if (activeMode === 'menu') {
      setSubmitEnabled?.(false);
      setSubmitLabel?.("가져올 대상 선택");
    } else if (activeMode === 'google-drive') {
      setSubmitEnabled?.(false);
      setSubmitLabel?.("문서 가져오기");

      registerSubmitHandler?.(async () => {
        if (driveRef.current) await driveRef.current.executeImport();
      });
    } else if (activeMode === 'confluence') {
      setSubmitEnabled?.(false);
      setSubmitLabel?.("페이지 가져오기");

      registerSubmitHandler?.(async () => {
        if (confluenceRef.current) await confluenceRef.current.executeImport();
      });
    }
  }, [activeMode, registerSubmitHandler, setSubmitEnabled, setSubmitLabel]);


  // --- Helper: 문서 생성 요청 ---
  const createDocument = async (title: string, content: string) => {
    if (!selectedGroupId || !onCreate) return;

    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) {
      console.error("Selected group not found");
      return;
    }

    let htmlContent = content;
    try {
      htmlContent = await marked.parse(content);
    } catch (e) {
      console.error("Markdown parsing failed", e);
    }

    await onCreate({
      groupId: group.id,
      groupType: group.type,
      folderId: selectedFolderId || undefined,
      template: 'blank',
      title: title,
      content: htmlContent
    });
  };

  // --- Handlers ---
  const handleFileSelect = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Documents',
          extensions: ['docx', 'pptx', 'xlsx', 'hwp']
        }]
      });

      if (selected && typeof selected === 'string') {
        processLocalFile(selected);
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
      setError("파일 선택 창을 열 수 없습니다.");
    }
  };

  const processLocalFile = async (path: string) => {
    setIsLoading(true);
    setStatusMessage("문서를 변환하고 저장하는 중...");

    try {
      const content = await invoke<string>('import_file', { path });
      const rawName = path.split(/[\\/]/).pop() || path;
      const nameWithoutExt = rawName.replace(/\.[^/.]+$/, "");

      await createDocument(nameWithoutExt, content);
      onClose();

    } catch (err) {
      console.error("Import failed:", err);
      setError(String(err));
      setIsLoading(false);
    }
  };

  // Google Drive Handlers
  const handleGoogleImportSelected = async (files: { name: string, content: string }[]) => {
    setIsLoading(true);
    setStatusMessage(`Google Drive 문서 ${files.length}개를 저장하는 중...`);
    try {
      for (const file of files) {
        await createDocument(file.name, file.content);
      }
      onClose();
    } catch (e) {
      console.error(e);
      setError("Import failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDriveSelectionChange = (count: number) => {
    setSubmitEnabled?.(count > 0);
    setSubmitLabel?.(count > 0 ? `${count}개 가져오기` : "문서 가져오기");
  };

  // Confluence Handlers
  const handleConfluenceImportSelected = async (content: string) => {
    setIsLoading(true);
    setStatusMessage("Confluence 페이지를 저장하는 중...");
    try {
      const titleMatch = content.match(/^# (.*)\n/);
      const title = titleMatch ? titleMatch[1].trim() : "Confluence Page";
      await createDocument(title, content);
      onClose();
    } catch (e) {
      console.error(e);
      setError("Import failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfluenceSelectionChange = (hasSelection: boolean) => {
    setSubmitEnabled?.(hasSelection);
    setSubmitLabel?.(hasSelection ? "페이지 가져오기" : "페이지 선택");
  };

  // --- Render ---

  // 1. 상세 뷰 모드일 때
  if (activeMode === 'google-drive') {
    return (
      <div className="flex flex-col h-full overflow-hidden relative">
        <ImportGoogleDriveView
          ref={driveRef}
          onImportSelected={handleGoogleImportSelected}
          onClose={() => setActiveMode('menu')} // Back to menu
          onSelectionChange={handleDriveSelectionChange}
        />
        {/* 우측 정렬된 닫기(뒤로가기) 버튼 */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setActiveMode('menu')}
            className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
            title="목록으로 돌아가기"
          >
            <X size={18} />
          </button>
        </div>
        {statusMessage && <LoadingOverlay message={statusMessage} />}
      </div>
    );
  }

  if (activeMode === 'confluence') {
    return (
      <div className="flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-hidden relative">
          <ImportConfluenceView
            ref={confluenceRef}
            onImportSelected={handleConfluenceImportSelected}
            onClose={() => setActiveMode('menu')}
            onSelectionChange={handleConfluenceSelectionChange}
          />
        </div>
        {/* 우측 정렬된 닫기(뒤로가기) 버튼 */}
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setActiveMode('menu')}
            className="p-1.5 bg-zinc-800/80 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors border border-zinc-700/50"
            title="목록으로 돌아가기"
          >
            <X size={18} />
          </button>
        </div>
        {statusMessage && <LoadingOverlay message={statusMessage} />}
      </div>
    );
  }

  // 2. 메인 메뉴 모드 (리스트)
  return (
    <div className="flex flex-col h-full p-8 animate-in fade-in duration-300 overflow-y-auto relative">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl font-bold text-white">문서 가져오기</h2>
        <p className="text-zinc-400 text-sm">로컬 파일이나 클라우드에서 문서를 가져와 바로 저장합니다.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 max-w-md mx-auto w-full">
        {/* Local File */}
        <button
          onClick={handleFileSelect}
          disabled={isLoading}
          className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-500 transition-all text-left group"
        >
          <div className="p-3 bg-zinc-700 rounded-full group-hover:bg-zinc-600 transition-colors">
            <FileText size={24} className="text-zinc-300" />
          </div>
          <div>
            <div className="font-medium text-white">로컬 파일 선택</div>
            <div className="text-xs text-zinc-400 mt-0.5">.docx, .hwp, .pptx 지원</div>
          </div>
          {isLoading && <Loader2 size={16} className="ml-auto animate-spin text-zinc-500" />}
        </button>

        {/* Google Drive */}
        <button
          onClick={() => setActiveMode('google-drive')}
          className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-500 transition-all text-left group"
        >
          <div className="p-3 bg-zinc-700 rounded-full group-hover:bg-zinc-600 transition-colors">
            <HardDrive size={24} className="text-zinc-300" />
          </div>
          <div>
            <div className="font-medium text-white">Google Drive</div>
            <div className="text-xs text-zinc-400 mt-0.5">구글 드라이브에서 파일 선택</div>
          </div>
        </button>

        {/* Confluence */}
        <button
          onClick={() => setActiveMode('confluence')}
          className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-500 transition-all text-left group"
        >
          <div className="p-3 bg-zinc-700 rounded-full group-hover:bg-zinc-600 transition-colors">
            {/* Confluence-like Icon */}
            <div className="w-6 h-6 flex items-center justify-center font-bold text-zinc-300 bg-zinc-600 rounded text-sm">C</div>
          </div>
          <div>
            <div className="font-medium text-white">Confluence</div>
            <div className="text-xs text-zinc-400 mt-0.5">Confluence 페이지 가져오기</div>
          </div>
        </button>
      </div>

      {statusMessage && <LoadingOverlay message={statusMessage} />}
    </div>
  );
}
