import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Star,
  FilePlus,
  FolderPlus,
  ArrowUpDown,
  ChevronsUpDown,
  Link,
  Building2,
  FolderKanban,
  Folder,
  GripVertical
} from 'lucide-react';
import { GroupLinkDialog } from '../dialogs/GroupLinkDialog';
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
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { NewDocumentDialog } from '../dialogs/NewDocumentDialog';

export type SidebarMode = 'folder' | 'star';

interface DocumentItem {
  id: string;
  type: 'document' | 'folder';
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

// Sortable Item Component
function SortableItem({
  item,
  groupId,
  depth = 0,
  onSelectDocument,
  selectedDocumentId,
  onQuickCreate,
  onCreateFolder
}: {
  item: DocumentItem;
  groupId: string;
  depth?: number;
  onSelectDocument?: (id: string) => void;
  selectedDocumentId?: string;
  onQuickCreate?: (groupId: string, folderId?: string) => void;
  onCreateFolder?: (groupId: string, parentFolderId?: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  if (item.type === 'folder') {
    return (
      <div ref={setNodeRef} style={style}>
        <div
          className="flex items-center group hover:bg-zinc-900 rounded-md transition-colors"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
        >
          {depth > 0 && <div className="w-px h-4 bg-zinc-700 mr-1" />}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 -mr-0.5"
          >
            <GripVertical size={10} />
          </button>
          <button className="flex-1 flex items-center gap-1 py-1.5 text-left text-zinc-400">
            <span className="text-zinc-500">
              {item.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <Folder size={14} className="text-yellow-600 shrink-0" />
            <span className="flex-1 text-sm truncate">{item.title}</span>
          </button>
          {/* Hover actions */}
          <div className="hidden group-hover:flex items-center gap-0.5 pr-1">
            <button
              onClick={(e) => { e.stopPropagation(); onQuickCreate?.(groupId, item.id); }}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
              title="Quick add document"
            >
              <FilePlus size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCreateFolder?.(groupId, item.id); }}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
              title="New folder"
            >
              <FolderPlus size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="flex items-center group hover:bg-zinc-900 rounded-md transition-colors"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {depth > 0 && <div className="w-px h-4 bg-zinc-700 mr-1" />}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 -mr-0.5"
        >
          <GripVertical size={10} />
        </button>
        <button
          onClick={() => onSelectDocument?.(item.id)}
          className={`flex-1 flex items-center gap-2 py-1.5 text-left rounded-md transition-colors text-sm ${selectedDocumentId === item.id
            ? 'text-blue-400'
            : 'text-zinc-400 hover:text-zinc-200'
            }`}
        >
          <FileText size={14} className="text-zinc-500 shrink-0" />
          <span className="truncate">{item.title}</span>
        </button>
      </div>
    </div>
  );
}

// Sortable Group Component
function SortableGroup({
  group,
  onToggle,
  onSelectDocument,
  selectedDocumentId,
  onQuickCreate,
  onCreateFolder
}: {
  group: DocumentGroup;
  onToggle: (id: string) => void;
  onSelectDocument?: (id: string) => void;
  selectedDocumentId?: string;
  onQuickCreate: (groupId: string, folderId?: string) => void;
  onCreateFolder: (groupId: string, parentFolderId?: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const itemIds = group.items.map(item => item.id);

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center group hover:bg-zinc-900 rounded-md transition-colors">
        <button
          {...attributes}
          {...listeners}
          className="p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-50 ml-2"
        >
          <GripVertical size={12} />
        </button>
        <button
          onClick={() => onToggle(group.id)}
          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-left text-zinc-400"
        >
          <span className="text-zinc-500">
            {group.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          {group.type === 'department' ? (
            <Building2 size={14} className="text-blue-400 shrink-0" />
          ) : (
            <FolderKanban size={14} className="text-purple-400 shrink-0" />
          )}
          <span className="flex-1 text-sm truncate">{group.name}</span>
        </button>
        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 pr-1">
          <button
            onClick={(e) => { e.stopPropagation(); onQuickCreate(group.id); }}
            className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
            title="Quick add document"
          >
            <FilePlus size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCreateFolder(group.id); }}
            className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
            title="New folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
      </div>

      {group.expanded && (
        <div className="ml-4">
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {group.items.map(item => (
              <SortableItem
                key={item.id}
                item={item}
                groupId={group.id}
                depth={0}
                onSelectDocument={onSelectDocument}
                selectedDocumentId={selectedDocumentId}
                onQuickCreate={onQuickCreate}
                onCreateFolder={onCreateFolder}
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
  const [groups, setGroups] = useState<DocumentGroup[]>([
    {
      id: 'dept-1',
      name: '개발팀',
      type: 'department',
      expanded: true,
      items: [
        { id: 'doc-1', type: 'document', title: '팀 회의록.md', path: '개발팀/', isFavorite: true },
        { id: 'doc-2', type: 'document', title: '코딩 가이드.md', path: '개발팀/', isFavorite: false },
        {
          id: 'folder-1', type: 'folder', title: '문서함', path: '개발팀/', expanded: true, children: [
            { id: 'doc-6', type: 'document', title: '규정.md', path: '개발팀/문서함/', isFavorite: false },
          ]
        },
      ]
    },
    {
      id: 'proj-1',
      name: 'Project Alpha',
      type: 'project',
      expanded: true,
      items: [
        { id: 'doc-3', type: 'document', title: '요구사항.md', path: 'Project Alpha/', isFavorite: true },
        { id: 'doc-4', type: 'document', title: 'API 설계.md', path: 'Project Alpha/', isFavorite: false },
      ]
    },
    {
      id: 'proj-2',
      name: 'Project Beta',
      type: 'project',
      expanded: true,
      items: [
        { id: 'doc-5', type: 'document', title: '마일스톤.md', path: 'Project Beta/', isFavorite: false },
      ]
    },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [allExpanded, setAllExpanded] = useState(true);
  const [showNewDocDialog, setShowNewDocDialog] = useState(false);
  const [showGroupLinkDialog, setShowGroupLinkDialog] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const toggleGroup = (groupId: string) => {
    setGroups(prev => prev.map(g =>
      g.id === groupId ? { ...g, expanded: !g.expanded } : g
    ));
  };

  const toggleAllGroups = () => {
    const newState = !allExpanded;
    setAllExpanded(newState);
    setGroups(prev => prev.map(g => ({ ...g, expanded: newState })));
  };

  const handleQuickCreateDocument = (groupId: string, _folderId?: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      type: 'document',
      title: `Untitled-${Date.now() % 1000}.md`,
      path: `${group.name}/`,
      isFavorite: false
    };

    setGroups(prev => prev.map(g =>
      g.id === groupId
        ? { ...g, items: [...g.items, newDoc] }
        : g
    ));
  };

  const handleCreateFolder = (groupId: string, parentFolderId?: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const newFolder: DocumentItem = {
      id: `folder-${Date.now()}`,
      type: 'folder',
      title: `새 폴더`,
      path: `${group.name}/`,
      expanded: true,
      children: []
    };

    if (parentFolderId) {
      // Add as subfolder
      const addToFolder = (items: DocumentItem[]): DocumentItem[] => {
        return items.map(item => {
          if (item.id === parentFolderId && item.type === 'folder') {
            return { ...item, children: [...(item.children || []), newFolder] };
          }
          if (item.children) {
            return { ...item, children: addToFolder(item.children) };
          }
          return item;
        });
      };
      setGroups(prev => prev.map(g =>
        g.id === groupId
          ? { ...g, items: addToFolder(g.items) }
          : g
      ));
    } else {
      setGroups(prev => prev.map(g =>
        g.id === groupId
          ? { ...g, items: [...g.items, newFolder] }
          : g
      ));
    }
  };

  const handleCreateDocument = (data: { group: string; template: string; title: string }) => {
    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      type: 'document',
      title: `${data.title}.md`,
      path: `${data.group}/`,
      isFavorite: false
    };

    setGroups(prev => prev.map(g =>
      g.name === data.group
        ? { ...g, items: [...g.items, newDoc] }
        : g
    ));
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    // Check if it's a group drag
    const activeGroupIndex = groups.findIndex(g => g.id === active.id);
    const overGroupIndex = groups.findIndex(g => g.id === over.id);

    if (activeGroupIndex !== -1 && overGroupIndex !== -1) {
      // Reordering groups
      setGroups(prev => arrayMove(prev, activeGroupIndex, overGroupIndex));
      return;
    }

    // Check if it's an item drag within a group
    for (const group of groups) {
      const activeIndex = group.items.findIndex(i => i.id === active.id);
      const overIndex = group.items.findIndex(i => i.id === over.id);

      if (activeIndex !== -1 && overIndex !== -1) {
        setGroups(prev => prev.map(g => {
          if (g.id !== group.id) return g;
          return { ...g, items: arrayMove(g.items, activeIndex, overIndex) };
        }));
        return;
      }
    }
  };

  const getAllDocuments = (items: DocumentItem[]): DocumentItem[] => {
    return items.flatMap(item => {
      if (item.type === 'folder' && item.children) {
        return [item, ...getAllDocuments(item.children)];
      }
      return [item];
    });
  };

  const allDocuments = groups.flatMap(g => getAllDocuments(g.items)).filter(i => i.type === 'document');
  const favoriteDocuments = allDocuments.filter(doc => doc.isFavorite);
  const groupsForDialog = groups.map(g => ({
    id: g.id,
    name: g.name,
    type: g.type,
    expanded: g.expanded,
    folders: g.items.filter(i => i.type === 'folder').map(f => ({
      id: f.id,
      name: f.title,
      expanded: f.expanded,
      children: f.children
    })) as any
  }));

  const groupIds = groups.map(g => g.id);

  const toolbarButtonClass = "w-8 h-8 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors";

  // Favorites View
  if (mode === 'star') {
    return (
      <div className="w-full bg-zinc-950 flex flex-col h-full">
        <div className="px-3 py-2">
          <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Star size={14} className="text-yellow-500" />
            Favorites
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 custom-scrollbar">
          {favoriteDocuments.map((doc) => (
            <button
              key={doc.id}
              onClick={() => onSelectDocument?.(doc.id)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 text-left rounded-md transition-colors text-sm ${selectedDocumentId === doc.id
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                }`}
            >
              <Star size={14} className="text-yellow-500 shrink-0" />
              <span className="truncate">{doc.title}</span>
            </button>
          ))}
          {favoriteDocuments.length === 0 && (
            <div className="text-center text-zinc-600 text-sm py-4">
              No favorites yet
            </div>
          )}
        </div>
      </div>
    );
  }

  // Folder View (default)
  const filteredGroups = groups.map(group => ({
    ...group,
    items: group.items.filter(item =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }));

  return (
    <div className="w-full bg-zinc-950 flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 py-2">
        <div className="flex items-center">
          <button className={toolbarButtonClass} title="New Document" onClick={() => setShowNewDocDialog(true)}>
            <FilePlus size={18} />
          </button>
        </div>
        <div className="flex items-center">
          <button className={toolbarButtonClass} title="Sort">
            <ArrowUpDown size={18} />
          </button>
          <button className={toolbarButtonClass} title={allExpanded ? "Collapse All" : "Expand All"} onClick={toggleAllGroups}>
            <ChevronsUpDown size={18} />
          </button>
          <button className={toolbarButtonClass} title="Link Groups" onClick={() => setShowGroupLinkDialog(true)}>
            <Link size={18} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-2 pb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-700 rounded-md text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Document Groups with DnD */}
      <div className="flex-1 overflow-y-auto px-2 py-1 custom-scrollbar">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
            {filteredGroups.map((group) => (
              <SortableGroup
                key={group.id}
                group={group}
                onToggle={toggleGroup}
                onSelectDocument={onSelectDocument}
                selectedDocumentId={selectedDocumentId}
                onQuickCreate={handleQuickCreateDocument}
                onCreateFolder={handleCreateFolder}
              />
            ))}
          </SortableContext>
          <DragOverlay>
            {activeId ? (
              <div className="bg-zinc-800 px-3 py-2 rounded-md text-sm text-zinc-300 shadow-lg">
                {groups.find(g => g.id === activeId)?.name ||
                  groups.flatMap(g => g.items).find(i => i.id === activeId)?.title}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* Bottom gap */}
      <div className="py-2" />

      <NewDocumentDialog
        isOpen={showNewDocDialog}
        onClose={() => setShowNewDocDialog(false)}
        onCreate={handleCreateDocument}
        groups={groupsForDialog}
      />

      <GroupLinkDialog
        isOpen={showGroupLinkDialog}
        onClose={() => setShowGroupLinkDialog(false)}
      />
    </div>
  );
};

export default DocumentList;
