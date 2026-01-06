import { useState } from 'react';

interface Document {
  id: string;
  title: string;
  updatedAt: string;
}

interface DocumentGroup {
  name: string;
  icon: string;
  documents: Document[];
  expanded: boolean;
}

interface DocumentSidebarProps {
  onSelectDocument?: (docId: string) => void;
  selectedDocumentId?: string;
}

export const DocumentSidebar = ({ onSelectDocument, selectedDocumentId }: DocumentSidebarProps) => {
  const [groups, setGroups] = useState<DocumentGroup[]>([
    {
      name: '부서',
      icon: '🏢',
      expanded: true,
      documents: [
        { id: 'dept-1', title: '2024년 부서 계획서', updatedAt: '2024-01-05' },
        { id: 'dept-2', title: '주간 업무 보고', updatedAt: '2024-01-04' },
        { id: 'dept-3', title: '회의록 - 1월', updatedAt: '2024-01-03' },
      ]
    },
    {
      name: '프로젝트',
      icon: '📁',
      expanded: true,
      documents: [
        { id: 'proj-1', title: 'Fiery Horizon 기획서', updatedAt: '2024-01-05' },
        { id: 'proj-2', title: 'API 설계 문서', updatedAt: '2024-01-04' },
        { id: 'proj-3', title: '테스트 계획서', updatedAt: '2024-01-02' },
      ]
    },
    {
      name: '개인',
      icon: '👤',
      expanded: true,
      documents: [
        { id: 'personal-1', title: '메모', updatedAt: '2024-01-05' },
        { id: 'personal-2', title: '아이디어 노트', updatedAt: '2024-01-03' },
      ]
    },
  ]);

  const [searchQuery, setSearchQuery] = useState('');

  const toggleGroup = (index: number) => {
    setGroups(prev => prev.map((g, i) =>
      i === index ? { ...g, expanded: !g.expanded } : g
    ));
  };

  const filteredGroups = groups.map(group => ({
    ...group,
    documents: group.documents.filter(doc =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }));

  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">문서 목록</h2>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="검색..."
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-blue-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500">🔍</span>
        </div>
      </div>

      {/* Document Groups */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
        {filteredGroups.map((group, groupIndex) => (
          <div key={group.name}>
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(groupIndex)}
              className="w-full flex items-center gap-2 px-2 py-2 text-left text-zinc-400 hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <span className="text-sm">{group.icon}</span>
              <span className="flex-1 text-sm font-medium">{group.name}</span>
              <span className="text-xs text-zinc-600">
                {group.documents.length}
              </span>
              <span className="text-zinc-600 text-xs">
                {group.expanded ? '▼' : '▶'}
              </span>
            </button>

            {/* Documents */}
            {group.expanded && (
              <div className="ml-2 space-y-0.5">
                {group.documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => onSelectDocument?.(doc.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg transition-colors ${selectedDocumentId === doc.id
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
                      }`}
                  >
                    <span className="text-zinc-600">📄</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{doc.title}</div>
                      <div className="text-xs text-zinc-600">{doc.updatedAt}</div>
                    </div>
                  </button>
                ))}
                {group.documents.length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-600 italic">
                    문서 없음
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New Document Button */}
      <div className="p-3 border-t border-zinc-800">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
          <span>+</span>
          <span>새 문서</span>
        </button>
      </div>
    </div>
  );
};

export default DocumentSidebar;
