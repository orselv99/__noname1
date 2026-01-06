import { X } from 'lucide-react';

interface Tab {
  id: string;
  title: string;
  isActive?: boolean;
  isDirty?: boolean;
}

interface EditorTabsProps {
  tabs: Tab[];
  onSelectTab?: (tabId: string) => void;
  onCloseTab?: (tabId: string) => void;
}

export const EditorTabs = ({ tabs, onSelectTab, onCloseTab }: EditorTabsProps) => {
  return (
    <div className="flex-1 flex items-center gap-2 overflow-hidden h-full">
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`flex items-center gap-2 px-3 py-1 text-xs h-full max-w-[200px] min-w-[120px] relative group cursor-pointer ${tab.isActive
            ? 'bg-zinc-900 border-t-2 border-blue-500 text-white'
            : 'text-zinc-500 hover:bg-zinc-900'
            }`}
          onClick={() => onSelectTab?.(tab.id)}
        >
          <span className="truncate">
            {tab.isDirty && <span className="text-blue-400 mr-1">●</span>}
            {tab.title}
          </span>
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-800 rounded ml-auto"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab?.(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};
