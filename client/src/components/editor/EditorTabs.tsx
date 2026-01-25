import { X, Plus, MoreHorizontal, Calendar as CalendarIcon, FileText } from 'lucide-react';
import { useContentStore, ContentStore } from '../../stores/contentStore';
import { useRef, useState, useEffect, useMemo, memo, useCallback } from 'react';

interface SortableTabProps {
  id: string;
  title: string;
  type?: 'document' | 'calendar';
  isActive: boolean;
  isDirty?: boolean;
  isRecycled?: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}

const SortableTab = memo(({ title, type, isActive, isDirty, isRecycled, onSelect, onClose }: SortableTabProps) => {
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
      <span className="truncate select-none flex-1 flex items-center gap-1.5">
        {type === 'calendar' ? <CalendarIcon size={12} className="shrink-0" /> : <FileText size={12} className="shrink-0 opacity-70" />}
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
});

export const EditorTabs = () => {
  const { tabs, activeTabId, setActiveTab, closeTab, triggerNewDocument } = useContentStore();
  // Subscribe to documents once to get deleted status
  // Optimize: Only subscribe to the list of deleted document IDs
  // This avoids re-rendering EditorTabs whenever ANY document content changes (e.g. typing)
  const deletedDocIds = useContentStore(useCallback((state: ContentStore) =>
    state.documents.filter(d => d.deleted_at).map(d => d.id).join(','),
    []));

  const deletedSet = useMemo(() => new Set(deletedDocIds.split(',')), [deletedDocIds]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  // Check if tab is recycled using the Set
  const isTabRecycled = (docId?: string) => docId ? deletedSet.has(docId) : false;

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
            type={tab.type} // Pass type
            isActive={activeTabId === tab.id}
            isDirty={tab.isDirty}
            isRecycled={isTabRecycled(tab.docId)}
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
