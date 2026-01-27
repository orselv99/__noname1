import { useState } from 'react';
import { X, Link2, Check, Clock, Building2, FolderKanban, Share2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

interface GroupLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AvailableGroup {
  id: string;
  name: string;
  type: 'project';
  status: 'none' | 'pending';
}

export const GroupLinkDialog = ({ isOpen, onClose }: GroupLinkDialogProps) => {
  const { departments: deptStore, projects: projStore } = useAuthStore();

  const [availableGroups, setAvailableGroups] = useState<AvailableGroup[]>([
    { id: 'proj-3', name: 'Project Gamma', type: 'project', status: 'none' },
    { id: 'proj-4', name: 'Project Delta', type: 'project', status: 'pending' },
    { id: 'proj-5', name: 'Project Epsilon', type: 'project', status: 'none' },
  ]);

  const handleRequestLink = (groupId: string) => {
    setAvailableGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, status: 'pending' as const } : g
    ));
  };

  if (!isOpen) return null;

  const departments = Object.entries(deptStore).map(([id, info]) => ({
    id,
    name: info.name,
    type: 'department' as const
  }));

  const myProjects = Object.entries(projStore).map(([id, info]) => ({
    id,
    name: info.name,
    type: 'project' as const
  }));

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Share2 size={18} />
            그룹 연결
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Connected Groups */}
          <div>
            {/* My Department */}
            {departments.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-zinc-500 mb-1.5">내 부서</p>
                <div className="space-y-1">
                  {departments.map(group => (
                    <div
                      key={group.id}
                      className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg text-sm text-zinc-300"
                    >
                      <Building2 size={14} className="text-blue-400" />
                      <span>{group.name}</span>
                      <span className="ml-auto text-xs text-green-500">연결됨</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* My Projects */}
            {myProjects.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-1.5">내 프로젝트</p>
                <div className="space-y-1">
                  {myProjects.map(group => (
                    <div
                      key={group.id}
                      className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg text-sm text-zinc-300"
                    >
                      <FolderKanban size={14} className="text-purple-400" />
                      <span>{group.name}</span>
                      <span className="ml-auto text-xs text-green-500">연결됨</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Available Groups */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
              <Link2 size={14} className="text-zinc-500" />
              연결 가능한 그룹
            </h3>
            <div className="space-y-1">
              {availableGroups.map(group => (
                <div
                  key={group.id}
                  className="flex items-center gap-2 px-3 py-2 bg-zinc-800/50 rounded-lg text-sm text-zinc-300"
                >
                  <FolderKanban size={14} className="text-zinc-500" />
                  <span>{group.name}</span>
                  {group.status === 'pending' ? (
                    <span className="ml-auto flex items-center gap-1 text-xs text-yellow-500">
                      <Clock size={12} />
                      요청됨
                    </span>
                  ) : (
                    <button
                      onClick={() => handleRequestLink(group.id)}
                      className="ml-auto text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                    >
                      연결요청
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="w-full py-2 px-4 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
