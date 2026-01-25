/**
 * ==========================================================================
 * MetadataPanel.tsx - 문서 메타데이터 패널
 * ==========================================================================
 * 
 * 선택된 문서의 메타데이터를 표시하는 사이드바 패널입니다.
 * 
 * 표시 항목:
 * - Status/Visibility (Private 그룹 제외)
 * - Summary (요약)
 * - Tags (태그)
 * - Footnotes (각주)
 * - Links (하이퍼링크)
 * - Resources (첨부 미디어)
 * - Revisions (버전 히스토리)
 * - Document Info (생성자, 생성일, 수정일, 크기)
 * ==========================================================================
 */

import { useState, useCallback, useMemo } from 'react';
import {
  Calendar,
  User,
  FileText,
  Eye,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  History,
  Activity
} from 'lucide-react';
import { useContentStore } from '../../stores/contentStore';
import { DocumentState, VisibilityLevel, GroupType, Document } from '../../types';
import { useAuthStore } from '../../stores/authStore';
import { useConfirm } from '../ConfirmProvider';
import { useToast } from '../Toast';

// 컴포넌트 임포트
import { MetadataDocumentStateDropdown } from './MetadataDocumentStateDropdown';
import { MetadataVisibilityDropdown, VISIBILITY_LEVELS } from './MetadataVisibilityDropdown';
import { MetadataTagList } from './MetadataTagList';
import { MetadataSummarySection } from './MetadataSummarySection';
import { MetadataFootnoteList } from './MetadataFootnoteList';
import { MetadataLinkList } from './MetadataLinkList';
import { MetadataResourceList } from './MetadataResourceList';

// 유틸리티 함수 임포트
import { formatBytes, formatDate } from '../../utils/formatters';

/**
 * 메타데이터 패널 메인 컴포넌트
 */
export const MetadataPanel = () => {
  // =========================================================================
  // Store Selectors (최적화된 셀렉터 사용)
  // =========================================================================

  // 활성 문서만 구독 (전체 documents 배열 변경에 반응하지 않음)
  const activeDoc = useContentStore(
    useCallback((state) => state.documents.find((d: Document) => d.id === state.activeTabId), [])
  );

  const liveEditorContent = useContentStore(state => state.liveEditorContent);
  const saveDocument = useContentStore(state => state.saveDocument);
  const { confirm } = useConfirm();
  const { showToast } = useToast();

  // =========================================================================
  // 미디어 크기 계산 (Memoized)
  // =========================================================================
  const { binary: totalMediaSize, encoded: totalEncodedMediaSize } = useMemo(() => {
    /**
     * HTML 콘텐츠에서 미디어 크기 계산
     */
    const calculateFromHtml = (htmlContent: string) => {
      let binary = 0;
      let encoded = 0;
      try {
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');

        const processElement = (el: Element) => {
          let src = el.getAttribute('src');
          if (!src && (el.tagName === 'VIDEO' || el.tagName === 'AUDIO')) {
            src = el.querySelector('source')?.getAttribute('src') ?? null;
          }

          if (src?.startsWith('data:')) {
            const parts = src.split(',');
            const base64Part = parts[1];

            if (base64Part) {
              binary += Math.floor(base64Part.length * 0.75);
            }
          }
        };

        Array.from(doc.getElementsByTagName('img')).forEach(processElement);
        Array.from(doc.getElementsByTagName('video')).forEach(processElement);
        Array.from(doc.getElementsByTagName('audio')).forEach(processElement);

        // 인코딩 크기는 바이너리 크기로부터 역산
        encoded = binary > 0 ? Math.ceil(binary / 0.75) : 0;
      } catch (e) { /* ignore */ }
      return { binary, encoded };
    };

    // 1. 편집 모드: 실시간 콘텐츠 사용
    if (liveEditorContent) {
      return calculateFromHtml(liveEditorContent);
    }

    // 2. 뷰 모드: 저장된 media_size 사용
    if (activeDoc?.media_size) {
      const binary = parseInt(activeDoc.media_size, 10);
      const encoded = binary > 0 ? Math.ceil(binary / 0.75) : 0;
      return { binary, encoded };
    }

    // 3. 레거시 문서: 콘텐츠에서 계산
    if (activeDoc?.content) {
      return calculateFromHtml(activeDoc.content);
    }

    return { binary: 0, encoded: 0 };
  }, [liveEditorContent, activeDoc?.content, activeDoc?.media_size]);

  // =========================================================================
  // 섹션 펼침 상태 (Hooks는 조건부 return 전에 호출)
  // =========================================================================
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [isTagsExpanded, setIsTagsExpanded] = useState(true);
  const [isLinksExpanded, setIsLinksExpanded] = useState(true);
  const [isResourcesExpanded, setIsResourcesExpanded] = useState(true);
  const [isMentionsExpanded, setIsMentionsExpanded] = useState(true);

  // Revision 펼침 상태 (상단 모두펼치기에 영향 안받음)
  const [isRevisionExpanded, setIsRevisionExpanded] = useState(false);

  // 상태 변경 로딩 상태
  const [isPublishing, setIsPublishing] = useState(false);

  /**
   * 모든 섹션 펼치기/접기 토글
   */
  const toggleAllSections = () => {
    const anyCollapsed = !isSummaryExpanded || !isTagsExpanded || !isLinksExpanded || !isResourcesExpanded || !isMentionsExpanded;
    setIsSummaryExpanded(anyCollapsed);
    setIsTagsExpanded(anyCollapsed);
    setIsLinksExpanded(anyCollapsed);
    setIsResourcesExpanded(anyCollapsed);
    setIsMentionsExpanded(anyCollapsed);
  };

  // =========================================================================
  // 문서 미선택 시 플레이스홀더
  // =========================================================================
  if (!activeDoc) {
    return (
      <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center text-zinc-500 text-xs">
        Select a document
      </div>
    );
  }

  // =========================================================================
  // 렌더링
  // =========================================================================
  return (
    <div className="w-full h-full bg-zinc-950 flex flex-col text-white relative">
      {/* 헤더 */}
      <div className="h-12 p-3 border-b border-zinc-800 font-medium text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-2">
        <FileText size={14} className="text-blue-400" />
        <span className="flex-1">Metadata</span>
        <button
          className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white transition-colors"
          onClick={toggleAllSections}
          title="Expand/Collapse All"
        >
          <ChevronsUpDown size={14} />
        </button>
      </div>

      {/* 메인 콘텐츠 (스크롤 영역) */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-6 custom-scrollbar hover:overflow-y-scroll"
        style={{ scrollbarGutter: 'stable' }}
      >

        {/* Status & Visibility 섹션 (Private 그룹 제외) */}
        {activeDoc.group_type !== GroupType.Private && (
          <div className="flex gap-2">
            {/* Status 드롭다운 */}
            <div className="flex-1">
              <h3 className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1">
                <Activity size={12} />
                Status
              </h3>
              <MetadataDocumentStateDropdown
                currentState={activeDoc.document_state}
                isPrivate={false}
                isLoading={isPublishing}
                disabled={isPublishing}
                onStateChange={async (state) => {
                  try {
                    // Private 문서 게시 차단
                    if (state === DocumentState.Published && activeDoc.group_type === GroupType.Private) {
                      await confirm({
                        title: '게시 불가',
                        message: '개인(Private) 문서는 게시할 수 없습니다',
                        confirmText: '확인',
                        variant: 'primary'
                      });
                      return;
                    }

                    // 게시 전환 시 확인
                    if (state === DocumentState.Published && activeDoc.document_state !== DocumentState.Published) {
                      const nextVersion = (activeDoc.version || 0) + 1;
                      if (await confirm({
                        title: '문서 게시',
                        message: `이 문서를 게시하시겠습니까?\n\n버전이 v${nextVersion}로 올라갑니다.`,
                        confirmText: '게시',
                        variant: 'primary'
                      })) {
                        setIsPublishing(true);
                        try {
                          await saveDocument({ ...activeDoc, document_state: state });
                        } finally {
                          setIsPublishing(false);
                        }
                      }
                    } else {
                      // 기타 상태 변경
                      await saveDocument({ ...activeDoc, document_state: state });
                    }
                  } catch (error) {
                    setIsPublishing(false);
                    console.error('State change error:', error);
                    showToast('서버 동기화 문제로 인해 게시가 취소되었습니다 (잠시 후 다시 시도해주세요)', 'error');
                  }
                }}
              />
            </div>

            {/* Visibility 드롭다운 */}
            <div className="flex-1">
              <h3 className="text-xs text-zinc-500 font-medium mb-1 flex items-center gap-1">
                <Eye size={12} />
                Visibility
              </h3>
              <MetadataVisibilityDropdown
                currentLevel={activeDoc.visibility_level}
                onLevelChange={async (level) => {
                  try {
                    // 그룹 기본 가시성 확인
                    let defaultVisibility = VisibilityLevel.Hidden;
                    const { departments, projects, user } = useAuthStore.getState();

                    if (activeDoc.group_type === GroupType.Department) {
                      if (activeDoc.group_id && departments[activeDoc.group_id]) {
                        defaultVisibility = departments[activeDoc.group_id].visibility;
                      } else if (user?.department && user.department.id === activeDoc.group_id) {
                        defaultVisibility = user.department.default_visibility_level;
                      }
                    } else if (activeDoc.group_type === GroupType.Project) {
                      if (activeDoc.group_id && projects[activeDoc.group_id]) {
                        defaultVisibility = projects[activeDoc.group_id].visibility;
                      }
                    }

                    // 그룹 기본값과 다른 경우 확인
                    if (level !== defaultVisibility) {
                      if (await confirm({
                        title: '가시성 변경 확인',
                        message: `선택한 가시성(${VISIBILITY_LEVELS.find(v => v.value === level)?.label})이 그룹 기본값(${VISIBILITY_LEVELS.find(v => v.value === defaultVisibility)?.label})과 다릅니다.\n\n정말 변경하시겠습니까?`,
                        confirmText: '변경',
                        variant: 'primary'
                      })) {
                        await saveDocument({ ...activeDoc, visibility_level: level });
                      }
                    } else {
                      await saveDocument({ ...activeDoc, visibility_level: level });
                    }
                  } catch (error) {
                    console.error('Visibility change error:', error);
                    showToast('가시성 설정을 변경할 수 없습니다', 'error');
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Summary 섹션 (추출된 컴포넌트) */}
        <MetadataSummarySection
          summary={activeDoc.summary}
          isExpanded={isSummaryExpanded}
          onToggle={() => setIsSummaryExpanded(!isSummaryExpanded)}
        />

        {/* Tags 섹션 (추출된 컴포넌트) */}
        <MetadataTagList
          docId={activeDoc.id}
          tags={activeDoc.tags || []}
          isExpanded={isTagsExpanded}
          onToggle={() => setIsTagsExpanded(!isTagsExpanded)}
        />

        {/* Footnotes (추출된 컴포넌트) */}
        <MetadataFootnoteList content={activeDoc.content} liveContent={liveEditorContent} forceExpanded={isLinksExpanded} />

        {/* Linked Mentions (추출된 컴포넌트) */}
        <MetadataLinkList content={activeDoc.content} liveContent={liveEditorContent} forceExpanded={isLinksExpanded} />

        {/* Attached Resources (추출된 컴포넌트) */}
        <MetadataResourceList content={activeDoc.content} liveContent={liveEditorContent} forceExpanded={isResourcesExpanded} />
      </div>

      {/* Revision 섹션 (Private 그룹 제외) */}
      {activeDoc.group_type !== GroupType.Private && (
        <div className="border-t border-zinc-800 shrink-0 bg-zinc-950">
          <div
            className="flex items-center gap-2 px-4 py-3 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none"
            onClick={() => setIsRevisionExpanded(!isRevisionExpanded)}
          >
            <History size={12} />
            <h3 className="text-xs font-medium flex-1">Revisions</h3>
            {isRevisionExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </div>
          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${isRevisionExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              }`}
          >
            <div className="px-4 pb-3 overflow-y-auto custom-scrollbar max-h-48">
              {/* Git Graph 스타일 Revisions */}
              <div className="relative pl-5">
                {/* 세로선 (버전 > 1인 경우만) */}
                {activeDoc.version > 1 && (
                  <div className="absolute left-[7px] top-3 bottom-3 w-px bg-zinc-700" />
                )}

                {/* Revision 아이템 */}
                <div className="space-y-2">
                  {/* 현재 버전 (버전 0이면 숨김) */}
                  {activeDoc.version > 0 && (
                    <div className="relative flex items-start gap-3 cursor-pointer hover:bg-zinc-900/50 -ml-5 pl-5 pr-2 py-1.5 rounded">
                      <div className="absolute left-[3px] top-2.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-2 ring-zinc-950" />
                      <div className="flex-1 min-w-0 ml-1">
                        <div className="text-xs text-zinc-200 truncate">
                          v{activeDoc.version}. <span className="text-zinc-400">{activeDoc.title}</span> <span className="text-zinc-500">· {activeDoc.creator_name || 'Unknown'}</span>
                        </div>
                        <div className="text-[10px] text-zinc-600">{formatDate(activeDoc.updated_at)}</div>
                      </div>
                    </div>
                  )}

                  {/* 이전 버전 플레이스홀더 */}
                  {activeDoc.version === 0 ? (
                    <div className="relative flex items-start gap-3 -ml-5 pl-5 pr-2 py-1.5 rounded select-none cursor-default">
                      <div className="absolute left-[3px] top-2.5 w-2.5 h-2.5 rounded-full invisible" />
                      <div className="flex-1 min-w-0 ml-1">
                        <div className="text-xs text-zinc-600 italic">
                          No previous versions.
                        </div>
                        <div className="text-[10px] text-zinc-600 italic">
                          Publish to create a new version.
                        </div>
                      </div>
                    </div>
                  ) : (
                    // 버전 히스토리 플레이스홀더 (revision 테이블 구현 시 대체)
                    Array.from({ length: Math.min(activeDoc.version - 1, 4) }, (_, idx) => {
                      const v = activeDoc.version - 1 - idx;
                      return (
                        <div key={v} className="relative flex items-start gap-3 cursor-pointer hover:bg-zinc-900/50 -ml-5 pl-5 pr-2 py-1 rounded opacity-70 hover:opacity-100 transition-opacity">
                          <div className="absolute left-[5px] top-2.5 w-1.5 h-1.5 rounded-full bg-zinc-500" />
                          <div className="flex-1 min-w-0 ml-1">
                            <div className="text-xs text-zinc-500 truncate">
                              v{v}. <span className="text-zinc-600">{activeDoc.title}</span> <span className="text-zinc-600">· {activeDoc.creator_name || 'Unknown'}</span>
                            </div>
                            <div className="text-[10px] text-zinc-700">(History data not available)</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 문서 정보 (하단 고정) */}
      <div className="p-4 border-t border-zinc-800 space-y-2 text-xs text-zinc-500 shrink-0 bg-zinc-950">
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><User size={12} /> Creator</span>
          <span>{activeDoc.creator_name || (activeDoc.user_id === 'user1' ? 'User' : 'Unknown')}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><Calendar size={12} /> Created</span>
          <span>{formatDate(activeDoc.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><Calendar size={12} /> Updated</span>
          <span>{formatDate(activeDoc.updated_at)}</span>
        </div>
        <div className="flex justify-between">
          <span className="flex items-center gap-1"><FileText size={12} /> Size</span>
          <span>
            {(() => {
              const totalSize = parseInt(activeDoc.size || '0', 10);
              const textSize = Math.max(0, totalSize - totalEncodedMediaSize);

              if (totalMediaSize > 0) {
                return `${formatBytes(totalSize)} (${formatBytes(textSize)} + ${formatBytes(totalMediaSize)} media)`;
              }
              return formatBytes(totalSize);
            })()}
          </span>
        </div>
      </div>
    </div>
  );
};
