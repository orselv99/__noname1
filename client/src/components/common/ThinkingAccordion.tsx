import { useState } from 'react';
import { Sparkles, ChevronDown, CheckCircle2, Loader2, LucideIcon } from 'lucide-react';

export interface ThinkingLog {
  message: string;
  subItems?: string[];
  tags?: string[];
}

export interface ThinkingItem {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'done' | 'idle' | 'error';
  logs: ThinkingLog[];
  icon?: LucideIcon;
  colorClass?: string; // e.g., 'text-yellow-400'
}

export interface ThinkingAccordionProps {
  items: ThinkingItem[];
  label?: string; // Main label for the accordion button
  defaultExpanded?: boolean;
}

export function ThinkingAccordion({ items, label = "생각하는 과정 표시", defaultExpanded = false }: ThinkingAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!items || items.length === 0) return null;

  return (
    <div className="w-full mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 rounded-full transition-colors w-fit"
      >
        <Sparkles size={11} className="text-blue-400 shrink-0" />
        <span className="text-[11px] font-medium text-zinc-300">
          {label}
        </span>
        <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="pl-4 mt-2 border-l border-zinc-800 ml-3 space-y-4 animate-in slide-in-from-top-1 duration-200 font-mono text-left">
          {items.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={`text-xs font-bold uppercase tracking-wider ${item.colorClass || 'text-zinc-500'} ${item.status === 'running' ? 'opacity-100' : 'opacity-70'}`}>
                  {item.label}
                </div>
                {item.status === 'running' && <Loader2 size={10} className={`animate-spin ${item.colorClass || 'text-zinc-400'}`} />}
                {item.status === 'done' && <CheckCircle2 size={10} className="text-green-500" />}
                {item.status === 'error' && <span className="text-[10px] text-red-500">Error</span>}
              </div>

              {/* Logs */}
              {item.logs.length > 0 && (
                <div className="space-y-1 pl-1">
                  {item.logs.map((log, i) => (
                    <div key={i} className="text-[11px] text-zinc-400">
                      <div>{log.message}</div>
                      {log.tags && log.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 mb-1">
                          {log.tags.map((tag, tIndex) => (
                            <span key={tIndex} className="px-1.5 py-0.5 rounded-md bg-zinc-700/50 text-zinc-300 text-[10px] border border-zinc-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {log.subItems && log.subItems.map((sub, j) => (
                        <div key={j} className="text-zinc-500 pl-2 opacity-80">- {sub}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

