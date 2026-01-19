import { Copy, Scissors, ClipboardPaste, MessageSquareQuote, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Editor } from '@tiptap/react';
import { useRef, useLayoutEffect, useState } from 'react';

interface EditorContextMenuProps {
  x: number;
  y: number;
  selectedText: string;
  editor: Editor | null;
  onClose: () => void;
  onAddFootnote?: (text: string) => void;
  onOpenRag?: () => void;
}

export const EditorContextMenu = ({
  x,
  y,
  selectedText,
  editor,
  onClose,
  onAddFootnote,
  onOpenRag,
}: EditorContextMenuProps) => {
  const hasSelection = selectedText.length > 0;
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    if (menuRef.current) {
      const { offsetWidth: width, offsetHeight: height } = menuRef.current;
      const { innerWidth, innerHeight } = window;

      let newTop = y;
      let newLeft = x;

      // Vertical adjustment (prevent overflow at bottom)
      if (y + height > innerHeight) {
        newTop = y - height;
      }

      // Horizontal adjustment (prevent overflow at right)
      if (x + width > innerWidth) {
        newLeft = x - width;
      }

      setPosition({ top: newTop, left: newLeft });
    }
  }, [x, y, selectedText]); // Re-calculate when coords or content changes

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-9998"
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className="fixed z-9999 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
        style={{ top: position.top, left: position.left }}
      >
        {/* Text selection actions - only show when text is selected */}
        {hasSelection && (
          <>
            <button
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              onClick={() => {
                navigator.clipboard.writeText(selectedText);
                onClose();
              }}
            >
              <Copy size={14} className="text-zinc-400" />
              복사
            </button>
            <button
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              onClick={() => {
                navigator.clipboard.writeText(selectedText);
                editor?.chain().focus().deleteSelection().run();
                onClose();
              }}
            >
              <Scissors size={14} className="text-zinc-400" />
              잘라내기
            </button>
            <button
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              onClick={async () => {
                const text = await navigator.clipboard.readText();
                editor?.chain().focus().insertContent(text).run();
                onClose();
              }}
            >
              <ClipboardPaste size={14} className="text-zinc-400" />
              붙여넣기
            </button>
            <div className="h-px bg-zinc-700 my-1" />
            <button
              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
              onClick={() => {
                onAddFootnote?.(selectedText);
                onClose();
              }}
            >
              <MessageSquareQuote size={14} className="text-zinc-400" />
              각주 추가
            </button>
            <div className="h-px bg-zinc-700 my-1" />
          </>
        )}

        {/* RAG action - always visible */}
        <button
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
          onClick={() => {
            onOpenRag?.();
            onClose();
          }}
        >
          <Search size={14} className="text-zinc-400" />
          RAG 검색
        </button>
      </div>
    </>,
    document.body
  );
};
