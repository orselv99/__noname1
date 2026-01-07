import { X, Info, Building2, FolderKanban, Calendar, User, FileText, UserStar } from 'lucide-react';

interface GroupInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  groupName?: string;
  groupType?: 'department' | 'project';
}

export const GroupInfoDialog = ({ isOpen, onClose, groupName = 'Unknown Group', groupType = 'project' }: GroupInfoDialogProps) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Info size={18} className="text-blue-400" />
            그룹 정보
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${groupType === 'department' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
              {groupType === 'department' ? <Building2 size={20} /> : <FolderKanban size={20} />}
            </div>
            <div>
              <div className="text-sm text-zinc-500 mb-0.5">{groupType === 'department' ? '부서' : '프로젝트'}</div>
              <div className="text-zinc-200 font-medium">{groupName}</div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 text-sm">
              <Calendar size={16} className="text-zinc-500 mt-0.5" />
              <div>
                <span className="text-zinc-500 block text-xs mb-0.5">생성일</span>
                <span className="text-zinc-300">2024년 1월 15일</span>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <UserStar size={16} className="text-zinc-500 mt-0.5" />
              <div>
                <span className="text-zinc-500 block text-xs mb-0.5">소유자</span>
                <span className="text-zinc-300">관리자 (admin@example.com)</span>
              </div>
            </div>
            {/* TODO: 나중에 실제 멤버 수와 문서 수를 연동해야 함 */}
            <div className="flex items-start gap-3 text-sm">
              <User size={16} className="text-zinc-500 mt-0.5" />
              <div>
                <span className="text-zinc-500 block text-xs mb-0.5">맴버</span>
                <span className="text-zinc-300">
                  12명
                </span>
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <FileText size={16} className="text-zinc-500 mt-0.5" />
              <div>
                <span className="text-zinc-500 block text-xs mb-0.5">문서</span>
                <span className="text-zinc-300">
                  45개
                  <span className="text-zinc-500 text-xs ml-1">(TODO: 그룹 모두에게 게시된)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="py-1.5 px-3 rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
