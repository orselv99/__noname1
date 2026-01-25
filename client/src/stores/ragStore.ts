import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

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
  thinkingProcess: any;
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
    set({ isLoading: true, loadingStatus: 'Thinking...' });

    try {
      // 1. Ask AI (this usually handles creation if no chat_id provided, 
      // but in updated backend it returns answer + chat_id)

      // But wait, frontend logic usually does:
      // If no chat ID, call ask_ai(null, question) -> returns { answer, chat_id }
      // Then we update state.

      // However, to show "User Message" immediately, we might want to manually add it to state?
      // Or rely on reload. 
      // Let's Optimistic add user message.
      const tempUserMsg: RagMessage = {
        id: 'temp-user',
        chat_id: currentChatId || 'temp',
        role: 'user',
        content,
        timestamp: Date.now()
      };

      set(state => ({ messages: [...state.messages, tempUserMsg] }));

      const res = await invoke<{ answer: string; chat_id: string }>('ask_ai', {
        chatId: currentChatId,
        question: content
      });

      // 2. Reload Messages (to get real IDs and AI response)
      const messages = await invoke<RagMessage[]>('get_rag_messages', { chatId: res.chat_id });
      messages.sort((a, b) => a.timestamp - b.timestamp);

      // 3. Reload Chats (to update title or order)
      await get().loadChats();

      set({
        currentChatId: res.chat_id,
        messages,
        isLoading: false,
        loadingStatus: ''
      });

    } catch (error) {
      console.error('Failed to send message:', error);
      set({ isLoading: false, loadingStatus: 'Error' });
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
