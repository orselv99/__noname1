import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { executeSearch, ThinkingState } from '../utils/LangGraphSearch';

export interface RagChat {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface RagMessage {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface RagState {
  chats: RagChat[];
  currentChatId: string | null;
  messages: RagMessage[];
  isLoading: boolean;
  loadingStatus: string;
  thinkingProcess: ThinkingState | null;
  isLoadingMore: boolean;
  hasMore: boolean;

  loadChats: (search?: string) => Promise<void>;
  selectChat: (id: string) => Promise<void>;
  createNewChat: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  renameChat: (id: string, title: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
}

export const useRagStore = create<RagState>((set, get) => ({
  chats: [],
  currentChatId: null,
  messages: [],
  isLoading: false,
  loadingStatus: '',
  thinkingProcess: null,
  isLoadingMore: false,
  hasMore: false,

  loadChats: async (search?: string) => {
    try {
      const chats = await invoke<RagChat[]>('get_rag_chats');
      // Client-side filtering if search is provided
      const filtered = search
        ? chats.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
        : chats;

      // Sort by updated_at desc
      filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      set({ chats: filtered });
    } catch (error) {
      console.error('Failed to load rag chats:', error);
    }
  },

  selectChat: async (id: string) => {
    set({ currentChatId: id, messages: [], isLoading: true });
    try {
      const messages = await invoke<RagMessage[]>('get_rag_messages', { chatId: id });
      // Sort by timestamp asc
      messages.sort((a, b) => a.timestamp - b.timestamp);
      set({ messages, isLoading: false });
    } catch (error) {
      console.error('Failed to load rag messages:', error);
      set({ isLoading: false });
    }
  },

  createNewChat: async () => {
    set({ currentChatId: null, messages: [], isLoading: false });
  },

  sendMessage: async (content: string) => {
    const { currentChatId, chats } = get();
    // Reset state
    set({
      isLoading: true,
      loadingStatus: '생각 중...',
      thinkingProcess: {
        local: { status: 'running', logs: [] }, // Start with running to show UI immediately
        server: { status: 'idle', logs: [] },
        web: { status: 'idle', logs: [] }
      }
    });

    try {
      // 1. Ensure Chat Session Exists
      let chatId = currentChatId;
      if (!chatId) {
        set({ loadingStatus: '새 채팅방 생성 중...' });
        const newChat = await invoke<RagChat>('create_new_chat', { title: content.slice(0, 30) });
        chatId = newChat.id;
        set(state => ({
          currentChatId: chatId,
          chats: [newChat, ...state.chats]
        }));
      }

      // 2. Persist User Message
      const userMsg = await invoke<RagMessage>('add_rag_message', {
        chatId,
        role: 'user',
        content
      });

      set(state => ({ messages: [...state.messages, userMsg] }));

      // 3. Execute LangGraph Search
      set({ loadingStatus: '문서 검색 및 분석 중...' });

      const searchResults = await executeSearch(content, (partialState) => {
        set(state => {
          const currentThinking = state.thinkingProcess || {
            local: { status: 'idle', logs: [] },
            server: { status: 'idle', logs: [] },
            web: { status: 'idle', logs: [] }
          };
          return {
            thinkingProcess: { ...currentThinking, ...partialState }
          };
        });
      });

      // 4. Format Result (JSON for UI)
      const localResults = searchResults.filter(r => r.source === 'local');
      const serverResults = searchResults.filter(r => r.source === 'server');
      const webResults = searchResults.filter(r => r.source === 'web');

      const responsePayload = {
        type: 'rag_search_result',
        summary: `검색이 완료되었습니다. (총 ${localResults.length + serverResults.length + webResults.length}건 발견)`,
        thinking_process: get().thinkingProcess,
        results: {
          local: localResults,
          server: serverResults,
          web: webResults
        }
      };

      // 5. Persist Assistant Message
      const assistantMsg = await invoke<RagMessage>('add_rag_message', {
        chatId,
        role: 'assistant',
        content: JSON.stringify(responsePayload)
      });

      // 6. Update UI
      set(state => ({
        messages: [...state.messages, assistantMsg],
        isLoading: false,
        loadingStatus: ''
      }));

      // Update chat timestamp in list
      get().loadChats();

    } catch (error) {
      console.error('Failed to send message:', error);
      set({ isLoading: false, loadingStatus: '오류 발생' });
    }
  },

  loadMoreMessages: async () => {
    // Pagination not fully implemented in backend 'get_rag_messages' yet (it returns all).
    // So this is a placeholder or logical stub.
    set({ isLoadingMore: false, hasMore: false });
  },

  renameChat: async (id: string, title: string) => {
    try {
      await invoke('update_rag_chat_title', { chatId: id, title });
      await get().loadChats();
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  },

  deleteChat: async (id: string) => {
    try {
      await invoke('delete_rag_chat', { chatId: id });
      set(state => ({
        chats: state.chats.filter(c => c.id !== id),
        currentChatId: state.currentChatId === id ? null : state.currentChatId,
        messages: state.currentChatId === id ? [] : state.messages
      }));
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  }

}));
