
import { Workflow } from 'lucide-react';

export const WorkflowPanel = () => {
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-sm font-semibold text-zinc-200">
          Workflow
        </h3>
        <p className="text-xs text-zinc-500 mt-1">
          워크플로우 상태
        </p>
      </div>
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 p-4 text-center">
        <Workflow size={48} className="mb-4 opacity-20" />
        <p>워크플로우를 선택하여<br />상세 정보를 확인하세요</p>
      </div>
    </div>
  );
};
