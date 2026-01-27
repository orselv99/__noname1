import { FileText, Database, Globe } from 'lucide-react';
import { ThinkingAccordion, ThinkingItem } from '../ui/ThinkingAccordion';

export interface RagThinkingState {
  local: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  server: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  web: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
}

export function RagThinkingAccordion({ state, status, defaultExpanded }: { state: RagThinkingState, status?: string, defaultExpanded?: boolean }) {
  if (!state) return null;

  const items: ThinkingItem[] = [
    {
      id: 'local',
      label: 'Local Docs',
      status: state.local.status as any,
      logs: state.local.logs,
      icon: FileText,
      colorClass: state.local.status === 'running' ? 'text-yellow-400' : undefined
    },
    {
      id: 'server',
      label: 'Server Docs',
      status: state.server.status as any,
      logs: state.server.logs,
      icon: Database,
      colorClass: state.server.status === 'running' ? 'text-purple-400' : undefined
    },
    {
      id: 'web',
      label: 'Web Search',
      status: state.web ? state.web.status as any : 'idle',
      logs: state.web ? state.web.logs : [],
      icon: Globe,
      colorClass: state.web?.status === 'running' ? 'text-blue-400' : undefined
    }
  ].filter(item => item.status !== 'idle' || item.logs.length > 0); // Optional: filter out idle/empty steps if desired, or keep them to show structure

  return (
    <ThinkingAccordion
      items={items}
      label={status}
      defaultExpanded={defaultExpanded}
    />
  );
}
