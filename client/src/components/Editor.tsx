import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    if (provider && editor) {
      // Re-configure extensions when provider is ready
      // But since we pass provider.doc to Collaboration extension, we might need to recreate editor or update extension?
      // Tiptap Collaboration extension handles ydoc updates if configured properly. 
      // A common pattern is to render EditorContent only when provider is ready,
      // OR pass the ydoc directly if created outside.
      // Let's refine the approach: Create ydoc and provider first, then init editor.
    }
  }, [provider, editor]);

  if (!provider) {
    return <div>Connecting to collaboration server...</div>;
  }

  return (
    <div className="border border-gray-700 rounded-lg p-4 bg-gray-800 text-white min-h-[500px]">
      <div className="mb-4 flex gap-2 border-b border-gray-700 pb-2">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-2 rounded hover:bg-gray-700 ${editor?.isActive('bold') ? 'bg-gray-700 text-blue-400' : ''}`}
        >
          Bold
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-2 rounded hover:bg-gray-700 ${editor?.isActive('italic') ? 'bg-gray-700 text-blue-400' : ''}`}
        >
          Italic
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          className={`p-2 rounded hover:bg-gray-700 ${editor?.isActive('strike') ? 'bg-gray-700 text-blue-400' : ''}`}
        >
          Strike
        </button>
      </div>
      <EditorContent editor={editor} className="prose prose-invert max-w-none focus:outline-none" />
    </div>
  );
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

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 p-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex gap-1 mr-4">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
        <div className="h-4 w-px bg-zinc-800 mx-2" />
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive('bold') ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
        >
          <strong>B</strong>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive('italic') ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
        >
          <em>I</em>
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded transition-colors ${editor?.isActive('strike') ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}`}
        >
          <s>S</s>
        </button>
      </div>
      <div className="flex-1 p-4 bg-black/50 overflow-y-auto">
        <EditorContent editor={editor} className="prose prose-invert max-w-none h-full outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px]" />
      </div>
      <div className="p-2 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500 flex justify-between">
        <span>{editor?.storage.characterCount?.characters() ?? 0} characters</span>
        <div className="flex gap-2 items-center">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Connected
        </div>
      </div>
    </div>
  );
};

export default CollaborativeEditor;
