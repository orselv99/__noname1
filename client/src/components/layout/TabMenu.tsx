import { Tab } from '../../stores/documentStore';
import { X } from 'lucide-react';

interface TabMenuProps {
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export const TabMenu = ({ tabs, activeTabId, onSelectTab, onCloseTab }: TabMenuProps) => {
  if (tabs.length === 0) {
    return <div className="p-4 text-xs text-zinc-500 whitespace-nowrap">No open tabs</div>;
  }

  return (
    <div className="flex flex-col min-w-[200px] max-w-[300px] max-h-[400px] overflow-y-auto py-1">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer group ${tab.id === activeTabId ? 'bg-zinc-800 text-blue-400' : 'text-zinc-300'
            }`}
          onClick={() => onSelectTab(tab.id)}
        >
          <span className="flex-1 truncate text-xs">{tab.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(tab.id);
            }}
            className="p-1 text-zinc-500 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
};
