import { AlertCircle, Download, Loader2, Cpu } from 'lucide-react';
import { useDocumentStore } from '../stores/documentStore';

export const StatusBar = () => {
  const { aiAnalysisStatus, aiProgress, autoSaveStatus } = useDocumentStore();

  return (
    <div className="h-6 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-3 text-[10px] text-zinc-500 select-none">
      <div className="flex items-center gap-4">
        <span className="hover:text-zinc-300 cursor-pointer">Ln 12, Col 45</span>
        <span className="hover:text-zinc-300 cursor-pointer">UTF-8</span>
        <span className="hover:text-zinc-300 cursor-pointer">Markdown</span>
      </div>

      <div className="flex items-center gap-3">
        {/* AI 진행률 - 다운로드 */}
        {aiProgress?.type === 'download' && (
          <div className="flex items-center gap-1.5 text-purple-400">
            <Download size={10} className="animate-pulse" />
            <span className="capitalize">{aiProgress.model}</span>
            <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${aiProgress.progress}%` }}
              />
            </div>
            <span>{aiProgress.progress.toFixed(0)}%</span>
          </div>
        )}
        {/* AI 진행률 - 작업(임베딩/추출) */}
        {aiProgress?.type === 'task' && (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Cpu size={10} className="animate-pulse" />
            <span className="capitalize">{aiProgress.model}</span>
            <Loader2 size={10} className="animate-spin" />
          </div>
        )}
        {/* 자동저장 상태 */}
        {autoSaveStatus && !aiProgress && (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <span>{autoSaveStatus}</span>
          </div>
        )}
        {/* AI 분석 상태 */}
        {aiAnalysisStatus && !autoSaveStatus && !aiProgress && (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Loader2 size={10} className="animate-spin" />
            <span>{aiAnalysisStatus}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500/20 border border-green-500/50"></span>
          <span>Online</span>
        </div>
        <div className="flex items-center gap-1 hover:text-zinc-300 cursor-pointer">
          <AlertCircle size={10} />
          <span>0 Warnings</span>
        </div>
      </div>
    </div>
  );
};
