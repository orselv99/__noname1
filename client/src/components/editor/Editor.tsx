import { useEditor, EditorContent, Extension } from '@tiptap/react';
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
import { findParentNode } from '@tiptap/core';

// Custom Table extension to handle arrow key navigation at table boundaries
const CustomTable = Table.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      ArrowDown: ({ editor }) => {
        const { selection } = editor.state;
        const table = findParentNode((node) => node.type.name === 'table')(selection);

        if (!table) return false;

        // Check if we're in the last row
        const tableNode = table.node;
        const lastRowIndex = tableNode.childCount - 1;

        // Find current row position within the table
        let currentRowIndex = -1;
        let offset = table.start;

        for (let i = 0; i < tableNode.childCount; i++) {
          const row = tableNode.child(i);
          const rowStart = offset;
          const rowEnd = offset + row.nodeSize;

          if (selection.from >= rowStart && selection.from < rowEnd) {
            currentRowIndex = i;
            break;
          }
          offset = rowEnd;
        }

        // If in the last row, create a paragraph after the table
        if (currentRowIndex === lastRowIndex) {
          const tableEnd = table.start + table.node.nodeSize;

          // Check if there's already content after the table
          const { doc } = editor.state;
          const nodeAfterTable = doc.nodeAt(tableEnd);

          if (!nodeAfterTable || nodeAfterTable.type.name !== 'paragraph') {
            // Insert a new paragraph after the table
            editor.chain()
              .insertContentAt(tableEnd, { type: 'paragraph' })
              .setTextSelection(tableEnd + 1)
              .focus()
              .run();
          } else {
            // Move to existing paragraph after table
            editor.chain()
              .setTextSelection(tableEnd + 1)
              .focus()
              .run();
          }
          return true;
        }

        return false; // Let default behavior handle other cases
      },
      ArrowUp: ({ editor }) => {
        const { selection } = editor.state;
        const table = findParentNode((node) => node.type.name === 'table')(selection);

        if (!table) return false;

        // Check if we're in the first row
        const tableNode = table.node;

        // Find current row position within the table
        let currentRowIndex = -1;
        let offset = table.start;

        for (let i = 0; i < tableNode.childCount; i++) {
          const row = tableNode.child(i);
          const rowStart = offset;
          const rowEnd = offset + row.nodeSize;

          if (selection.from >= rowStart && selection.from < rowEnd) {
            currentRowIndex = i;
            break;
          }
          offset = rowEnd;
        }

        // If in the first row, move to content before the table
        if (currentRowIndex === 0) {
          const tableStart = table.start;

          // Move cursor to position before the table
          if (tableStart > 1) {
            editor.chain()
              .setTextSelection(tableStart - 1)
              .focus()
              .run();
            return true;
          }
        }

        return false; // Let default behavior handle other cases
      },
    };
  },
});
import { useEffect, useState, useRef, useCallback } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { FileText, Star, Save, Lock, Unlock } from 'lucide-react';
import { EditorToolbar } from './EditorToolbar';
import { Document, DocumentState } from '../../types';
import { useToast } from '../Toast';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// --- Custom Plugin for Transient Highlighting ---
const evidencePluginKey = new PluginKey('evidence-highlight');

const EvidenceHighlightExtension = Extension.create({
  name: 'evidenceHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: evidencePluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            // Check for meta to add/remove decorations
            const meta = tr.getMeta(evidencePluginKey);
            if (meta) {
              if (meta.action === 'set') {
                return DecorationSet.create(tr.doc, meta.decorations);
              } else if (meta.action === 'clear') {
                return DecorationSet.empty;
              }
            }
            // Adjust decorations for document changes
            return oldSet.map(tr.mapping, tr.doc);
          }
        },
        props: {
          decorations(state) {
            return this.getState(state);
          }
        }
      })
    ];
  }
});

const colors = ['#958DF1', '#F98181', '#FBBC88', '#FAF594', '#70CFF8', '#94FADB', '#B9F18D'];

export const Editor = () => {
  return <div>Use CollaborativeEditor</div>;
};

const TiptapEditor = ({ ydoc, provider }: { ydoc: Y.Doc, provider: WebsocketProvider }) => {
  const { showToast } = useToast();
  const { fetchDocuments, activeTabId, highlightedEvidence, toggleFavorite, updateDocument, setAiAnalysisStatus, setLiveEditorContent, setAutoSaveStatus, updateTabTitle, markTabDirty } = useDocumentStore();

  // Memoize activeDoc to prevent unnecessary re-renders
  const activeDoc = useDocumentStore(useCallback(
    (state) => state.documents.find(d => d.id === activeTabId),
    [activeTabId]
  ));

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
        openOnClick: false,
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
      CustomTable.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      EvidenceHighlightExtension, // Add our custom extension
    ],
  });

  const [, setAiResult] = useState<any>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [title, setTitle] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);

  const getDraftKey = (docId: string) => `draft-${docId}`;

  // Sync isDirty with store for tab indicator
  useEffect(() => {
    if (activeTabId) {
      markTabDirty(activeTabId, isDirty);
    }
  }, [isDirty, activeTabId, markTabDirty]);

  // Read-only toggle
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  const lastActiveTabId = useRef<string | null>(null);
  const ignoreUpdate = useRef(false);
  const lastLoadedContent = useRef<string | null>(null);

  // Load content - optimized for fast tab switching
  useEffect(() => {
    if (!editor) return;

    if (activeTabId) {
      // Only load content if the tab has changed
      if (activeTabId === lastActiveTabId.current) {
        return;
      }
      lastActiveTabId.current = activeTabId;

      if (activeDoc) {
        const doc = activeDoc;
        ignoreUpdate.current = true; // Block update listener
        const draftKey = getDraftKey(activeTabId);
        const savedDraft = localStorage.getItem(draftKey);

        let contentToLoad: string;
        let titleToLoad: string;

        if (savedDraft) {
          try {
            const draft = JSON.parse(savedDraft);
            titleToLoad = draft.title || doc.title;
            contentToLoad = draft.content || doc.content;
          } catch (e) {
            titleToLoad = doc.title;
            contentToLoad = doc.content;
          }
        } else {
          titleToLoad = doc.title;
          contentToLoad = doc.content;
        }

        // Set title synchronously for immediate feedback
        setTitle(titleToLoad);

        // Check if content actually changed to avoid unnecessary setContent
        if (lastLoadedContent.current !== contentToLoad) {
          lastLoadedContent.current = contentToLoad;
          // Use setTimeout to defer content loading to next event loop
          // This allows the tab UI to update first, making the switch feel faster
          setTimeout(() => {
            editor.commands.setContent(contentToLoad, false);
          }, 0);
        }

        // Short delay to ensure we don't catch the echo update from Yjs if any
        setTimeout(() => {
          setIsDirty(false);
          ignoreUpdate.current = false;
        }, 50);

        // Check if recycled (deleted)
        const isRecycled = !!doc.deleted_at;
        if (isRecycled) {
          setIsReadOnly(true);
          editor.setEditable(false);
        } else {
          setIsReadOnly(false);
          editor.setEditable(true);
        }
      }
    } else {
      lastActiveTabId.current = null;
      lastLoadedContent.current = null;
      setTitle('Untitled');
      if (editor) {
        ignoreUpdate.current = true;
        editor.commands.clearContent();
        setTimeout(() => {
          setIsDirty(false);
          ignoreUpdate.current = false;
        }, 50);
      }
    }
  }, [activeTabId, activeDoc, editor]);

  // Enforce read-only for recycled docs even if user tries to toggle
  useEffect(() => {
    if (activeTabId && activeDoc) {
      if (activeDoc.deleted_at) {
        if (!isReadOnly) setIsReadOnly(true);
        if (editor && editor.isEditable) editor.setEditable(false);
      }
    }
  }, [isReadOnly, activeTabId, activeDoc, editor]);

  // Track changes
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      if (ignoreUpdate.current) return;
      setIsDirty(true);
      const state = useDocumentStore.getState();
      const currentDoc = state.documents.find(d => d.id === state.activeTabId);
      if (currentDoc && currentDoc.document_state === DocumentState.Published) {
        state.updateDocument({ ...currentDoc, document_state: DocumentState.Draft });
      }
    };
    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor]);

  // Real-time metadata update
  useEffect(() => {
    if (!editor || !activeTabId) return;
    const updateMetadata = () => {
      const currentContent = editor.getHTML();
      setLiveEditorContent(currentContent);
    };
    const timeoutId = setTimeout(updateMetadata, 300);
    return () => clearTimeout(timeoutId);
  }, [editor?.state.doc, activeTabId, setLiveEditorContent]);

  // Auto-save
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
        setAutoSaveStatus('자동저장됨');
        setTimeout(() => setAutoSaveStatus(null), 2000);
      } catch (e) {
        console.error('Draft auto-save failed:', e);
      }
    }, 5000);
    return () => clearTimeout(autoSaveTimeout);
  }, [editor?.state.doc, activeTabId, title, isDirty, setAutoSaveStatus]);

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, activeTabId, activeDoc, title, isDirty]);

  // Handle highlighting evidence (Transient + Scroll)
  useEffect(() => {
    if (!editor) return;

    if (highlightedEvidence) {
      const doc = editor.state.doc;
      const segments: { from: number; to: number; text: string; nodePos: number }[] = [];
      let stringAccumulator = "";

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

      let matchIndex = stringAccumulator.indexOf(highlightedEvidence);
      let matchLen = highlightedEvidence.length;

      if (matchIndex === -1) {
        const trimmed = highlightedEvidence.trim();
        matchIndex = stringAccumulator.indexOf(trimmed);
        matchLen = trimmed.length;
      }

      if (matchIndex !== -1) {
        const matchEnd = matchIndex + matchLen;
        const getDocPos = (strIndex: number) => {
          for (const seg of segments) {
            if (strIndex >= seg.from && strIndex < seg.to) {
              // Exact match within segment
              return seg.nodePos + (strIndex - seg.from);
            }
          }
          // Check if it's strictly at the end of a segment (which is start of next or end of doc)
          // We iterate backwards to find the segment that ends exactly here
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].to === strIndex) {
              return segments[i].nodePos + segments[i].text.length;
            }
            if (segments[i].to < strIndex) break; // Should not happen if normalized
          }
          // Default: if it's 0
          if (strIndex === 0 && segments.length > 0) return segments[0].nodePos;
          return 0;
        };

        const from = getDocPos(matchIndex);
        const to = getDocPos(matchEnd);

        if (from !== to) {
          // 1. Transient Decoration (Yellow Background)
          const decoration = Decoration.inline(from, to, {
            class: 'bg-yellow-500/30 border-b-2 border-yellow-500/50 rounded-sm' // Tailwin classes for highlight
          });

          editor.view.dispatch(
            editor.view.state.tr.setMeta(evidencePluginKey, {
              action: 'set',
              decorations: [decoration]
            })
          );

          // 2. Robust Manual Scroll
          setTimeout(() => {
            const view = editor.view;
            if (!view) return;

            // Get coordinates of the selection start
            const coords = view.coordsAtPos(from);
            const scrollContainer = document.getElementById('editor-scroll-container');

            if (scrollContainer && coords) {
              const containerRect = scrollContainer.getBoundingClientRect();
              const relativeTop = coords.top - containerRect.top;
              const currentScroll = scrollContainer.scrollTop;
              const targetScroll = currentScroll + relativeTop - (containerRect.height / 2);

              scrollContainer.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
              });
            } else {
              editor.chain().scrollIntoView().run();
            }
          }, 50);
        }
      } else {
        // Evidence provided but not found in doc -> Clear
        editor.view.dispatch(
          editor.view.state.tr.setMeta(evidencePluginKey, {
            action: 'clear'
          })
        );
      }
    } else {
      // Clear decorations
      editor.view.dispatch(
        editor.view.state.tr.setMeta(evidencePluginKey, {
          action: 'clear'
        })
      );
    }
  }, [highlightedEvidence, editor]);

  const handleAiExtraction = async () => {
    if (!editor) return;
    const text = editor.getText();
    if (!text.trim()) return;

    setIsExtracting(true);
    setAiAnalysisStatus('AI 분석중...');
    setAiResult(null);

    try {
      const res = await invoke('extract_info', {
        text,
        content: editor.getHTML(),
        title: title || undefined,
        id: activeTabId || undefined
      });
      console.log("AI Analysis Result:", res);
      await fetchDocuments();
      setAiResult(null);
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

  // ToC / Headings logic ...
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
  const headings = editor ? getHeadings() : [];

  const scrollToHeading = (pos: number) => {
    if (!editor) return;
    editor.commands.setTextSelection(pos);
    setTimeout(() => {
      const view = editor.view;
      const dom = view.nodeDOM(pos) as HTMLElement;
      const scrollContainer = document.getElementById('editor-scroll-container');
      if (dom && scrollContainer) {
        dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        editor.chain().scrollIntoView().run();
      }
    }, 50);
  };

  const handleSave = async () => {
    if (!editor || !activeTabId || !activeDoc) return;
    try {
      const content = editor.getHTML();
      const req = {
        id: activeTabId,
        title: title,
        content: content,
        group_type: activeDoc.group_type || 2,
        group_id: activeDoc.group_id,
        parent_id: activeDoc.parent_id,
        document_state: activeDoc.document_state || 1,
        visibility_level: activeDoc.visibility_level || 1,
        is_favorite: activeDoc.is_favorite || false,
        version: activeDoc.version || 1,
        summary: activeDoc.summary, // Pass summary so it isn't lost if the backend updates it
      };
      const savedDoc = await invoke<Document>('save_document', { req });

      // Merge savedDoc with existing summary/tags to prevent them from disappearing
      // (The save_document API returns None for summary/tags by default)
      const mergedDoc = {
        ...savedDoc,
        summary: activeDoc.summary, // Preserve summary
        tags: activeDoc.tags,       // Preserve tags
        creator_name: activeDoc.creator_name // Preserve creator name
      };

      updateDocument(mergedDoc);
      setIsDirty(false);
      localStorage.removeItem(getDraftKey(activeTabId));
      showToast('저장되었습니다.', 'success');
      console.log('Document saved', mergedDoc);
    } catch (error) {
      console.error('Failed to save document:', error);
      showToast('저장 실패: ' + String(error), 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative">
      {/* Header */}
      <div className="flex items-center justify-between gap-1 pt-2 pl-4 pr-2 shrink-0">
        <div className='flex items-center gap-1 text-xs text-zinc-500 overflow-hidden whitespace-nowrap'>
          {/* Simple Breadcrumb for now */}
          <span className="text-zinc-400">{activeDoc?.group_type === 2 ? 'Private' : 'Public'} / {title}</span>
        </div>
        <div>
          {activeDoc?.group_id === 'ffffffff-ffff-ffff-ffff-ffffffffffff' ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-900/50 text-red-400 select-none">
              <span className="text-[10px] font-bold tracking-wider">DELETED</span>
            </div>
          ) : (
            <>
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
              >
                <Star size={18} className={activeDoc?.is_favorite ? 'fill-current' : ''} />
              </button>
              <button
                onClick={handleSave}
                disabled={!isDirty}
                className={`p-2 rounded-lg transition-colors ${!isDirty ? 'text-zinc-700 cursor-not-allowed' : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'}`}
              >
                <Save size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex relative min-h-0 overflow-hidden">
        <div
          className="flex-1 flex overflow-y-auto custom-scrollbar w-full relative"
          id="editor-scroll-container"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="flex-1 flex flex-col items-center min-h-full">
            <div className="w-full max-w-4xl flex flex-col relative">
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
                    setIsDirty(true);
                    if (activeTabId) updateTabTitle(activeTabId, newTitle);
                  }}
                  placeholder="Untitled"
                  className="w-full bg-transparent text-4xl font-bold text-white placeholder-zinc-700 focus:outline-none"
                />
              </div>

              <div className="px-4 py-4 sticky top-4 z-50 shrink-0">
                {activeDoc?.group_id !== 'ffffffff-ffff-ffff-ffff-ffffffffffff' && (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur shadow-2xl mx-auto max-w-fit transition-all duration-300">
                    <EditorToolbar editor={editor} />
                  </div>
                )}
              </div>

              <div className="flex-1 px-12 pb-20 w-full">
                <EditorContent
                  editor={editor}
                  className="prose prose-invert prose-lg max-w-none w-full outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] text-zinc-300"
                />
              </div>
            </div>
          </div>
        </div>

        {/* TOC */}
        {headings.length > 0 && (
          <div className="absolute top-40 right-6 w-40 shrink-0 flex flex-col max-h-[calc(100%-13rem)] z-40 pointer-events-none">
            <div className="flex-1 overflow-y-auto py-4 custom-scrollbar pointer-events-auto">
              {headings.map((heading, idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToHeading(heading.pos)}
                  className={`block w-full text-right pr-3 py-1.5 text-[11px] truncate hover:text-white cursor-pointer transition-colors border-r-2 ${heading.level === 1 ? 'text-zinc-200 font-medium border-red-500' :
                    heading.level === 2 ? 'text-zinc-400 border-transparent hover:border-zinc-600' :
                      'text-zinc-500 border-transparent hover:border-zinc-700'
                    }`}
                  title={heading.text}
                >
                  {heading.text || '(empty)'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI FAB */}
        <div className="absolute bottom-8 right-8 z-50">
          <button
            className={`flex items-center gap-2 px-5 py-3 rounded-full font-medium shadow-xl transition-all ${isExtracting ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 active:scale-95'
              }`}
            onClick={handleAiExtraction}
            disabled={isExtracting}
          >
            {isExtracting ? '분석중...' : 'AI 분석'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const CollaborativeEditor = () => {
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const wsProvider = new WebsocketProvider('ws://localhost:8080/api/v1/ws/signaling', 'fiery-horizon-demo', doc);
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
};

export default CollaborativeEditor;
