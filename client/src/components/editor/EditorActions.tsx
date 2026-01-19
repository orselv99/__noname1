import { Star, Save, Lock, Unlock, Printer } from 'lucide-react';
import { Document } from '../../types';

interface EditorActionsProps {
  doc: Document;
  isReadOnly: boolean;
  onToggleReadOnly: () => void;
  onToggleFavorite: () => void;
  onSave: () => void;
  onPrint: () => void;
  isDirty: boolean;
}

export const EditorActions = ({
  doc,
  isReadOnly,
  onToggleReadOnly,
  onToggleFavorite,
  onSave,
  onPrint,
  isDirty
}: EditorActionsProps) => {
  if (doc.deleted_at) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 select-none">
        <span className="text-[10px] font-bold tracking-wider">DELETED</span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={onToggleReadOnly}
        className={`p-2 rounded-lg transition-colors ${isReadOnly ? 'text-red-400 bg-red-900/20 hover:bg-red-900/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
        title={isReadOnly ? "Read-only Mode (Unlock)" : "Lock Document"}
      >
        {isReadOnly ? <Lock size={18} /> : <Unlock size={18} />}
      </button>
      <button
        onClick={onToggleFavorite}
        className={`p-2 rounded-lg hover:bg-zinc-800 transition-colors ${doc.is_favorite ? 'text-yellow-400' : 'text-zinc-400 hover:text-white'}`}
        title={doc.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
      >
        <Star size={18} className={doc.is_favorite ? 'fill-current' : ''} />
      </button>
      <button
        onClick={onPrint}
        className="p-2 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-white"
        title="Print Document"
      >
        <Printer size={18} />
      </button>
      <button
        onClick={onSave}
        disabled={!isDirty}
        className={`p-2 rounded-lg transition-colors ${!isDirty ? 'text-zinc-700 cursor-not-allowed' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
        title="Save Document"
      >
        <Save size={18} />
      </button>
    </>
  );
};
