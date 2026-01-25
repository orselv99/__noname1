import { memo, useMemo, useCallback } from 'react';
import { useContentStore } from '../../stores/contentStore';
import { useAuthStore } from '../../stores/authStore';
import { Document, GroupType } from '../../types';

interface EditorBreadcrumbsProps {
  currentDoc: Document | undefined;
}

export const EditorBreadcrumbs = memo(({ currentDoc }: EditorBreadcrumbsProps) => {
  const documents = useContentStore(state => state.documents);
  const addTab = useContentStore(state => state.addTab);

  // Build breadcrumbs path from current document up to root
  const breadcrumbs = useMemo(() => {
    if (!currentDoc) return [];

    const path: { id: string; title: string }[] = [];
    let doc = currentDoc;

    // Traverse up the parent chain (max 10 levels to prevent infinite loop)
    for (let i = 0; i < 10 && doc; i++) {
      path.unshift({ id: doc.id, title: doc.title || 'Untitled' });

      if (!doc.parent_id) break;

      const parentDoc = documents.find(d => d.id === doc!.parent_id);
      if (!parentDoc) break;
      doc = parentDoc;
    }

    return path;
  }, [currentDoc, documents]);

  const handleBreadcrumbClick = useCallback((breadcrumbDocId: string) => {
    if (!currentDoc || breadcrumbDocId === currentDoc.id) return; // Already on this document
    const targetDoc = documents.find(d => d.id === breadcrumbDocId);
    if (targetDoc) {
      addTab(targetDoc);
    }
  }, [currentDoc, documents, addTab]);

  return (
    <div className='flex items-center gap-1 text-xs text-zinc-500 overflow-hidden whitespace-nowrap'>
      <span className="text-zinc-400">
        {currentDoc?.group_type === GroupType.Private ? 'Private' :
          currentDoc?.group_type === GroupType.Project ? (useAuthStore.getState().projects[currentDoc.group_id!]?.name || 'Project') :
            currentDoc?.group_type === GroupType.Department ? (useAuthStore.getState().departments[currentDoc.group_id!]?.name || 'Department') :
              'Public'}
      </span>
      {breadcrumbs.map((crumb, index) => (
        <span key={crumb.id} className="flex items-center">
          <span className="mx-1 text-zinc-600">/</span>
          {index === breadcrumbs.length - 1 ? (
            // Current document - not clickable
            <span className="text-zinc-300 font-medium truncate pl-1 max-w-[200px]">{crumb.title}</span>
          ) : (
            // Ancestor document - clickable
            <button
              onClick={() => handleBreadcrumbClick(crumb.id)}
              className="text-zinc-400 hover:text-blue-400 truncate pl-1 max-w-[150px] transition-colors cursor-pointer"
              title={crumb.title}
            >
              {crumb.title}
            </button>
          )}
        </span>
      ))}
    </div>
  );
});

EditorBreadcrumbs.displayName = 'EditorBreadcrumbs';
