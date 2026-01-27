import { Upload, FileText } from 'lucide-react';

/**
 * NewDocumentImportMode 컴포넌트
 * 
 * 기존의 레거시 문서(워드, PDF 등)를 가져와서 시스템에 등록하는 화면입니다.
 * 현재는 UI만 구현되어 있으며, 실제 파일 업로드 기능은 추후 연동될 예정입니다.
 */
export function NewDocumentImportMode() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-6 animate-in fade-in duration-300">

      {/* 아이콘 및 안내 문구 영역 */}
      <div className="bg-zinc-800/50 p-6 rounded-full">
        <Upload size={48} className="text-zinc-500" />
      </div>

      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-white">기존 문서 가져오기</h3>
        <p className="text-sm text-zinc-400 max-w-sm mx-auto leading-relaxed">
          Word, PDF, HWP 등 기존에 작성된 문서를 업로드하여<br />
          새로운 문서로 변환하고 지식 베이스에 추가할 수 있습니다.
        </p>
      </div>

      {/* 파일 드래그 앤 드롭 영역 (Placeholder) */}
      <div className="w-full max-w-md border-2 border-dashed border-zinc-700 rounded-xl p-10 hover:border-blue-500/50 hover:bg-zinc-800/30 transition-all cursor-pointer group">
        <div className="flex flex-col items-center gap-2">
          <FileText size={32} className="text-zinc-600 group-hover:text-blue-400 transition-colors" />
          <div className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300">
            클릭하거나 파일을 여기로 드래그하세요
          </div>
          <div className="text-xs text-zinc-600">
            지원 형식: .docx, .pdf, .hwp, .txt
          </div>
        </div>
      </div>
    </div>
  );
}
