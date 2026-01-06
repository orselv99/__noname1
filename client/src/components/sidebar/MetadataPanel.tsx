import { Tag, Calendar, User, FileText } from 'lucide-react';

export const MetadataPanel = () => {
  return (
    <div className="w-full h-full bg-zinc-950 flex flex-col text-white">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 font-medium text-xs text-zinc-400 uppercase tracking-wider flex items-center gap-2">
        <FileText size={14} />
        Metadata
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">

        {/* Tags Section */}
        <div className="space-y-2">
          <h3 className="text-xs text-zinc-500 font-medium flex items-center gap-2">
            <Tag size={12} /> Tags
          </h3>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-blue-400">#project</span>
            <span className="px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-xs text-purple-400">#planning</span>
            <button className="px-2 py-1 bg-zinc-900/50 border border-zinc-800 rounded text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition-colors">
              + Add Tag
            </button>
          </div>
        </div>

        {/* Status Section Mockup */}
        <div className="space-y-2">
          <h3 className="text-xs text-zinc-500 font-medium">Status</h3>
          <div className="w-full h-8 bg-zinc-900 border border-zinc-700 rounded flex items-center px-3 text-xs text-zinc-400">
            Draft
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
            <span>orseL</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1"><Calendar size={12} /> Created</span>
            <span>2024-06-08</span>
          </div>
          <div className="flex justify-between">
            <span className="flex items-center gap-1"><Calendar size={12} /> Updated</span>
            <span>Just now</span>
          </div>
        </div>

      </div>
    </div>
  );
};
