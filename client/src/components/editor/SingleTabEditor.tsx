import { useEditor, EditorContent, Extension, Mark, mergeAttributes } from '@tiptap/react';
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
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Superscript from '@tiptap/extension-superscript';
import Paragraph from '@tiptap/extension-paragraph';
import { findParentNode } from '@tiptap/core';
import { useEffect, useState, useRef, useCallback, memo, useMemo } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { Star, Save, Lock, Unlock } from 'lucide-react';
import { EditorToolbar } from './EditorToolbar';
import { Document, DocumentState } from '../../types';
import { useToast } from '../Toast';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { invoke } from '@tauri-apps/api/core';

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
            const meta = tr.getMeta(evidencePluginKey);
            if (meta) {
              if (meta.action === 'set') {
                return DecorationSet.create(tr.doc, meta.decorations);
              } else if (meta.action === 'clear') {
                return DecorationSet.empty;
              }
            }
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

// Custom Footnote Reference Mark
const FootnoteRef = Mark.create({
  name: 'footnoteRef',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'footnote-ref text-blue-500 cursor-pointer font-medium',
      },
    }
  },

  addAttributes() {
    return {
      'data-footnote-target': {
        default: null,
      },
      id: {
        default: null,
      },
      class: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-footnote-target]',
      },
      {
        tag: 'span.footnote-ref',
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  }
});

// Custom Extensions to allow attributes
const CustomParagraph = Paragraph.extend({
  addAttributes() {
    return {
      class: {
        default: null,
      },
      id: {
        default: null,
      },
      style: {
        default: null,
      },
      contenteditable: {
        default: null,
      },
    }
  }
});



// --- Custom Extension for Auto-Embedding Pasted/Dropped Images ---
const ImageEmbedExtension = Extension.create({
  name: 'imageEmbed',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('image-embed'),
        props: {
          // Handle paste events
          handlePaste: (_view, event) => {
            // First check for pasted files (e.g., screenshot from clipboard)
            const files = event.clipboardData?.files;
            if (files && files.length > 0) {
              const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
              if (imageFiles.length > 0) {
                event.preventDefault();

                imageFiles.forEach(file => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result as string;
                    editor.chain().focus().setImage({ src: dataUrl }).run();
                  };
                  reader.readAsDataURL(file);
                });

                return true;
              }
            }

            // For HTML paste with external images, let paste happen normally,
            // then scan and replace external URLs
            const html = event.clipboardData?.getData('text/html');
            if (!html) return false;

            // Check if there are external images
            const hasExternalImages = /src=["']https?:\/\/[^"']+["']/i.test(html);
            if (!hasExternalImages) return false;

            console.log('Detected external images in pasted HTML, will process after paste');

            // Let the paste happen normally (return false), 
            // then process after a short delay
            setTimeout(async () => {
              console.log('Scanning editor for external images to embed...');

              const { state } = editor;
              let hasChanges = false;

              const imagesToProcess: { pos: number; src: string }[] = [];

              // Scan document for external images
              state.doc.descendants((node, pos) => {
                if (node.type.name === 'image') {
                  const src = node.attrs.src;
                  if (src && !src.startsWith('data:') && (src.startsWith('http://') || src.startsWith('https://'))) {
                    imagesToProcess.push({ pos, src });
                  }
                }
              });

              if (imagesToProcess.length === 0) return;

              console.log(`Found ${imagesToProcess.length} images to process`);

              // Process images one by one to avoid race conditions
              for (const { pos, src } of imagesToProcess) {
                try {
                  console.log('Downloading image:', src);
                  const dataUrl = await invoke<string>('download_image', { url: src });

                  if (dataUrl && dataUrl.startsWith('data:')) {
                    console.log('Image downloaded, updating node at pos:', pos);

                    // Always get fresh transaction/state to avoid mapping issues
                    editor.view.dispatch(
                      editor.state.tr.setNodeMarkup(pos, undefined, {
                        ...editor.state.doc.nodeAt(pos)?.attrs,
                        src: dataUrl
                      })
                    );
                    hasChanges = true;
                  }
                } catch (error) {
                  console.error('Failed to embed:', src, error);
                }
              }

              if (hasChanges) {
                console.log('All images processed and updated');
                // Trigger a generic update to ensure dirty state if needed
                // (dispatching transactions above should already do this, but just in case)
              }
            }, 100);

            // Let the paste happen normally
            return false;
          },

          // Handle drag-drop events
          handleDrop: (_view, event, _slice, moved) => {
            console.log('handleDrop triggered - moved:', moved);

            // Only handle if not moved from within editor
            if (moved) return false;

            const files = event.dataTransfer?.files;
            console.log('Drop files count:', files?.length, 'types:', event.dataTransfer?.types);

            if (!files || files.length === 0) return false;

            const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
            console.log('Image files to process:', imageFiles.length, imageFiles.map(f => f.name));

            if (imageFiles.length === 0) return false;

            event.preventDefault();

            imageFiles.forEach(file => {
              console.log('Reading file:', file.name, file.type, file.size);
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                console.log('FileReader complete, inserting image');
                editor.chain().focus().setImage({ src: dataUrl }).run();
                console.log('Image inserted via drag-drop');
              };
              reader.onerror = (e) => console.error('FileReader error:', e);
              reader.readAsDataURL(file);
            });

            return true;
          }
        }
      })
    ];
  }
});

// Custom Table extension to handle arrow key navigation at table boundaries
const CustomTable = Table.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      ArrowDown: ({ editor }) => {
        const { selection } = editor.state;
        const table = findParentNode((node) => node.type.name === 'table')(selection);

        if (!table) return false;

        const tableNode = table.node;
        const lastRowIndex = tableNode.childCount - 1;

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

        if (currentRowIndex === lastRowIndex) {
          const tableEnd = table.start + table.node.nodeSize;
          const { doc } = editor.state;
          const nodeAfterTable = doc.nodeAt(tableEnd);

          if (!nodeAfterTable || nodeAfterTable.type.name !== 'paragraph') {
            editor.chain()
              .insertContentAt(tableEnd, { type: 'paragraph' })
              .setTextSelection(tableEnd + 1)
              .focus()
              .run();
          } else {
            editor.chain()
              .setTextSelection(tableEnd + 1)
              .focus()
              .run();
          }
          return true;
        }

        return false;
      },
      ArrowUp: ({ editor }) => {
        const { selection } = editor.state;
        const table = findParentNode((node) => node.type.name === 'table')(selection);

        if (!table) return false;

        const tableNode = table.node;

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

        if (currentRowIndex === 0) {
          const tableStart = table.start;

          if (tableStart > 1) {
            editor.chain()
              .setTextSelection(tableStart - 1)
              .focus()
              .run();
            return true;
          }
        }

        return false;
      },
    };
  },
});

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
  const { updateTabTitle } = useDocumentStore();
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
 * SingleTabEditor - A TipTap editor instance for a single document tab.
 * Each tab has its own editor instance to enable instant tab switching.
 * When not active, the editor is hidden with display:none but kept in memory.
 */
export const SingleTabEditor = memo(({ docId, isActive }: SingleTabEditorProps) => {
  const { showToast } = useToast();
  const { fetchDocuments, highlightedEvidence, toggleFavorite, updateDocument, aiAnalysisStatus, setAiAnalysisStatus, setLiveEditorContent, setAutoSaveStatus, markTabDirty, addTab } = useDocumentStore();

  // Get document data for this specific editor
  const doc = useDocumentStore(
    useCallback((state) => state.documents.find((d: Document) => d.id === docId), [docId])
  );

  // Get all documents for breadcrumbs hierarchy
  const documents = useDocumentStore(state => state.documents);

  // Build breadcrumbs path from current document up to root
  const breadcrumbs = useMemo(() => {
    if (!doc) return [];

    const path: { id: string; title: string }[] = [];
    let currentDoc = doc;

    // Traverse up the parent chain (max 10 levels to prevent infinite loop)
    for (let i = 0; i < 10 && currentDoc; i++) {
      path.unshift({ id: currentDoc.id, title: currentDoc.title || 'Untitled' });

      if (!currentDoc.parent_id) break;

      const parentDoc = documents.find(d => d.id === currentDoc!.parent_id);
      if (!parentDoc) break;
      currentDoc = parentDoc;
    }

    return path;
  }, [doc, documents]);

  // Handle breadcrumb click - open the document in a tab
  const handleBreadcrumbClick = useCallback((breadcrumbDocId: string) => {
    if (breadcrumbDocId === docId) return; // Already on this document
    const targetDoc = documents.find(d => d.id === breadcrumbDocId);
    if (targetDoc) {
      addTab(targetDoc);
    }
  }, [docId, documents, addTab]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // Disabled since we're not using collaboration per-tab
        // Use CustomParagraph instead
      }),
      CustomParagraph,
      FootnoteRef,
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
      Superscript, // Standard Superscript is fine now
      EvidenceHighlightExtension,
      ImageEmbedExtension,
    ],
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

  const [, setAiResult] = useState<any>(null);
  const [title, setTitle] = useState(() => doc?.title || '');
  const [isDirty, setIsDirty] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const ignoreUpdate = useRef(false);
  const contentLoaded = useRef(false);

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
    pushContent();

    // Debounce metadata updates on editor changes
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const debouncedUpdate = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(pushContent, 300);
    };

    editor.on('update', debouncedUpdate);
    return () => {
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

  // Handle highlighting evidence (only when active)
  useEffect(() => {
    if (!editor || !isActive) return;

    if (highlightedEvidence) {
      const editorDoc = editor.state.doc;
      const segments: { from: number; to: number; text: string; nodePos: number }[] = [];
      let stringAccumulator = "";

      editorDoc.descendants((node, pos) => {
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

      // Fallback 1: Try trimmed version
      if (matchIndex === -1) {
        const trimmed = highlightedEvidence.trim();
        matchIndex = stringAccumulator.indexOf(trimmed);
        matchLen = trimmed.length;
      }

      // Fallback 2: Try fuzzy matching - find significant words
      if (matchIndex === -1) {
        // Extract significant words (3+ chars, exclude common Korean particles)
        const words = highlightedEvidence
          .split(/[\s.,!?;:'"()[\]{}]+/)
          .filter(w => w.length >= 3)
          .filter(w => !['이다', '있다', '하다', '되다', '이며', '있으며', '한다', '된다'].includes(w))
          .slice(0, 8);

        console.log('Fuzzy search words:', words);

        for (const word of words) {
          const wordIndex = stringAccumulator.indexOf(word);
          if (wordIndex !== -1) {
            console.log(`Found word "${word}" at index ${wordIndex}`);
            matchIndex = wordIndex;
            matchLen = Math.min(100, highlightedEvidence.length);
            break;
          }
        }
      }

      // Fallback 3: If still not found, try to find the tag name itself
      if (matchIndex === -1) {
        // The highlightedEvidence might be the evidence, but we can also search for any Korean proper noun
        const koreanWords = highlightedEvidence.match(/[가-힣]{2,}/g) || [];
        for (const word of koreanWords) {
          if (word.length >= 2) {
            const wordIndex = stringAccumulator.indexOf(word);
            if (wordIndex !== -1) {
              console.log(`Found Korean word "${word}" at index ${wordIndex}`);
              matchIndex = wordIndex;
              matchLen = word.length + 30;
              break;
            }
          }
        }
      }

      console.log(`Final match: index=${matchIndex}, len=${matchLen}`);

      if (matchIndex !== -1) {
        const matchEnd = matchIndex + matchLen;
        const getDocPos = (strIndex: number) => {
          for (const seg of segments) {
            if (strIndex >= seg.from && strIndex < seg.to) {
              return seg.nodePos + (strIndex - seg.from);
            }
          }
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].to === strIndex) {
              return segments[i].nodePos + segments[i].text.length;
            }
            if (segments[i].to < strIndex) break;
          }
          if (strIndex === 0 && segments.length > 0) return segments[0].nodePos;
          return 0;
        };

        const from = getDocPos(matchIndex);
        const to = getDocPos(matchEnd);

        if (from !== to) {
          const decoration = Decoration.inline(from, to, {
            class: 'bg-yellow-500/30 border-b-2 border-yellow-500/50 rounded-sm'
          });

          editor.view.dispatch(
            editor.view.state.tr.setMeta(evidencePluginKey, {
              action: 'set',
              decorations: [decoration]
            })
          );

          setTimeout(() => {
            const view = editor.view;
            if (!view) return;

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
        editor.view.dispatch(
          editor.view.state.tr.setMeta(evidencePluginKey, {
            action: 'clear'
          })
        );
      }
    } else {
      editor.view.dispatch(
        editor.view.state.tr.setMeta(evidencePluginKey, {
          action: 'clear'
        })
      );
    }
  }, [highlightedEvidence, editor, isActive]);

  const handleAiExtraction = async () => {
    if (!editor || !doc) return;
    const text = editor.getText();
    if (!text.trim()) return;

    setAiAnalysisStatus('AI 분석중...');
    setAiResult(null);

    try {
      const res = await invoke('extract_info', {
        text,
        content: editor.getHTML(),
        title: title || undefined,
        id: docId || undefined
      });
      console.log("AI Analysis Result:", res);
      await fetchDocuments();
      setAiResult(null);
      setAiAnalysisStatus(null);
    } catch (error) {
      console.error('AI Extraction Failed:', error);
      setAiAnalysisStatus('AI 분석 실패');
      setTimeout(() => setAiAnalysisStatus(null), 3000);
    }
  };

  // ToC / Headings logic
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
        version: doc.version || 1,
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
      showToast('저장되었습니다.', 'success');
      console.log('Document saved successfully, new size:', savedDoc.size);
    } catch (error) {
      console.error('Failed to save document:', error);
      showToast('저장 실패: ' + String(error), 'error');
    }
  };

  if (!doc) {
    return null; // Don't render if document doesn't exist
  }

  return (
    <div
      className="flex flex-col h-full bg-zinc-950 relative"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-1 pt-2 pl-4 pr-2 shrink-0">
        <div className='flex items-center gap-1 text-xs text-zinc-500 overflow-hidden whitespace-nowrap'>
          <span className="text-zinc-400">{doc?.group_type === 2 ? 'Private' : 'Public'}</span>
          {breadcrumbs.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center">
              <span className="mx-1 text-zinc-600">/</span>
              {index === breadcrumbs.length - 1 ? (
                // Current document - not clickable
                <span className="text-zinc-300 font-medium truncate max-w-[200px]">{crumb.title}</span>
              ) : (
                // Ancestor document - clickable
                <button
                  onClick={() => handleBreadcrumbClick(crumb.id)}
                  className="text-zinc-400 hover:text-blue-400 hover:underline truncate max-w-[150px] transition-colors"
                  title={crumb.title}
                >
                  {crumb.title}
                </button>
              )}
            </span>
          ))}
        </div>
        <div>
          {doc?.deleted_at ? (
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
                onClick={() => toggleFavorite(docId)}
                className={`p-2 rounded-lg hover:bg-zinc-800 transition-colors ${doc?.is_favorite ? 'text-yellow-400' : 'text-zinc-400 hover:text-white'}`}
              >
                <Star size={18} className={doc?.is_favorite ? 'fill-current' : ''} />
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

              <div className="px-4 py-4 sticky top-4 z-50 shrink-0">
                {!doc?.deleted_at && (
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
            className={`flex items-center gap-2 px-5 py-3 rounded-full font-medium shadow-xl transition-all ${aiAnalysisStatus ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 active:scale-95'
              }`}
            onClick={handleAiExtraction}
            disabled={!!aiAnalysisStatus}
          >
            {aiAnalysisStatus || 'AI 분석'}
          </button>
        </div>
      </div>
    </div>
  );
});

SingleTabEditor.displayName = 'SingleTabEditor';
