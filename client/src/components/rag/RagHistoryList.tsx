import { useState } from 'react';
import { MessageSquare, Pencil, X } from 'lucide-react';
import { useRagStore } from '../../stores/ragStore';

// Props 인터페이스 정의
interface RagHistoryListProps {
  onSelectChat: (id: string) => void; // 채팅 선택 시 호출될 콜백
}

/**
 * RagHistoryList 컴포넌트
 * 
 * 저장된 채팅 기록(히스토리)을 목록으로 보여주는 컴포넌트입니다.
 * 채팅 검색, 이름 변경, 삭제 기능을 제공합니다.
 */
export function RagHistoryList({ onSelectChat }: RagHistoryListProps) {
  // RAG 스토어에서 필요한 상태와 함수들을 가져옵니다.
  const { chats, currentChatId, loadChats, renameChat, deleteChat } = useRagStore();

  // 채팅방 이름 수정 상태 관리
  const [editingChatId, setEditingChatId] = useState<string | null>(null); // 현재 수정 중인 채팅 ID
  const [editTitle, setEditTitle] = useState(''); // 수정 중인 제목 텍스트

  /**
   * 채팅방 이름 변경 처리 함수
   */
  const handleRename = async (chatId: string) => {
    // 빈 제목으로 변경하려고 하면 취소
    if (!editTitle.trim()) {
      setEditingChatId(null);
      return;
    }
    await renameChat(chatId, editTitle);
    setEditingChatId(null);
  };

  /**
   * 수정 모드 시작 함수
   */
  const startEditing = (e: React.MouseEvent, chat: any) => {
    e.stopPropagation(); // 채팅방 선택 이벤트 전파 방지
    setEditingChatId(chat.id);
    setEditTitle(chat.title);
  };

  /**
   * 채팅방 삭제 처리 함수
   */
  const handleDelete = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation(); // 채팅방 선택 이벤트 전파 방지
    // 사용자 확인 후 삭제
    if (confirm('이 채팅을 삭제하시겠습니까?')) {
      deleteChat(chatId);
    }
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-zinc-950 z-10 custom-scrollbar flex flex-col [scrollbar-gutter:stable]">
      {/* 
        검색 입력창 영역 
        상단에 고정되어 스크롤되지 않습니다.
      */}
      <div className="p-3 sticky top-0 bg-zinc-950 z-10 border-b border-zinc-900">
        <input
          type="text"
          placeholder="대화 내역 검색..."
          className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
          onChange={(e) => loadChats(e.target.value)} // 입력 시마다 실시간 검색
        />
      </div>

      {/* 채팅 목록 영역 */}
      <div className="p-2 flex-1">
        {chats.length === 0 ? (
          // 채팅 내역이 없을 경우 표시
          <div className="text-center text-zinc-600 mt-10 text-xs">기록이 없습니다</div>
        ) : (
          <div className="space-y-1">
            {chats.map(chat => {
              const isEditing = editingChatId === chat.id;

              return (
                <div key={chat.id} className="group relative">
                  {/* 채팅 항목 컨테이너 */}
                  <div
                    className={`w-full text-left p-3 rounded border transition-all flex items-center gap-3 
                      ${currentChatId === chat.id
                        ? 'bg-zinc-900 border-blue-900/50 text-blue-100' // 현재 선택된 채팅
                        : 'bg-zinc-950 border-zinc-900 hover:bg-zinc-900 hover:border-zinc-800 text-zinc-400'} // 그 외
                    `}
                  >
                    {/* 
                      채팅 선택 버튼
                      수정 중이 아닐 때만 클릭 가능
                    */}
                    <button
                      onClick={() => !isEditing && onSelectChat(chat.id)}
                      className="flex items-center gap-3 flex-1 min-w-0"
                    >
                      {/* 메시지 아이콘 (선택 여부에 따라 색상 변경) */}
                      <MessageSquare
                        size={14}
                        className={`shrink-0 ${currentChatId === chat.id ? 'text-blue-500' : 'text-zinc-600 group-hover:text-zinc-500'}`}
                      />

                      <div className="flex-1 min-w-0 pr-12 text-left">
                        {isEditing ? (
                          // 수정 모드일 때: 입력창 표시
                          <input
                            autoFocus
                            type="text"
                            className="w-full bg-zinc-800 border border-blue-500/50 rounded px-1 py-0.5 text-sm text-zinc-200 focus:outline-none"
                            value={editTitle}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={() => handleRename(chat.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRename(chat.id);
                              if (e.key === 'Escape') setEditingChatId(null);
                            }}
                          />
                        ) : (
                          // 일반 모드일 때: 제목과 날짜 표시
                          <>
                            <div className="text-sm font-medium truncate">{chat.title}</div>
                            <div className="text-[10px] text-zinc-600 mt-0.5">
                              {new Date(chat.created_at).toLocaleString()}
                            </div>
                          </>
                        )}
                      </div>
                    </button>
                  </div>

                  {/* 
                    호버 액션 버튼들 (이름 변경, 삭제)
                    수정 중이 아닐 때만 마우스 오버 시 표시됨
                  */}
                  {!isEditing && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* 이름 변경 버튼 */}
                      <button
                        onClick={(e) => startEditing(e, chat)}
                        className="p-1.5 text-zinc-600 hover:text-blue-400 rounded hover:bg-zinc-800 transition-colors"
                        title="이름 변경"
                      >
                        <Pencil size={12} />
                      </button>

                      {/* 삭제 버튼 */}
                      <button
                        onClick={(e) => handleDelete(e, chat.id)}
                        className="p-1.5 text-zinc-600 hover:text-red-400 rounded hover:bg-zinc-800 transition-colors"
                        title="채팅 삭제"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
