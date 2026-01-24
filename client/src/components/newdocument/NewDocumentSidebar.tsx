/**
 * ==========================================================================
 * Sidebar.tsx - 문서 생성 위치 선택 사이드바
 * ==========================================================================
 * 
 * 새 문서 만들기 다이얼로그의 좌측 사이드바입니다.
 * 그룹 및 폴더 트리를 표시하고 선택할 수 있습니다.
 * ==========================================================================
 */

import { ChevronDown, ChevronRight, Building2, FolderKanban, Folder, FolderPlus } from 'lucide-react';
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
  creationMode: 'blank' | 'ai';
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
  onCreateFolder,
  onToggleGroup,
  onToggleFolder
}: NewDocumentSidebarProps) => {

  /**
   * 확장/축소 토글 처리
   */
  const toggleExpand = (id: string, e: React.MouseEvent, type: 'group' | 'folder', groupId?: string) => {
    e.stopPropagation();
    if (type === 'group') {
      onToggleGroup?.(id);
    } else {
      if (groupId) onToggleFolder?.(groupId, id);
    }
  };

  /**
   * 폴더 트리 재귀 렌더링
   */
  const renderFolders = (folders: FolderItem[], groupId: string, depth: number) => {
    return folders.map(folder => (
      <div key={folder.id}>
        <div
          className={`w-full flex items-center group/folder relative pr-2 py-1.5 text-sm transition-colors cursor-pointer ${selectedFolderId === folder.id && selectedGroupId === groupId
            ? creationMode === 'ai'
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-blue-500/20 text-blue-400'
            : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          style={{ paddingLeft: `${depth * 16 + 28}px` }}
          onClick={() => onSelectFolder(groupId, folder.id)}
        >
          {/* 폴더 확장/축소 버튼 */}
          {folder.children && folder.children.length > 0 && (
            <button
              onClick={(e) => toggleExpand(folder.id, e, 'folder', groupId)}
              className="absolute left-0 p-1 hover:text-zinc-200"
              style={{ left: `${depth * 16 + 12}px` }}
            >
              {folder.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          <Folder size={14} className="text-yellow-600 shrink-0 mr-2" />
          <span className="truncate flex-1">{folder.name}</span>

          {/* 하위 폴더 생성 버튼 (호버 시 표시) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder?.(groupId, folder.id);
            }}
            className="hidden group-hover/folder:flex p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 rounded"
            title="Create Folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
        {/* 하위 폴더 렌더링 */}
        {folder.expanded && folder.children && (
          <div>
            {renderFolders(folder.children, groupId, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div className="w-56 border-r border-zinc-800 overflow-y-auto shrink-0 bg-zinc-900/50">
      <div className="p-2 text-xs text-zinc-500 font-medium uppercase">위치 선택</div>
      {groups.map(group => (
        <div key={group.id}>
          <div
            className={`w-full flex items-center group/group relative pr-2 py-1.5 text-sm transition-colors cursor-pointer ${selectedGroupId === group.id && !selectedFolderId
              ? creationMode === 'ai'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-blue-500/20 text-blue-400'
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
            {group.type === 'department' ? (
              <Building2 size={14} className={` shrink-0 mr-2 ${creationMode === 'ai' ? 'text-purple-400' : 'text-blue-400'}`} />
            ) : (
              <FolderKanban size={14} className="text-purple-400 shrink-0 mr-2" />
            )}
            <span className="truncate flex-1 font-medium">{group.name}</span>

            {/* 최상위 폴더 생성 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreateFolder?.(group.id);
              }}
              className="hidden group-hover/group:flex p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 rounded"
              title="Create Folder"
            >
              <FolderPlus size={14} />
            </button>
          </div>

          {/* 그룹 내 폴더 목록 */}
          {group.expanded && renderFolders(group.folders, group.id, 0)}
        </div>
      ))}
    </div>
  );
};

NewDocumentSidebar.displayName = 'NewDocumentSidebar';