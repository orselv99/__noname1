import { useEditor, EditorContent } from '@tiptap/react';
import { invoke } from '@tauri-apps/api/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useEffect, useState } from 'react';
import { ChevronDown, Eye, EyeOff, FileText, Globe, FilePen, MessageSquareText, FileCheck } from 'lucide-react';

const colors = ['#958DF1', '#F98181', '#FBBC88', '#FAF594', '#70CFF8', '#94FADB', '#B9F18D'];

export const Editor = () => {
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // Disabling Tiptap history to use Yjs history
      }),
      Collaboration.configure({
        document: provider?.doc,
      }),
      CollaborationCursor.configure({
        provider: provider,
        user: {
          name: 'Anonymous',
          color: colors[Math.floor(Math.random() * colors.length)],
        },
      }),
    ],
  });

  useEffect(() => {
    const ydoc = new Y.Doc();
    // Connect to the signaling server
    const wsProvider = new WebsocketProvider(
      'ws://localhost:8080/api/v1/ws/signaling',
      'fiery-horizon-demo', // Room name
      ydoc
    );

    setProvider(wsProvider);

    return () => {
      wsProvider.destroy();
    };
  }, []);

  if (!provider) {
    return <div>Connecting to collaboration server...</div>;
  }

  // Deprecated standalone editor usage
  return <div>Legacy Editor (Use CollaborativeEditor)</div>;
};

// Refined implementation to ensure provider is ready before editor
export const CollaborativeEditor = () => {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const wsProvider = new WebsocketProvider(
      'ws://localhost:8080/api/v1/ws/signaling',
      'fiery-horizon-demo',
      doc
    );

    setYdoc(doc);
    setProvider(wsProvider);

    return () => {
      wsProvider.destroy();
      doc.destroy();
    }
  }, []);

  if (!ydoc || !provider) {
    return <div className="text-white p-4">Connecting...</div>;
  }

  return <TiptapEditor ydoc={ydoc} provider={provider} />;
}


const TiptapEditor = ({ ydoc, provider }: { ydoc: Y.Doc, provider: WebsocketProvider }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false,
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider: provider,
        user: {
          name: `User ${Math.floor(Math.random() * 100)}`,
          color: colors[Math.floor(Math.random() * colors.length)],
        },
      }),
    ],
  });

  const [aiResult, setAiResult] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [title, setTitle] = useState('');

  // NOTE: Metadata state has been moved to RightSidebar (conceptually)
  // In a real app, we would sync state via Context or lifting state up.
  // For this layout demo, Editor focuses purely on content.

  const handleAiExtraction = async () => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) return;

    setIsExtracting(true);
    setAiResult(null);

    try {
      const result: any = await invoke('extract_info', { text, title: title || undefined });
      setAiResult(result);
    } catch (error) {
      console.error('AI Extraction Failed:', error);
      setAiResult({ error: `Failed to extract info: ${error}` });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 relative">

      {/* Document Title (Optional, Obsidian puts it in header or file) */}
      <div className="px-8 pt-6 pb-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          className="w-full bg-transparent text-3xl font-bold text-white placeholder-zinc-600 focus:outline-none"
        />
      </div>

      {/* Toolbar (Sticky) */}
      <div className="flex items-center gap-2 px-8 py-2 sticky top-0 z-10 opacity-50 hover:opacity-100 transition-opacity">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive('bold') ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive('italic') ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <em>I</em>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive('strike') ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          <s>S</s>
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-2" />

        <button
          onClick={handleAiExtraction}
          disabled={isExtracting}
          className={`text-xs font-medium transition-colors ${isExtracting
            ? 'text-zinc-600 cursor-wait'
            : 'text-indigo-400 hover:text-indigo-300'
            }`}
        >
          {isExtracting ? 'Extracting...' : '✨ Extract Info'}
        </button>
      </div>

      {/* Editor Content */}
      <div className="flex-1 px-8 pb-8 overflow-y-auto custom-scrollbar">
        <EditorContent editor={editor} className="prose prose-invert max-w-none h-full outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px] text-lg leading-relaxed text-zinc-300" />
      </div>

      {aiResult && (
        <div className="mx-8 mb-4 p-4 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400 max-h-40 overflow-auto">
          <h4 className="text-zinc-500 font-bold mb-2">AI Extraction Result:</h4>
          <pre className="whitespace-pre-wrap">{JSON.stringify(aiResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default CollaborativeEditor;
