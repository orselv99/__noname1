import { ExternalLink, Globe } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useContentStore } from '../../stores/contentStore';

// Props 인터페이스 정의
interface RagResultItemProps {
  result: any;                // 검색 결과 데이터 객체
  type: 'local' | 'server' | 'web'; // 결과 유형 (로컬, 서버, 웹)
  hoverColor?: string;        // 마우스 오버 시 색상 (선택 사항)
  onSelect?: (result: any) => void; // 선택 시 실행될 콜백 함수 (선택 사항)
}

/**
 * RagResultItem 컴포넌트
 * 
 * 검색된 개별 항목(문서 또는 웹 페이지)을 표시하는 카드 형태의 컴포넌트입니다.
 * 클릭 시 해당 문서를 열거나 웹페이지로 이동합니다.
 */
export function RagResultItem({ result, type, hoverColor, onSelect }: RagResultItemProps) {
  // 전역 상태 저장소에서 필요한 함수와 상태를 가져옵니다.
  const documents = useContentStore(state => state.documents); // 로컬 문서 목록
  const addTab = useContentStore(state => state.addTab);       // 탭 추가 함수

  /**
   * 항목 클릭 핸들러
   * 
   * 결과 유형에 따라 다른 동작을 수행합니다.
   * - 서버 문서: onSelect 콜백 호출 (팝업 표시 등)
   * - 웹 결과: 기본 브라우저로 URL 열기
   * - 로컬 문서: 에디터 탭에 문서 추가 및 열기
   */
  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation(); // 부모 요소로의 클릭 이벤트 전파 중단

    // 서버 문서인 경우
    if (type === 'server' && onSelect) {
      onSelect(result);
      return;
    }

    // 웹 검색 결과인 경우
    if (type === 'web') {
      if (result.metadata.url) {
        try {
          // Tauri 플러그인을 사용하여 외부 브라우저에서 열기 시도
          await openUrl(result.metadata.url);
        } catch (error) {
          console.error("URL 열기 실패:", error);
          // 실패 시 window.open으로 새 탭 열기 시도 (일반 웹 환경 대응)
          window.open(result.metadata.url, '_blank');
        }
      }
    } else {
      // 로컬 문서인 경우
      // ID로 문서를 찾아서 탭에 추가합니다.
      const doc = documents.find(d => d.id === result.metadata.id);
      if (doc) {
        addTab(doc);
      } else {
        console.warn("로컬에서 문서를 찾을 수 없습니다:", result.metadata.id);
      }
    }
  };

  /**
   * 그룹(카테고리)에 따른 배지 색상 반환 함수
   */
  const getBadgeColor = (group: string) => {
    switch (group) {
      case 'Private': return 'bg-zinc-800 text-zinc-400';
      case 'Personal': return 'bg-purple-900/30 text-purple-400';
      case 'Department': return 'bg-pink-900/30 text-pink-400';
      case 'Project': return 'bg-indigo-900/30 text-indigo-400';
      case 'Web': return 'bg-green-900/30 text-green-400';
      case 'Server': return 'bg-blue-900/30 text-blue-400';
      default: return 'bg-zinc-800 text-zinc-500';
    }
  };

  // 호버 색상이 지정되지 않았을 경우 기본값 설정
  const hoverClass = hoverColor || "group-hover:text-blue-400";

  return (
    <div
      className="bg-zinc-950/50 border border-zinc-800 rounded-md p-3 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/50 transition-all group"
      onClick={handleOpen}
    >
      {/* 상단 라인: 제목, 그룹 배지, 유사도 점수, 링크 아이콘 */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          {/* 문서 제목 */}
          <span className={`text-xs font-medium text-zinc-300 truncate transition-colors ${hoverClass}`}>
            {result.metadata.title || "제목 없음"}
          </span>

          {/* 그룹(카테고리) 배지 (웹 검색이 아닐 때만 표시) */}
          {type !== 'web' && result.metadata.group_name && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${getBadgeColor(result.metadata.group_name)}`}>
              {result.metadata.group_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* 유사도 점수 표시 */}
          {result.metadata.similarity !== undefined && (
            <span className="text-[9px] text-zinc-500 font-mono">
              {result.metadata.similarity.toFixed(0)}%
            </span>
          )}

          {/* 외부 링크 아이콘 */}
          <div className={`text-zinc-600 transition-colors ${hoverClass}`}>
            <ExternalLink size={12} />
          </div>
        </div>
      </div>

      {/* 본문 미리보기 (최대 2줄) */}
      <div className="text-xs text-zinc-500 line-clamp-2 break-all leading-relaxed">
        {result.content}
      </div>

      {/* 웹 검색 결과일 경우 URL 도메인 표시 */}
      {type === 'web' && result.metadata.url && (
        <div className="mt-2 text-[10px] text-zinc-600 flex items-center gap-1 truncate">
          <Globe size={10} />
          {new URL(result.metadata.url).hostname}
        </div>
      )}
    </div>
  );
}
