
import { Workflow } from 'lucide-react';

export const WorkflowView = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-zinc-900">
      <Workflow size={64} className="mb-4 opacity-50" />
      <h2 className="text-xl font-bold mb-2 text-zinc-300">Workflows</h2>
      <p className="text-zinc-500">워크플로우 관리 기능이 곧 추가될 예정입니다.</p>
    </div>
  );
};
