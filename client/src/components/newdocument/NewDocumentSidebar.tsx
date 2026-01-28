/**
 * ==========================================================================
 * Sidebar.tsx - 문서 생성 위치 선택 사이드바
 * ==========================================================================
 * 
 * 새 문서 만들기 다이얼로그의 좌측 사이드바입니다.
 * 그룹 및 폴더 트리를 표시하고 선택할 수 있습니다.
 * ==========================================================================
 */

import { ChevronDown, ChevronRight, Building2, FileText, Files, Briefcase, Lock } from 'lucide-react';
import { GroupItem, FolderItem } from './types';

/**
 * Sidebar 컴포넌트 Props
 */
interface NewDocumentSidebarProps {
  /** 그룹 목록 데이터 */
  groups: GroupItem[];
  /** 현재 선택된 그룹 ID */
  selectedGroupId: string;
  /** 현재 선택된 폴더 ID (없으면 null) */
  selectedFolderId: string | null;
  /** 현재 생성 모드 ('blank' 또는 'ai') - 선택 강조 색상 결정 */
  creationMode: 'blank' | 'ai' | 'import';
  /** 그룹 선택 핸들러 */
  onSelectGroup: (groupId: string) => void;
  /** 폴더 선택 핸들러 */
  onSelectFolder: (groupId: string, folderId: string) => void;
  /** 그룹/폴더 생성 핸들러 (옵션) */
  onCreateFolder?: (groupId: string, parentFolderId?: string) => void;
  /** 그룹 토글 핸들러 (옵션) */
  onToggleGroup?: (groupId: string) => void;
  /** 폴더 토글 핸들러 (옵션) */
  onToggleFolder?: (groupId: string, folderId: string) => void;
}

/**
 * 사이드바 컴포넌트
 */
export const NewDocumentSidebar = ({
  groups,
  selectedGroupId,
  selectedFolderId,
  creationMode,
  onSelectGroup,
  onSelectFolder,
  onToggleGroup,
  onToggleFolder
}: NewDocumentSidebarProps) => {

  /**
   * 확장/축소 토글 처리
   */
  const toggleExpand = (
    id: string,
    e: React.MouseEvent,
    type: 'group' | 'document',
    groupId?: string) => {
    e.stopPropagation();
    if (type === 'group') {
      onToggleGroup?.(id);
    } else {
      if (groupId) onToggleFolder?.(groupId, id);
    }
  };

  /**
   * 문서 트리 재귀 렌더링
   */
  const renderDocuments = (items: FolderItem[], groupId: string, depth: number) => {
    return items.map(item => {
      // 하위 문서가 있는지 확인 (아이콘 및 동작 결정용)
      const hasChildren = item.children && item.children.length > 0;

      return (
        <div key={item.id} className="flex flex-col">
          <div
            className={`w-full flex items-center group/item relative pr-2 py-1.5 text-sm transition-colors cursor-pointer 
              ${selectedFolderId === item.id && selectedGroupId === groupId ?
                creationMode === 'ai' ? 'bg-purple-500/20 text-purple-400' :
                  creationMode === 'import' ? 'bg-green-500/20 text-green-400' :
                    'bg-blue-500/20 text-blue-400'
                : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            style={{ paddingLeft: `${depth * 16 + 28}px` }}
            onClick={(e) => {
              // 문서 선택
              onSelectFolder(groupId, item.id);

              // 하위 문서가 있으면 펼치기/접기 토글
              if (hasChildren) {
                console.log('toggleExpand', item.id, e, 'document', groupId);
                // 상위로 이벤트 전파 방지
                e.stopPropagation();

                toggleExpand(item.id, e, 'document', groupId);
              }
            }}
          >
            {/* 확장/축소 버튼 (하위 문서가 있을 때만 표시) */}
            {hasChildren && (
              <button
                onClick={(e) => toggleExpand(item.id, e, 'document', groupId)}
                className="absolute left-0 p-1 hover:text-zinc-200"
                style={{ left: `${depth * 16 + 12}px` }}
              >
                {item.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            )}

            {/* 아이콘: 하위 문서 유무에 따라 FileText(단일) / Files(모음) 구분 */}
            {hasChildren ? (
              <Files size={14} className="shrink-0 mr-2" />
            ) : (
              <FileText size={14} className="shrink-0 mr-2" />
            )}

            <span className="truncate flex-1">{item.name}</span>
          </div>

          {/* 하위 문서 목록 렌더링 (Column 방향) */}
          {item.expanded && hasChildren && (
            <div className="flex flex-col">
              {renderDocuments(item.children!, groupId, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="w-56 border-r border-zinc-800 overflow-y-auto shrink-0 bg-zinc-900/50 flex flex-col">
      <div className="p-2 text-xs text-zinc-500 font-medium uppercase">위치 선택</div>
      {groups.map(group => (
        <div key={group.id} className="flex flex-col">
          <div
            className={`w-full flex items-center group/group relative pr-2 py-1.5 text-sm transition-colors cursor-pointer ${selectedGroupId === group.id && !selectedFolderId
              ? creationMode === 'ai' ? 'bg-purple-500/20 text-purple-400' :
                creationMode === 'import' ? 'bg-green-500/20 text-green-400' :
                  'bg-blue-500/20 text-blue-400'
              : 'text-zinc-400 hover:bg-zinc-800'
              }`}
            onClick={() => {
              onSelectGroup(group.id);
              if (!group.expanded) {
                onToggleGroup?.(group.id);
              }
            }}
          >
            {/* 그룹 확장/축소 버튼 */}
            <button
              onClick={(e) => toggleExpand(group.id, e, 'group')}
              className="p-1 mx-1 hover:text-zinc-200 text-zinc-500"
            >
              {group.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {/* 그룹 타입 아이콘 */}
            {group.type === 'department' ?
              <Building2
                size={14}
                className={` shrink-0 mr-2 ${creationMode === 'ai' ? 'text-purple-400' :
                  creationMode === 'import' ? 'text-green-400' : 'text-blue-400'}`} /> :
              group.type === 'project' ?
                <Briefcase
                  size={14}
                  className={` shrink-0 mr-2 ${creationMode === 'ai' ? 'text-purple-400' :
                    creationMode === 'import' ? 'text-green-400' : 'text-blue-400'}`} /> :
                <Lock
                  size={14}
                  className={` shrink-0 mr-2 ${creationMode === 'ai' ? 'text-purple-400' :
                    creationMode === 'import' ? 'text-green-400' : 'text-blue-400'}`} />}
            <span className="truncate flex-1 font-medium">{group.name}</span>

          </div>

          {/* 그룹 내 문서 목록 */}
          {group.expanded && (
            <div className="flex flex-col">
              {renderDocuments(group.folders, group.id, 0)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

NewDocumentSidebar.displayName = 'NewDocumentSidebar';