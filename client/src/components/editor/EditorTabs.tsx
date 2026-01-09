import { X, Plus, MoreHorizontal } from 'lucide-react';
import { useDocumentStore } from '../../stores/documentStore';
import { useRef, useState, useEffect } from 'react';

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
      className={`flex items-center gap-2 px-3 py-1 text-xs h-full max-w-[200px] min-w-[120px] relative group cursor-pointer ${isActive
        ? 'bg-zinc-900 border-t-2 border-t-blue-500 text-white'
        : 'text-zinc-500 hover:bg-zinc-800 border-t-2 border-t-transparent hover:text-zinc-200'
        }`}
      onMouseDown={(e) => e.stopPropagation()} // Prevent window drag
      onClick={onSelect}
    >
      <span className="truncate select-none">
        {isDirty && <span className="text-blue-400 mr-1">●</span>}
        {title}
      </span>
      <button
        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-700 rounded ml-auto transition-opacity"
        onClick={(e) => onClose(e)}
      >
        <X size={12} />
      </button>
    </div>
  );
};

export const EditorTabs = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, triggerNewDocument } = useDocumentStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const checkOverflow = () => {
      setHasOverflow(el.scrollWidth > el.clientWidth);
    };

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);

    checkOverflow();
    return () => observer.disconnect();
  }, [tabs]);

  return (
    <div className="relative h-full flex-1 overflow-hidden">
      <div
        ref={containerRef}
        className="flex h-full items-center overflow-hidden w-full"
      >
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
        {/* New Document Button */}
        <button
          onClick={triggerNewDocument}
          className="h-full w-8 flex items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-white transition-colors"
          title="New Document"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Overflow Indicator */}
      {hasOverflow && (
        <div
          className="absolute right-0 top-0 bottom-0 bg-linear-to-l from-zinc-950 via-zinc-950 to-transparent pl-8 pr-2 flex items-center z-10 pointer-events-auto cursor-default"
        >
          <MoreHorizontal size={14} className="text-zinc-500" />
        </div>
      )}
    </div>
  );
};
