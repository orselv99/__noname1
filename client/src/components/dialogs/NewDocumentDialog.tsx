import { useState } from 'react';
import { X, FileText, FileCode, Table, PenLine, Presentation, BookOpen, ClipboardList, Search, ChevronDown, ChevronRight, Building2, FolderKanban, Folder, FolderPlus } from 'lucide-react';

interface FolderItem {
  id: string;
  name: string;
  expanded: boolean;
  children?: FolderItem[];
}

interface NewDocumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate?: (data: { group: string; folder?: string; template: string; title: string }) => void;
  onCreateFolder?: (groupId: string, parentFolderId?: string) => void;
  onToggleGroup?: (groupId: string) => void;
  onToggleFolder?: (groupId: string, folderId: string) => void;
  groups: {
    id: string;
    name: string;
    type: 'department' | 'project';
    expanded: boolean;
    folders: FolderItem[];
  }[];
}

const frequentTemplates = [
  { id: 'blank', name: 'Blank', icon: FileText },
  { id: 'note', name: 'Note', icon: PenLine },
  { id: 'meeting', name: 'Meeting', icon: Table },
  { id: 'code', name: 'Code', icon: FileCode },
  { id: 'presentation', name: 'Presentation', icon: Presentation },
];

const allTemplates = [
  { id: 'blank', name: 'Blank', icon: FileText, description: '빈 문서' },
  { id: 'note', name: 'Note', icon: PenLine, description: '간단한 메모' },
  { id: 'meeting', name: 'Meeting', icon: Table, description: '회의록 템플릿' },
  { id: 'code', name: 'Code', icon: FileCode, description: '코드 문서' },
  { id: 'presentation', name: 'Presentation', icon: Presentation, description: '프레젠테이션' },
  { id: 'wiki', name: 'Wiki', icon: BookOpen, description: '위키 문서' },
  { id: 'checklist', name: 'Checklist', icon: ClipboardList, description: '체크리스트' },
];

export const NewDocumentDialog = ({ isOpen, onClose, onCreate, onCreateFolder, onToggleGroup, onToggleFolder, groups }: NewDocumentDialogProps) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(groups[0]?.id || '');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState('blank');
  const [title, setTitle] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');

  const handleCreate = () => {
    if (!title.trim() || !selectedGroupId) return;
    const group = groups.find(g => g.id === selectedGroupId);
    if (!group) return;

    // Find folder name recursively if selectedFolderId is set
    let folderName: string | undefined;
    if (selectedFolderId) {
      const findFolder = (folders: FolderItem[]): string | undefined => {
        for (const f of folders) {
          if (f.id === selectedFolderId) return f.name;
          if (f.children) {
            const found = findFolder(f.children);
            if (found) return found;
          }
        }
        return undefined;
      };
      folderName = findFolder(group.folders);
    }

    onCreate?.({
      group: group.name,
      folder: folderName,
      template: selectedTemplate,
      title: title.trim()
    });
    setTitle('');
    setSelectedTemplate('blank');
    setTemplateSearch('');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && title.trim()) {
      handleCreate();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const toggleExpand = (id: string, e: React.MouseEvent, type: 'group' | 'folder', groupId?: string) => {
    e.stopPropagation();
    if (type === 'group') {
      onToggleGroup?.(id);
    } else {
      if (groupId) onToggleFolder?.(groupId, id);
    }
  };

  const filteredTemplates = allTemplates.filter(t =>
    t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    t.description.toLowerCase().includes(templateSearch.toLowerCase())
  );

  const renderFolders = (folders: FolderItem[], groupId: string, depth: number) => {
    return folders.map(folder => (
      <div key={folder.id}>
        <div
          className={`w-full flex items-center group/folder relative pr-2 py-1.5 text-sm transition-colors cursor-pointer ${selectedFolderId === folder.id && selectedGroupId === groupId
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          style={{ paddingLeft: `${depth * 16 + 28}px` }}
          onClick={() => {
            setSelectedGroupId(groupId);
            setSelectedFolderId(folder.id);
          }}
        >
          {folder.children && folder.children.length > 0 && (
            <button
              onClick={(e) => toggleExpand(folder.id, e, 'folder', groupId)}
              className="absolute left-0 p-1 hover:text-zinc-200"
              style={{ left: `${depth * 16 + 12}px` }}
            >
              {folder.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>
          )}
          <Folder size={14} className="text-yellow-600 shrink-0 mr-2" />
          <span className="truncate flex-1">{folder.name}</span>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateFolder?.(groupId, folder.id);
            }}
            className="hidden group-hover/folder:flex p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 rounded"
            title="Create Folder"
          >
            <FolderPlus size={14} />
          </button>
        </div>
        {folder.expanded && folder.children && (
          <div>
            {renderFolders(folder.children, groupId, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold text-white">새 문서</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Group/Folder Tree */}
          <div className="w-56 border-r border-zinc-800 overflow-y-auto shrink-0 bg-zinc-900/50">
            <div className="p-2 text-xs text-zinc-500 font-medium uppercase">위치 선택</div>
            {groups.map(group => (
              <div key={group.id}>
                <div
                  className={`w-full flex items-center group/group relative pr-2 py-1.5 text-sm transition-colors cursor-pointer ${selectedGroupId === group.id && !selectedFolderId
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-zinc-400 hover:bg-zinc-800'
                    }`}
                  onClick={() => {
                    setSelectedGroupId(group.id);
                    setSelectedFolderId(null);
                    if (!group.expanded) {
                      onToggleGroup?.(group.id);
                    }
                  }}
                >
                  <button
                    onClick={(e) => toggleExpand(group.id, e, 'group')}
                    className="p-1 mx-1 hover:text-zinc-200 text-zinc-500"
                  >
                    {group.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                  {group.type === 'department' ? (
                    <Building2 size={14} className="text-blue-400 shrink-0 mr-2" />
                  ) : (
                    <FolderKanban size={14} className="text-purple-400 shrink-0 mr-2" />
                  )}
                  <span className="truncate flex-1 font-medium">{group.name}</span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateFolder?.(group.id);
                    }}
                    className="hidden group-hover/group:flex p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 rounded"
                    title="Create Folder"
                  >
                    <FolderPlus size={14} />
                  </button>
                </div>

                {group.expanded && renderFolders(group.folders, group.id, 0)}
              </div>
            ))}
          </div>

          {/* Right: Template & Title */}
          <div className="flex-1 p-5 overflow-y-auto">
            {/* Template Section */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-400 mb-3">자주 사용하는 템플릿</label>
              <div className="flex flex-wrap gap-2">
                {frequentTemplates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${selectedTemplate === template.id
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/50'
                        : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600 hover:bg-zinc-700'
                      }`}
                  >
                    <template.icon size={16} />
                    <span>{template.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Template Search */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-zinc-400 mb-3">템플릿 검색</label>
              <div className="relative group">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="템플릿을 검색하세요..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-10 pr-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-zinc-600"
                />
              </div>

              {templateSearch && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto custom-scrollbar border border-zinc-700/50 rounded-lg p-1 bg-zinc-900/50">
                  {filteredTemplates.map(template => (
                    <button
                      key={template.id}
                      onClick={() => {
                        setSelectedTemplate(template.id);
                        setTemplateSearch('');
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${selectedTemplate === template.id
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'text-zinc-400 hover:bg-zinc-800'
                        }`}
                    >
                      <template.icon size={18} />
                      <div className="flex-1">
                        <div className="font-medium">{template.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{template.description}</div>
                      </div>
                    </button>
                  ))}
                  {filteredTemplates.length === 0 && (
                    <div className="text-center py-4 text-zinc-500 text-sm">
                      검색 결과가 없습니다
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title Input */}
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-3">문서 제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="제목을 입력하세요..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-base focus:outline-none focus:border-blue-500 transition-colors placeholder-zinc-600"
                autoFocus
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 py-3 border-t border-zinc-800 shrink-0 bg-zinc-900">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors text-sm font-medium"
          >
            취소
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim()}
            className="flex-1 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
          >
            문서 생성
          </button>
        </div>
      </div>
    </div>
  );
};
