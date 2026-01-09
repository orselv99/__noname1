import { useEditor, EditorContent } from '@tiptap/react';
import { invoke } from '@tauri-apps/api/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import { useEffect, useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { FileText, Star, Save, MoreVertical, Lock, Unlock } from 'lucide-react';
import { EditorToolbar } from './EditorToolbar';
import { Document } from '../../types';
import { useToast } from '../Toast';

const colors = ['#958DF1', '#F98181', '#FBBC88', '#FAF594', '#70CFF8', '#94FADB', '#B9F18D'];

export const Editor = () => {
  // Legacy component shell
  return <div>Use CollaborativeEditor</div>;
}

export const CollaborativeEditor = () => {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    // Connect to the signaling server
    const wsProvider = new WebsocketProvider(
      'ws://localhost:8080/api/v1/ws/signaling',
      'fiery-horizon-demo', // Room name
      doc
    );

    setYdoc(doc);
    setProvider(wsProvider);

    return () => {
      wsProvider.destroy();
      doc.destroy();
    };
  }, []);

  if (!ydoc || !provider) {
    return <div className="text-white p-4">Connecting...</div>;
  }

  return <TiptapEditor ydoc={ydoc} provider={provider} />;
}


const TiptapEditor = ({ ydoc, provider }: { ydoc: Y.Doc, provider: WebsocketProvider }) => {
  const { showToast } = useToast();
  const { fetchDocuments, activeTabId, documents, highlightedEvidence, toggleFavorite, updateDocument, setAiAnalysisStatus, setLiveEditorContent, setAutoSaveStatus, updateTabTitle } = useDocumentStore();
  const activeDoc = documents.find(d => d.id === activeTabId);
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
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Link.configure({
        openOnClick: false, // Ctrl+Click to follow
        autolink: true,
      }),
      Image,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
  });

  const [, setAiResult] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [title, setTitle] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  // LocalStorage Draft 키 생성 헬퍼
  const getDraftKey = (docId: string) => `draft-${docId}`;

  // Read-only toggle effect
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  // Load content when active tab changes (with localStorage draft recovery)
  useEffect(() => {
    if (!editor) return;

    if (activeTabId) {
      const doc = documents.find(d => d.id === activeTabId);
      if (doc) {
        // localStorage에서 draft 확인
        const draftKey = getDraftKey(activeTabId);
        const savedDraft = localStorage.getItem(draftKey);

        if (savedDraft) {
          try {
            const draft = JSON.parse(savedDraft);
            // Draft가 있으면 복구
            setTitle(draft.title || doc.title);
            editor.commands.setContent(draft.content || doc.content, true);
          } catch (e) {
            // 파싱 실패 시 서버 데이터 사용
            setTitle(doc.title);
            editor.commands.setContent(doc.content, true);
          }
        } else {
          // Draft 없으면 서버 데이터 사용
          setTitle(doc.title);
          editor.commands.setContent(doc.content, true);
        }
        setIsDirty(false);
      }
    } else {
      setTitle('Untitled');
      if (editor) {
        editor.commands.clearContent();
        setIsDirty(false);
      }
    }
  }, [activeTabId, documents, editor]);

  // Track changes and update metadata in real-time
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      setIsDirty(true);
    };

    editor.on('update', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
    }
  }, [editor]);

  // 실시간 메타데이터 업데이트 (디바운스 적용)
  useEffect(() => {
    if (!editor || !activeTabId) return;

    const updateMetadata = () => {
      const currentContent = editor.getHTML();
      // 저장되지 않은 실시간 콘텐츠를 별도 상태로 관리 (메타데이터 패널용)
      setLiveEditorContent(currentContent);
    };

    // 디바운스: 300ms 후에 업데이트
    const timeoutId = setTimeout(updateMetadata, 300);

    return () => clearTimeout(timeoutId);
  }, [editor?.state.doc, activeTabId, setLiveEditorContent]);

  // localStorage 자동저장 (5초 interval)
  useEffect(() => {
    if (!editor || !activeTabId || !isDirty) return;

    const autoSaveTimeout = setTimeout(() => {
      const currentContent = editor.getHTML();
      const draftKey = getDraftKey(activeTabId);

      try {
        const draft = {
          title,
          content: currentContent,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem(draftKey, JSON.stringify(draft));

        // 상태바에 자동저장 표시
        setAutoSaveStatus('자동저장됨');
        setTimeout(() => setAutoSaveStatus(null), 2000);
      } catch (e) {
        console.error('Draft auto-save failed:', e);
      }
    }, 5000); // 5초 후 자동저장

    return () => clearTimeout(autoSaveTimeout);
  }, [editor?.state.doc, activeTabId, title, isDirty, setAutoSaveStatus]);

  // Keyboard Shortcuts (Ctrl+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, activeTabId, activeDoc, title, isDirty]); // Dependencies for handleSave

  // Handle highlighting evidence from MetadataPanel
  useEffect(() => {
    if (!editor) return;

    if (highlightedEvidence) {
      const doc = editor.state.doc;
      const segments: { from: number; to: number; text: string; nodePos: number }[] = [];
      let stringAccumulator = "";

      // 1. Build a searchable string and map segments
      doc.descendants((node, pos) => {
        if (node.isText) {
          const text = node.text || "";
          segments.push({
            from: stringAccumulator.length,
            to: stringAccumulator.length + text.length,
            text: text,
            nodePos: pos
          });
          stringAccumulator += text;
        } else if (node.isBlock) {
          if (stringAccumulator.length > 0 && !stringAccumulator.endsWith(" ")) {
            stringAccumulator += " ";
          }
        }
      });

      // 2. Normalize for search
      let matchIndex = stringAccumulator.indexOf(highlightedEvidence);
      let matchLen = highlightedEvidence.length;

      // Fallback: Try trimmed
      if (matchIndex === -1) {
        const trimmed = highlightedEvidence.trim();
        matchIndex = stringAccumulator.indexOf(trimmed);
        matchLen = trimmed.length;
      }

      if (matchIndex !== -1) {
        const matchEnd = matchIndex + matchLen;

        // 3. Resolve matchIndex to Doc Pos
        const getDocPos = (strIndex: number) => {
          for (const seg of segments) {
            if (strIndex >= seg.from && strIndex < seg.to) {
              return seg.nodePos + (strIndex - seg.from);
            }
          }
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].to <= strIndex) {
              return segments[i].nodePos + segments[i].text.length;
            }
          }
          return 0;
        };

        const from = getDocPos(matchIndex);
        const to = getDocPos(matchEnd);

        if (from !== to) {
          // Use highlight mark with a special color for evidence
          editor.chain()
            .setTextSelection({ from, to })
            .setHighlight({ color: '#3b82f6' })
            .scrollIntoView()
            .run();
        }
      }
    } else {
      // Clear all highlights when evidence is cleared (mouse leave)
      // Note: This removes ALL highlights. For production, use a separate mark type.
      editor.chain().selectAll().unsetHighlight().setTextSelection(0).run();
    }
  }, [highlightedEvidence, editor]);

  // NOTE: Metadata state has been moved to RightSidebar (conceptually)
  // In a real app, we would sync state via Context or lifting state up.
  // For this layout demo, Editor focuses purely on content.

  const handleAiExtraction = async () => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) return;

    setIsExtracting(true);
    setAiAnalysisStatus('AI 분석중...');
    setAiResult(null);

    try {
      await invoke('extract_info', {
        text,
        content: editor.getHTML(), // Pass HTML to preserve formatting
        title: title || undefined,
        id: activeTabId || undefined
      });
      // Refresh documents to update MetadataPanel with new tags/summary
      await fetchDocuments();
      setAiResult(null); // Clear previous result or just ignore it
      setAiAnalysisStatus(null);
    } catch (error) {
      console.error('AI Extraction Failed:', error);
      setAiAnalysisStatus('AI 분석 실패');
      setTimeout(() => setAiAnalysisStatus(null), 3000);
    } finally {
      setIsExtracting(false);
    }
  };


  if (!activeTabId) {
    return (
      <div className="flex flex-col h-full bg-zinc-900 items-center justify-center text-zinc-500">
        <FileText size={48} className="mb-4 opacity-20" />
        <p>Select a document to edit</p>
      </div>
    );
  }

  // Extract headings from editor for TOC
  const getHeadings = () => {
    if (!editor) return [];
    const headings: { level: number; text: string; pos: number }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        headings.push({
          level: node.attrs.level,
          text: node.textContent,
          pos,
        });
      }
    });
    return headings;
  };

  const scrollToHeading = (pos: number) => {
    if (!editor) return;
    editor.commands.setTextSelection(pos);

    // 1. Try nodeDOM first
    let element = editor.view.nodeDOM(pos) as HTMLElement;

    // 2. If not found or not an element, try domAtPos and traverse up
    if (!element || !(element instanceof HTMLElement)) {
      const { node } = editor.view.domAtPos(pos);
      let target = node instanceof HTMLElement ? node : node.parentElement;

      // Traverse up to find Heading element
      while (target && target !== editor.view.dom) {
        if (/^H[1-6]$/.test(target.tagName)) {
          element = target;
          break;
        }
        target = target.parentElement;
      }
    }

    if (element && element.scrollIntoView) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };


  const headings = editor ? getHeadings() : [];

  // 저장 함수
  const handleSave = async () => {
    if (!editor || !activeTabId || !activeDoc) return;

    try {
      const content = editor.getHTML();

      const req = {
        id: activeTabId,
        title: title,
        content: content,
        group_type: activeDoc.group_type || 2,
        group_id: activeDoc.group_id, // Ensure group_id is passed
        parent_id: activeDoc.parent_id, // Preserve parent_id
        document_state: activeDoc.document_state || 1,
        visibility_level: activeDoc.visibility_level || 1,
        is_favorite: activeDoc.is_favorite || false,
      };

      const savedDoc = await invoke<Document>('save_document', { req });

      // 저장 성공 후 스토어 업데이트 (서버 응답 사용)
      // 서버에서 계산된 updated_at, size 등이 포함된 savedDoc으로 업데이트해야 형상이 동기화됨.
      updateDocument(savedDoc);
      setIsDirty(false); // Reset dirty state on save

      // 저장 완료 시 localStorage draft 삭제
      const draftKey = getDraftKey(activeTabId);
      localStorage.removeItem(draftKey);

      showToast('저장되었습니다.', 'success');
      console.log('Document saved and synced successfully', savedDoc);
    } catch (error) {
      console.error('Failed to save document:', error);
      showToast('저장 실패: ' + String(error), 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative">
      {/* Action Icons */}
      <div className="flex items-center justify-between gap-1 pt-2 pl-4 pr-2 shrink-0">
        <div className='flex items-center gap-1 text-xs text-zinc-500 overflow-hidden whitespace-nowrap'>
          {(() => {
            if (!activeDoc) return null;

            // Breadcrumb Logic
            const path: Document[] = [];
            let current = activeDoc;
            // Prevent infinite loop with max depth safety
            let safety = 0;
            while (current && safety < 20) {
              path.unshift(current);
              if (current.parent_id) {
                const parent = documents.find(d => d.id === current.parent_id);
                if (parent) {
                  current = parent;
                } else {
                  break;
                }
              } else {
                break;
              }
              safety++;
            }

            // Group Label (First item)
            const groupLabel = activeDoc.group_type === 2 ? 'Private' : 'Public';

            // We want to show: Group / [Optionally ...] / Parent 2 / Parent 1 / Current
            // Limit to 3 parents + Current
            // Path includes Current. So max length = 4 items allowed.
            let displayPath = path;
            let truncated = false;

            if (path.length > 4) {
              displayPath = path.slice(-4);
              truncated = true;
            }

            return (
              <>
                <span className="shrink-0">{groupLabel}</span>
                <span className="select-none">/</span>
                {truncated && (
                  <>
                    <span className="shrink-0">...</span>
                    <span className="select-none">/</span>
                  </>
                )}
                {displayPath.map((item, idx) => {
                  const isLast = idx === displayPath.length - 1;
                  return (
                    <div key={item.id} className="flex items-center gap-1">
                      <button
                        onClick={() => useDocumentStore.getState().addTab(item)}
                        className={`hover:text-zinc-300 transition-colors ${isLast ? "text-zinc-300 font-medium cursor-default pointer-events-none" : "shrink-0 hover:underline cursor-pointer"}`}
                      >
                        {item.id === activeDoc.id ? title : item.title}
                      </button>
                      {!isLast && <span className="select-none">/</span>}
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
        <div>
          <button
            onClick={() => setIsReadOnly(!isReadOnly)}
            className={`p-2 rounded-lg transition-colors ${isReadOnly ? 'text-red-400 bg-red-900/20 hover:bg-red-900/30' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'}`}
            title={isReadOnly ? "Read-only Mode (Unlock)" : "Lock Document"}
          >
            {isReadOnly ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
          <button
            onClick={() => activeTabId && toggleFavorite(activeTabId)}
            className={`p-2 rounded-lg hover:bg-zinc-800 transition-colors ${activeDoc?.is_favorite ? 'text-yellow-400' : 'text-zinc-400 hover:text-white'}`}
            title="즐겨찾기"
          >
            <Star size={18} className={activeDoc?.is_favorite ? 'fill-current' : ''} />
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty} // Disable if not dirty
            className={`p-2 rounded-lg transition-colors ${!isDirty ? 'text-zinc-700 cursor-not-allowed' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
            title="저장 (Ctrl+S)"
          >
            <Save size={18} />
          </button>
          <button
            onClick={() => console.log('More menu clicked')}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="더보기"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex relative min-h-0 overflow-hidden">
        {/* Scroll Container */}
        <div
          className="flex-1 flex overflow-y-auto custom-scrollbar w-full relative"
          id="editor-scroll-container"
          style={{ scrollbarGutter: 'stable' }}
        >

          {/* Editor Content Container */}
          <div className="flex-1 flex flex-col items-center min-h-full">
            <div className="w-full max-w-4xl flex flex-col relative">
              {/* Title */}
              <div className="px-12 pt-10 pb-4 shrink-0">
                <input
                  type="text"
                  value={title}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      editor?.commands.focus('start');
                    }
                  }}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setTitle(newTitle);
                    setIsDirty(true); // 제목 변경 시 isDirty 활성화
                    // 탭 제목도 실시간 업데이트
                    if (activeTabId) {
                      updateTabTitle(activeTabId, newTitle);
                    }
                  }}
                  placeholder="Untitled"
                  className="w-full bg-transparent text-4xl font-bold text-white placeholder-zinc-700 focus:outline-none"
                />
              </div>

              {/* Floating Toolbar - Sticky within content */}
              <div className="px-4 py-4 sticky top-4 z-50 shrink-0">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur shadow-2xl mx-auto max-w-fit transition-all duration-300">
                  <EditorToolbar editor={editor} />
                </div>
              </div>

              {/* Editor Content Page */}
              <div className="flex-1 px-12 pb-20 w-full">
                <EditorContent
                  editor={editor}
                  className="prose prose-invert prose-lg max-w-none w-full outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] text-zinc-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* TOC Panel (Floating) */}
        {headings.length > 0 && (
          <div className="absolute top-40 right-6 w-40 shrink-0 flex flex-col max-h-[calc(100%-13rem)] z-40 pointer-events-none">
            <div className="flex-1 overflow-y-auto py-4 custom-scrollbar pointer-events-auto">
              {headings.map((heading, idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToHeading(heading.pos)}
                  className={`block w-full text-right pr-3 py-1.5 text-[11px] truncate hover:text-white cursor-pointer transition-colors border-r-2 ${heading.level === 1
                    ? 'text-zinc-200 font-medium border-red-500'
                    : heading.level === 2
                      ? 'text-zinc-400 border-transparent hover:border-zinc-600'
                      : 'text-zinc-500 border-transparent hover:border-zinc-700'
                    }`}
                  title={heading.text}
                >
                  {heading.text || '(empty)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Floating AI Action Button - Absolute relative to Outer Wrapper */}
        <div className="absolute bottom-8 right-8 z-50">
          <button
            className={`flex items-center gap-2 px-5 py-3 rounded-full font-medium shadow-xl transition-all ${isExtracting
              ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 active:scale-95'
              }`}
            onClick={handleAiExtraction}
            disabled={isExtracting}
          >
            {isExtracting ? (
              <>
                <span className="animate-spin">⟳</span>
                <span className="text-sm">분석중...</span>
              </>
            ) : (
              <>
                <Star size={18} className="fill-current" />
                <span className="text-sm">AI 분석</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};


export default CollaborativeEditor;
