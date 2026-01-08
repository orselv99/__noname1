import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { Document, GroupType, SaveDocumentRequest, DocumentState, VisibilityLevel } from '../types';

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

  // Actions
  fetchDocuments: () => Promise<void>;
  addDocument: (doc: Document) => void;
  updateDocument: (doc: Document) => void;
  toggleFavorite: (docId: string) => Promise<void>;
  createDocument: (title?: string, groupId?: string, groupType?: GroupType) => Promise<void>;

  // Tab Actions
  addTab: (doc: Document) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  reorderTabs: (newTabs: Tab[]) => void;
  // markTabDirty: (tabId: string, isDirty: boolean) => void; // Future use
}

export const useDocumentStore = create<DocumentStore>()(
  persist(
    (set, get) => ({
      documents: [],
      isLoading: false,
      error: null,

      tabs: [],
      activeTabId: null,

      fetchDocuments: async () => {
        set({ isLoading: true, error: null });
        try {
          const docs = await invoke<Document[]>('list_documents', { groupType: null, groupId: null });
          set((state) => {
            // Also update tabs titles if documents changed
            // This is crucial for persistence: if a doc title changed in DB but localStorage has old title,
            // this sync will fix it upon fetch.
            const newTabs = state.tabs.map(tab => {
              const found = docs.find(d => d.id === tab.docId);
              return found ? { ...tab, title: found.title } : tab;
            });
            return { documents: docs, tabs: newTabs, isLoading: false };
          });
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
        set({ activeTabId: tabId });
      },

      reorderTabs: (newTabs) => {
        set({ tabs: newTabs });
      },

      createDocument: async (title = 'Untitled', groupId, groupType = GroupType.Private) => {
        const req: SaveDocumentRequest = {
          title,
          content: '',
          group_type: groupType,
          group_id: groupId || undefined, // Ensure explicit undefined for optional
          document_state: DocumentState.Draft,
          visibility_level: VisibilityLevel.Hidden,
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
    }),
    {
      name: 'document-storage', // key in localStorage
      partialize: (state) => ({
        tabs: state.tabs.map(t => ({ ...t, isDirty: false })), // Don't persist dirty state, reset to false
        activeTabId: state.activeTabId,
      }), // Only persist tabs and activeTabId
    }
  )
);
