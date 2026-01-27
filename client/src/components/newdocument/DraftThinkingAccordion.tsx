import { FileText, Globe, Sparkles, PenLine, Paperclip, Layout } from 'lucide-react';
import { ThinkingAccordion, ThinkingItem } from '../ui/ThinkingAccordion';

export interface DraftThinkingState {
  info: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[], tags?: string[] }[] };
  template: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  local: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  web: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  resources: { status: 'pending' | 'running' | 'done' | 'idle', logs: { message: string, subItems?: string[] }[] };
  drafting: { status: 'pending' | 'running' | 'done' | 'idle' | 'error', logs: { message: string, subItems?: string[] }[] };
}

export function DraftThinkingAccordion({ state, status, defaultExpanded }: { state: DraftThinkingState, status?: string, defaultExpanded?: boolean }) {
  if (!state) return null;

  const items: ThinkingItem[] = [
    {
      id: 'info',
      label: 'Document Info & Summary',
      status: state.info.status as any,
      logs: state.info.logs,
      icon: PenLine,
      colorClass: state.info.status === 'running' ? 'text-zinc-400' : undefined
    },
    {
      id: 'template',
      label: 'Template Selection',
      status: state.template.status as any,
      logs: state.template.logs,
      icon: Layout,
      colorClass: state.template.status === 'running' ? 'text-zinc-400' : undefined
    },
    {
      id: 'local',
      label: 'Reference Documents Analysis',
      status: state.local.status as any,
      logs: state.local.logs,
      icon: FileText,
      colorClass: state.local.status === 'running' ? 'text-yellow-400' : undefined
    },
    {
      id: 'web',
      label: 'Web Search Analysis',
      status: state.web.status as any,
      logs: state.web.logs,
      icon: Globe,
      colorClass: state.web.status === 'running' ? 'text-blue-400' : undefined
    },
    {
      id: 'resources',
      label: 'Resource Analysis',
      status: state.resources.status as any,
      logs: state.resources.logs,
      icon: Paperclip,
      colorClass: state.resources.status === 'running' ? 'text-pink-400' : undefined
    },
    {
      id: 'drafting',
      label: 'AI Draft Generation',
      status: state.drafting.status as any,
      logs: state.drafting.logs,
      icon: Sparkles,
      colorClass: state.drafting.status === 'running' ? 'text-purple-400' : undefined
    }
  ];

  return (
    <ThinkingAccordion
      items={items}
      label={status || "AI Drafting Process"}
      defaultExpanded={defaultExpanded}
    />
  );
}
