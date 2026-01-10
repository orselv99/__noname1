import { MetadataPanel } from './MetadataPanel';
import { RagPanel } from './RagPanel';
import { ResizeHandle } from '../layout/ResizeHandle';
import { FileText, Sparkles, ChevronRight, ChevronLeft } from 'lucide-react';

interface RightSidebarProps {
  width: number;
  isCollapsed: boolean;
  onToggle: () => void;
  onResize: (e: React.MouseEvent) => void;
  activeTab: 'metadata' | 'rag';
  onTabChange: (tab: 'metadata' | 'rag') => void;
}

export const RightSidebar = ({
  width,
  isCollapsed,
  onToggle,
  onResize,
  activeTab,
  onTabChange
}: RightSidebarProps) => {

  return (
    <div
      className="relative flex h-full bg-zinc-950 border-l border-zinc-900 transition-all duration-300 ease-in-out"
      style={{ width: isCollapsed ? '48px' : width }}
    >
      {!isCollapsed && <ResizeHandle onResizeStart={onResize} />}

      {/* Sidebar Icons (Left side of right sidebar? No, usually right side or top?) */}
      {/* Let's put icons on the left edge of the right sidebar context, similar to main sidebar but mirrored? */}
      {/* Actually, looking at previous design (inferences), it likely had a tab bar or icon bar. */}
      {/* Let's implement a simple column of icons for toggling/switching */}

      <div className="flex flex-col w-12 items-center py-4 gap-4 border-r border-zinc-900 bg-zinc-950 shrink-0 z-10">
        <button
          onClick={onToggle}
          className="p-2 text-zinc-500 hover:text-white rounded transition-colors"
          title={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div className="w-6 h-[1px] bg-zinc-800" />

        <button
          onClick={() => {
            onTabChange('metadata');
            if (isCollapsed) onToggle();
          }}
          className={`p-2 rounded transition-colors ${activeTab === 'metadata' && !isCollapsed ? 'text-blue-400 bg-zinc-900' : 'text-zinc-500 hover:text-white'}`}
          title="Metadata"
        >
          <FileText size={18} />
        </button>

        <button
          onClick={() => {
            onTabChange('rag');
            if (isCollapsed) onToggle();
          }}
          className={`p-2 rounded transition-colors ${activeTab === 'rag' && !isCollapsed ? 'text-purple-400 bg-zinc-900' : 'text-zinc-500 hover:text-white'}`}
          title="AI Assistant"
        >
          <Sparkles size={18} />
        </button>
      </div>

      {!isCollapsed && (
        <div className="flex-1 overflow-hidden flex flex-col min-w-0">
          {activeTab === 'metadata' ? <MetadataPanel /> : <RagPanel />}
        </div>
      )}
    </div>
  );
};
