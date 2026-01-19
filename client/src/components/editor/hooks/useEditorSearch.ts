import { useState, useCallback, useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Decoration } from '@tiptap/pm/view';
import { SearchOptions } from '../SearchWidget';
import { searchPluginKey } from '../extensions';

export interface UseEditorSearchResult {
  showSearch: boolean;
  setShowSearch: (show: boolean) => void;
  matches: { from: number; to: number }[];
  currentMatchIndex: number;
  totalMatches: number;
  handleSearch: (term: string, options: SearchOptions) => void;
  handleReplace: (replacement: string) => void;
  handleReplaceAll: (replacement: string) => void;
  navigateSearch: (direction: 'next' | 'prev') => void;
}

export function useEditorSearch(editor: Editor | null, isActive: boolean): UseEditorSearchResult {
  const [showSearch, setShowSearch] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [totalMatches, setTotalMatches] = useState(0);
  const [matches, setMatches] = useState<{ from: number; to: number }[]>([]);
  const [currentTerm, setCurrentTerm] = useState('');
  const [currentOptions, setCurrentOptions] = useState<SearchOptions>({ caseSensitive: false, wholeWord: false, isRegex: false });

  // Handle Ctrl+F
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  const handleSearch = useCallback((term: string, options: SearchOptions) => {
    setCurrentTerm(term);
    setCurrentOptions(options);

    if (!term || !editor) {
      setMatches([]);
      setTotalMatches(0);
      setCurrentMatchIndex(-1);
      editor?.view.dispatch(editor.view.state.tr.setMeta(searchPluginKey, { action: 'clear' }));
      return;
    }

    const { doc } = editor.state;
    const foundMatches: { from: number; to: number }[] = [];

    try {
      let regex: RegExp;
      if (options.isRegex) {
        regex = new RegExp(term, options.caseSensitive ? 'g' : 'gi');
      } else {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex chars
        if (options.wholeWord) {
          regex = new RegExp(`\\b${escaped}\\b`, options.caseSensitive ? 'g' : 'gi');
        } else {
          regex = new RegExp(escaped, options.caseSensitive ? 'g' : 'gi');
        }
      }

      doc.descendants((node, pos) => {
        if (node.isText && node.text) {
          const text = node.text;
          let match;
          while ((match = regex.exec(text)) !== null) {
            foundMatches.push({
              from: pos + match.index,
              to: pos + match.index + match[0].length
            });
          }
        }
      });
    } catch (e) {
      // Invalid regex, ignore
      console.warn("Invalid regex:", e);
    }

    setMatches(foundMatches);
    setTotalMatches(foundMatches.length);

    if (foundMatches.length > 0) {
      // Find nearest match after current selection
      const { from } = editor.state.selection;
      let nextIndex = foundMatches.findIndex(m => m.from >= from);
      if (nextIndex === -1) nextIndex = 0;

      setCurrentMatchIndex(nextIndex);

      // Highlight logic
      const decorations = foundMatches.map((m, i) =>
        Decoration.inline(m.from, m.to, {
          class: `search-match ${i === nextIndex ? 'current-search-match ring-2 ring-yellow-400' : 'bg-yellow-500/30'}`
        })
      );

      editor.view.dispatch(editor.view.state.tr.setMeta(searchPluginKey, {
        action: 'set',
        decorations,
        matches: foundMatches
      }));

      // Scroll to match
      const match = foundMatches[nextIndex];
      const dom = editor.view.domAtPos(match.from).node as HTMLElement;
      if (dom) {
        editor.commands.setTextSelection(match.from);
        editor.commands.scrollIntoView();
      }
    } else {
      setCurrentMatchIndex(-1);
      editor.view.dispatch(editor.view.state.tr.setMeta(searchPluginKey, { action: 'clear' }));
    }
  }, [editor]);

  const handleReplace = useCallback((replacement: string) => {
    if (!editor || matches.length === 0 || currentMatchIndex === -1) return;

    const match = matches[currentMatchIndex];
    if (!match) return;

    editor.chain()
      .setTextSelection({ from: match.from, to: match.to })
      .insertContent(replacement)
      .run();

    // Re-trigger search to update matches
    setTimeout(() => handleSearch(currentTerm, currentOptions), 10);

  }, [editor, matches, currentMatchIndex, currentTerm, currentOptions, handleSearch]);

  const handleReplaceAll = useCallback((replacement: string) => {
    if (!editor || matches.length === 0) return;

    const tr = editor.state.tr;

    // matches are sorted by document order. Reverse them to avoid index shifting.
    [...matches].reverse().forEach(match => {
      tr.insertText(replacement, match.from, match.to);
    });

    editor.view.dispatch(tr);

    // Re-search
    setTimeout(() => handleSearch(currentTerm, currentOptions), 10);

  }, [editor, matches, currentTerm, currentOptions, handleSearch]);

  const navigateSearch = useCallback((direction: 'next' | 'prev') => {
    if (matches.length === 0 || !editor) return;

    let newIndex = direction === 'next' ? currentMatchIndex + 1 : currentMatchIndex - 1;
    if (newIndex >= matches.length) newIndex = 0;
    if (newIndex < 0) newIndex = matches.length - 1;

    setCurrentMatchIndex(newIndex);

    const decorations = matches.map((m, i) => Decoration.inline(m.from, m.to, {
      class: i === newIndex ? 'bg-orange-500 text-white current-search-match' : 'bg-yellow-500/50'
    }));

    editor.view.dispatch(
      editor.view.state.tr.setMeta(searchPluginKey, {
        action: 'set',
        decorations,
        matches
      })
    );

    // Scroll to match
    setTimeout(() => {
      const el = document.querySelector('.current-search-match');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  }, [editor, matches, currentMatchIndex]);

  return {
    showSearch,
    setShowSearch,
    matches,
    currentMatchIndex,
    totalMatches,
    handleSearch,
    handleReplace,
    handleReplaceAll,
    navigateSearch
  };
}
