import { useState, useMemo } from 'react';
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
  Info,
} from 'lucide-react';
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
  onSelectDocument?: (docId: string) => void;
  selectedDocumentId?: string;
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
  onMouseLeave
}: ItemProps) {
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
        {/* Toggle Expand */}
        <div
          className={`w-5 h-5 flex items-center justify-center shrink-0 cursor-pointer text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800 transition-colors mr-0.5`}
          onPointerDown={(e) => e.stopPropagation()} // Prevent drag start on toggle
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren || !item.expanded) {
              onToggleExpand(groupId, item.id);
            }
          }}
        >
          {hasChildren ? (
            item.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
          ) : (
            <div className="w-1 h-1 rounded-full bg-zinc-700 group-hover:bg-zinc-600" />
          )}
        </div>

        {/* Icon & Title */}
        <div
          className={`flex-1 flex items-center gap-2 py-1 pr-8 cursor-pointer overflow-hidden select-none ${selectedDocumentId === item.id ? 'text-blue-400' : 'text-zinc-400'}`}
          onClick={(e) => {
            onSelectDocument?.(item.id);
          }}
        >
          <FileText size={14} className={`shrink-0 ${selectedDocumentId === item.id ? 'text-blue-400' : 'text-zinc-500'}`} />
          <span className="truncate text-sm">{item.title}</span>
        </div>

        {/* Hover Actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 pr-2 absolute right-0 top-1/2 -translate-y-1/2">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); }}
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
  onItemMouseLeave
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
  onOpenGroupSettings,
  dragState,
  onItemMouseMove,
  onItemMouseLeave
}: {
  group: DocumentGroup;
  onToggle: (id: string) => void;
  onSelectDocument?: (id: string) => void;
  selectedDocumentId?: string;
  onToggleExpandInfo: (groupId: string, itemId: string) => void;
  onAddSubPage: (groupId: string, parentId?: string) => void;
  onOpenGroupSettings: (groupId: string) => void;
  dragState: { activeId: string | null, overId: string | null, position: DropPosition | null };
  onItemMouseMove: (e: React.MouseEvent, item: DocumentItem) => void;
  onItemMouseLeave: () => void;
}) {
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

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* Group Header */}
      <div
        className="flex items-center group hover:bg-zinc-900 rounded-md transition-colors px-2 py-1 relative min-h-[30px]"
        {...attributes}
        {...listeners}
      >
        <div
          className={`mr-1 cursor-pointer text-zinc-500 hover:text-zinc-300 w-5 flex justify-center`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle(group.id); }}
        >
          {group.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        <div className="flex-1 flex items-center gap-2 overflow-hidden cursor-pointer select-none" onClick={() => onToggle(group.id)}>
          <span className="text-sm font-medium text-zinc-400 truncate">{group.name}</span>
        </div>

        <div className="hidden group-hover:flex items-center gap-0.5 absolute right-2">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpenGroupSettings(group.id); }}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
          >
            <Info size={16} />
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
              />
            ))}
          </SortableContext>
        </div>
      )}
    </div>
  );
}

export const DocumentList = ({
  onSelectDocument,
  selectedDocumentId,
  mode = 'folder'
}: DocumentListProps) => {
  // --- State ---
  const [groups, setGroups] = useState<DocumentGroup[]>([
    {
      id: 'dept-1',
      name: 'Engineering Dept',
      type: 'department',
      expanded: true,
      items: [
        { id: 'doc-1', title: 'Onboarding Guide', path: '', isFavorite: true, children: [] },
        {
          id: 'doc-2', title: 'Tech Stack', path: '', isFavorite: false, expanded: true, children: [
            { id: 'doc-2-1', title: 'Frontend (React)', path: '', children: [] },
            { id: 'doc-2-2', title: 'Backend (Go)', path: '', children: [] }
          ]
        },
      ]
    },
    {
      id: 'proj-1',
      name: 'Project Phoenix',
      type: 'project',
      expanded: true,
      items: [
        { id: 'doc-p1-1', title: 'Project Plan', path: '', children: [] },
        { id: 'doc-p1-2', title: 'Meeting Notes', path: '', children: [] },
      ]
    },
    {
      id: 'proj-2',
      name: 'Marketing Campaign',
      type: 'project',
      expanded: false,
      items: [
        { id: 'doc-p2-1', title: 'Q1 Strategy', path: '', children: [] },
        { id: 'doc-p2-2', title: 'Assets Links', path: '', children: [] },
      ]
    }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [showGroupLinkDialog, setShowGroupLinkDialog] = useState(false);
  const [showGroupInfoDialog, setShowGroupInfoDialog] = useState(false);
  const [activeGroupForInfo, setActiveGroupForInfo] = useState<DocumentGroup | null>(null);
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
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, expanded: !g.expanded } : g));
  };

  const toggleAllGroups = () => {
    // Check if any is collapsed, if so expand all. If all expanded, collapse all.
    const anyCollapsed = groups.some(g => !g.expanded);
    setGroups(prev => prev.map(g => ({ ...g, expanded: anyCollapsed })));
  };

  const toggleExpandItem = (groupId: string, itemId: string) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      // Recursive toggle
      const toggle = (items: DocumentItem[]): DocumentItem[] => {
        return items.map(i => {
          if (i.id === itemId) return { ...i, expanded: !i.expanded };
          if (i.children) return { ...i, children: toggle(i.children) };
          return i;
        });
      }
      return { ...g, items: toggle(g.items) };
    }));
  };

  const handleAddSubPage = (groupId: string, parentId?: string) => {
    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      title: 'Untitled',
      path: '',
      children: [],
      expanded: true
    };

    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      if (!parentId) return { ...g, items: [...g.items, newDoc] };

      const add = (items: DocumentItem[]): DocumentItem[] => {
        return items.map(i => {
          if (i.id === parentId) return { ...i, expanded: true, children: [...(i.children || []), newDoc] };
          if (i.children) return { ...i, children: add(i.children) };
          return i;
        });
      }
      return { ...g, items: add(g.items) };
    }));
  };

  const handleOpenGroupSettings = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      setActiveGroupForInfo(group);
      setShowGroupInfoDialog(true);
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
                onSelectDocument={onSelectDocument}
                selectedDocumentId={selectedDocumentId}
                onToggleExpandInfo={toggleExpandItem}
                onAddSubPage={handleAddSubPage}
                onOpenGroupSettings={handleOpenGroupSettings}
                dragState={dragState}
                onItemMouseMove={onItemMouseMove}
                onItemMouseLeave={() => setDragState(prev => prev.activeId ? prev : { ...prev, overId: null, position: null })}
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
    </div>
  );
}

export default DocumentList;
