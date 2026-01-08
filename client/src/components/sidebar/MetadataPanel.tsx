import { useState } from 'react';
import { Tag, Calendar, User, FileText, Plus, ChevronUp } from 'lucide-react';
import { useDocumentStore } from '../../stores/documentStore';
import { DocumentState } from '../../types';

// Add Tag Form Component
const AddTagForm = ({ docId }: { docId: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tagName, setTagName] = useState('');
  const [evidence, setEvidence] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!tagName.trim()) return;

    setIsSubmitting(true);
    try {
      await useDocumentStore.getState().addTagToDocument(docId, tagName.trim(), evidence.trim() || undefined);
      setTagName('');
      setEvidence('');
      setIsExpanded(false);
    } catch (error) {
      console.error('Failed to add tag:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-blue-400 transition-colors"
      >
        <Plus size={12} />
        Add tag
      </button>
    );
  }

  return (
    <div className="space-y-2 p-2 bg-zinc-900 rounded border border-zinc-800">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">Add Tag</span>
        <button onClick={() => setIsExpanded(false)} className="text-zinc-500 hover:text-zinc-300">
          <ChevronUp size={12} />
        </button>
      </div>
      <input
        type="text"
        value={tagName}
        onChange={(e) => setTagName(e.target.value)}
        placeholder="Tag name"
        className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
      />
      <input
        type="text"
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        placeholder="Evidence (optional)"
        className="w-full px-2 py-1.5 bg-zinc-950 border border-zinc-700 rounded text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
      />
      <button
        onClick={handleSubmit}
        disabled={!tagName.trim() || isSubmitting}
        className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-xs text-white font-medium transition-colors"
      >
        {isSubmitting ? 'Adding...' : 'Add'}
      </button>
    </div>
  );
};

export const MetadataPanel = () => {
  const { documents, activeTabId } = useDocumentStore();
  const activeDoc = documents.find(d => d.id === activeTabId);

  if (!activeDoc) {
    return (
      <div className="w-full h-full bg-zinc-950 flex flex-col items-center justify-center text-zinc-500 text-xs">
        Select a document
      </div>
    );
  }
  console.log(documents);
  return (
    <div className="w-full h-full bg-zinc-950 flex flex-col text-white">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 font-medium text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-2">
        <FileText size={14} />
        Metadata
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">

        {/* Summary Section */}
        <div className="mb-6">
          <h3 className="text-xs text-zinc-500 font-medium mb-2">Summary</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">
            {activeDoc.summary || <span className="text-zinc-600 italic">No summary available</span>}
          </p>
        </div>

        {/* Tags Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 text-zinc-500">
            <Tag size={12} />
            <h3 className="text-xs font-medium">Tags</h3>
          </div>
          <div className="flex flex-wrap gap-2 overflow-visible mb-3">
            {(!activeDoc.tags || activeDoc.tags.length === 0) && (
              <span className="text-xs text-zinc-600 italic block">No tags</span>
            )}
            {activeDoc.tags && activeDoc.tags.map((t, i) => (
              <div key={i} className="group relative">
                <span
                  onMouseEnter={() => {
                    if (t.evidence) {
                      useDocumentStore.getState().setHighlightedEvidence(t.evidence);
                    }
                  }}
                  onMouseLeave={() => {
                    useDocumentStore.getState().setHighlightedEvidence(null);
                  }}
                  className="cursor-help px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-blue-400 hover:border-blue-500 hover:bg-zinc-800 transition-colors inline-flex items-center gap-1">
                  #{t.tag}
                  <button
                    onClick={() => useDocumentStore.getState().removeTagFromDocument(activeDoc.id, i)}
                    className="ml-1 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Remove tag"
                  >
                    ×
                  </button>
                </span>
                {/* Evidence Tooltip - Shows above the tag */}
                {t.evidence && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-60 p-2 bg-zinc-800 border border-zinc-700 rounded shadow-xl z-9999 text-[10px] text-zinc-300 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-normal wrap-break-word">
                    <div className="font-bold mb-1 text-zinc-400">Evidence:</div>
                    {t.evidence}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Tag Form */}
          <AddTagForm docId={activeDoc.id} />
        </div>

        {/* Status Section */}
        <div className="space-y-2">
          <h3 className="text-xs text-zinc-500 font-medium">Status</h3>
          <div className="w-full h-8 bg-zinc-900 border border-zinc-700 rounded flex items-center px-3 text-xs text-zinc-400">
            {activeDoc.document_state === DocumentState.Draft ? 'Draft' :
              activeDoc.document_state === DocumentState.Feedback ? 'Feedback' :
                activeDoc.document_state === DocumentState.Published ? 'Published' : 'Unknown'}
          </div>
        </div>

        {/* Links / Backlinks (Mock) */}
        <div className="space-y-2">
          <h3 className="text-xs text-zinc-500 font-medium">Linked Mentions</h3>
          <div className="space-y-1">
            <div className="text-xs bg-zinc-900 p-2 rounded border border-zinc-800 text-zinc-400">
              <p className="line-clamp-2">...reference to [[Project Alpha]] in the meeting notes...</p>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="pt-4 border-t border-zinc-800 space-y-2 text-xs text-zinc-500">
          <div className="flex justify-between">
            <span className="flex items-center gap-1"><User size={12} /> Creator</span>
            <span>{activeDoc.user_id === 'user1' ? 'User' : 'Unknown'}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1"><Calendar size={12} /> Created</span>
            <span>{activeDoc.created_at ? new Date(activeDoc.created_at).toLocaleDateString() : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1"><Calendar size={12} /> Updated</span>
            <span>{activeDoc.updated_at ? new Date(activeDoc.updated_at).toLocaleDateString() : '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1"><FileText size={12} /> Size</span>
            <span>{activeDoc.size || '0'} bytes</span>
          </div>
        </div>

      </div>
    </div>
  );
};
