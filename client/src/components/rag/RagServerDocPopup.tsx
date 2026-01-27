import { createPortal } from 'react-dom';
import { X, Database, Calendar, Sparkles, Tag } from 'lucide-react';

// Props 인터페이스 정의
interface RagServerDocPopupProps {
  doc: any;             // 표시할 문서 객체 (타입은 추후 구체화 가능)
  onClose: () => void;  // 팝업 닫기 함수
}

/**
 * RagServerDocPopup 컴포넌트
 * 
 * 서버 검색 결과를 클릭했을 때 상세 내용을 보여주는 모달 팝업입니다.
 * React Portal을 사용하여 body 태그 바로 아래에 렌더링되므로, 다른 UI 요소 위에 뜹니다.
 */
export function RagServerDocPopup({ doc, onClose }: RagServerDocPopupProps) {
  // 문서가 없으면 아무것도 렌더링하지 않습니다.
  if (!doc) return null;

  // createPortal을 사용하여 현재 컴포넌트 계층 구조 바깥(document.body)에 렌더링합니다.
  return createPortal(
    /* 
      배경 오버레이 (Backdrop)
      클릭 시 팝업이 닫히도록 onClose 핸들러를 연결합니다.
    */
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* 
        팝업 컨테이너 
        내부 클릭 이벤트가 배경으로 전파되어 닫히는 것을 방지하기 위해 stopPropagation을 사용합니다.
      */}
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 영역: 아이콘, 제목, 메타정보, 닫기 버튼 */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            {/* 데이터베이스 아이콘 */}
            <div className="p-2 rounded bg-blue-500/10 text-blue-400 shrink-0">
              <Database size={18} />
            </div>

            <div className="min-w-0">
              {/* 문서 제목 */}
              <h3 className="font-semibold text-zinc-100 truncate text-base">
                {doc.metadata.title || "제목 없음"}
              </h3>

              {/* 문서 생성일 및 유사도 점수 표시 */}
              <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                {doc.metadata.created_at && (
                  <span className="flex items-center gap-1">
                    <Calendar size={10} />
                    {new Date(doc.metadata.created_at).toLocaleDateString()}
                  </span>
                )}
                {doc.metadata.score && (
                  <span className="bg-blue-900/30 text-blue-400 px-1.5 rounded">
                    {Number(doc.metadata.score).toFixed(2)} 유사도
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 닫기 버튼 (X 아이콘) */}
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white rounded-md hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문 내용 영역 (스크롤 가능) */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* 요약 정보가 있으면 표시 */}
          {doc.metadata.summary && (
            <div className="mb-6 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Sparkles size={12} className="text-yellow-500" /> 요약
              </h4>
              <p className="text-sm text-zinc-300 leading-relaxed">{doc.metadata.summary}</p>
            </div>
          )}

          {/* 문서 실제 내용 */}
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-300">
              {doc.content}
            </div>
          </div>

          {/* 태그 정보 표시 */}
          {doc.metadata.tag_evidences && doc.metadata.tag_evidences.length > 0 && (
            <div className="mt-8 pt-4 border-t border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Tag size={12} /> 태그
              </h4>
              <div className="flex flex-wrap gap-2">
                {doc.metadata.tag_evidences.map((tag: any, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    #{tag.tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 영역: 하단 닫기 버튼 */}
        <div className="p-3 border-t border-zinc-700 bg-zinc-900/50 text-right shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>,
    document.body // Portal의 타겟 노드
  );
}
