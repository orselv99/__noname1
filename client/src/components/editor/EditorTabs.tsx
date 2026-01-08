import { X } from 'lucide-react';
import { useDocumentStore } from '../../stores/documentStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableTabProps {
  id: string;
  title: string;
  isActive: boolean;
  isDirty?: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}

const SortableTab = ({ id, title, isActive, isDirty, onSelect, onClose }: SortableTabProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 px-3 py-1 text-xs h-full max-w-[200px] min-w-[120px] relative group cursor-pointer border-r border-zinc-800 ${isActive
        ? 'bg-zinc-900 border-t-2 border-t-blue-500 text-white'
        : 'text-zinc-500 hover:bg-zinc-900 border-t-2 border-t-transparent'
        }`}
      onClick={onSelect}
    >
      <span className="truncate select-none">
        {isDirty && <span className="text-blue-400 mr-1">●</span>}
        {title}
      </span>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 rounded ml-auto transition-opacity"
        onClick={onClose}
      >
        <X size={12} />
      </button>
    </div>
  );
};


export const EditorTabs = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs } = useDocumentStore();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex((t) => t.id === active.id);
      const newIndex = tabs.findIndex((t) => t.id === over.id);
      reorderTabs(arrayMove(tabs, oldIndex, newIndex));
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex-1 flex items-center overflow-x-auto h-full px-2 custom-scrollbar">
        <SortableContext
          items={tabs.map(t => t.id)}
          strategy={horizontalListSortingStrategy}
        >
          {tabs.map(tab => (
            <SortableTab
              key={tab.id}
              id={tab.id}
              title={tab.title}
              isActive={tab.id === activeTabId}
              isDirty={tab.isDirty}
              onSelect={() => setActiveTab(tab.id)}
              onClose={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
};
