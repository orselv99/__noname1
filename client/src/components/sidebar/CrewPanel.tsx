import { useState, useMemo } from 'react';
import { MessageCircle, Search, User, X, Hash, MessageSquarePlus, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { CrewMember } from '../../types';
import { roomManager } from '../../services/p2p/RoomManager';

/**
 * 사용자(Crew) 목록을 표시하는 사이드바 패널
 */
export const CrewPanel = () => {
  const crew = useAuthStore(state => state.crew);
  const currentUser = useAuthStore(state => state.user);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string | null>(null);

  // Multi-selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // 검색 및 필터링
  const filteredCrew = useMemo(() => {
    return crew.filter(member => {
      // 본인 제외 (채팅 대상 선택 시)
      if (member.id === currentUser?.user_id) return false;

      // Hide admins from the list as per request
      if (['super', 'admin'].includes(member.role)) return false;

      // 검색어 필터 (이름, 이메일, 부서)
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        member.username.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        (member.department_name && member.department_name.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      return true;
    });
  }, [crew, searchQuery, filterRole, currentUser]);

  // 부서별 그룹화
  const groupedCrew = useMemo(() => {
    const groups: Record<string, CrewMember[]> = {};
    filteredCrew.forEach(member => {
      const dept = member.department_name || '부서 없음';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(member);
    });
    return groups;
  }, [filteredCrew]);

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedUserIds(newSet);

    // Auto-enable selection mode if not active
    if (!isSelectionMode && newSet.size > 0) {
      setIsSelectionMode(true);
    }
    // Auto-disable if empty? Maybe keep it.
    if (newSet.size === 0) {
      setIsSelectionMode(false);
    }
  };

  const handleStartChat = () => {
    if (selectedUserIds.size === 0) return;
    roomManager.createRoom(Array.from(selectedUserIds));
    setSelectedUserIds(new Set());
    setIsSelectionMode(false);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 relative">
      {/* 헤더 */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-blue-400" />
          <h2 className="font-medium text-white">크루 ({filteredCrew.length})</h2>
        </div>

        {/* 간단한 필터 메뉴 (예시) */}
        <div className="flex gap-1">
          <button
            onClick={() => setIsSelectionMode(!isSelectionMode)}
            className={`p-1.5 rounded-md ${isSelectionMode ? 'bg-zinc-800 text-white' : 'hover:bg-zinc-800 text-zinc-400'}`}
            title="다중 선택 모드"
          >
            <CheckCircle2 size={16} className={selectedUserIds.size > 0 ? "text-blue-400" : ""} />
          </button>
        </div>
      </div>

      {/* 검색 바 */}
      <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="이름, 부서 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-2 pl-9 pr-8 text-sm text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 목록 (스크롤 영역) */}
      <div className="flex-1 overflow-y-auto pb-20">
        {filteredCrew.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
            <User size={32} className="opacity-20" />
            <span className="text-sm">검색 결과가 없습니다.</span>
          </div>
        ) : (
          <div className="pb-4">
            {Object.entries(groupedCrew).map(([deptName, members]) => (
              <div key={deptName} className="mb-1">
                {/* 부서 헤더 */}
                <div className="px-4 py-2 bg-zinc-900/30 text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                  <Hash size={10} />
                  {deptName}
                  <span className="bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px] ml-auto">
                    {members.length}
                  </span>
                </div>

                {/* 멤버 목록 */}
                <div>
                  {members.map(member => {
                    const isSelected = selectedUserIds.has(member.id);
                    return (
                      <div
                        key={member.id}
                        onClick={() => toggleSelection(member.id)}
                        className={`group px-4 py-3 border-b border-zinc-800/50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-500/10 hover:bg-blue-500/20' : 'hover:bg-zinc-900'
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* 체크박스 (선택 모드일 때만) */}
                          {isSelectionMode && (
                            <div className={`w-5 h-5 rounded border flex items-center justify-center mt-2.5 transition-colors ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-zinc-600 bg-zinc-800'
                              }`}>
                              {isSelected && <CheckCircle2 size={12} />}
                            </div>
                          )}

                          {/* 프로필 아바타 */}
                          <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 border border-zinc-700 group-hover:border-zinc-600 relative">
                            <span className="text-sm font-bold text-zinc-300 group-hover:text-white">
                              {member.username.slice(0, 2).toUpperCase()}
                            </span>
                            {member.is_online && (
                              <div title="온라인" className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-950"></div>
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            {/* 라인 1: 이름 + 직책 */}
                            <div className="flex items-center gap-2 mb-0.5">
                              <h3 className={`text-sm font-medium truncate group-hover:text-white ${isSelected ? 'text-blue-200' : 'text-zinc-200'}`}>
                                {member.username}
                              </h3>
                              {member.position_name && (
                                <span className="text-xs text-zinc-500">{member.position_name}</span>
                              )}
                            </div>

                            {/* 라인 2: 이메일 */}
                            <div className="text-xs text-zinc-600 group-hover:text-zinc-500 truncate">
                              {member.email}
                            </div>
                          </div>

                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start Chat Floating Button */}
      {selectedUserIds.size > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={handleStartChat}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full shadow-lg font-medium transition-transform hover:scale-105 active:scale-95"
          >
            <MessageSquarePlus size={20} />
            {selectedUserIds.size}명과 대화 시작
          </button>
        </div>
      )}
    </div>
  );
};
