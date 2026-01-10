import { Minus, X, Square, Copy } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState, useEffect } from 'react';
import { isTauri } from '../../utils/tauri';

interface WindowControlsProps {
  onClose?: () => void;
  showConfirmOnClose?: boolean;
  onShowCloseConfirm?: () => void;
}

export const WindowControls = ({
  onClose,
  showConfirmOnClose = false,
  onShowCloseConfirm
}: WindowControlsProps) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    const win = getCurrentWindow();
    win.isMaximized().then(setIsMaximized);

    let cleanup: (() => void) | null = null;
    win.onResized(() => win.isMaximized().then(setIsMaximized)).then(unlisten => {
      cleanup = unlisten;
    });

    return () => {
      if (cleanup) cleanup();
    };
  }, []);

  const minimize = () => {
    if (isTauri()) {
      getCurrentWindow().minimize();
    }
  };

  const toggleMaximize = async () => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const maximized = await win.isMaximized();
    if (maximized) await win.unmaximize();
    else await win.maximize();
    setIsMaximized(!maximized);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (showConfirmOnClose && onShowCloseConfirm) {
      onShowCloseConfirm();
    } else if (isTauri()) {
      getCurrentWindow().close();
    }
  };

  // In browser mode, hide window controls entirely
  if (!isTauri()) {
    return null;
  }

  return (
    <div className="flex items-center">
      <button
        onClick={minimize}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        title="Minimize"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={toggleMaximize}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors"
        title="Maximize"
      >
        {isMaximized ? <Copy size={14} /> : <Square size={14} />}
      </button>
      <button
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:bg-red-600 hover:text-white transition-colors"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
};
