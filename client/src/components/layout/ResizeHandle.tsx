import React from 'react';

interface ResizeHandleProps {
  onResizeStart: (e: React.MouseEvent) => void;
}

export const ResizeHandle = ({ onResizeStart }: ResizeHandleProps) => {
  return (
    <div className="relative shrink-0 group" style={{ width: '1px' }}>
      {/* Visible line */}
      <div className="absolute inset-0 bg-zinc-800 group-hover:bg-blue-500 transition-colors" />
      {/* Wider hit area for easier dragging */}
      <div
        className="absolute inset-y-0 -left-1 -right-1 cursor-col-resize z-10"
        onMouseDown={onResizeStart}
      />
    </div>
  );
};
