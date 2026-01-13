import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { Document, GroupType, SaveDocumentRequest, DocumentState, VisibilityLevel, ListDocumentsResponse, UserInfo } from '../types';

export interface Tab {
  id: string; // usually document id
  docId: string;
  title: string;
  isDirty?: boolean;
}

interface DocumentStore {
  documents: Document[];
  isLoading: boolean;
  error: string | null;

  // Tabs
  tabs: Tab[];
  activeTabId: string | null;

  // UI State
  highlightedEvidence: string | null;

  // 실시간 에디터 콘텐츠 (저장되지 않은 상태, 메타데이터 패널용)
  liveEditorContent: string | null;

  // AI 분석 상태
  aiAnalysisStatus: string | null;
  // 자동저장 상태
  autoSaveStatus: string | null;
  newDocTrigger: number;
  triggerNewDocument: () => void;

  // Actions
  lastSyncedAt: number | null; // Added for incremental sync

  // Actions
  fetchDocuments: () => Promise<void>;
  addDocument: (doc: Document) => void;
  updateDocument: (doc: Document) => void;
  saveDocument: (doc: Document) => Promise<void>;
  toggleFavorite: (docId: string) => Promise<void>;
  createDocument: (title?: string, groupId?: string, groupType?: GroupType, parentId?: string, defaultVisibility?: number) => Promise<void>;
  deleteDocument: (docId: string) => Promise<void>;
  restoreDocument: (docId: string) => Promise<void>;
  renameDocument: (docId: string, newTitle: string) => Promise<void>;

  // User
  currentUser: UserInfo | null;
  setCurrentUser: (user: UserInfo) => void;

  // Tab Actions
  addTab: (doc: Document) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (newTabs: Tab[]) => void;
  updateTabTitle: (tabId: string, newTitle: string) => void;
  setHighlightedEvidence: (text: string | null) => void;
  addTagToDocument: (docId: string, tag: string, evidence?: string) => Promise<void>;
  removeTagFromDocument: (docId: string, tagIndex: number) => Promise<void>;
  setAiAnalysisStatus: (status: string | null) => void;
  setAutoSaveStatus: (status: string | null) => void;
  setLiveEditorContent: (content: string | null) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  emptyRecycleBin: () => Promise<void>;
}

export const useDocumentStore = create<DocumentStore>()(
  persist(
    (set, get) => ({
      documents: [],
      isLoading: false,
      error: null,
      lastSyncedAt: null,

      tabs: [],
      activeTabId: null,
      highlightedEvidence: null,
      liveEditorContent: null,
      aiAnalysisStatus: null,
      autoSaveStatus: null,
      newDocTrigger: 0,
      triggerNewDocument: () => set((state) => ({ newDocTrigger: state.newDocTrigger + 1 })),

      fetchDocuments: async () => {
        set({ isLoading: true, error: null });
        try {
          // If we have no documents, force full sync regardless of lastSyncedAt
          const currentDocs = get().documents;
          const lastOne = get().lastSyncedAt;
          const effectiveLastSync = currentDocs.length > 0 ? lastOne : null;

          const response = await invoke<ListDocumentsResponse>('list_documents', {
            groupType: null,
            groupId: null,
            lastSyncedAt: effectiveLastSync
          });

          const deltaDocs = response.docs;
          const serverTime = response.last_synced_at;

          if (deltaDocs.length > 0) {
            console.log(`Fetched ${deltaDocs.length} documents from server`);
            deltaDocs.forEach(d => {
              if (d.content && d.content.length > 0) {
                console.log(`Doc [${d.title}] content length: ${d.content.length}`);
              } else {
                console.log(`Doc [${d.title}] has EMPTY content`);
              }
            });
          }

          set((state) => {
            let newDocs = [...state.documents];

            if (effectiveLastSync) {
              // Merge delta - preserve existing data if server returns null/empty
              console.log(`Incremental sync: received ${deltaDocs.length} updates`);
              deltaDocs.forEach(d => {
                const idx = newDocs.findIndex(e => e.id === d.id);
                if (idx !== -1) {
                  // Merge: preserve existing summary/tags if new ones are empty
                  const existing = newDocs[idx];
                  newDocs[idx] = {
                    ...d,
                    summary: d.summary || existing.summary,
                    tags: (d.tags && d.tags.length > 0) ? d.tags : existing.tags,
                    updated_at: d.updated_at || existing.updated_at,
                    created_at: d.created_at || existing.created_at,
                  };
                } else {
                  newDocs.push(d);
                }
              });
            } else {
              // Full replace
              console.log(`Full sync: received ${deltaDocs.length} documents`);
              newDocs = deltaDocs;
            }

            // Update tabs titles if changed
            const newTabs = state.tabs.map(tab => {
              const found = newDocs.find(d => d.id === tab.docId);
              return found ? { ...tab, title: found.title } : tab;
            });

            return {
              documents: newDocs,
              tabs: newTabs,
              isLoading: false,
              lastSyncedAt: serverTime
            };
          });

          // 탭이 없으면 첫 번째 문서를 자동으로 열기
          const state = get();
          if (state.tabs.length === 0 && state.documents.length > 0) {
            get().addTab(state.documents[0]);
          }
        } catch (error) {
          console.error('Failed to fetch documents:', error);
          set({ error: String(error), isLoading: false });
        }
      },

      addDocument: (doc) => {
        set((state) => ({ documents: [...state.documents, doc] }));
      },

      updateDocument: (updatedDoc) => {
        set((state) => ({
          documents: state.documents.map((d) =>
            d.id === updatedDoc.id ? updatedDoc : d
          ),
          // Automatically update tab title if it exists
          tabs: state.tabs.map(t =>
            t.docId === updatedDoc.id ? { ...t, title: updatedDoc.title } : t
          )
        }));
      },

      saveDocument: async (doc) => {
        // Optimistic update
        get().updateDocument(doc);

        try {
          // Version Handling:
          // 1. If not published, keep current version (don't increment).
          // 2. If published, increment version (start at 1 if 0).
          let newVersion = doc.version || 0;
          if (doc.document_state === DocumentState.Published) {
            newVersion += 1;
          }

          const req: SaveDocumentRequest = {
            id: doc.id,
            title: doc.title,
            content: doc.content,
            summary: doc.summary,
            group_type: doc.group_type,
            group_id: doc.group_id,
            parent_id: doc.parent_id,
            document_state: doc.document_state,
            visibility_level: doc.visibility_level,
            is_favorite: doc.is_favorite,
            tags: doc.tags,
            version: newVersion,
            creator_name: doc.creator_name
          };
          const savedDoc = await invoke<Document>('save_document', { req });

          // 서버 응답에서 AI 필드(summary, tags)가 누락될 경우 기존 데이터 보존
          // 백엔드에서 부분 업데이트 시 이 필드들을 반환하지 않을 수 있음
          const mergedDoc = {
            ...savedDoc,
            summary: savedDoc.summary || doc.summary,
            tags: (savedDoc.tags && savedDoc.tags.length > 0) ? savedDoc.tags : doc.tags,
            creator_name: savedDoc.creator_name || doc.creator_name,
            // Preserve parent_id if backend doesn't return it
            parent_id: savedDoc.parent_id !== undefined ? savedDoc.parent_id : doc.parent_id,
          };

          get().updateDocument(mergedDoc);
        } catch (error) {
          console.error("Failed to save document:", error);
          // Revert optimistic update by fetching latest state from DB (which might have been rolled back)
          get().fetchDocuments();
          throw error; // Re-throw so caller knows it failed
        }
      },

      toggleFavorite: async (docId) => {
        const doc = get().documents.find(d => d.id === docId);
        if (!doc) return;

        const updatedDoc = { ...doc, is_favorite: !doc.is_favorite };
        // Optimistic update
        get().updateDocument(updatedDoc);

        // Persist to backend
        try {
          // Re-construct SaveReq from doc. 
          // Note: Ideally backend should have a specific toggle endpoint, 
          // but reusing save_document is fine for this prototype.
          const req: SaveDocumentRequest = {
            id: updatedDoc.id,
            title: updatedDoc.title,
            content: updatedDoc.content,
            summary: updatedDoc.summary,
            group_type: updatedDoc.group_type,
            group_id: updatedDoc.group_id,
            document_state: updatedDoc.document_state,
            visibility_level: updatedDoc.visibility_level,
            is_favorite: updatedDoc.is_favorite
          };
          await invoke('save_document', { req });
        } catch (error) {
          console.error("Failed to toggle favorite", error);
          // Revert on error
          get().updateDocument(doc);
        }
      },

      addTab: (doc) => {
        set((state) => {
          const existingTab = state.tabs.find((t) => t.docId === doc.id);
          if (existingTab) {
            return { activeTabId: existingTab.id };
          }
          const newTab: Tab = {
            id: doc.id,
            docId: doc.id,
            title: doc.title,
            isDirty: false,
          };
          return {
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
          };
        });
      },

      closeTab: (tabId) => {
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== tabId);
          let newActiveId = state.activeTabId;

          if (state.activeTabId === tabId) {
            // If closing active tab, switch to the one before it or null
            const index = state.tabs.findIndex((t) => t.id === tabId);
            if (newTabs.length > 0) {
              // Try to go to previous tab, otherwise next tab
              const nextTab = newTabs[index - 1] || newTabs[index] || newTabs[0];
              newActiveId = nextTab.id;
            } else {
              newActiveId = null;
            }
          }
          return { tabs: newTabs, activeTabId: newActiveId };
        });
      },

      setActiveTab: (tabId) => {
        // Clear highlighted evidence when switching tabs to prevent cross-document highlighting
        set({ activeTabId: tabId, highlightedEvidence: null });
      },

      reorderTabs: (newTabs) => {
        set({ tabs: newTabs });
      },

      updateTabTitle: (tabId, newTitle) => {
        set((state) => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, title: newTitle } : t)
        }));
      },

      setHighlightedEvidence: (text) => {
        set({ highlightedEvidence: text });
      },

      setAiAnalysisStatus: (status) => {
        set({ aiAnalysisStatus: status });
      },

      setAutoSaveStatus: (status) => {
        set({ autoSaveStatus: status });
      },

      setLiveEditorContent: (content) => {
        set({ liveEditorContent: content });
      },

      addTagToDocument: async (docId, tag, evidence) => {
        const doc = get().documents.find(d => d.id === docId);
        if (!doc) return;

        const newTag = { tag, evidence: evidence || undefined };
        const updatedTags = [...(doc.tags || []), newTag];
        const updatedDoc = { ...doc, tags: updatedTags };

        // Optimistic update
        get().updateDocument(updatedDoc);

        // Persist to backend
        try {
          const req: SaveDocumentRequest = {
            id: updatedDoc.id,
            title: updatedDoc.title,
            content: updatedDoc.content,
            summary: updatedDoc.summary,
            group_type: updatedDoc.group_type,
            group_id: updatedDoc.group_id,
            document_state: updatedDoc.document_state,
            visibility_level: updatedDoc.visibility_level,
            is_favorite: updatedDoc.is_favorite,
            tags: updatedTags,
          };
          await invoke('save_document', { req });
        } catch (error) {
          console.error('Failed to add tag:', error);
          get().updateDocument(doc);
        }
      },

      removeTagFromDocument: async (docId, tagIndex) => {
        const doc = get().documents.find(d => d.id === docId);
        if (!doc || !doc.tags) return;

        const updatedTags = doc.tags.filter((_, i) => i !== tagIndex);
        const updatedDoc = { ...doc, tags: updatedTags };

        // Optimistic update
        get().updateDocument(updatedDoc);

        // Persist to backend
        try {
          const req: SaveDocumentRequest = {
            id: updatedDoc.id,
            title: updatedDoc.title,
            content: updatedDoc.content,
            summary: updatedDoc.summary,
            group_type: updatedDoc.group_type,
            group_id: updatedDoc.group_id,
            parent_id: updatedDoc.parent_id,
            document_state: updatedDoc.document_state,
            visibility_level: updatedDoc.visibility_level,
            is_favorite: updatedDoc.is_favorite,
            tags: updatedTags,
          };
          await invoke('save_document', { req });
        } catch (error) {
          console.error('Failed to remove tag:', error);
          get().updateDocument(doc);
        }
      },

      createDocument: async (title = 'Untitled', groupId, groupType = GroupType.Private, parentId, defaultVisibility = VisibilityLevel.Hidden) => {
        const req: SaveDocumentRequest = {
          title,
          content: '',
          group_type: groupType,
          group_id: groupId || undefined, // Ensure explicit undefined for optional
          parent_id: parentId || undefined,
          document_state: DocumentState.Draft,
          visibility_level: defaultVisibility,
        };

        try {
          const newDoc = await invoke<Document>('save_document', { req });
          set((state) => ({ documents: [...state.documents, newDoc] }));

          // Auto open tab
          get().addTab(newDoc);
        } catch (error) {
          console.error('Failed to create document:', error);
        }
      },

      deleteDocument: async (docId: string) => {
        // Optimistic delete
        const allDocs = get().documents;
        const targetDoc = allDocs.find(d => d.id === docId);

        if (!targetDoc) return;

        // Soft Delete if not already deleted (all group types go to recycle bin first)
        const isSoftDelete = !targetDoc.deleted_at;

        if (isSoftDelete) {
          // Soft Delete: Mark deleted_at (Recursive) AND Close Tabs
          set((state) => {
            const idsToRecycle = new Set<string>();
            const collect = (id: string) => {
              idsToRecycle.add(id);
              const children = state.documents.filter(d => d.parent_id === id);
              children.forEach(c => collect(c.id));
            };
            collect(docId);

            const now = new Date().toISOString();
            const newDocuments = state.documents.map(d =>
              idsToRecycle.has(d.id) ? { ...d, deleted_at: now, updated_at: now } : d
            );

            // Explicitly close tabs for all recycled docs
            const newTabs = state.tabs.filter(t => !idsToRecycle.has(t.id));

            let newActiveId = state.activeTabId;
            if (newActiveId && idsToRecycle.has(newActiveId)) {
              if (newTabs.length > 0) {
                newActiveId = newTabs[newTabs.length - 1].id;
              } else {
                newActiveId = null;
              }
            }

            return {
              documents: newDocuments,
              tabs: newTabs,
              activeTabId: newActiveId
            };
          });

        } else {
          // Hard Delete: Remove completely (if already deleted or not private)
          const toDeleteIds = new Set<string>();

          const collect = (id: string) => {
            toDeleteIds.add(id);
            const children = allDocs.filter(d => d.parent_id === id);
            children.forEach(c => collect(c.id));
          };
          collect(docId);

          set((state) => {
            const newDocs = state.documents.filter(d => !toDeleteIds.has(d.id));
            const newTabs = state.tabs.filter(t => !toDeleteIds.has(t.docId));

            let newActiveId = state.activeTabId;
            if (newActiveId && toDeleteIds.has(newActiveId)) {
              if (newTabs.length > 0) {
                newActiveId = newTabs[newTabs.length - 1].id;
              } else {
                newActiveId = null;
              }
            }

            return {
              documents: newDocs,
              tabs: newTabs,
              activeTabId: newActiveId
            };
          });

          // Clear drafts
          toDeleteIds.forEach(id => {
            localStorage.removeItem(`draft-${id}`);
          });
        }

        try {
          await invoke('delete_document', { id: docId });
        } catch (error) {
          console.error('Failed to delete document:', error);
          get().fetchDocuments();
        }
      },

      restoreDocument: async (docId: string) => {
        // Optimistic restore: Unset deleted_at (Only for the selected document, not children)
        set((state) => {
          const now = new Date().toISOString();
          const newDocuments = state.documents.map(d =>
            d.id === docId ? { ...d, deleted_at: undefined, updated_at: now } : d
          );
          return { documents: newDocuments };
        });

        try {
          await invoke('restore_document', { id: docId });
        } catch (error) {
          console.error('Failed to restore document:', error);
          get().fetchDocuments();
        }
      },

      emptyRecycleBin: async () => {
        // Optimistic: Remove all docs with deleted_at
        set((state) => {
          const newDocuments = state.documents.filter(d => !d.deleted_at);
          // Also cleanup any tabs that might reference deleted docs (though they should be closed on delete)
          const deletedIds = new Set(state.documents.filter(d => d.deleted_at).map(d => d.id));
          const newTabs = state.tabs.filter(t => !deletedIds.has(t.docId));

          let newActiveId = state.activeTabId;
          if (newActiveId && deletedIds.has(newActiveId)) {
            if (newTabs.length > 0) {
              newActiveId = newTabs[newTabs.length - 1].id;
            } else {
              newActiveId = null;
            }
          }

          return {
            documents: newDocuments,
            tabs: newTabs,
            activeTabId: newActiveId
          };
        });

        try {
          await invoke('empty_recycle_bin');
        } catch (error) {
          console.error('Failed to empty recycle bin:', error);
          get().fetchDocuments();
        }
      },


      renameDocument: async (docId: string, newTitle: string) => {
        const doc = get().documents.find(d => d.id === docId);
        if (!doc) return;

        // Optimistic update
        set(state => ({
          documents: state.documents.map(d => d.id === docId ? { ...d, title: newTitle } : d),
          // Also update tabs if open
          tabs: state.tabs.map(t => t.docId === docId ? { ...t, title: newTitle } : t)
        }));

        try {
          const req: SaveDocumentRequest = {
            id: doc.id,
            title: newTitle,
            content: doc.content || "", // Ensure content is preserved
            group_type: doc.group_type,
            group_id: doc.group_id,
            parent_id: doc.parent_id,
            document_state: doc.document_state,
            visibility_level: doc.visibility_level,
            creator_name: doc.creator_name
          };
          await invoke('save_document', { req });
        } catch (error) {
          console.error("Failed to rename document:", error);
          get().fetchDocuments();
        }
      },

      markTabDirty: (tabId: string, isDirty: boolean) => {
        set((state) => ({
          tabs: state.tabs.map(t => t.id === tabId ? { ...t, isDirty } : t)
        }));
      },

      currentUser: null,
      setCurrentUser: (user: UserInfo) => set({ currentUser: user }),
    }),
    {
      name: 'document-storage-v1', // key in localStorage
      partialize: (state) => ({
        tabs: state.tabs.map(t => ({ ...t, isDirty: false })), // Don't persist dirty state, reset to false
        activeTabId: state.activeTabId,
      }),
    }
  )
);
