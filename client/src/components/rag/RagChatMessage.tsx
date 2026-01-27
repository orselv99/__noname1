import { FileText, Database, Globe, Sparkles } from 'lucide-react';
import { RagThinkingAccordion } from './RagThinkingAccordion';
import { RagCollapsibleSection } from './RagCollapsibleSection';
import { RagResultItem } from './RagResultItem';

// Props 인터페이스 정의
interface RagChatMessageProps {
  message: any; // 메시지 객체 (타입은 추후 구체화 가능: { id, role, content, timestamp })
  onSelectServerDoc: (doc: any) => void; // 서버 문서를 선택했을 때 호출될 콜백
}

/**
 * RagChatMessage 컴포넌트
 * 
 * 개별 채팅 메시지를 렌더링하는 컴포넌트입니다.
 * - 사용자 메시지: 우측 정렬, 파란색 말풍선
 * - AI 메시지: 좌측 정렬, 회색 말풍선
 * - RAG 검색 결과: Thinking Process, 요약, 검색 결과(로컬, 서버, 웹)를 구조화하여 표시
 */
export function RagChatMessage({ message, onSelectServerDoc }: RagChatMessageProps) {
  let isRagResult = false;
  let ragData: any = null;

  // AI 메시지이고 JSON 형식으로 시작하면 RAG 결과인지 파싱을 시도합니다.
  if (message.role === 'assistant' && message.content.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message.content);
      if (parsed.type === 'rag_search_result') {
        isRagResult = true;
        ragData = parsed;
      }
    } catch (e) {
      // JSON 파싱 실패 시 일반 텍스트 메시지로 처리
    }
  }

  // RAG 검색 결과 메시지인 경우
  if (isRagResult && ragData) {
    return (
      <div className="flex flex-col gap-2 w-full mb-6">
        {/* 1. 사고 과정 (Thinking Process) - 좌측 정렬 */}
        {ragData.thinking_process && (
          <div className="flex justify-start w-full max-w-[90%]">
            <RagThinkingAccordion state={ragData.thinking_process as any} status="Thinking Process" />
          </div>
        )}

        {/* 2. 검색 결과 카드 - 중앙 정렬 */}
        <div className="flex justify-center w-full">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 w-full max-w-3xl shadow-lg">
            {/* 요약 내용 */}
            <div className="text-xs mb-4 text-zinc-300 leading-relaxed">
              {ragData.summary}
            </div>

            {/* 로컬 문서 결과 섹션 */}
            {ragData.results.local.length > 0 && (
              <RagCollapsibleSection
                title="로컬 문서"
                icon={FileText}
                colorClass="text-purple-400"
                count={ragData.results.local.length}
              >
                {ragData.results.local.map((r: any, i: number) => (
                  <RagResultItem
                    key={i}
                    result={r}
                    type="local"
                    hoverColor="group-hover:text-purple-400"
                  />
                ))}
              </RagCollapsibleSection>
            )}

            {/* 서버 문서 결과 섹션 */}
            <RagCollapsibleSection
              title="서버 문서"
              icon={Database}
              colorClass="text-blue-400"
              count={ragData.results.server.length}
            >
              {ragData.results.server.length > 0 ? (
                ragData.results.server.map((r: any, i: number) => (
                  <RagResultItem
                    key={i}
                    result={r}
                    type="server"
                    hoverColor="group-hover:text-blue-400"
                    onSelect={onSelectServerDoc} // 서버 문서 선택 시 콜백 호출
                  />
                ))
              ) : (
                <div className="text-xs text-zinc-500 italic px-1">
                  검색된 서버 문서가 없습니다
                </div>
              )}
            </RagCollapsibleSection>

            {/* 웹 검색 결과 섹션 */}
            {ragData.results.web.length > 0 && (
              <RagCollapsibleSection
                title="웹 검색"
                icon={Globe}
                colorClass="text-green-400"
                count={ragData.results.web.length}
              >
                {ragData.results.web.map((r: any, i: number) => (
                  <RagResultItem
                    key={i}
                    result={r}
                    type="web"
                    hoverColor="group-hover:text-green-400"
                  />
                ))}
              </RagCollapsibleSection>
            )}

            {/* 하단 안내 메시지 */}
            <div className="pt-3 border-t border-zinc-800/50 text-xs text-zinc-500 flex items-center gap-2">
              <Sparkles size={12} className="text-zinc-600" />
              <span>종합 답변 생성 기능은 준비 중입니다</span>
            </div>
          </div>
        </div>

        {/* 타임스탬프 (우측 하단) */}
        <div className="flex justify-end pr-4">
          <span className="text-[10px] text-zinc-600">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    );
  }

  // 일반 텍스트 메시지 렌더링 (사용자 또는 시스템 메시지)
  return (
    <div className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col max-w-[90%] ${message.role === 'user' ? 'items-end' : 'items-start'}`}>
        {/* 말풍선 스타일 지정 */}
        <div className={`px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap wrap-break-word ${message.role === 'user'
          ? 'bg-blue-600/90 text-white rounded-tr-none' // 사용자: 파란색
          : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none w-full min-w-0' // AI: 회색
          }`}>
          {message.content}
        </div>

        {/* 타임스탬프 */}
        <span className="text-[10px] text-zinc-600 mt-1 px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
