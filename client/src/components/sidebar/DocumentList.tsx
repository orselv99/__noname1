import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Edit2 } from 'lucide-react';

import { useDocumentStore } from '../../stores/documentStore';
import { GroupType, SortOption } from '../../types';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FilePlus,
  MoreHorizontal,
  Plus,
  ChevronsUpDown,
  Search,
  Share2,
  ArrowUpDown,
  Folder,
  Building2,
  Briefcase,
  Lock,
  Star,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { GroupLinkDialog } from '../dialogs/GroupLinkDialog';
import { GroupInfoDialog } from '../dialogs/GroupInfoDialog';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NewDocumentDialog } from '../dialogs/NewDocumentDialog';

export type SidebarMode = 'folder' | 'star';

interface DocumentItem {
  id: string;
  title: string;
  path: string;
  isFavorite?: boolean;
  children?: DocumentItem[];
  expanded?: boolean;
}

interface DocumentGroup {
  id: string;
  name: string;
  type: 'department' | 'project';
  items: DocumentItem[];
  expanded: boolean;
}

interface DocumentListProps {
  onSelectDocument?: (id: string) => void;
  mode?: SidebarMode;
}

type DropPosition = 'top' | 'bottom' | 'inside';

// Helper to interact with the tree
const findItem = (items: DocumentItem[], id: string): DocumentItem | undefined => {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItem(item.children, id);
      if (found) return found;
    }
  }
  return undefined;
};

// --- Components ---

interface ItemProps {
  item: DocumentItem;
  groupId: string;
  depth: number;
  selectedDocumentId?: string;
  onSelectDocument?: (id: string) => void;
  onToggleExpand: (groupId: string, itemId: string) => void;
  onAddSubPage?: (groupId: string, parentId: string) => void;
  // Drag props
  isDragging?: boolean;
  dragOverInfo?: { position: DropPosition } | null;
  style?: React.CSSProperties;
  attributes?: any;
  listeners?: any;
  setNodeRef?: (node: HTMLElement | null) => void;
  onMouseMove?: (e: React.MouseEvent, item: DocumentItem) => void;
  onMouseLeave?: () => void;
}

function ItemContent({
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
  onMenuClick, // New Prop
  isRenaming,
  onRenameSubmit
}: ItemProps & {
  onMenuClick?: (e: React.MouseEvent, id: string) => void;
  isRenaming?: boolean;
  onRenameSubmit?: (id: string, newTitle: string) => void;
}) {
  const hasChildren = item.children && item.children.length > 0;

  // Visual feedback for 'inside' drop
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
      {/* Drop Indicators - Made clearer with z-index and color */}
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
        {/* Icon / Chevron Toggle */}
        <div
          className={`w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer mr-1 relative`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation();
              onToggleExpand(groupId, item.id);
            } else {
              onSelectDocument?.(item.id); // Clicking icon on leaf selects it
            }
          }}
        >
          {/* Normal Icon */}
          <FileText
            size={14}
            className={`${selectedDocumentId === item.id ? 'text-blue-400' : 'text-zinc-500'} ${hasChildren ? 'group-hover:hidden' : ''}`}
          />

          {/* Chevron on Hover (if children exist) */}
          {hasChildren && (
            <div className="hidden group-hover:flex items-center justify-center text-zinc-400 hover:text-zinc-200">
              {item.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
          )}
        </div>

        {/* Title */}
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

        {/* Hover Actions */}
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

function SortableItem({
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
}: {
  item: DocumentItem;
  groupId: string;
  depth?: number;
  onSelectDocument?: (id: string) => void;
  selectedDocumentId?: string;
  onToggleExpand: (groupId: string, itemId: string) => void;
  onAddSubPage?: (groupId: string, parentId: string) => void;
  dragState: { activeId: string | null, overId: string | null, position: DropPosition | null };
  onItemMouseMove: (e: React.MouseEvent, item: DocumentItem) => void;
  onItemMouseLeave: () => void;
  onMenuClick?: (e: React.MouseEvent, id: string) => void;
  renamingId?: string | null;
  onRenameSubmit?: (id: string, newTitle: string) => void;
}) {
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
  const dragOverInfo = isOver ? { position: position as DropPosition } : null;

  // Stabilize DnD: ONLY apply transform if we are dragging THIS item.
  // This prevents the list from shuffling around while dragging over it.
  const style = {
    transform: isDragging ? CSS.Translate.toString(transform) : undefined,
    transition,
  };

  return (
    <div className="mb-0.5">
      <ItemContent
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
      {item.expanded && item.children && (
        <SortableContext items={item.children.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {item.children.map(child => (
            <SortableItem
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
}

// Sortable Group Component
function SortableGroup({
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
}: {
  group: DocumentGroup;
  onToggle: (id: string) => void;
  onSelectDocument?: (id: string) => void;
  selectedDocumentId?: string;
  onToggleExpandInfo: (groupId: string, itemId: string) => void;
  onAddSubPage: (groupId: string, parentId?: string) => void;
  dragState: { activeId: string | null, overId: string | null, position: DropPosition | null };
  onItemMouseMove: (e: React.MouseEvent, item: DocumentItem) => void;
  onItemMouseLeave: () => void;
  sortBy: SortOption;
  onSortChange: (groupId: string, sort: SortOption) => void;
  onMenuClick?: (e: React.MouseEvent, id: string) => void;
  renamingId?: string | null;
  onRenameSubmit?: (id: string, newTitle: string) => void;
}) {
  const [showSortMenu, setShowSortMenu] = useState(false);

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

  let GroupIcon = Folder;
  if (group.type === 'project') GroupIcon = Briefcase;
  else if (group.type === 'department') {
    if (group.id === 'private_group') GroupIcon = Lock;
    else GroupIcon = Building2;
  }

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* Group Header */}
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
          {/* Group Icon (Hidden on Hover) */}
          <GroupIcon size={14} className={`text-zinc-500 group-hover:hidden`} />

          {/* Chevron (Visible on Hover) */}
          <div className="hidden group-hover:flex items-center justify-center text-zinc-400">
            {group.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>
        </div>

        <div className="flex-1 flex items-center gap-2 overflow-hidden cursor-pointer select-none" onClick={() => onToggle(group.id)}>
          <span className="text-sm font-medium text-zinc-400 truncate">{group.name}</span>
        </div>

        <div className="hidden group-hover:flex items-center gap-0.5 absolute right-2">
          {/* Sort Menu Button */}
          <div className="relative">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}
              className="p-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
              title="정렬"
            >
              <ArrowUpDown size={14} />
            </button>
            {/* Sort Dropdown */}
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
            onClick={(e) => { e.stopPropagation(); /* More options */ }}
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

      {group.expanded && (
        <div className="">
          <SortableContext items={group.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {group.items.map(item => (
              <SortableItem
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
}

export const DocumentList = ({ onSelectDocument }: DocumentListProps) => {
  // --- State ---
  const { documents, createDocument, renameDocument, deleteDocument, fetchDocuments, addTab, activeTabId, currentUser, newDocTrigger } = useDocumentStore();
  const { departments, projects } = useAuthStore();

  // State Hoisting
  const [groupSortOptions, setGroupSortOptions] = useState<Record<string, SortOption>>({});
  const handleSortChange = (groupId: string, sort: SortOption) => {
    setGroupSortOptions(prev => ({ ...prev, [groupId]: sort }));
  };

  const [isFavoriteFilter, setIsFavoriteFilter] = useState(false);

  // Persistent expansion state
  const expandedIdsRef = useRef<Set<string>>(new Set());
  const expandedGroupsRef = useRef<Set<string>>(new Set(['private_group'])); // Default expanded groups

  const [contextMenu, setContextMenu] = useState<{ id: string, x: number, y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Listen for global Create Document trigger
  useEffect(() => {
    if (newDocTrigger > 0) {
      setShowNewDocDialog(true);
    }
  }, [newDocTrigger]);

  const handleMenuClick = (e: React.MouseEvent, id: string) => {
    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    setContextMenu({
      id,
      x: rect.right + 4,
      y: rect.top
    });
  };

  const handleRename = (id: string) => {
    setRenamingId(id);
    setContextMenu(null);
  };

  const handleRenameSubmit = async (id: string, newTitle: string) => {
    if (newTitle.trim()) {
      await renameDocument(id, newTitle);
    }
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      await deleteDocument(id);
    }
    setContextMenu(null);
  };

  // State for real groups
  const [groups, setGroups] = useState<DocumentGroup[]>([]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Sync store documents to groups
  useEffect(() => {
    // 1. Favorites View (Flat)
    if (isFavoriteFilter) {
      const favs = documents.filter(d => d.is_favorite);
      // Sort favorites by updated_at desc default
      favs.sort((a, b) => (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || ''));

      const flatItems: DocumentItem[] = favs.map(d => ({
        id: d.id,
        title: d.title,
        path: '',
        expanded: false,
      }));

      setGroups([{
        id: 'favorites',
        name: 'Favorites',
        type: 'project',
        expanded: true,
        items: flatItems
      }]);
      return;
    }


    // 2. Standard Tree View
    const effectiveDocuments = documents;

    // Use persisted expansion state
    const expandedIds = expandedIdsRef.current;

    // Also update groups expansion from persisted state
    // We handle this inside groups construction below by checking expandedGroupsRef


    // Recursive tree builder with Sort
    const buildTree = (docs: typeof documents, sortOpt: SortOption = SortOption.NameAsc, parentId?: string): DocumentItem[] => {
      const comparator = (a: any, b: any) => {
        switch (sortOpt) {
          case SortOption.NameAsc: return a.title.localeCompare(b.title);
          case SortOption.NameDesc: return b.title.localeCompare(a.title);
          case SortOption.DateNewest: return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '');
          case SortOption.DateOldest: return (a.updated_at || a.created_at || '').localeCompare(b.updated_at || b.created_at || '');
          default: return 0;
        }
      };

      return docs
        .filter(d => {
          if (parentId) return d.parent_id === parentId;
          return !d.parent_id;
        })
        .sort(comparator)
        .map(d => ({
          id: d.id,
          title: d.title,
          width: '', // Assuming standard width handling
          path: '',
          expanded: expandedIds.has(d.id),
          children: buildTree(docs, sortOpt, d.id)
        }));
    };

    const newGroups: DocumentGroup[] = [];
    const PRIVATE_GROUP_UI_ID = 'private_group';

    // 1. Private Group
    const privateDocs = effectiveDocuments.filter(
      d => d.group_type === GroupType.Private && !d.group_id
    );

    newGroups.push({
      id: PRIVATE_GROUP_UI_ID,
      name: 'Private',
      type: 'department',
      expanded: expandedGroupsRef.current.has(PRIVATE_GROUP_UI_ID),
      items: buildTree(privateDocs, groupSortOptions[PRIVATE_GROUP_UI_ID])
    });

    // 2. Department Groups (Type 0)
    const deptDocs = effectiveDocuments.filter(d => d.group_type === GroupType.Department && d.group_id);
    const deptGroups: Record<string, typeof documents> = {};

    // Initialize My Department empty group if user has one
    if (currentUser?.department_id) {
      deptGroups[currentUser.department_id] = [];
    }

    deptDocs.forEach(d => {
      if (!d.group_id) return;
      if (!deptGroups[d.group_id]) deptGroups[d.group_id] = [];
      deptGroups[d.group_id].push(d);
    });

    const myDeptId = currentUser?.department_id;
    const sortedDeptIds = Object.keys(deptGroups).sort((a, b) => {
      if (a === myDeptId) return -1;
      if (b === myDeptId) return 1;
      return a.localeCompare(b);
    });

    sortedDeptIds.forEach((groupId) => {
      const items = deptGroups[groupId];
      const itemsTree = buildTree(items, groupSortOptions[groupId]);

      // Determine Department Name
      let groupName = `Department ${groupId.substring(0, 8)}...`;
      if (groupId === myDeptId) {
        groupName = currentUser?.department_name?.trim() || 'My Department';
      } else if (departments[groupId]) {
        groupName = departments[groupId];
      }

      newGroups.push({
        id: groupId,
        name: groupName,
        type: 'department',
        expanded: expandedGroupsRef.current.has(groupId),
        items: itemsTree
      });
    });

    // 3. Project Groups (Type 1)
    const projGroups: Record<string, typeof documents> = {};

    // Initialize with joined projects from AuthStore so they appear even if empty
    Object.keys(projects).forEach(pid => {
      projGroups[pid] = [];
    });

    // Populate with documents
    const projDocs = effectiveDocuments.filter(d => d.group_type === GroupType.Project && d.group_id);
    projDocs.forEach(d => {
      if (!d.group_id) return;
      if (!projGroups[d.group_id]) projGroups[d.group_id] = [];
      projGroups[d.group_id].push(d);
    });

    // Sort Projects by Name
    const sortedProjIds = Object.keys(projGroups).sort((a, b) => {
      const nameA = projects[a] || a;
      const nameB = projects[b] || b;
      return nameA.localeCompare(nameB);
    });

    sortedProjIds.forEach(groupId => {
      const items = projGroups[groupId];
      newGroups.push({
        id: groupId,
        name: projects[groupId] || `Project ${groupId.substring(0, 8)}...`,
        type: 'project',
        expanded: expandedGroupsRef.current.has(groupId),
        items: buildTree(items, groupSortOptions[groupId])
      });
    });

    setGroups(newGroups);
  }, [documents, currentUser, groupSortOptions, isFavoriteFilter, departments, projects]);

  // activeTabId 변경 시 해당 문서의 부모들을 자동으로 펼치기
  useEffect(() => {
    if (!activeTabId) return;

    // 선택된 문서 찾기
    const selectedDoc = documents.find(d => d.id === activeTabId);
    if (!selectedDoc) return;

    // 부모 ID 수집 (문서 계층)
    const parentIds: string[] = [];
    let currentParentId = selectedDoc.parent_id;
    let safety = 0;
    const MAX_DEPTH = 100;
    while (currentParentId && safety < MAX_DEPTH) {
      parentIds.push(currentParentId);
      const parentDoc = documents.find(d => d.id === currentParentId);
      currentParentId = parentDoc?.parent_id;
      safety++;
    }

    // 해당 문서가 속한 그룹 찾기 및 펼치기
    setGroups(prev => prev.map(g => {
      // 그룹 펼치기 (해당 문서가 이 그룹에 속하는지 확인)
      const containsDoc = (items: DocumentItem[]): boolean => {
        for (const item of items) {
          if (item.id === activeTabId) return true;
          if (item.children && containsDoc(item.children)) return true;
        }
        return false;
      };

      if (!containsDoc(g.items)) return g;

      // 그룹 펼치기
      const expandParents = (items: DocumentItem[]): DocumentItem[] => {
        return items.map(item => {
          // 부모인 경우 펼치기
          if (parentIds.includes(item.id)) {
            return {
              ...item,
              expanded: true,
              children: item.children ? expandParents(item.children) : undefined
            };
          }
          if (item.children) {
            return { ...item, children: expandParents(item.children) };
          }
          return item;
        });
      };

      return { ...g, expanded: true, items: expandParents(g.items) };
    }));
  }, [activeTabId, documents]);

  // State defined above usage
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [showGroupLinkDialog, setShowGroupLinkDialog] = useState(false);
  const [showGroupInfoDialog, setShowGroupInfoDialog] = useState(false);
  const [activeGroupForInfo, _setActiveGroupForInfo] = useState<DocumentGroup | null>(null);
  const [dragState, setDragState] = useState<{ activeId: string | null, overId: string | null, position: DropPosition | null }>({ activeId: null, overId: null, position: null });

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement starts drag
      },
    })
  );

  // --- Handlers ---
  const toggleGroup = (groupId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const newExpanded = !g.expanded;
        if (newExpanded) expandedGroupsRef.current.add(groupId);
        else expandedGroupsRef.current.delete(groupId);
        return { ...g, expanded: newExpanded };
      }
      return g;
    }));
  };

  const toggleAllGroups = () => {
    // Check if any group or item is collapsed, if so expand all. If all expanded, collapse all.
    const anyCollapsed = groups.some(g => !g.expanded);

    // Recursive function to set expanded state for all items
    const setAllExpanded = (items: DocumentItem[], expanded: boolean): DocumentItem[] => {
      return items.map(item => {
        if (expanded) expandedIdsRef.current.add(item.id);
        else expandedIdsRef.current.delete(item.id);

        return {
          ...item,
          expanded: expanded,
          children: item.children ? setAllExpanded(item.children, expanded) : undefined
        };
      });
    };

    setGroups(prev => prev.map(g => {
      const newExpanded = !anyCollapsed;
      if (newExpanded) expandedGroupsRef.current.add(g.id);
      else expandedGroupsRef.current.delete(g.id);

      return {
        ...g,
        expanded: newExpanded,
        items: setAllExpanded(g.items, newExpanded)
      }
    }));
  };

  const toggleExpandItem = (groupId: string, itemId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      // Recursive toggle
      const toggle = (items: DocumentItem[]): DocumentItem[] => {
        return items.map(i => {
          if (i.id === itemId) {
            const newExpanded = !i.expanded;
            if (newExpanded) expandedIdsRef.current.add(itemId);
            else expandedIdsRef.current.delete(itemId);
            return { ...i, expanded: newExpanded };
          }
          if (i.children) return { ...i, children: toggle(i.children) };
          return i;
        });
      }
      return { ...g, items: toggle(g.items) };
    }));
  };

  const expandItem = (groupId: string, itemId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      const expand = (items: DocumentItem[]): DocumentItem[] => {
        return items.map(i => {
          if (i.id === itemId) {
            expandedIdsRef.current.add(itemId);
            return { ...i, expanded: true };
          }
          if (i.children) return { ...i, children: expand(i.children) };
          return i;
        });
      }
      // Also expand group
      if (!g.expanded) expandedGroupsRef.current.add(groupId);
      return { ...g, expanded: true, items: expand(g.items) };
    }));
  };

  const handleAddSubPage = (groupId: string, parentId?: string) => {
    // Auto-expand parent if creating a sub-page
    if (parentId) {
      expandItem(groupId, parentId);
    }

    // groupId === 'private_group' means the Private group
    if (groupId === 'private_group') {
      createDocument('Untitled', undefined, GroupType.Private, parentId);
      return;
    }

    // Otherwise, try to infer details. 
    // In strict mode, we should match groupId against known groups to find type.
    const group = groups.find(g => g.id === groupId);
    if (group) {
      // TODO: We need real group type in DocumentGroup interface to be sure.
      // For now, mapping based on our construction logic:

      let newGroupType = GroupType.Department;
      if (group.type === 'project') newGroupType = GroupType.Project;

      createDocument('Untitled', groupId, newGroupType, parentId);
    }
  };


  // --- Drag & Drop Logic ---

  const handleDragStart = (event: DragStartEvent) => {
    setDragState({ activeId: event.active.id as string, overId: null, position: null });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const position = dragState.position;
    setDragState({ activeId: null, overId: null, position: null });

    if (!over || active.id === over.id) return;
    if (!position) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Helper to traverse and update
    setGroups(prevGroups => {
      let activeItem: DocumentItem | null = null;

      // Remove Logic
      const remove = (items: DocumentItem[]): DocumentItem[] => {
        const result: DocumentItem[] = [];
        for (const item of items) {
          if (item.id === activeId) {
            activeItem = item; // Capture it
          } else {
            if (item.children) {
              item.children = remove(item.children); // Recurse
            }
            result.push(item);
          }
        }
        return result;
      }

      const newGroups = prevGroups.map(g => ({ ...g, items: remove(g.items) }));

      if (!activeItem) return prevGroups; // Should not happen

      // Insert Logic
      const insert = (items: DocumentItem[]): DocumentItem[] => {
        const result: DocumentItem[] = [];
        for (const item of items) {
          // Check if this item is the target
          if (item.id === overId) {
            if (position === 'top') {
              result.push(activeItem!);
              result.push(item);
            } else if (position === 'bottom') {
              result.push(item);
              result.push(activeItem!);
            } else if (position === 'inside') {
              item.children = [...(item.children || []), activeItem!];
              item.expanded = true; // Auto expand when dropping inside
              result.push(item);
            }
          } else {
            if (item.children) {
              item.children = insert(item.children);
            }
            result.push(item);
          }
        }
        return result;
      };

      const finalGroups = newGroups.map(g => ({ ...g, items: insert(g.items) }));
      return finalGroups;
    });
  };

  const onItemMouseMove = (e: React.MouseEvent, item: DocumentItem) => {
    if (!dragState.activeId || dragState.activeId === item.id) return;

    // Calculate position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;

    let pos: DropPosition = 'inside';

    // 25% top, 50% middle, 25% bottom
    if (y < h * 0.25) pos = 'top';
    else if (y > h * 0.75) pos = 'bottom';
    else pos = 'inside';

    // Provide debounce or only update if changed to avoid render thrashing
    if (dragState.overId !== item.id || dragState.position !== pos) {
      setDragState(prev => ({ ...prev, overId: item.id, position: pos }));
    }
  };

  // Helper to find item for Preview
  const activeItem = useMemo(() => {
    if (!dragState.activeId) return null;
    const allItems = groups.flatMap(g => g.items); // Should use recursive finder
    return findItem(allItems, dragState.activeId);
  }, [dragState.activeId, groups]);

  return (
    <div className="w-full bg-zinc-950 flex flex-col h-full font-sans">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 rounded"
            onClick={() => setShowGroupLinkDialog(true)}
            title="Link Settings"
          >
            <Share2 size={18} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${isFavoriteFilter ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-zinc-500 hover:text-yellow-400 hover:bg-zinc-800'}`}
            onClick={() => setIsFavoriteFilter(!isFavoriteFilter)}
            title={isFavoriteFilter ? "Show All Documents" : "Show Favorites Only"}
          >
            {isFavoriteFilter ? (
              <FileText size={18} />
            ) : (
              <Star size={18} />
            )}
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 rounded"
            onClick={toggleAllGroups}
            title="Expand/Collapse All"
          >
            <ChevronsUpDown size={18} />
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 rounded"
            onClick={() => setShowNewDocDialog(true)}
            title="New Document"
          >
            <FilePlus size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-3 shrink-0">
        <div className="relative group">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" size={14} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-4 py-1.5 bg-zinc-900/50 border border-zinc-800 rounded-md text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 focus:bg-zinc-900 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={groups.map(g => g.id)} strategy={verticalListSortingStrategy}>
            {groups.map(group => (
              <SortableGroup
                key={group.id}
                group={group}
                onToggle={toggleGroup}
                onSelectDocument={(id) => {
                  const doc = documents.find(d => d.id === id);
                  if (doc) addTab(doc);
                  onSelectDocument?.(id);
                }}
                selectedDocumentId={activeTabId || undefined}
                onToggleExpandInfo={toggleExpandItem}
                onAddSubPage={handleAddSubPage}
                dragState={dragState}
                onItemMouseMove={onItemMouseMove}
                onItemMouseLeave={() => setDragState(prev => prev.activeId ? prev : { ...prev, overId: null, position: null })}
                sortBy={groupSortOptions[group.id] || 'date'}
                onSortChange={handleSortChange}
                onMenuClick={handleMenuClick}
                renamingId={renamingId}
                onRenameSubmit={handleRenameSubmit}
              />
            ))}
          </SortableContext>

          <DragOverlay>
            {activeItem ? (
              <div className="bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-md p-2 shadow-xl flex items-center gap-2 w-[200px]">
                <FileText size={14} className="text-zinc-400" />
                <span className="text-sm text-zinc-200 truncate">{activeItem.title}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <NewDocumentDialog
        isOpen={showNewDocDialog}
        onClose={() => setShowNewDocDialog(false)}
        onCreate={() => { }}
        groups={[]}
      />

      <GroupLinkDialog
        isOpen={showGroupLinkDialog}
        onClose={() => setShowGroupLinkDialog(false)}
      />

      <GroupInfoDialog
        isOpen={showGroupInfoDialog}
        onClose={() => setShowGroupInfoDialog(false)}
        groupName={activeGroupForInfo?.name}
        groupType={activeGroupForInfo?.type}
      />
      {contextMenu && createPortal(
        <div
          className="fixed z-9999 bg-zinc-900 border border-zinc-800 rounded shadow-xl py-1 w-32 flex flex-col"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="px-3 py-1.5 text-xs text-left text-zinc-400 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
            onClick={(e) => { e.stopPropagation(); handleRename(contextMenu.id); }}
          >
            <Edit2 size={12} /> Rename
          </button>
          <button
            className="px-3 py-1.5 text-xs text-left text-red-500 hover:bg-zinc-800 flex items-center gap-2"
            onClick={() => handleDelete(contextMenu.id)}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

export default DocumentList;
