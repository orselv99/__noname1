import { useState } from 'react';
import { Trash2, ChevronUp, ChevronDown, RotateCcw, X, FileText } from 'lucide-react';
import { useConfirm } from '../ConfirmProvider';
import { useDocumentStore } from '../../stores/documentStore';

export const RecycleBin = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { documents, restoreDocument, saveDocument, deleteDocument, addTab } = useDocumentStore();
  const { confirm } = useConfirm();

  const deletedDocs = documents.filter(d => d.deleted_at);

  const handleRestore = async (id: string, title: string) => {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    // Check if parent is also deleted
    let parentIsDeleted = false;
    if (doc.parent_id) {
      const parent = documents.find(d => d.id === doc.parent_id);
      if (parent && parent.deleted_at) {
        parentIsDeleted = true;
      } else if (!parent) {
        // Parent not found, treat as orphan
        parentIsDeleted = true;
      }
    }

    const message = parentIsDeleted
      ? `"${title}" 문서의 상위 폴더가 삭제되었습니다.\n최상위(Root) 경로로 복원하시겠습니까?`
      : `"${title}" 문서를 복원하시겠습니까?`;

    if (await confirm({
      title: '문서 복원',
      message: message,
      confirmText: '복원',
      variant: 'primary'
    })) {
      if (parentIsDeleted) {
        // Move to Root first (Persistence)
        await saveDocument({ ...doc, parent_id: undefined });
      }
      await restoreDocument(doc.id);

      // Auto-open tab for convenience
      const updatedDoc = { ...doc, deleted_at: undefined, parent_id: parentIsDeleted ? undefined : doc.parent_id };
      addTab(updatedDoc);
    }
  };

  const handleDeleteForever = async (id: string, title: string) => {
    if (await confirm({
      title: '영구 삭제',
      message: `"${title}" 문서를 영구 삭제하시겠습니까?\n삭제된 문서는 복구할 수 없습니다.`,
      confirmText: '영구 삭제',
      variant: 'danger'
    })) {
      await deleteDocument(id);
    }
  };

  return (
    <div className="border-t border-zinc-900 shrink-0 bg-zinc-950">
      <div
        className="flex items-center gap-2 px-3 py-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Trash2 size={14} />
        <h3 className="text-xs font-medium flex-1">Recycle Bin ({deletedDocs.length})</h3>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="px-2 pb-2 overflow-y-auto custom-scrollbar max-h-48">
          {deletedDocs.length === 0 ? (
            <div className="text-xs text-zinc-600 italic text-center py-2">
              휴지통이 비었습니다.
            </div>
          ) : (
            <div className="space-y-1">
              {deletedDocs.map(item => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-900/50 transition-colors cursor-pointer"
                  onClick={() => addTab(item)}
                >
                  <FileText size={12} className="text-zinc-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-400 truncate">{item.title}</div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRestore(item.id, item.title); }}
                      className="p-1 text-zinc-500 hover:text-blue-400 hover:bg-zinc-800 rounded transition-colors"
                      title="복원"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteForever(item.id, item.title); }}
                      className="p-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                      title="영구 삭제"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
