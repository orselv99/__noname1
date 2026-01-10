import { memo } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { SingleTabEditor } from './SingleTabEditor';
import { FileText } from 'lucide-react';

/**
 * EditorContainer - Manages multiple SingleTabEditor instances.
 * Each open tab has its own editor instance, enabling instant tab switching
 * by toggling visibility instead of re-loading content.
 */
export const EditorContainer = memo(() => {
  const tabs = useDocumentStore(state => state.tabs);
  const activeTabId = useDocumentStore(state => state.activeTabId);

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
        <SingleTabEditor
          key={tab.docId}
          docId={tab.docId}
          isActive={tab.id === activeTabId}
        />
      ))}
    </div>
  );
});

EditorContainer.displayName = 'EditorContainer';

export default EditorContainer;
