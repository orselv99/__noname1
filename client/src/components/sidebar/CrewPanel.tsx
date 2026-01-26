import { useState, useMemo, useEffect, useRef } from 'react';
import { MessageSquare, Search, User, X, Hash, Users, MessageCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { CrewMember } from '../../types';
import { roomManager } from '../../services/p2p/RoomManager';
import { formatDate } from '../../utils/formatters';

/**
 * CrewPanel: 사용자 목록 및 채팅방 목록을 관리하는 사이드바 패널
 * 
 * 기능:
 * 1. [탭 전환] 사용자(Crew) 목록 <-> 대화방(Rooms) 목록
 * 2. [사용자 목록] 부서별 그룹화, 검색, 상태 표시, 더블클릭 시 1:1 대화
 * 3. [대화방 목록] 최근 대화순 정렬, 마지막 메시지 미리보기
 */
export const CrewPanel = () => {
  // Global State
  const crew = useAuthStore(state => state.crew);
  const currentUser = useAuthStore(state => state.user);
  const rooms = useChatStore(state => state.rooms);
  const messages = useChatStore(state => state.messages); // 마지막 메시지 표시용

  // Local State
  const [activeTab, setActiveTab] = useState<'users' | 'rooms'>('users');
  const [searchQuery, setSearchQuery] = useState('');

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: CrewMember } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ==================================================================================
  // [Users Tab] 로직: 필터링 및 그룹화
  // ==================================================================================
  const filteredCrew = useMemo(() => {
    return crew.filter(member => {
      if (member.id === currentUser?.user_id) return false; // 본인 제외
      if (['super', 'admin'].includes(member.role)) return false; // 어드민 숨김 (요청사항)

      const query = searchQuery.toLowerCase();
      return (
        member.username.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query) ||
        (member.department_name && member.department_name.toLowerCase().includes(query))
      );
    });
  }, [crew, searchQuery, currentUser]);

  const groupedCrew = useMemo(() => {
    const groups: Record<string, CrewMember[]> = {};
    filteredCrew.forEach(member => {
      const dept = member.department_name || '부서 없음';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(member);
    });
    return groups;
  }, [filteredCrew]);

  // ==================================================================================
  // [Rooms Tab] 로직: 정렬 및 이름 생성
  // ==================================================================================
  const sortedRooms = useMemo(() => {
    const roomList = Object.values(rooms);
    // 검색어 필터 (방 이름)
    const filtered = searchQuery
      ? roomList.filter(r => r.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      : roomList;

    // 정렬: 최신 업데이트 순
    return filtered.sort((a, b) => {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [rooms, searchQuery]);

  // 방 이름 생성 헬퍼 (1:1인 경우 상대방 이름 표시)
  const getRoomDisplayInfo = (room: any) => {
    // 1. 방 이름이 명시적으로 있으면 사용 (단, 'New Room' 등 기본값 제외)
    if (room.name && !room.name.includes('자동 생성됨') && room.name !== '새 채팅방') {
      return { name: room.name, isGroup: true };
    }

    // 2. 1:1 채팅인 경우 상대방 이름 찾기
    const myId = currentUser?.user_id;
    const otherId = room.participants.find((p: string) => p !== myId);

    if (otherId) {
      const otherUser = crew.find(c => c.id === otherId);
      return {
        name: otherUser ? otherUser.username : '알 수 없는 사용자',
        isGroup: false,
        user: otherUser
      };
    }

    return { name: '대화방', isGroup: true };
  };

  const getLastMessage = (roomId: string) => {
    const msgs = messages[roomId];
    if (msgs && msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      if (last.content.startsWith('data:image')) return '(사진)';
      return last.content;
    }
    return '';
  };

  // ==================================================================================
  // Event Handlers
  // ==================================================================================
  const handleStartChat = (memberId: string) => {
    roomManager.createRoom([memberId]);
    setContextMenu(null);
  };

  const handleOpenRoom = (roomId: string) => {
    roomManager.openChatWindow(roomId);
  };

  const handleContextMenu = (e: React.MouseEvent, member: CrewMember) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, member });
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 relative">
      {/* 헤더 */}
      <div className="h-12 p-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-blue-400" />
          <h2 className="text-zinc-400 font-medium text-xs uppercase tracking-wider ">
            Crew ({filteredCrew.length})
          </h2>
          {/* <span className="text-xs text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded-full">
            {activeTab === 'users' ? filteredCrew.length : sortedRooms.length}
          </span> */}
        </div>

        {/* 탭 전환 버튼 */}
        <div className="flex gap-0.5">
          <button
            onClick={() => setActiveTab('users')}
            className={`p-1.5 rounded-md transition-all ${activeTab === 'users'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            title="사용자 목록"
          >
            <Users size={16} />
          </button>
          <button
            onClick={() => setActiveTab('rooms')}
            className={`p-1.5 rounded-md transition-all ${activeTab === 'rooms'
              ? 'bg-zinc-800 text-white shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            title="대화방 목록"
          >
            <MessageCircle size={16} />
          </button>
        </div>
      </div>

      {/* 검색 바 */}
      <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/30">
        <div className="relative group">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
          <input
            type="text"
            placeholder={activeTab === 'users' ? "이름, 부서 검색..." : "대화방 검색..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg py-2 pl-9 pr-8 text-sm text-zinc-300 focus:outline-none focus:border-blue-500/50 focus:bg-zinc-900 transition-all placeholder:text-zinc-600"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-zinc-500 hover:text-zinc-300 p-0.5 rounded-full hover:bg-zinc-800"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 목록 (스크롤 영역) */}
      <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">

        {/* ==================== [Users Tab] ==================== */}
        {activeTab === 'users' && (
          filteredCrew.length === 0 ? (
            <EmptyState message="검색 결과가 없습니다." />
          ) : (
            <div className="pb-4">
              {Object.entries(groupedCrew).map(([deptName, members]) => (
                <div key={deptName} className="mb-1">
                  {/* 부서 헤더 */}
                  <div className="px-4 py-2 bg-zinc-900/30 text-[11px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2 sticky top-0 backdrop-blur-sm z-10 border-y border-zinc-800/50">
                    <Hash size={10} />
                    {deptName}
                    <span className="bg-zinc-800 px-1.5 py-0.5 rounded-full text-[10px] ml-auto text-zinc-400">
                      {members.length}
                    </span>
                  </div>

                  {/* 멤버 목록 */}
                  <div>
                    {members.map(member => (
                      <div
                        key={member.id}
                        onDoubleClick={() => handleStartChat(member.id)}
                        onContextMenu={(e) => handleContextMenu(e, member)}
                        className={`group px-4 py-3 border-b border-zinc-800/30 cursor-pointer transition-colors hover:bg-zinc-900/80 ${contextMenu?.member.id === member.id ? 'bg-zinc-800' : ''}`}
                      >
                        <div className="flex items-center gap-3">
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
                              <h3 className="text-sm font-medium truncate group-hover:text-white text-zinc-200">
                                {member.username}
                              </h3>
                              {member.position_name && (
                                <span className="text-xs text-zinc-500">{member.position_name}</span>
                              )}
                            </div>
                            <div className="text-xs text-zinc-500 group-hover:text-zinc-400 truncate flex items-center gap-1">
                              {/* <Mail size={10} /> */}
                              {member.email}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ==================== [Rooms Tab] ==================== */}
        {activeTab === 'rooms' && (
          sortedRooms.length === 0 ? (
            <EmptyState message="대화방이 없습니다." icon={<MessageSquare size={32} className="opacity-20" />} />
          ) : (
            <div className="divide-y divide-zinc-800/30">
              {sortedRooms.map(room => {
                const info = getRoomDisplayInfo(room);
                const lastMsg = getLastMessage(room.id);

                return (
                  <div
                    key={room.id}
                    onClick={() => handleOpenRoom(room.id)}
                    className="group px-4 py-3 cursor-pointer transition-colors hover:bg-zinc-900/80 flex items-center gap-3"
                  >
                    {/* Room Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700/50 group-hover:border-zinc-600 relative overflow-hidden">
                      {info.isGroup ? (
                        <Users size={20} className="text-zinc-500 group-hover:text-zinc-400" />
                      ) : (
                        <span className="text-sm font-bold text-zinc-400 group-hover:text-white">
                          {info.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-medium truncate text-zinc-300 group-hover:text-white">
                          {info.name}
                        </h3>
                        <span className="text-[10px] text-zinc-600 ml-2 whitespace-nowrap">
                          {formatDate(room.updated_at).slice(5, 16)} {/* MM.DD HH:mm */}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-500 truncate group-hover:text-zinc-400">
                          {lastMsg || <span className="opacity-50 italic">대화 내용 없음</span>}
                        </p>
                        {/* 뱃지 기능이 추가된다면 여기에 렌더링 */}
                        {/* <span className="bg-blue-600 text-white text-[10px] px-1.5 rounded-full min-w-[1.2em] text-center">N</span> */}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Context Menu (User Tab Only) */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[180px] backdrop-blur-md bg-zinc-900/95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-3 py-2 border-b border-zinc-800 mb-1">
            <div className="text-sm font-semibold text-zinc-200">{contextMenu.member.username}</div>
            <div className="text-xs text-zinc-500">{contextMenu.member.department_name}</div>
          </div>
          <button
            onClick={() => handleStartChat(contextMenu.member.id)}
            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-blue-600 hover:text-white flex items-center gap-2 transition-colors"
          >
            <MessageSquare size={14} />
            대화 시작
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-2 transition-colors"
          >
            <User size={14} />
            프로필 보기
          </button>
        </div>
      )}
    </div>
  );
};

const EmptyState = ({ message, icon }: { message: string, icon?: React.ReactNode }) => (
  <div className="flex flex-col items-center justify-center h-48 text-zinc-600 gap-3">
    {icon || <User size={32} className="opacity-20" />}
    <span className="text-sm font-medium">{message}</span>
  </div>
);
