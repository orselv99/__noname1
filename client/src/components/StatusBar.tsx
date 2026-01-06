import { Wifi, AlertCircle } from 'lucide-react';

export const StatusBar = () => {
  return (
    <div className="h-6 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-3 text-[10px] text-zinc-500 select-none">
      <div className="flex items-center gap-4">
        <span className="hover:text-zinc-300 cursor-pointer">Ln 12, Col 45</span>
        <span className="hover:text-zinc-300 cursor-pointer">UTF-8</span>
        <span className="hover:text-zinc-300 cursor-pointer">Markdown</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500/20 border border-green-500/50"></span>
          <span>Online</span>
        </div>
        <div className="flex items-center gap-1 hover:text-zinc-300 cursor-pointer">
          <AlertCircle size={10} />
          <span>0 Warnings</span>
        </div>
      </div>
    </div>
  );
};
