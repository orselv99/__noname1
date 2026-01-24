/**
 * ==========================================================================
 * DocumentListGroup.tsx - 문서 목록 그룹 컴포넌트
 * ==========================================================================
 * 
 * 문서 목록의 그룹(Private, Department, Project 등)을 렌더링합니다.
 * 그룹 자체도 정렬 가능하며, 내부의 문서 아이템들을 포함합니다.
 * ==========================================================================
 */

import { memo, useState } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder, Briefcase, Lock, Building2, ChevronDown, ChevronRight, ArrowUpDown, MoreHorizontal, Plus } from 'lucide-react';
import { SortOption } from '../../types';
import { DocumentListGroupType, DocumentListItemType, DocumentListDropPosition } from './types';
import { DocumentListItem } from './DocumentListItem';

/**
 * DocumentListGroup Props
 */
interface DocumentListGroupProps {
  /** 그룹 데이터 */
  group: DocumentListGroupType;
  /** 접기/펼치기 토글 핸들러 */
  onToggle: (id: string) => void;
  /** 문서 선택 핸들러 */
  onSelectDocument?: (id: string) => void;
  /** 선택된 문서 ID */
  selectedDocumentId?: string;
  /** 문서 아이템 확장 토글 */
  onToggleExpandInfo: (groupId: string, itemId: string) => void;
  /** 하위 페이지 추가 핸들러 */
  onAddSubPage: (groupId: string, parentId?: string) => void;
  /** 드래그 상태 정보 */
  dragState: { activeId: string | null, overId: string | null, position: DocumentListDropPosition | null };
  /** 아이템 마우스 이동 핸들러 */
  onItemMouseMove: (e: React.MouseEvent, item: DocumentListItemType) => void;
  /** 아이템 마우스 이탈 핸들러 */
  onItemMouseLeave: () => void;
  /** 현재 정렬 옵션 */
  sortBy: SortOption;
  /** 정렬 변경 핸들러 */
  onSortChange: (groupId: string, sort: SortOption) => void;
  /** 메뉴 클릭 핸들러 */
  onMenuClick?: (e: React.MouseEvent, id: string) => void;
  /** 이름 변경 중인 ID */
  renamingId?: string | null;
  /** 이름 변경 완료 핸들러 */
  onRenameSubmit?: (id: string, newTitle: string) => void;
}

/**
 * 문서 목록 그룹 컴포넌트
 */
export const DocumentListGroup = memo(({
  group,
  onToggle,
  onSelectDocument,
  selectedDocumentId,
  onToggleExpandInfo,
  onAddSubPage,
  dragState,
  onItemMouseMove,
  onItemMouseLeave,
  sortBy,
  onSortChange,
  onMenuClick,
  renamingId,
  onRenameSubmit
}: DocumentListGroupProps) => {
  const [showSortMenu, setShowSortMenu] = useState(false);
  // ... rest of implementation ...
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isGroupDragging,
  } = useSortable({
    id: group.id,
    data: { type: 'group', group }
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isGroupDragging ? 0.5 : 1
  };

  // 그룹 타입에 따른 아이콘 결정
  let GroupIcon = Folder;
  if (group.type === 'project') GroupIcon = Briefcase;
  else if (group.type === 'department') {
    if (group.id === 'private_group') GroupIcon = Lock;
    else GroupIcon = Building2;
  }

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* 그룹 헤더 */}
      <div
        className="flex items-center group hover:bg-zinc-900 rounded-md transition-colors px-2 py-1 relative min-h-[30px]"
        {...attributes}
        {...listeners}
      >
        <div
          className={`mr-1 cursor-pointer w-5 h-5 flex items-center justify-center shrink-0 relative`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle(group.id); }}
        >
          {/* 그룹 아이콘 (호버 시 숨김) */}
          <GroupIcon size={14} className={`text-zinc-500 group-hover:hidden`} />

          {/* 확장/축소 아이콘 (호버 시 표시) */}
          <div className="hidden group-hover:flex items-center justify-center text-zinc-400">
            {group.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2 overflow-hidden cursor-pointer select-none" onClick={() => onToggle(group.id)}>
          <span className="text-sm font-medium text-zinc-400 truncate">{group.name}</span>
        </div>

        {/* 그룹 액션 버튼 (호버 시 표시) */}
        <div className="hidden group-hover:flex items-center gap-0.5 absolute right-2">
          {/* 정렬 메뉴 버튼 */}
          <div className="relative">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
              className="p-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
              title="정렬"
            >
              <ArrowUpDown size={14} />
            </button>
            {/* 정렬 드롭다운 메뉴 */}
            {showSortMenu && (
              <div
                className="absolute top-full right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg z-50 py-1 min-w-[120px]"
                onMouseLeave={() => setShowSortMenu(false)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); onSortChange(group.id, SortOption.DateNewest); setShowSortMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 ${sortBy === SortOption.DateNewest ? 'text-blue-400' : 'text-zinc-300'}`}
                >
                  최신순
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSortChange(group.id, SortOption.DateOldest); setShowSortMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 ${sortBy === SortOption.DateOldest ? 'text-blue-400' : 'text-zinc-300'}`}
                >
                  오래된순
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSortChange(group.id, SortOption.NameAsc); setShowSortMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 ${sortBy === SortOption.NameAsc ? 'text-blue-400' : 'text-zinc-300'}`}
                >
                  이름 (A-Z)
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onSortChange(group.id, SortOption.NameDesc); setShowSortMenu(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-zinc-700 ${sortBy === SortOption.NameDesc ? 'text-blue-400' : 'text-zinc-300'}`}
                >
                  이름 (Z-A)
                </button>
              </div>
            )}
          </div>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); /* 추가 옵션 구현 */ }}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
          >
            <MoreHorizontal size={16} />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAddSubPage(group.id); }}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* 내부 아이템 렌더링 */}
      {group.expanded && (
        <div className="">
          <SortableContext items={group.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {group.items.map(item => (
              <DocumentListItem
                key={item.id}
                item={item}
                groupId={group.id}
                depth={1}
                onSelectDocument={onSelectDocument}
                selectedDocumentId={selectedDocumentId}
                onToggleExpand={onToggleExpandInfo}
                onAddSubPage={(gId, pId) => onAddSubPage(gId, pId)}
                dragState={dragState}
                onItemMouseMove={onItemMouseMove}
                onItemMouseLeave={onItemMouseLeave}
                onMenuClick={onMenuClick}
                renamingId={renamingId}
                onRenameSubmit={onRenameSubmit}
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
});

DocumentListGroup.displayName = 'DocumentListGroup';
