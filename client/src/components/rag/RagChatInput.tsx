import { useState } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { useRagStore } from '../../stores/ragStore';

/**
 * RagChatInput 컴포넌트
 * 
 * 사용자의 질문을 입력받고 전송하는 하단 입력바 컴포넌트입니다.
 * 로딩 상태일 때는 전송 버튼이 비활성화되며 로딩 스피너가 표시됩니다.
 */
export function RagChatInput() {
  const [input, setInput] = useState(''); // 입력창 상태
  const { sendMessage, isLoading } = useRagStore(); // RAG 스토어 훅

  /**
   * 폼 제출 핸들러
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // 입력값이 없거나 이미 로딩 중이면 무시
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    setInput(''); // 입력창 초기화
    await sendMessage(userQuery); // 메시지 전송
  };

  return (
    <div className="p-3 border-t border-zinc-800 bg-zinc-950 shrink-0">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="문서에 대해 질문하세요..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 pr-9 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-zinc-200 placeholder-zinc-600 disabled:opacity-50"
        />

        {/* 전송 버튼 */}
        <button
          type="submit"
          disabled={isLoading || !input.trim()} // 로딩 중이거나 입력값이 없으면 비활성화
          className="absolute right-1 top-1 bottom-1 aspect-square flex items-center justify-center text-zinc-400 hover:text-blue-500 disabled:opacity-50 disabled:hover:text-zinc-400 transition-colors"
        >
          {/* 로딩 중이면 스피너, 아니면 전송 아이콘 표시 */}
          {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>
    </div>
  );
}
