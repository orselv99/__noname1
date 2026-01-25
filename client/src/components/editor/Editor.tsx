import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Superscript from '@tiptap/extension-superscript';
import { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useContentStore } from '../../stores/contentStore';
import { EditorContextMenu } from './EditorContextMenu';
import { EditorToolbar } from './EditorToolbar';
import { SearchWidget } from './SearchWidget';
import { EditorBreadcrumbs } from './EditorBreadcrumbs';
import { EditorActions } from './EditorActions';
import { EditorTOC } from './EditorTOC';
import { Document, DocumentState } from '../../types';
import { useToast } from '../Toast';
import { invoke } from '@tauri-apps/api/core';

// Import extracted extensions
import {
  EvidenceHighlightExtension,
  SearchHighlightExtension,
  FootnoteRefNode,
  CustomParagraph,
  ImageEmbedExtension,
  CustomTable,
} from './extensions';
import { useEditorSearch, useEvidenceHighlight } from './hooks';


interface SingleTabEditorProps {
  docId: string;
  isActive: boolean;
}

// 타이틀 입력을 별도 컴포넌트로 분리하여 불필요한 리렌더링 방지
interface TitleInputProps {
  initialTitle: string;
  docId: string;
  onTitleChange: (newTitle: string) => void;
  onFocusEditor: () => void;
}

const TitleInput = memo(({ initialTitle, docId, onTitleChange, onFocusEditor }: TitleInputProps) => {
  const [localTitle, setLocalTitle] = useState(initialTitle);
  const updateTabTitle = useContentStore(state => state.updateTabTitle);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevInitialTitleRef = useRef(initialTitle);
  const hasUserEditedRef = useRef(false);

  // Sync with initialTitle when it changes (e.g., after doc loads)
  useEffect(() => {
    // Only sync if user hasn't started editing OR if docId changed
    if (!hasUserEditedRef.current || prevInitialTitleRef.current === '') {
      setLocalTitle(initialTitle);
    }
    prevInitialTitleRef.current = initialTitle;
  }, [initialTitle, docId]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    hasUserEditedRef.current = true; // Mark that user has started editing
    setLocalTitle(newTitle);
    onTitleChange(newTitle);

    // Debounce store update
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      updateTabTitle(docId, newTitle);
    }, 300);
  }, [docId, onTitleChange, updateTabTitle]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onFocusEditor();
    }
  }, [onFocusEditor]);

  return (
    <input
      type="text"
      value={localTitle}
      onKeyDown={handleKeyDown}
      onChange={handleChange}
      placeholder="Untitled"
      className="w-full bg-transparent text-4xl font-bold text-white placeholder-zinc-700 focus:outline-none"
    />
  );
});

TitleInput.displayName = 'TitleInput';

/**
 * Editor - A TipTap editor instance for a single document tab.
 * Each tab has its own editor instance to enable instant tab switching.
 * When not active, the editor is hidden with display:none but kept in memory.
 */
export const Editor = memo(({ docId, isActive }: SingleTabEditorProps) => {
  const { showToast } = useToast();

  // Optimized Selectors to prevent re-render of ALL editors on ANY store change
  const highlightedEvidence = useContentStore(state => state.highlightedEvidence);
  const toggleFavorite = useContentStore(state => state.toggleFavorite);
  const updateDocument = useContentStore(state => state.updateDocument);
  const setLiveEditorContent = useContentStore(state => state.setLiveEditorContent);
  const setAutoSaveStatus = useContentStore(state => state.setAutoSaveStatus);
  const markTabDirty = useContentStore(state => state.markTabDirty);

  // Get document data for this specific editor
  const doc = useContentStore(
    useCallback((state) => state.documents.find((d: Document) => d.id === docId), [docId])
  );

  // Memoize extensions array to prevent recreation on every render
  const extensions = useMemo(() => [
    StarterKit.configure({
      // History is enabled by default for Undo/Redo (Ctrl+Z, Ctrl+Y)
      // Use CustomParagraph instead of default Paragraph
    }),
    CustomParagraph,
    FootnoteRefNode,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
    }),
    Image.configure({
      inline: true,
      allowBase64: true,
    }),
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
    Superscript,
    EvidenceHighlightExtension,
    SearchHighlightExtension,
    ImageEmbedExtension,
  ], []);

  const editor = useEditor({
    extensions,
    editorProps: {
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement;

        // 1. Check for FootnoteRef (span with data-target)
        const footnoteRef = target.closest('span[data-footnote-target]');
        if (footnoteRef) {
          const id = footnoteRef.getAttribute('data-footnote-target');
          if (id) {
            const element = document.getElementById(id);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return true;
            }
          }
        }

        const anchor = target.closest('a');
        if (anchor) {
          // Check for internal anchor links
          const href = anchor.getAttribute('href');
          const hash = anchor.hash; // Browser property, includes #

          if ((href && href.startsWith('#')) || (hash && hash.startsWith('#'))) {
            event.preventDefault();
            event.stopPropagation(); // Ensure no other handlers fire

            const id = hash ? hash.substring(1) : href!.substring(1);
            const element = document.getElementById(id);
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              return true;
            }
          }
        }
        return false;
      }
    },
    content: '', // Will be set on mount
  });

  const [title, setTitle] = useState(() => doc?.title || '');
  const [isDirty, setIsDirty] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const ignoreUpdate = useRef(false);
  const contentLoaded = useRef(false);

  // Search & Evidence Hooks
  const {
    showSearch,
    setShowSearch,
    currentMatchIndex,
    totalMatches,
    handleSearch,
    handleReplace,
    handleReplaceAll,
    navigateSearch
  } = useEditorSearch(editor, isActive);

  useEvidenceHighlight(editor, isActive, highlightedEvidence);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);

  const getDraftKey = (id: string) => `draft-${id}`;

  // Sync isDirty with store for tab indicator
  useEffect(() => {
    if (isActive) {
      markTabDirty(docId, isDirty);
    }
  }, [isDirty, docId, isActive, markTabDirty]);

  // Read-only toggle
  useEffect(() => {
    if (editor) {
      editor.setEditable(!isReadOnly);
    }
  }, [editor, isReadOnly]);

  // Load content ONCE on mount
  useEffect(() => {
    if (!editor || !doc || contentLoaded.current) return;

    contentLoaded.current = true;
    ignoreUpdate.current = true;

    const draftKey = getDraftKey(docId);
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

    setTitle(titleToLoad);
    editor.commands.setContent(contentToLoad, false);

    // Push content to metadata panel after loading
    if (isActive) {
      setLiveEditorContent(contentToLoad);
    }

    setTimeout(() => {
      setIsDirty(false);
      ignoreUpdate.current = false;
    }, 50);

    // Check if recycled (deleted)
    const isRecycled = !!doc.deleted_at;
    if (isRecycled) {
      setIsReadOnly(true);
      editor.setEditable(false);
    }
  }, [editor, doc, docId, isActive, setLiveEditorContent]);

  // Track changes
  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      if (ignoreUpdate.current) return;
      setIsDirty(true);
      if (doc && doc.document_state === DocumentState.Published) {
        updateDocument({ ...doc, document_state: DocumentState.Draft });
      }
    };
    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, doc, updateDocument]);

  // Real-time metadata update (only when active)
  useEffect(() => {
    if (!editor || !isActive) return;

    const pushContent = () => {
      const currentContent = editor.getHTML();
      setLiveEditorContent(currentContent);
    };

    // Push content immediately when tab becomes active
    // Performance: Delay slightly to allow tab switch animation/render to complete first
    // This prevents blocking the UI thread with getHTML() and MetadataPanel parsing during the transition
    const timer = setTimeout(() => {
      pushContent();
    }, 50);

    // Debounce metadata updates on editor changes
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const debouncedUpdate = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(pushContent, 300);
    };

    editor.on('update', debouncedUpdate);
    return () => {
      clearTimeout(timer);
      if (timeoutId) clearTimeout(timeoutId);
      editor.off('update', debouncedUpdate);
      // Clear content when tab becomes inactive
      setLiveEditorContent(null);
    };
  }, [editor, isActive, setLiveEditorContent]);

  // Auto-save (triggered by editor changes, not on every render)
  useEffect(() => {
    if (!editor || !isDirty) return;

    let autoSaveTimeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleAutoSave = () => {
      if (autoSaveTimeoutId) clearTimeout(autoSaveTimeoutId);
      autoSaveTimeoutId = setTimeout(() => {
        const currentContent = editor.getHTML();
        const draftKey = getDraftKey(docId);
        try {
          const draft = {
            title,
            content: currentContent,
            savedAt: new Date().toISOString()
          };
          localStorage.setItem(draftKey, JSON.stringify(draft));
          if (isActive) {
            setAutoSaveStatus('자동저장됨');
            setTimeout(() => setAutoSaveStatus(null), 2000);
          }
        } catch (e) {
          console.error('Draft auto-save failed:', e);
        }
      }, 5000);
    };

    editor.on('update', handleAutoSave);
    return () => {
      if (autoSaveTimeoutId) clearTimeout(autoSaveTimeoutId);
      editor.off('update', handleAutoSave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docId, isDirty, isActive, setAutoSaveStatus]); // title is accessed inside closure

  // Shortcuts (only when active)
  useEffect(() => {
    if (!isActive) return;
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
  }, [editor, doc, title, isDirty, isActive]);

  // ToC / Headings logic
  const [headings, setHeadings] = useState<{ level: number; text: string; pos: number }[]>([]);

  useEffect(() => {
    if (!editor) return;

    const updateHeadings = () => {
      const newHeadings: { level: number; text: string; pos: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
          newHeadings.push({
            level: node.attrs.level,
            text: node.textContent,
            pos,
          });
        }
      });
      setHeadings(newHeadings);
    };

    updateHeadings(); // Initial load
    editor.on('update', updateHeadings);

    return () => {
      editor.off('update', updateHeadings);
    };
  }, [editor]);

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
    if (!editor || !doc) return;
    try {
      const content = editor.getHTML();
      console.log('Saving document content length:', content.length);
      console.log('Content snippet:', content.substring(0, 100)); // Log start of content

      const req = {
        id: docId,
        title: title,
        content: content,
        group_type: doc.group_type || 2,
        group_id: doc.group_id,
        parent_id: doc.parent_id,
        document_state: doc.document_state || 1,
        visibility_level: doc.visibility_level || 1,
        is_favorite: doc.is_favorite || false,
        version: doc.version || 0,
        summary: doc.summary,
      };
      const savedDoc = await invoke<Document>('save_document', { req });

      const mergedDoc = {
        ...savedDoc,
        summary: doc.summary,
        tags: doc.tags,
        creator_name: doc.creator_name
      };

      updateDocument(mergedDoc);
      setIsDirty(false);
      localStorage.removeItem(getDraftKey(docId));
      showToast('저장되었습니다', 'success');
      console.log('Document saved successfully, new size:', savedDoc.size);
    } catch (error) {
      console.error('Failed to save document:', error);
      showToast('저장 실패: ' + String(error), 'error');
    }
  };

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  if (!doc) {
    return null; // Don't render if document doesn't exist
  }

  return (
    <div
      className="flex flex-col h-full bg-zinc-950 relative"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      <style>{`
        @media print {
          @page {
            margin: 2cm;
            size: auto;
          }
          html, body {
            visibility: hidden;
            background: white !important;
            height: auto !important;
            overflow: visible !important;
          }
          #printable-area {
            visibility: visible;
            position: fixed !important; /* Fixed relative to viewport/page to escape parent constraints */
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            bottom: auto !important;
            width: 100% !important;
            max-width: none !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            overflow: visible !important;
            display: block !important;
            z-index: 9999;
          }
          #printable-area * {
            visibility: visible;
          }
          /* Ensure content takes full width */
          #printable-area > div {
            width: 100% !important;
            max-width: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          /* Reset prose width constraint */
          .prose {
            max-width: none !important;
            width: 100% !important;
          }
          /* Ensure text colors are printed */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          /* Hide non-printable elements */
          .no-print, .print\\:hidden {
            display: none !important;
          }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between gap-1 pt-2 pl-4 pr-2 shrink-0">
        <EditorBreadcrumbs currentDoc={doc} />
        <div>
          <EditorActions
            doc={doc}
            isReadOnly={isReadOnly}
            onToggleReadOnly={() => setIsReadOnly(!isReadOnly)}
            onToggleFavorite={() => toggleFavorite(docId)}
            onPrint={handlePrint}
            onSave={handleSave}
            isDirty={isDirty}
          />
        </div>
      </div>

      <div className="flex-1 flex relative min-h-0 overflow-hidden">
        <div
          className="flex-1 flex overflow-y-auto custom-scrollbar w-full relative"
          id="editor-scroll-container"
          style={{ scrollbarGutter: 'stable' }}
        >
          <div className="flex-1 flex flex-col items-center min-h-full">
            <div className="w-full max-w-4xl flex flex-col relative" id="printable-area">
              <div className="px-12 pt-10 pb-4 shrink-0 print:px-0">
                <TitleInput
                  initialTitle={title}
                  docId={docId}
                  onTitleChange={(newTitle) => {
                    setTitle(newTitle);
                    setIsDirty(true);
                  }}
                  onFocusEditor={() => editor?.commands.focus('start')}
                />
              </div>

              <div className="px-4 py-4 sticky top-4 z-50 shrink-0 flex justify-center pointer-events-none print:hidden">
                <div className="pointer-events-auto">
                  {!doc?.deleted_at && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur shadow-2xl mx-auto max-w-fit transition-all duration-300">
                      <EditorToolbar editor={editor} />
                    </div>
                  )}
                </div>
              </div>

              <div
                className="flex-1 px-12 pb-20 w-full print:px-0"
                onContextMenu={(e) => {
                  if (!editor) return;
                  e.preventDefault();
                  const { from, to } = editor.state.selection;
                  const selectedText = from !== to ? editor.state.doc.textBetween(from, to, ' ') : '';
                  setContextMenu({ x: e.clientX, y: e.clientY, selectedText });
                }}
              >
                <EditorContent
                  editor={editor}
                  className="prose prose-invert prose-lg max-w-none w-full outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[500px] text-zinc-300 print:text-black"
                />
              </div>

              {/* Watermark - Only visible in print */}
              <div className="fixed inset-0 pointer-events-none hidden print:flex items-center justify-center opacity-10 z-50" style={{ transform: 'rotate(-45deg)' }}>
                <div className="text-[150px] font-bold text-gray-500 whitespace-nowrap select-none">
                  CONFIDENTIAL
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* TOC */}
        <EditorTOC headings={headings} scrollToHeading={scrollToHeading} />


      </div>

      {
        showSearch && (
          <div className="absolute top-15 right-5 z-60">
            <SearchWidget
              onSearch={handleSearch}
              onNext={() => navigateSearch('next')}
              onPrev={() => navigateSearch('prev')}
              onReplace={handleReplace}
              onReplaceAll={handleReplaceAll}
              onClose={() => {
                setShowSearch(false);
                handleSearch('', { caseSensitive: false, wholeWord: false, isRegex: false });
                editor?.commands.focus();
              }}
              matchIndex={currentMatchIndex}
              totalMatches={totalMatches}
            />
          </div>
        )
      }

      {/* Custom Context Menu */}
      {
        contextMenu && (
          <EditorContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            selectedText={contextMenu.selectedText}
            editor={editor}
            onClose={() => setContextMenu(null)}
            onAddFootnote={(_text) => {
              if (!editor) return;

              // 1. Count existing footnotes using same logic as toolbar (regex for [N] pattern)
              const text = editor.getText();
              const regex = /\[(\d+)\]/g;
              let maxNum = 0;
              let match;
              while ((match = regex.exec(text)) !== null) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
              }
              const nextNum = maxNum + 1;
              const ref = `[${nextNum}]`;
              const fnId = `fn-${nextNum}`;
              const refId = `ref-${nextNum}`;

              // 2. Insert reference at cursor using same HTML as toolbar
              const { to } = editor.state.selection;
              editor.chain()
                .focus()
                .setTextSelection(to)
                .insertContent(`<span data-footnote-target="${fnId}" id="${refId}" class="footnote-ref text-blue-500 cursor-pointer font-medium"><sup>${ref}</sup></span> `)
                .run();

              // 3. Add footnote section at document end (same format as toolbar)
              const html = editor.getHTML();
              const hasSeparator = html.includes('<hr');

              let appendHtml = '';
              if (!hasSeparator) {
                appendHtml += '<hr class="my-4 border-zinc-700" contenteditable="false">';
              }

              // Add the footnote content (same styling as toolbar, but empty for user to fill)
              appendHtml += `<p id="${fnId}" class="text-xs text-zinc-500 !m-0 !p-0 !indent-0 leading-tight" contenteditable="false">
                <span data-footnote-target="${refId}" class="footnote-ref text-blue-500 hover:text-blue-600 cursor-pointer font-medium"><sup>${ref}</sup></span>
                <span class="ml-1"> </span>
              </p>`;

              // Append to end
              const endPos = editor.state.doc.content.size;
              editor.chain().insertContentAt(endPos, appendHtml).run();

              // 4. Move cursor to footnote for user to type content
              setTimeout(() => {
                const newDocEnd = editor.state.doc.content.size;
                editor.chain()
                  .focus()
                  .setTextSelection(newDocEnd - 1)
                  .scrollIntoView()
                  .run();
              }, 50);
            }}
            onOpenRag={() => {
              // TODO: Implement RAG search - could emit event or call store
              console.log('Open RAG with:', contextMenu.selectedText);
            }}
          />
        )
      }
    </div >
  );
});

Editor.displayName = 'SingleTabEditor';
