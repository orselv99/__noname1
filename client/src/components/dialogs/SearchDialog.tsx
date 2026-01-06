import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (item: string) => void;
}

export const SearchDialog = ({ isOpen, onClose, onSelect }: SearchDialogProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const items = [
    '2026-01-06',
    'Untitled.canvas',
    'Untitled.base',
    'ChatGpt for desktop/2024-06-08',
    '3. Characters/Uire Innistra',
    'ChatGpt for desktop/Untitled',
    '3. Characters/Draka',
    'PROJ_ARS/목표',
    '설정/테스트',
  ];

  const filteredItems = items.filter(item =>
    !searchQuery || item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        handleSelect(filteredItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const handleSelect = (item: string) => {
    onSelect?.(item);
    onClose();
    setSearchQuery('');
    setSelectedIndex(0);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[15vh] z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
          <Search size={18} className="text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Find or create a note..."
            className="flex-1 bg-transparent text-white placeholder-zinc-500 focus:outline-none text-base"
            autoFocus
          />
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {filteredItems.map((item, index) => (
            <button
              key={index}
              className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${index === selectedIndex
                  ? 'bg-blue-600/20 text-blue-300 border-l-2 border-blue-500'
                  : 'text-zinc-300 hover:bg-zinc-800 border-l-2 border-transparent'
                }`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {item}
            </button>
          ))}
          {filteredItems.length === 0 && (
            <div className="px-4 py-8 text-center text-zinc-500">
              No results found
            </div>
          )}
        </div>

        {/* Keyboard Shortcuts Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-zinc-800 text-xs text-zinc-500">
          <span>↑↓ to navigate</span>
          <span>↵ to open</span>
          <span>ctrl ↵ to open in new tab</span>
          <span>esc to dismiss</span>
        </div>
      </div>
    </div>
  );
};
