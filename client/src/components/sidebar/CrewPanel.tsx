import { useRef, useState, useMemo } from 'react';
import { MessageCircle, Search, User, Filter, MoreVertical, X, Phone, Mail, Hash } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { CrewMember } from '../../types';

/**
 * 사용자(Crew) 목록을 표시하는 사이드바 패널
 */
export const CrewPanel = () => {
  const crew = useAuthStore(state => state.crew);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string | null>(null);

  // 검색 및 필터링
  const filteredCrew = useMemo(() => {
    return crew.filter(member => {
      // 검색어 필터 (이름, 이메일, 부서)
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        member.username.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        (member.department_name && member.department_name.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // 역할 필터
      if (filterRole === 'admin' && !['super', 'admin'].includes(member.role)) return false;
      if (filterRole === 'user' && !['user', 'viewer'].includes(member.role)) return false;

      return true;
    });
  }, [crew, searchQuery, filterRole]);

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

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300">
      {/* 헤더 */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle size={18} className="text-blue-400" />
          <h2 className="font-medium text-white">크루 ({crew.length})</h2>
        </div>

        {/* 간단한 필터 메뉴 (예시) */}
        <div className="flex gap-1">
          <button
            onClick={() => setFilterRole(filterRole === 'admin' ? null : 'admin')}
            className={`p-1.5 rounded-md ${filterRole === 'admin' ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-zinc-800 text-zinc-400'}`}
            title="관리자만 보기"
          >
            <User size={16} />
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
      <div className="flex-1 overflow-y-auto">
        {crew.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-zinc-500 gap-2">
            <User size={32} className="opacity-20" />
            <span className="text-sm">구성원이 없습니다.</span>
          </div>
        ) : Object.keys(groupedCrew).length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">
            검색 결과가 없습니다.
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
                  {members.map(member => (
                    <div
                      key={member.id}
                      className="group px-4 py-3 hover:bg-zinc-900 border-b border-zinc-800/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* 프로필 아바타 (임시: 이니셜) */}
                        <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center shrink-0 border border-zinc-700 group-hover:border-zinc-600 relative">
                          <span className="text-sm font-bold text-zinc-300 group-hover:text-white">
                            {member.username.slice(0, 2).toUpperCase()}
                          </span>
                          {member.is_online && (
                            <div title="온라인" className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-zinc-950"></div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <h3 className="text-sm font-medium text-zinc-200 truncate group-hover:text-white">
                              {member.username}
                            </h3>
                            {/* 역할 뱃지 */}
                            {['super', 'admin'].includes(member.role) && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-400 font-medium border border-indigo-500/20">
                                {member.role === 'super' ? 'SUPER' : 'ADMIN'}
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-zinc-500 truncate flex flex-col gap-0.5">
                            {/* 직책 표시 */}
                            {(member.position_name) && (
                              <span className="text-zinc-400">{member.position_name}</span>
                            )}
                            <span className="text-zinc-600 group-hover:text-zinc-500">{member.email}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
