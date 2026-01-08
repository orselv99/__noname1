import {
  useState,
  useEffect,
  useRef
} from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, CheckSquare, Link as LinkIcon, Image as ImageIcon,
  Highlighter, Type, Grid,
  ChevronDown, Pilcrow,
  Indent, Outdent
} from 'lucide-react';
import type { Editor } from '@tiptap/react';

interface EditorToolbarProps {
  editor: Editor | null;
}

export const EditorToolbar = ({ editor }: EditorToolbarProps) => {
  // Force re-render on editor state changes to update button highlights
  const [, forceUpdate] = useState({});
  const [headingDropdownOpen, setHeadingDropdownOpen] = useState(false);
  const [colorDropdownOpen, setColorDropdownOpen] = useState(false);
  const [highlightDropdownOpen, setHighlightDropdownOpen] = useState(false);
  const [alignDropdownOpen, setAlignDropdownOpen] = useState(false);
  const [listDropdownOpen, setListDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const colorDropdownRef = useRef<HTMLDivElement>(null);
  const highlightDropdownRef = useRef<HTMLDivElement>(null);
  const alignDropdownRef = useRef<HTMLDivElement>(null);
  const listDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => forceUpdate({});

    // Subscribe to transaction and selection updates
    editor.on('transaction', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);

    return () => {
      editor.off('transaction', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setHeadingDropdownOpen(false);
      }
      if (colorDropdownRef.current && !colorDropdownRef.current.contains(target)) {
        setColorDropdownOpen(false);
      }
      if (highlightDropdownRef.current && !highlightDropdownRef.current.contains(target)) {
        setHighlightDropdownOpen(false);
      }
      if (alignDropdownRef.current && !alignDropdownRef.current.contains(target)) {
        setAlignDropdownOpen(false);
      }
      if (listDropdownRef.current && !listDropdownRef.current.contains(target)) {
        setListDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (!editor) return null;

  const addImage = () => {
    const url = window.prompt('Enter Image URL:');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter Link URL:', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const ToolbarButton = ({ onClick, isActive = false, children, className = '', title = '' }: any) => (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${isActive ? 'bg-zinc-800 text-blue-400' : 'text-zinc-400'
        } ${className}`}
      type="button"
      title={title}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="w-px h-6 bg-zinc-800 mx-1" />;

  // Color palette for text and highlight
  const textColors = [
    ['#6b7280', '#374151', '#1f2937', '#111827'],
    ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa'],
    ['#0d9488', '#14b8a6', '#2dd4bf', '#5eead4'],
    ['#ca8a04', '#eab308', '#facc15', '#fde047'],
    ['#ea580c', '#f97316', '#fb923c', '#fdba74'],
    ['#dc2626', '#ef4444', '#f87171', '#fca5a5'],
  ];

  const highlightColors = ['transparent', '#374151', '#0d9488', '#ca8a04', '#c026d3', '#dc2626'];

  // Get current heading level for display
  const getCurrentHeadingLabel = () => {
    for (let i = 1; i <= 6; i++) {
      if (editor.isActive('heading', { level: i })) return `H${i}`;
    }
    return 'P';
  };

  return (
    <div className="flex items-center gap-1 p-1.5 flex-wrap justify-center">
      {/* Headings Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setHeadingDropdownOpen(!headingDropdownOpen)}
          className={`flex items-center gap-1 px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors ${editor.isActive('heading') ? 'bg-zinc-800 text-blue-400' : 'text-zinc-400'
            }`}
          type="button"
          title="Heading"
        >
          <span className="text-xs font-medium w-5">{getCurrentHeadingLabel()}</span>
          <ChevronDown size={12} className={`transition-transform ${headingDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {headingDropdownOpen && (
          <div className="absolute top-full left-[-6px] mt-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-40 z-50">
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <button
                key={level}
                onClick={() => {
                  editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run();
                  setHeadingDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-4 ${editor.isActive('heading', { level }) ? 'text-blue-400 bg-zinc-800' : 'text-zinc-300'
                  }`}
                type="button"
              >
                <span className={`w-6 font-bold `}>H{level}</span>
                <span className={`text-zinc-500 ${level <= 2 ? 'text-base' : level <= 4 ? 'text-sm' : 'text-xs'}`}>Heading {level}</span>
              </button>
            ))}
            <div className="border-t border-zinc-700 my-1" />
            <button
              onClick={() => {
                editor.chain().focus().setParagraph().run();
                setHeadingDropdownOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-4   ${editor.isActive('paragraph') ? 'text-blue-400 bg-zinc-800' : 'text-zinc-300'
                }`}
              type="button"
            >
              <Pilcrow className='w-6' size={14} />
              <span className="text-zinc-500 text-xs">Paragraph</span>
            </button>
          </div>
        )}
      </div>

      <Divider />

      {/* Bold */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <Bold size={16} />
      </ToolbarButton>

      {/* Italic, Underline, Strike */}
      <div className="flex items-center gap-0.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} title="Italic (Ctrl+I)">
          <Italic size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} title="Underline (Ctrl+U)">
          <UnderlineIcon size={16} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} title="Strikethrough">
          <Strikethrough size={16} />
        </ToolbarButton>
      </div>


      <Divider />

      {/* Text Color Dropdown */}
      <div className="relative" ref={colorDropdownRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setColorDropdownOpen(!colorDropdownOpen)}
          className={`flex items-center gap-0.5 px-1.5 py-1.5 rounded hover:bg-zinc-800 transition-colors text-zinc-400`}
          type="button"
          title="Text Color"
        >
          <Type size={16} className="text-blue-400" />
          <ChevronDown size={10} />
        </button>
        {colorDropdownOpen && (
          <div className="absolute top-full left-0 mt-3 left-[-6px] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 z-50">
            <div className="grid grid-cols-4 gap-1">
              {textColors.flat().map((color, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    editor.chain().focus().setColor(color).run();
                    setColorDropdownOpen(false);
                  }}
                  className="w-6 h-6 rounded border border-zinc-600 hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
            <button
              onClick={() => {
                editor.chain().focus().unsetColor().run();
                setColorDropdownOpen(false);
              }}
              className="w-full mt-2 text-xs text-zinc-400 hover:text-white py-1"
              type="button"
            >
              Reset Color
            </button>
          </div>
        )}
      </div>

      {/* Highlight Color Dropdown */}
      <div className="relative" ref={highlightDropdownRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setHighlightDropdownOpen(!highlightDropdownOpen)}
          className={`flex items-center gap-0.5 px-1.5 py-1.5 rounded hover:bg-zinc-800 transition-colors ${editor.isActive('highlight') ? 'bg-zinc-800 text-blue-400' : 'text-zinc-400'}`}
          type="button"
          title="Highlight"
        >
          <Highlighter size={16} className="text-yellow-400" />
          <ChevronDown size={10} />
        </button>
        {highlightDropdownOpen && (
          <div className="absolute top-full left-[-6px] mt-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl p-2 z-50">
            <div className="flex gap-1.5">
              {highlightColors.map((color, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    if (color === 'transparent') {
                      editor.chain().focus().unsetHighlight().run();
                    } else {
                      editor.chain().focus().setHighlight({ color }).run();
                    }
                    setHighlightDropdownOpen(false);
                  }}
                  className={`w-7 h-7 rounded border border-zinc-600 hover:scale-110 transition-transform flex items-center justify-center ${color === 'transparent' ? 'bg-zinc-800' : ''}`}
                  style={{ backgroundColor: color === 'transparent' ? undefined : color }}
                  type="button"
                >
                  {color === 'transparent' && <span className="text-zinc-500 text-xs">/</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Divider />

      {/* Alignment Dropdown */}
      <div className="relative" ref={alignDropdownRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAlignDropdownOpen(!alignDropdownOpen)}
          className={`flex items-center gap-0.5 px-1.5 py-1.5 rounded hover:bg-zinc-800 transition-colors text-zinc-400`}
          type="button"
          title="Text Alignment"
        >
          <AlignLeft size={16} />
          <ChevronDown size={10} />
        </button>
        {alignDropdownOpen && (
          <div className="absolute top-full left-0 mt-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-32 z-50">
            <button
              onClick={() => { editor.chain().focus().setTextAlign('left').run(); setAlignDropdownOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3 ${editor.isActive({ textAlign: 'left' }) ? 'text-blue-400 bg-zinc-800' : 'text-zinc-300'}`}
              type="button"
            >
              <AlignLeft size={14} />
              <span className="text-sm">Align left</span>
            </button>
            <button
              onClick={() => { editor.chain().focus().setTextAlign('center').run(); setAlignDropdownOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3 ${editor.isActive({ textAlign: 'center' }) ? 'text-blue-400 bg-zinc-800' : 'text-zinc-300'}`}
              type="button"
            >
              <AlignCenter size={14} />
              <span className="text-sm">Align center</span>
            </button>
            <button
              onClick={() => { editor.chain().focus().setTextAlign('right').run(); setAlignDropdownOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3 ${editor.isActive({ textAlign: 'right' }) ? 'text-blue-400 bg-zinc-800' : 'text-zinc-300'}`}
              type="button"
            >
              <AlignRight size={14} />
              <span className="text-sm">Align right</span>
            </button>
          </div>
        )}
      </div>

      {/* List Dropdown */}
      <div className="relative" ref={listDropdownRef}>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setListDropdownOpen(!listDropdownOpen)}
          className={`flex items-center gap-0.5 px-1.5 py-1.5 rounded hover:bg-zinc-800 transition-colors ${(editor.isActive('bulletList') || editor.isActive('orderedList')) ? 'bg-zinc-800 text-blue-400' : 'text-zinc-400'}`}
          type="button"
          title="Lists"
        >
          <List size={16} />
          <ChevronDown size={10} />
        </button>
        {listDropdownOpen && (
          <div className="absolute top-full left-0 mt-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-36 z-50">
            <button
              onClick={() => { editor.chain().focus().toggleBulletList().run(); setListDropdownOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3 ${editor.isActive('bulletList') ? 'text-blue-400 bg-zinc-800' : 'text-zinc-300'}`}
              type="button"
            >
              <List size={14} />
              <span className="text-sm">Bullet list</span>
            </button>
            <button
              onClick={() => { editor.chain().focus().toggleOrderedList().run(); setListDropdownOpen(false); }}
              className={`w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3 ${editor.isActive('orderedList') ? 'text-blue-400 bg-zinc-800' : 'text-zinc-300'}`}
              type="button"
            >
              <ListOrdered size={14} />
              <span className="text-sm">Numbered list</span>
            </button>
            <div className="border-t border-zinc-700 my-1" />
            <button
              onClick={() => { editor.chain().focus().liftListItem('listItem').run(); setListDropdownOpen(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3 text-zinc-300"
              type="button"
            >
              <Outdent size={14} />
              <span className="text-sm">Outdent</span>
            </button>
            <button
              onClick={() => { editor.chain().focus().sinkListItem('listItem').run(); setListDropdownOpen(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-zinc-800 transition-colors flex items-center gap-3 text-zinc-300"
              type="button"
            >
              <Indent size={14} />
              <span className="text-sm">Indent</span>
            </button>
          </div>
        )}
      </div>

      <Divider />

      {/* Insert Group */}
      <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} title="Task List">
        <CheckSquare size={16} />
      </ToolbarButton>

      <ToolbarButton onClick={setLink} isActive={editor.isActive('link')} title="Insert Link">
        <LinkIcon size={16} />
      </ToolbarButton>

      <ToolbarButton onClick={addImage} title="Insert Image">
        <ImageIcon size={16} />
      </ToolbarButton>

      <ToolbarButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title="Insert Table">
        <Grid size={16} />
      </ToolbarButton>

    </div>
  );
};

export default EditorToolbar;
