import { useState } from 'react';
import { Sparkles, ChevronDown, CheckCircle2, Loader2 } from 'lucide-react';

export interface ThinkingState {
  local: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  server: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  web: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
}

export function ThinkingAccordion({ state, status, defaultExpanded = false }: { state: ThinkingState, status?: string, defaultExpanded?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!state) return null;

  return (
    <div className="w-full mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 rounded-full transition-colors w-fit"
      >
        <Sparkles size={11} className="text-blue-400 shrink-0" />
        <span className="text-[11px] font-medium text-zinc-300">
          {status || "생각하는 과정 표시"}
        </span>
        <ChevronDown size={12} className={`text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {isExpanded && (
        <div className="pl-4 mt-2 border-l border-zinc-800 ml-3 space-y-4 animate-in slide-in-from-top-1 duration-200 font-mono text-left">

          {/* Local Search Step */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`text-xs font-bold uppercase tracking-wider ${state.local.status === 'running' ? 'text-yellow-400' : 'text-zinc-500'}`}>
                Local Docs
              </div>
              {state.local.status === 'running' && <Loader2 size={10} className="animate-spin text-yellow-400" />}
              {state.local.status === 'done' && <CheckCircle2 size={10} className="text-green-500" />}
            </div>
            {/* Logs */}
            <div className="space-y-1 pl-1">
              {state.local.logs.map((log: any, i: number) => (
                <div key={i} className="text-[11px] text-zinc-400">
                  <div>{log.message}</div>
                  {log.subItems && log.subItems.map((sub: string, j: number) => (
                    <div key={j} className="text-zinc-500 pl-2 opacity-80">- {sub}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Server Search Step */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className={`text-xs font-bold uppercase tracking-wider ${state.server.status === 'running' ? 'text-purple-400' : 'text-zinc-500'}`}>
                Server Docs
              </div>
              {state.server.status === 'running' && <Loader2 size={10} className="animate-spin text-purple-400" />}
              {state.server.status === 'done' && <CheckCircle2 size={10} className="text-green-500" />}
            </div>
            {/* Logs */}
            <div className="space-y-1 pl-1">
              {state.server.logs.map((log: any, i: number) => (
                <div key={i} className="text-[11px] text-zinc-400">
                  <div>{log.message}</div>
                  {log.subItems && log.subItems.map((sub: string, j: number) => (
                    <div key={j} className="text-zinc-500 pl-2 opacity-80">- {sub}</div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Web Search Step */}
          {state.web && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className={`text-xs font-bold uppercase tracking-wider ${state.web.status === 'running' ? 'text-blue-400' : 'text-zinc-500'}`}>
                  Web Search
                </div>
                {state.web.status === 'running' && <Loader2 size={10} className="animate-spin text-blue-400" />}
                {state.web.status === 'done' && <CheckCircle2 size={10} className="text-green-500" />}
              </div>
              {/* Logs */}
              <div className="space-y-1 pl-1">
                {state.web.logs.map((log: any, i: number) => (
                  <div key={i} className="text-[11px] text-zinc-400">
                    <div>{log.message}</div>
                    {log.subItems && log.subItems.map((sub: string, j: number) => (
                      <div key={j} className="text-zinc-500 pl-2 opacity-80">- {sub}</div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
