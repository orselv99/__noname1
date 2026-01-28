import { useState } from 'react';
import { Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface NewDocumentImportModeProps {
  onImportComplete?: (title: string, content: string) => void;
}

/**
 * NewDocumentImportMode 컴포넌트
 * 
 * 기존의 레거시 문서(워드, PDF, HWP 등)를 가져와서 시스템에 등록하는 화면입니다.
 * Tauri File Dialog를 통해 파일을 선택하고, 백엔드에서 Markdown으로 변환하여 메타데이터를 표시합니다.
 */
export function NewDocumentImportMode({ onImportComplete }: NewDocumentImportModeProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);

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
        setIsLoading(true);
        setError(null);
        setFileInfo(null);

        try {
          // 백엔드 import_file 커맨드 호출
          const content = await invoke<string>('import_file', { path: selected });

          const rawName = selected.split(/[\\/]/).pop() || selected;
          const nameWithoutExt = rawName.replace(/\.[^/.]+$/, "");
          // 텍스트 길이로 대략적인 크기 표시 (정확한 파일 크기는 아니지만 텍스트 양 가늠)
          // media 크기는 현재 포함되지 않으나 요구사항에 맞춰 텍스트 길이 사용
          const size = new TextEncoder().encode(content).length;

          setFileInfo({
            name: nameWithoutExt,
            size: size
          });

          // 상위 컴포넌트로 데이터 전달 (생성 준비 완료)
          onImportComplete?.(nameWithoutExt, content);

        } catch (err) {
          console.error("Import failed:", err);
          setError(String(err));
        } finally {
          setIsLoading(false);
        }
      }
    } catch (err) {
      console.error("Failed to open dialog:", err);
      setError("파일 선택 창을 열 수 없습니다. (플러그인 오류)");
    }
  };

  /** 파일 크기 포맷팅 유틸리티 */
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (fileInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-300 p-6 space-y-6">
        <div className="p-4 bg-green-500/20 rounded-full">
          <FileText className="text-green-400" size={40} />
        </div>

        <div className="text-center space-y-2">
          <h3 className="text-xl font-medium text-white">{fileInfo.name}</h3>
          <p className="text-zinc-400">
            변환된 크기: <span className="text-zinc-300">{formatSize(fileInfo.size)}</span>
          </p>
        </div>

        <div className="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700 max-w-sm w-full">
          <p className="text-sm text-zinc-400 text-center">
            문서 내용을 성공적으로 가져왔습니다.<br />
            아래 <b>'문서 추가'</b> 버튼을 눌러 저장을 완료하세요.
          </p>
        </div>

        <button
          onClick={handleFileSelect}
          className="text-sm text-zinc-500 hover:text-white underline underline-offset-4"
        >
          다른 파일 선택하기
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-6 animate-in fade-in duration-300">

      {/* 아이콘 및 안내 문구 영역 */}
      <div className={`p-6 rounded-full transition-all ${isLoading ? 'bg-blue-500/20' : 'bg-zinc-800/50'}`}>
        {isLoading ? (
          <Loader2 size={48} className="text-blue-500 animate-spin" />
        ) : error ? (
          <AlertCircle size={48} className="text-red-500" />
        ) : (
          <Upload size={48} className="text-zinc-500" />
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-white">
          {isLoading ? '문서 변환 중...' : '기존 문서 가져오기'}
        </h3>
        <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : isLoading ? (
            "문서의 내용을 분석하여 Markdown 형식으로 변환하고 있습니다.\n잠시만 기다려주세요."
          ) : (
            <>
              Word, PPT, Excel 및 HWP 문서를 선택하여<br />
              내용을 자동으로 추출하고 가져옵니다.
            </>
          )}
        </p>
      </div>

      {/* 파일 선택 버튼 */}
      {!isLoading && (
        <button
          onClick={handleFileSelect}
          className="w-full max-w-md border-2 border-dashed border-zinc-700 rounded-xl p-10 hover:border-blue-500/50 hover:bg-zinc-800/30 transition-all cursor-pointer group flex flex-col items-center gap-2 focus:outline-none"
        >
          <FileText size={32} className="text-zinc-600 group-hover:text-blue-400 transition-colors" />
          <div className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300">
            여기를 클릭하여 파일 선택
          </div>
          <div className="text-xs text-zinc-600">
            지원 형식: .docx, .pptx, .xlsx, .hwp
          </div>
        </button>
      )}
    </div>
  );
}
