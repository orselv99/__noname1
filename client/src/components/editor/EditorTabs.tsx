import { X, Plus, MoreHorizontal } from 'lucide-react';
import { useDocumentStore } from '../../stores/documentStore';
import { useRef, useState, useEffect } from 'react';

interface SortableTabProps {
  id: string;
  title: string;
  isActive: boolean;
  isDirty?: boolean;
  isRecycled?: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}

const SortableTab = ({ title, isActive, isDirty, isRecycled, onSelect, onClose }: SortableTabProps) => {
  // Logic for border color
  let borderColor = 'border-t-transparent';
  if (isActive) {
    borderColor = isRecycled ? 'border-t-red-500' : 'border-t-blue-500';
  }

  // Logic for text color when active
  let textClass = 'text-zinc-500 hover:text-zinc-200';
  if (isActive) {
    textClass = isRecycled ? 'bg-zinc-900 text-red-100' : 'bg-zinc-900 text-white';
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1 text-xs h-full max-w-[200px] min-w-[120px] relative group cursor-pointer border-t-2 ${borderColor} ${textClass} hover:bg-zinc-800 transition-colors`}
      onMouseDown={(e) => e.stopPropagation()} // Prevent window drag
      onClick={onSelect}
    >
      <span className="truncate select-none flex-1">
        {title}
      </span>

      <div className="flex items-center justify-center w-4 h-4 ml-1 relative shrink-0">
        {isDirty && !isRecycled && (
          <div className="absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity pointer-events-none">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
          </div>
        )}
        <button
          className={`absolute inset-0 flex items-center justify-center p-0.5 hover:bg-zinc-700 rounded text-zinc-500 hover:text-white transition-opacity ${isDirty && !isRecycled ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          onClick={(e) => onClose(e)}
        >
          <X size={12} />
        </button>
      </div>
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
        {tabs.map((tab) => {
          // Check if tab is recycled
          const doc = useDocumentStore.getState().documents.find(d => d.id === tab.docId);
          const isRecycled = doc?.group_id === 'ffffffff-ffff-ffff-ffff-ffffffffffff';

          return (
            <SortableTab
              key={tab.id}
              id={tab.id}
              title={tab.title}
              isActive={activeTabId === tab.id}
              isDirty={tab.isDirty}
              isRecycled={isRecycled}
              onSelect={() => setActiveTab(tab.id)}
              onClose={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            />
          )
        })}
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
