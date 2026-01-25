import { Loader2, Bell } from 'lucide-react';
import { useDocumentStore } from '../stores/documentStore';
import { useAlarmStore } from '../stores/alarmStore';

export const StatusBar = () => {
  const { aiAnalysisStatus, autoSaveStatus } = useDocumentStore();
  const alarms = useAlarmStore(state => state.alarms);
  const unreadCount = alarms.filter(a => !a.read).length;

  return (
    <div className="h-9 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-3 text-xs text-zinc-500 select-none">
      <div className="flex items-center gap-4">
        <span className="hover:text-zinc-300 cursor-pointer">Ln 12, Col 45</span>
        <span className="hover:text-zinc-300 cursor-pointer">UTF-8</span>
        <span className="hover:text-zinc-300 cursor-pointer">Markdown</span>
      </div>

      <div className="flex items-center gap-3">
        {/* 자동저장 상태 */}
        {autoSaveStatus && (
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Loader2 size={10} className="animate-spin" />
            <span>{autoSaveStatus}</span>
          </div>
        )}
        {/* AI 분석 상태 */}
        {aiAnalysisStatus && !autoSaveStatus && (
          <div className="flex items-center gap-1.5 text-blue-400">
            <Loader2 size={10} className="animate-spin" />
            <span>{aiAnalysisStatus}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500/20 border border-green-500/50"></span>
          <span>Online</span>
        </div>
        <div className="flex items-center gap-1 hover:text-zinc-300 cursor-pointer relative" title="알림">
          <Bell size={14} />
          {/* Notification Badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-zinc-950 flex items-center justify-center text-[6px] text-white">
              {/* Optional: unreadCount */}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
