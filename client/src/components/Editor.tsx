import { useEditor, EditorContent } from '@tiptap/react';
import { invoke } from '@tauri-apps/api/core';
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

  const [aiResult, setAiResult] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);

  // Document metadata state
  const [isMetadataExpanded, setIsMetadataExpanded] = useState(true);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [tags, setTags] = useState<{ tag: string; evidence: string | null; expanded: boolean }[]>([]);
  const [documentState, setDocumentState] = useState<number>(1); // 1=DRAFT, 2=FEEDBACK, 3=PUBLISHED
  const [visibilityLevel, setVisibilityLevel] = useState<number>(1); // 1=HIDDEN, 2=METADATA, 3=SNIPPET, 4=PUBLIC
  const [contributor, setContributor] = useState('');
  const [createdAt] = useState('');
  const [updatedAt] = useState('');

  const handleAiExtraction = async () => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) return;

    setIsExtracting(true);
    setAiResult(null);

    try {
      const result: any = await invoke('extract_info', { text, title: title || undefined });
      setAiResult(result);

      // Auto-populate fields from AI result
      if (result.summary) setSummary(result.summary);
      if (result.tags) {
        setTags(result.tags.map((t: any) => ({
          tag: t.tag,
          evidence: t.evidence || null,
          expanded: false
        })));
      }
    } catch (error) {
      console.error('AI Extraction Failed:', error);
      setAiResult({ error: `Failed to extract info: ${error}` });
    } finally {
      setIsExtracting(false);
    }
  };

  const toggleTagExpanded = (index: number) => {
    setTags(prev => prev.map((t, i) =>
      i === index ? { ...t, expanded: !t.expanded } : t
    ));
  };

  const documentStateLabels: Record<number, string> = {
    1: 'Draft',
    2: 'Feedback',
    3: 'Published'
  };

  const visibilityLabels: Record<number, string> = {
    1: 'Hidden',
    2: 'Metadata Only',
    3: 'Snippet',
    4: 'Public'
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
      {/* Document Metadata Panel - Collapsible */}
      <div className="bg-zinc-950 border-b border-zinc-800">
        {/* Header with Toggle */}
        <button
          onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-zinc-900 transition-colors"
        >
          <span className="text-sm font-medium text-zinc-400">📄 문서 정보</span>
          <span className="text-zinc-500 text-xs">{isMetadataExpanded ? '▲ 접기' : '▼ 펼치기'}</span>
        </button>

        {/* Collapsible Content */}
        {isMetadataExpanded && (
          <div className="p-4 pt-2 space-y-3 max-h-80 overflow-y-auto custom-scrollbar">
            {/* Title */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">제목</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="문서 제목을 입력하세요"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Summary */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">요약</label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="AI가 자동 생성하거나 직접 입력하세요"
                rows={2}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Tags with Accordion */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">태그</label>
              <div className="space-y-1">
                {tags.length === 0 ? (
                  <div className="text-xs text-zinc-600 italic">AI 추출 후 태그가 표시됩니다</div>
                ) : (
                  tags.map((tag, index) => (
                    <div key={index} className="border border-zinc-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleTagExpanded(index)}
                        className="w-full px-3 py-2 bg-zinc-800 text-left flex justify-between items-center hover:bg-zinc-750"
                      >
                        <span className="text-sm text-blue-400">#{tag.tag}</span>
                        <span className="text-zinc-500 text-xs">
                          {tag.expanded ? '▲' : '▼'}
                        </span>
                      </button>
                      {tag.expanded && tag.evidence && (
                        <div className="px-3 py-2 bg-zinc-900 text-xs text-zinc-400 border-t border-zinc-700">
                          <div className="text-zinc-500 mb-1">근거:</div>
                          <p className="italic">{tag.evidence}</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* State and Visibility */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">문서 상태</label>
                <select
                  value={documentState}
                  onChange={(e) => setDocumentState(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {Object.entries(documentStateLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">공개 범위</label>
                <select
                  value={visibilityLevel}
                  onChange={(e) => setVisibilityLevel(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {Object.entries(visibilityLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Contributor */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">기여자</label>
              <input
                type="text"
                value={contributor}
                onChange={(e) => setContributor(e.target.value)}
                placeholder="기여자 이름"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">생성일</label>
                <input
                  type="text"
                  value={createdAt}
                  readOnly
                  placeholder="자동 생성"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">수정일</label>
                <input
                  type="text"
                  value={updatedAt}
                  readOnly
                  placeholder="자동 생성"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 text-sm cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-px bg-linear-to-r from-transparent via-zinc-600 to-transparent" />

      {/* Toolbar */}
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

        <div className="h-4 w-px bg-zinc-800 mx-2" />

        <button
          onClick={handleAiExtraction}
          disabled={isExtracting}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${isExtracting
            ? 'bg-zinc-800 text-zinc-500 cursor-wait'
            : 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30'
            }`}
        >
          {isExtracting ? 'Extracting...' : '✨ Extract Info'}
        </button>
      </div>

      {/* Editor Content */}
      <div className="flex-1 p-4 bg-black/50 overflow-y-auto">
        <EditorContent editor={editor} className="prose prose-invert max-w-none h-full outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px]" />
      </div>

      {aiResult && (
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 text-xs font-mono text-zinc-400 max-h-40 overflow-auto">
          <h4 className="text-zinc-500 font-bold mb-2">AI Extraction Result:</h4>
          <pre className="whitespace-pre-wrap">{JSON.stringify(aiResult, null, 2)}</pre>
        </div>
      )}

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
