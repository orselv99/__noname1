import { useState, useRef, useEffect } from 'react';
import { Upload, Layout, Loader2 } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { marked } from 'marked';
import { FolderItem } from './types';
import { ImportGoogleDriveView, ImportGoogleDriveViewHandle } from './import/ImportGoogleDriveView';

/**
 * NewDocumentImportMode Props 정의
 * 직접 생성을 위해 상위 컴포넌트의 onCreate와 컨텍스트 정보를 받습니다.
 */
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
  // External Action Registration
  registerSubmitHandler?: (handler: () => Promise<void>) => void;
  setSubmitEnabled?: (enabled: boolean) => void;
  setSubmitLabel?: (label: string) => void;
}

/**
 * NewDocumentImportMode 컴포넌트
 * 
 * 기능:
 * 1. 로컬 파일 가져오기
 * 2. 외부 서비스(Google Drive) 가져오기 -> ImportGoogleDriveView 컴포넌트로 위임
 */
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const driveRef = useRef<ImportGoogleDriveViewHandle>(null);

  // Initialize button state
  useEffect(() => {
    // Default state: disabled until selection
    setSubmitEnabled?.(false);
    setSubmitLabel?.("문서 가져오기");

    // Register handler that delegates to drive view
    registerSubmitHandler?.(async () => {
      if (driveRef.current) {
        await driveRef.current.executeImport();
      }
    });

    // Cleanup: Reset on unmount
    return () => {
      setSubmitEnabled?.(true); // Reset to default true for other modes or safety
      setSubmitLabel?.("문서 추가");
    };
  }, [registerSubmitHandler, setSubmitEnabled, setSubmitLabel]);

  // --- Helper: 문서 생성 요청 ---
  const createDocument = async (title: string, content: string) => {
    if (!selectedGroupId || !onCreate) return;

    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) {
      console.error("Selected group not found");
      return;
    }

    // Markdown을 HTML로 변환 (에디터 호환성)
    let htmlContent = content;
    try {
      htmlContent = await marked.parse(content);
    } catch (e) {
      console.error("Markdown parsing failed", e);
    }

    // Await to ensure sequential execution mostly
    await onCreate({
      groupId: group.id,
      groupType: group.type,
      folderId: selectedFolderId || undefined,
      template: 'blank',
      title: title,
      content: htmlContent
    });
  };

  // --- 로컬 파일 핸들러 ---
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

  // --- Google Drive Handler (Delegated) ---
  const handleGoogleImportSelected = async (files: { name: string, content: string }[]) => {
    // Process creation sequentially
    for (const file of files) {
      await createDocument(file.name, file.content);
    }
  };

  const handleSelectionChange = (count: number) => {
    setSubmitEnabled?.(count > 0);
    setSubmitLabel?.(count > 0 ? `${count}개 가져오기` : "문서 가져오기");
  };

  // --- Render: 메인 메뉴 ---
  return (
    <div className="flex flex-col h-full p-8 animate-in fade-in duration-300 overflow-y-auto relative">
      <div className="text-center space-y-2 mb-8">
        <h2 className="text-2xl font-bold text-white">문서 가져오기</h2>
        <p className="text-zinc-400 text-sm">로컬 파일이나 클라우드에서 문서를 가져와 바로 저장합니다.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 max-w-md mx-auto w-full">
        {/* Local File */}
        <button
          onClick={handleFileSelect}
          disabled={isLoading}
          className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-zinc-500 transition-all text-left group"
        >
          <div className="p-3 bg-zinc-700 rounded-full group-hover:bg-zinc-600 transition-colors">
            <Upload size={24} className="text-zinc-300" />
          </div>
          <div>
            <div className="font-medium text-white">로컬 파일 선택</div>
            <div className="text-xs text-zinc-400 mt-0.5">.docx, .hwp, .pptx 지원</div>
          </div>
          {isLoading && <Loader2 size={16} className="ml-auto animate-spin text-zinc-500" />}
        </button>

        {/* Google Drive View (Embedded Button inside) */}
        <ImportGoogleDriveView
          ref={driveRef}
          onImportSelected={handleGoogleImportSelected}
          onClose={onClose}
          onSelectionChange={handleSelectionChange}
        />

        {/* Notions (Disabled) */}
        <div className="flex items-center gap-4 p-4 rounded-xl border border-zinc-800 bg-zinc-900/30 opacity-50 cursor-not-allowed">
          <div className="p-3 bg-zinc-800 rounded-full">
            <Layout size={24} className="text-zinc-600" />
          </div>
          <div>
            <div className="font-medium text-zinc-500">Notion</div>
            <div className="text-xs text-zinc-600 mt-0.5">준비 중입니다</div>
          </div>
        </div>
      </div>

      {/* Error / Loading Overlay if needed for local */}
      {statusMessage && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 rounded-xl">
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={32} className="animate-spin text-blue-500" />
            <p className="text-white font-medium">{statusMessage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
