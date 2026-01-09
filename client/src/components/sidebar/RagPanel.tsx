import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Search, Loader2, FileText, Send, Sparkles } from 'lucide-react';

export function RagPanel() {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setAnswer('');

    try {
      const result = await invoke<string>('ask_ai', { question: query });
      setAnswer(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-hidden">
      {/* Header - Matching MetadataPanel header style */}
      <div className="h-12 p-3 border-b border-zinc-800 text-zinc-400 font-medium text-xs uppercase tracking-wider flex items-center gap-2">
        <Sparkles size={14} className="text-blue-400" />
        <span className="flex-1">AI Search</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex flex-col gap-6">

          {/* Search Section */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-zinc-500 select-none">
              <Search size={12} />
              <h3 className="text-xs font-medium flex-1 uppercase tracking-wider">Query</h3>
            </div>

            <form onSubmit={handleSearch} className="relative">
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ask a question..."
                  className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 pr-9 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-zinc-200 placeholder-zinc-600"
                />
                <button
                  type="submit"
                  disabled={isLoading || !query.trim()}
                  className="absolute right-1 top-1 bottom-1 aspect-square flex items-center justify-center text-zinc-400 hover:text-blue-400 disabled:opacity-50 disabled:hover:text-zinc-400 transition-colors"
                >
                  {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            </form>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Answer Section */}
          {answer && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-zinc-500 select-none">
                <FileText size={12} />
                <h3 className="text-xs font-medium flex-1 uppercase tracking-wider">Answer</h3>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded p-3 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="prose prose-invert prose-xs max-w-none leading-relaxed whitespace-pre-wrap text-zinc-300">
                  {answer}
                </div>
              </div>
            </div>
          )}

          {/* Suggestions - Only show when no answer/loading */}
          {!answer && !isLoading && !error && (
            <div>
              <div className="flex items-center gap-2 mb-2 text-zinc-500 select-none">
                <Sparkles size={12} />
                <h3 className="text-xs font-medium flex-1 uppercase tracking-wider">Suggestions</h3>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <div
                  className="p-2.5 bg-zinc-900/30 border border-zinc-800 rounded hover:bg-zinc-900 hover:border-zinc-700 transition-colors cursor-pointer group"
                  onClick={() => setQuery("이 문서를 요약해줘")}
                >
                  <h4 className="font-medium text-zinc-400 text-xs mb-0.5 group-hover:text-blue-400 transition-colors">Summarize</h4>
                  <p className="text-[10px] text-zinc-600">Summarize the current context</p>
                </div>
                <div
                  className="p-2.5 bg-zinc-900/30 border border-zinc-800 rounded hover:bg-zinc-900 hover:border-zinc-700 transition-colors cursor-pointer group"
                  onClick={() => setQuery("주요 키워드 5개만 뽑아줘")}
                >
                  <h4 className="font-medium text-zinc-400 text-xs mb-0.5 group-hover:text-blue-400 transition-colors">Keywords</h4>
                  <p className="text-[10px] text-zinc-600">Extract main keywords</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
