import { useState, useMemo } from 'react';
import { Trash2, ChevronUp, ChevronDown, RotateCcw, X, FileText, Search, Eraser } from 'lucide-react';
import { useConfirm } from '../ConfirmProvider';
import { useDocumentStore } from '../../stores/documentStore';

export const RecycleBin = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { documents, restoreDocument, saveDocument, deleteDocument, addTab, emptyRecycleBin } = useDocumentStore();
  const { confirm } = useConfirm();

  const deletedDocs = useMemo(() => documents.filter(d => d.deleted_at), [documents]);
  const filteredDocs = useMemo(() => {
    if (!searchTerm) return deletedDocs;
    return deletedDocs.filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [deletedDocs, searchTerm]);

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
      ? `"${title}" 문서의 상위 폴더가 삭제되었습니다\n최상위(Root) 경로로 복원하시겠습니까?`
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
      message: `"${title}" 문서를 영구 삭제하시겠습니까?\n삭제된 문서는 복구할 수 없습니다`,
      confirmText: '영구 삭제',
      variant: 'danger'
    })) {
      await deleteDocument(id);
    }
  };

  const handleEmptyBin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletedDocs.length === 0) return;

    if (await confirm({
      title: '휴지통 비우기',
      message: `휴지통에 있는 ${deletedDocs.length}개의 문서를 모두 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다`,
      confirmText: '비우기',
      variant: 'danger'
    })) {
      await emptyRecycleBin();
    }
  };

  return (
    <div className="border-t border-zinc-900 shrink-0 bg-zinc-950">
      <div
        className="flex items-center gap-2 px-3 py-2 text-zinc-500 cursor-pointer hover:text-zinc-300 select-none transition-colors group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Trash2 size={14} />
        <h3 className="text-xs font-medium flex-1">Recycle Bin ({deletedDocs.length})</h3>

        {/* Empty Bin Button */}
        {deletedDocs.length > 0 && (
          <button
            onClick={handleEmptyBin}
            className="p-1 text-zinc-600 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="휴지통 비우기"
          >
            <Eraser size={14} />
          </button>
        )}

        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>

      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
          }`}
      >
        <div className="px-2 pb-2">
          {/* Search Bar - Show when we have enough items to likely need scrolling/search */}
          {(deletedDocs.length >= 5) && (
            <div className="mb-2 px-1">
              <div className="flex items-center gap-2 bg-zinc-900 rounded px-2 py-1 border border-zinc-800 focus-within:border-zinc-700">
                <Search size={12} className="text-zinc-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="휴지통 검색..."
                  className="w-full bg-transparent text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none"
                  onClick={(e) => e.stopPropagation()}
                />
                {searchTerm && (
                  <button onClick={(e) => { e.stopPropagation(); setSearchTerm(''); }}>
                    <X size={12} className="text-zinc-500 hover:text-zinc-300" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="overflow-y-auto custom-scrollbar max-h-48 space-y-1">
            {deletedDocs.length === 0 ? (
              <div className="text-xs text-zinc-600 italic text-center py-2">
                휴지통이 비었습니다
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-xs text-zinc-600 italic text-center py-2">
                검색 결과가 없습니다
              </div>
            ) : (
              filteredDocs.map(item => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-zinc-900/50 transition-colors cursor-pointer"
                  onClick={() => addTab(item)}
                >
                  <FileText size={12} className="text-zinc-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-400 truncate text-left">{item.title}</div>
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
