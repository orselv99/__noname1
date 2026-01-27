import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Loader2, Sparkles, Plus, History } from 'lucide-react';
import { useRagStore } from '../../stores/ragStore';
import { ThinkingAccordion } from '../ui/ThinkingAccordion';
import { RagHistoryList } from './RagHistoryList';
import { RagChatInput } from './RagChatInput';
import { RagChatMessage } from './RagChatMessage';
import { RagServerDocPopup } from './RagServerDocPopup';

/**
 * RagPanel 컴포넌트
 * 
 * RAG(Retrieval-Augmented Generation) 시스템의 메인 인터페이스입니다.
 * 채팅 기록 관리, 새로운 채팅 시작, 메시지 목록 표시, 문서 검색 결과를 통합하여 보여줍니다.
 */
export function RagPanel() {
  // UI 상태 관리
  const [showHistory, setShowHistory] = useState(false); // 히스토리 목록 표시 여부
  const [selectedServerDoc, setSelectedServerDoc] = useState<any>(null); // 선택된 서버 문서 (팝업용)

  // RAG 스토어에서 데이터와 액션들을 가져옵니다.
  const {
    chats, currentChatId, messages,
    isLoading, loadingStatus, thinkingProcess, isLoadingMore, hasMore,
    loadChats, createNewChat, loadMoreMessages
  } = useRagStore();

  // DOM 요소 참조 (스크롤 제어용)
  const messagesEndRef = useRef<HTMLDivElement>(null); // 메시지 목록의 끝 지점
  const containerRef = useRef<HTMLDivElement>(null);   // 메시지 컨테이너

  // 스크롤 동작 제어 플래그
  const isFirstRender = useRef(true);      // 첫 렌더링 여부 확인
  const isAutoScrollEnabled = useRef(true); // 자동 스크롤 활성화 여부
  const [prevScrollHeight, setPrevScrollHeight] = useState(0); // 이전 스크롤 높이 (무한 스크롤 시 위치 유지용)

  // 컴포넌트 마운트 시 채팅 목록 불러오기
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // 채팅이 있고 선택된 채팅이 없으며 히스토리가 안 보이는 경우 초기 상태 처리
  useEffect(() => {
    if (!currentChatId && chats.length > 0 && !showHistory) {
      // 기본적으로는 "새 채팅" 상태를 유지합니다.
      // 필요하다면 여기서 가장 최근 채팅을 자동으로 선택하게 할 수 있습니다.
    }
  }, [chats, currentChatId, showHistory]);

  /**
   * 스크롤 이벤트 핸들러
   * 
   * 1. 사용자가 스크롤을 위로 올리면 자동 스크롤을 비활성화합니다.
   * 2. 맨 위로 스크롤했을 때 더 불러올 메시지가 있다면 추가 로딩을 트리거합니다.
   */
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

    // 바닥에서 50px 이내에 있는지 확인
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isAutoScrollEnabled.current = distanceFromBottom < 50;

    // 맨 위(scrollTop === 0)이고 더 불러올 내용이 있으면 로딩
    if (scrollTop === 0 && hasMore && !isLoadingMore && currentChatId) {
      setPrevScrollHeight(scrollHeight); // 현재 높이 저장 (로딩 후 위치 복원용)
      loadMoreMessages();
    }
  };

  /**
   * 메시지 로딩 후 스크롤 위치 유지 (Infinite Scroll UX)
   */
  useLayoutEffect(() => {
    if (containerRef.current && prevScrollHeight > 0) {
      const newScrollHeight = containerRef.current.scrollHeight;
      // 새로운 메시지가 추가된 만큼 스크롤 위치를 조정하여 시각적으로 위치 유지
      containerRef.current.scrollTop = newScrollHeight - prevScrollHeight;
      setPrevScrollHeight(0);
      isAutoScrollEnabled.current = false; // 과거 메시지 로딩 시에는 자동 스크롤 방지
    }
  }, [messages, prevScrollHeight]);

  /**
   * 맨 아래로 스크롤 이동 함수
   */
  const scrollToBottom = () => {
    if (isFirstRender.current) {
      // 첫 렌더링 시에는 즉시 이동
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isFirstRender.current = false;
      isAutoScrollEnabled.current = true;
    } else if (isAutoScrollEnabled.current) {
      // 자동 스크롤이 활성화된 경우 부드럽게 이동
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // 메시지나 생각 과정이 업데이트될 때 자동 스크롤 시도
  useEffect(() => {
    if (prevScrollHeight === 0 && !isLoadingMore) {
      scrollToBottom();
    }
  }, [messages, thinkingProcess, isLoadingMore, prevScrollHeight]);

  /**
   * 채팅 선택 핸들러
   */
  const handleSelectChat = (id: string) => {
    useRagStore.getState().selectChat(id);
    setShowHistory(false); // 히스토리 닫기
    isFirstRender.current = true; // 스크롤 초기화 트리거
  };

  /**
   * 새 채팅 시작 핸들러
   */
  const handleNewChat = () => {
    createNewChat();
    setShowHistory(false);
    isFirstRender.current = true;
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-hidden">
      {/* 
        헤더 영역
        현재 채팅 제목 또는 상태를 표시하고, 히스토리/새 채팅 버튼을 포함합니다.
      */}
      <div className="h-12 p-3 border-b border-zinc-800 text-zinc-400 font-medium text-xs uppercase tracking-wider flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-blue-400" />
          <span className="flex-1 truncate">
            {showHistory
              ? "히스토리"
              : (currentChatId ? chats.find(c => c.id === currentChatId)?.title || "AI 검색" : "AI 검색")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* 히스토리 토글 버튼 */}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded transition-colors ${showHistory ? 'text-blue-400 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'}`}
            title="히스토리"
          >
            <History size={14} />
          </button>

          {/* 새 채팅 버튼 */}
          <button
            onClick={handleNewChat}
            className="text-zinc-500 hover:text-blue-400 p-1.5 rounded transition-colors"
            title="새 채팅"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* 메인 콘텐츠 영역 */}
      <div className="flex-1 overflow-hidden relative">
        {showHistory ? (
          // 히스토리 목록 컴포넌트 표시
          <RagHistoryList onSelectChat={handleSelectChat} />
        ) : (
          // 채팅 메시지 목록 표시
          <div
            ref={containerRef}
            className="h-full overflow-y-auto p-4 custom-scrollbar [scrollbar-gutter:stable]"
            onScroll={handleScroll}
          >
            {/* 상단 로딩 인디케이터 (무한 스크롤) */}
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 size={16} className="animate-spin text-zinc-500" />
              </div>
            )}

            {/* 메시지가 없을 때 (초기 상태) 안내 화면 */}
            {messages.length === 0 && !isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500">
                <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-blue-400/50" />
                </div>
                <p className="text-sm font-medium text-zinc-300 mb-1">AI 지식 베이스</p>
                <p className="text-xs max-w-[200px] leading-relaxed">
                  전체 문서 컬렉션에 대해 질문해보세요.
                </p>
              </div>
            ) : (
              // 메시지 목록 렌더링
              <div className="space-y-6">
                {messages.map((msg) => (
                  <RagChatMessage
                    key={msg.id}
                    message={msg}
                    onSelectServerDoc={setSelectedServerDoc}
                  />
                ))}

                {/* 답변 생성 중일 때 사고 과정 표시 */}
                {isLoading && thinkingProcess && (
                  <div className="flex gap-3 w-full">
                    <ThinkingAccordion
                      state={thinkingProcess as any}
                      status={loadingStatus || "답변 생성 중..."}
                      defaultExpanded={true}
                    />
                  </div>
                )}

                {/* 스크롤 하단 기준점 */}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 
        채팅 입력바 
        히스토리 화면이 아닐 때만 표시
      */}
      {!showHistory && <RagChatInput />}

      {/* 
        서버 문서 상세 팝업 
        Portal로 띄워지며, selectedServerDoc이 있을 때만 렌더링됨
      */}
      <RagServerDocPopup
        doc={selectedServerDoc}
        onClose={() => setSelectedServerDoc(null)}
      />
    </div>
  );
}
