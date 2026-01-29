import { memo } from 'react';
import { useContentStore } from '../../stores/contentStore';
import { Editor } from '../editor/Editor';
import { CalendarView } from '../calendar/CalendarView';
import { WorkflowView } from '../workflow/WorkflowView';
import { FileText } from 'lucide-react';

/**
 * ContentContainer - Manages multiple SingleTabEditor instances.
 * Each open tab has its own editor instance, enabling instant tab switching
 * by toggling visibility instead of re-loading content.
 */
export const ContentContainer = memo(() => {
  const tabs = useContentStore(state => state.tabs);
  const activeTabId = useContentStore(state => state.activeTabId);

  if (tabs.length === 0) {
    return (
      <div className="flex flex-col h-full bg-zinc-900 items-center justify-center text-zinc-500">
        <FileText size={48} className="mb-4 opacity-20" />
        <p>Select a document to edit</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {tabs.map((tab) => (
        <div key={tab.id} className={`w-full h-full ${tab.id === activeTabId ? 'block' : 'hidden'}`}>
          {tab.type === 'calendar' ? (
            <CalendarView />
          ) : tab.type === 'workflow' ? (
            <WorkflowView />
          ) : (
            <Editor
              docId={tab.docId!}
              isActive={tab.id === activeTabId}
            />
          )}
        </div>
      ))}
    </div>
  );
});

ContentContainer.displayName = 'ContentContainer';

export default ContentContainer;
