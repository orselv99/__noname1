import { X } from 'lucide-react';
import { useDocumentStore } from '../../stores/documentStore';

interface SortableTabProps {
  id: string;
  title: string;
  isActive: boolean;
  isDirty?: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}

const SortableTab = ({ title, isActive, isDirty, onSelect, onClose }: SortableTabProps) => {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 text-xs h-full max-w-[200px] min-w-[120px] relative group cursor-pointer border-r border-zinc-800 ${isActive
        ? 'bg-zinc-900 border-t-2 border-t-blue-500 text-white'
        : 'text-zinc-500 hover:bg-zinc-900 border-t-2 border-t-transparent'
        }`}
      onMouseDown={(e) => e.stopPropagation()} // Prevent window drag
      onClick={onSelect}
    >
      <span className="truncate select-none">
        {isDirty && <span className="text-blue-400 mr-1">●</span>}
        {title}
      </span>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 rounded ml-auto transition-opacity"
        onClick={(e) => onClose(e)}
      >
        <X size={12} />
      </button>
    </div>
  );
};

export const EditorTabs = () => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useDocumentStore();

  return (
    <div className="flex h-full overflow-x-auto no-scrollbar items-center">
      {tabs.map((tab) => (
        <SortableTab
          key={tab.id}
          id={tab.id}
          title={tab.title}
          isActive={activeTabId === tab.id}
          isDirty={tab.isDirty}
          onSelect={() => setActiveTab(tab.id)}
          onClose={(e) => {
            e.stopPropagation();
            closeTab(tab.id);
          }}
        />
      ))}
    </div>
  );
};
