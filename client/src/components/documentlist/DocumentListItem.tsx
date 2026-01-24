/**
 * ==========================================================================
 * DocumentListItem.tsx - 문서 목록 아이템 컴포넌트
 * ==========================================================================
 * 
 * 문서 트리의 개별 항목(문서/폴더)을 렌더링합니다.
 * dnd-kit을 사용한 드래그 앤 드롭 기능을 포함합니다.
 * ==========================================================================
 */

import { FileText, ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DocumentListItemType, DocumentListDropPosition } from './types';

/**
 * 아이템 콘텐츠 Props
 */
interface DocumentListItemContentProps {
  item: DocumentListItemType;
  groupId: string;
  depth: number;
  selectedDocumentId?: string;
  onSelectDocument?: (id: string) => void;
  onToggleExpand: (groupId: string, itemId: string) => void;
  onAddSubPage?: (groupId: string, parentId: string) => void;

  // Drag props
  isDragging?: boolean;
  dragOverInfo?: { position: DocumentListDropPosition } | null;
  style?: React.CSSProperties;
  attributes?: any;
  listeners?: any;
  setNodeRef?: (node: HTMLElement | null) => void;
  onMouseMove?: (e: React.MouseEvent, item: DocumentListItemType) => void;
  onMouseLeave?: () => void;

  // Menu & Rename
  onMenuClick?: (e: React.MouseEvent, id: string) => void;
  isRenaming?: boolean;
  onRenameSubmit?: (id: string, newTitle: string) => void;
}

/**
 * 문서 아이템 내부 콘텐츠 (스타일 및 인터랙션)
 */
function DocumentListItemContent({
  item,
  groupId,
  depth,
  selectedDocumentId,
  onSelectDocument,
  onToggleExpand,
  onAddSubPage,
  isDragging,
  dragOverInfo,
  style,
  attributes,
  listeners,
  setNodeRef,
  onMouseMove,
  onMouseLeave,
  onMenuClick,
  isRenaming,
  onRenameSubmit
}: DocumentListItemContentProps) {
  const hasChildren = item.children && item.children.length > 0;

  // 'Inside' 드롭 시각적 피드백
  const isDropTargetInside = dragOverInfo?.position === 'inside';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-md transition-colors ${isDragging ? 'opacity-30 z-0' : 'opacity-100 z-10'} ${isDropTargetInside ? 'bg-blue-500/20' : 'hover:bg-zinc-900'}`}
      {...attributes}
      {...listeners}
      onMouseMove={(e) => onMouseMove?.(e, item)}
      onMouseLeave={onMouseLeave}
    >
      {/* 드롭 인디케이터 - 상단/하단 */}
      {dragOverInfo?.position === 'top' && (
        <div className="absolute -top-[2px] left-0 right-0 h-[3px] bg-blue-500 z-50 pointer-events-none rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
      )}
      {dragOverInfo?.position === 'bottom' && (
        <div className="absolute -bottom-[2px] left-0 right-0 h-[3px] bg-blue-500 z-50 pointer-events-none rounded-full shadow-[0_0_8px_rgba(59,130,246,0.6)] " />
      )}

      <div
        className="flex items-center min-h-[28px] relative"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {/* 아이콘 / 확장 토글 */}
        <div
          className={`w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer mr-1 relative`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              onToggleExpand(groupId, item.id);
            } else {
              onSelectDocument?.(item.id);
            }
          }}
        >
          {/* 기본 문서 아이콘 */}
          <FileText
            size={14}
            className={`${selectedDocumentId === item.id ? 'text-blue-400' : 'text-zinc-500'} ${hasChildren ? 'group-hover:hidden' : ''}`}
          />

          {/* 호버 시 확장 아이콘 (자식이 있을 경우) */}
          {hasChildren && (
            <div className="hidden group-hover:flex items-center justify-center text-zinc-400 hover:text-zinc-200">
              {item.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          )}
        </div>

        {/* 제목 영역 */}
        <div
          className={`flex-1 flex items-center py-1 pr-8 cursor-pointer overflow-hidden select-none ${selectedDocumentId === item.id ? 'text-blue-400' : 'text-zinc-400'}`}
          onClick={() => {
            onSelectDocument?.(item.id);
          }}
        >
          {isRenaming ? (
            <input
              autoFocus
              defaultValue={item.title}
              className="bg-zinc-800 text-zinc-100 text-sm px-1 py-0.5 rounded w-full border border-blue-500 focus:outline-none"
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => onRenameSubmit?.(item.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  onRenameSubmit?.(item.id, item.title);
                  e.currentTarget.value = item.title;
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <span className="truncate text-sm">{item.title}</span>
          )}
        </div>

        {/* 호버 액션 버튼 (메뉴, 추가) */}
        <div className="hidden group-hover:flex items-center gap-0.5 pr-2 absolute right-0 top-1/2 -translate-y-1/2">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onMenuClick?.(e, item.id);
            }}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (onAddSubPage) onAddSubPage(groupId, item.id);
            }}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * DocumentListItem Props
 */
interface DocumentListItemProps {
  item: DocumentListItemType;
  groupId: string;
  depth?: number;
  onSelectDocument?: (id: string) => void;
  selectedDocumentId?: string;
  onToggleExpand: (groupId: string, itemId: string) => void;
  onAddSubPage?: (groupId: string, parentId: string) => void;
  dragState: { activeId: string | null, overId: string | null, position: DocumentListDropPosition | null };
  onItemMouseMove: (e: React.MouseEvent, item: DocumentListItemType) => void;
  onItemMouseLeave: () => void;
  onMenuClick?: (e: React.MouseEvent, id: string) => void;
  renamingId?: string | null;
  onRenameSubmit?: (id: string, newTitle: string) => void;
}

/**
 * Sortable(드래그 가능한) 문서 리스트 아이템 컴포넌트
 */
export const DocumentListItem = ({
  item,
  groupId,
  depth = 0,
  onSelectDocument,
  selectedDocumentId,
  onToggleExpand,
  onAddSubPage,
  dragState,
  onItemMouseMove,
  onItemMouseLeave,
  onMenuClick,
  renamingId,
  onRenameSubmit
}: DocumentListItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: 'item', item, groupId, depth }
  });

  const isOver = dragState.overId === item.id;
  const position = isOver ? dragState.position : null;
  const dragOverInfo = isOver ? { position: position as DocumentListDropPosition } : null;

  // 드래그 중 흔들림 방지 스타일 적용
  const style = {
    transform: isDragging ? CSS.Translate.toString(transform) : undefined,
    transition,
  };

  return (
    <div className="mb-0.5">
      <DocumentListItemContent
        item={item}
        groupId={groupId}
        depth={depth}
        isDragging={isDragging}
        selectedDocumentId={selectedDocumentId}
        onSelectDocument={onSelectDocument}
        onToggleExpand={onToggleExpand}
        onAddSubPage={onAddSubPage}
        dragOverInfo={dragOverInfo}

        setNodeRef={setNodeRef}
        style={style}
        attributes={attributes}
        listeners={listeners}
        onMouseMove={onItemMouseMove}
        onMouseLeave={onItemMouseLeave}
        onMenuClick={onMenuClick}
        isRenaming={renamingId === item.id}
        onRenameSubmit={onRenameSubmit}
      />
      {/* 하위 아이템 렌더링 (재귀) */}
      {item.expanded && item.children && (
        <SortableContext items={item.children.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {item.children.map(child => (
            <DocumentListItem
              key={child.id}
              item={child}
              groupId={groupId}
              depth={depth + 1}
              onSelectDocument={onSelectDocument}
              selectedDocumentId={selectedDocumentId}
              onToggleExpand={onToggleExpand}
              onAddSubPage={onAddSubPage}
              dragState={dragState}
              onItemMouseMove={onItemMouseMove}
              onItemMouseLeave={onItemMouseLeave}
              onMenuClick={onMenuClick}
              renamingId={renamingId}
              onRenameSubmit={onRenameSubmit}
            />
          ))}
        </SortableContext>
      )}
    </div>
  );
};
