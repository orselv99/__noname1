import { useRef, useEffect, useState } from 'react';
import { ChevronUp, ChevronDown, X, CaseSensitive, WholeWord, Regex, Replace, ChevronRight } from 'lucide-react';

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  isRegex: boolean;
}

interface SearchWidgetProps {
  onSearch: (term: string, options: SearchOptions) => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: (replacement: string) => void;
  onReplaceAll: (replacement: string) => void;
  onClose: () => void;
  matchIndex: number; // 0-based
  totalMatches: number;
  className?: string;
}

export const SearchWidget = ({
  onSearch,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onClose,
  matchIndex,
  totalMatches,
  className
}: SearchWidgetProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [isReplaceMode, setIsReplaceMode] = useState(false);
  const [options, setOptions] = useState<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    isRegex: false
  });

  useEffect(() => {
    // Focus when mounted
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleSearchChange = (newTerm: string) => {
    setTerm(newTerm);
    onSearch(newTerm, options);
  };

  const toggleOption = (key: keyof SearchOptions) => {
    const newOptions = { ...options, [key]: !options[key] };
    setOptions(newOptions);
    onSearch(term, newOptions);
  };

  return (
    <div className={`flex flex-col bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 w-[350px] ${className}`}>

      <div className="grid grid-cols-[28px_1fr_auto] gap-1 p-1">

        {/* Row 1: Find */}
        <div className="flex items-center justify-center">
          <button
            onClick={() => setIsReplaceMode(!isReplaceMode)}
            className={`h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-700 text-zinc-400 ${isReplaceMode ? 'text-zinc-200' : ''}`}
          >
            <ChevronRight size={14} className={`transition-transform duration-200 ${isReplaceMode ? 'rotate-90' : ''}`} />
          </button>
        </div>

        <div className="flex items-center bg-zinc-900 rounded-md border border-zinc-700 px-2 py-0.5 relative group focus-within:border-blue-500/50 transition-colors h-8">
          <input
            ref={inputRef}
            className="bg-transparent border-none text-xs text-white focus:outline-none flex-1 min-w-0 placeholder-zinc-600 h-full"
            placeholder="Find..."
            value={term}
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) onPrev();
                else onNext();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />

          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={() => toggleOption('caseSensitive')}
              className={`h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-700 ${options.caseSensitive ? 'text-blue-400 bg-zinc-800' : 'text-zinc-500'}`}
              title="Match Case (Alt+C)"
            >
              <CaseSensitive size={14} />
            </button>
            <button
              onClick={() => toggleOption('wholeWord')}
              className={`h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-700 ${options.wholeWord ? 'text-blue-400 bg-zinc-800' : 'text-zinc-500'}`}
              title="Match Whole Word (Alt+W)"
            >
              <WholeWord size={14} />
            </button>
            <button
              onClick={() => toggleOption('isRegex')}
              className={`h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-700 ${options.isRegex ? 'text-blue-400 bg-zinc-800' : 'text-zinc-500'}`}
              title="Use Regular Expression (Alt+R)"
            >
              <Regex size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button onClick={onPrev} className="h-6 w-6 flex items-center justify-center hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Previous (Shift+Enter)">
            <ChevronUp size={14} />
          </button>
          <button onClick={onNext} className="h-6 w-6 flex items-center justify-center hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Next (Enter)">
            <ChevronDown size={14} />
          </button>
          <button onClick={onClose} className="h-6 w-6 flex items-center justify-center hover:bg-zinc-700 rounded text-zinc-400 hover:text-white" title="Close (Esc)">
            <X size={14} />
          </button>
        </div>

        {/* Row 2: Replace */}
        {isReplaceMode && (
          <>
            <div /> {/* Spacer */}
            <div className="flex items-center bg-zinc-900 rounded-md border border-zinc-700 px-2 py-0.5 focus-within:border-blue-500/50 transition-colors h-8">
              <input
                ref={replaceInputRef}
                className="bg-transparent border-none text-xs text-white focus:outline-none flex-1 min-w-0 placeholder-zinc-600 h-full"
                placeholder="Replace..."
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (e.ctrlKey || e.metaKey) onReplaceAll(replacement);
                    else onReplace(replacement);
                  }
                }}
              />
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => onReplace(replacement)}
                className="h-6 w-6 flex items-center justify-center hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"
                title="Replace (Enter)"
              >
                <Replace size={14} />
              </button>
              <button
                onClick={() => onReplaceAll(replacement)}
                className="h-6 px-1.5 flex items-center justify-center hover:bg-zinc-700 rounded text-zinc-400 hover:text-white text-[10px] font-medium"
                title="Replace All (Ctrl+Enter)"
              >
                All
              </button>
            </div>
          </>
        )}
      </div>

      {/* Status Bar */}
      <div className="px-2 py-0.5 text-[10px] text-zinc-500 bg-zinc-900/50 border-t border-zinc-700/50 flex justify-between">
        <span>
          {totalMatches > 0 ? `${matchIndex + 1} of ${totalMatches}` : 'No results'}
        </span>
        {totalMatches > 500 && <span className="text-amber-500/80">500+ matches</span>}
      </div>
    </div>
  );
};

