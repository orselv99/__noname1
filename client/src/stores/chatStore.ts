import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface ChatMessage {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ChatStore {
  chats: ChatSession[];
  currentChatId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;

  loadChats: (search?: string) => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  createNewChat: () => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, newTitle: string) => Promise<void>;

  // Send message handles optimistically adding user/assistant msgs
  sendMessage: (content: string) => Promise<void>;

  loadMoreMessages: () => Promise<void>;
  clearMessages: () => void; // Clears locally view only
}

const PAGE_SIZE = 50;

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChatId: null,
  messages: [],
  isLoading: false,
  isLoadingMore: false,
  hasMore: true,

  loadChats: async (search?: string) => {
    try {
      const chats = await invoke<ChatSession[]>('get_rag_chats', { search });
      set({ chats });
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  },

  deleteChat: async (chatId: string) => {
    try {
      await invoke('delete_rag_chat', { chatId });
      // If the deleted chat was selected, clear selection
      const { currentChatId, loadChats } = get();
      if (currentChatId === chatId) {
        set({ currentChatId: null, messages: [] });
      }
      // Refresh list
      await loadChats();
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  },

  renameChat: async (chatId: string, newTitle: string) => {
    try {
      await invoke('update_rag_chat_title', { chatId, newTitle });
      await get().loadChats();
    } catch (error) {
      console.error('Failed to rename chat:', error);
    }
  },

  selectChat: async (chatId) => {
    set({ currentChatId: chatId, messages: [], hasMore: true, isLoading: true });
    try {
      const msgs = await invoke<ChatMessage[]>('get_rag_messages', {
        chatId,
        limit: PAGE_SIZE,
        before: null
      });
      set({
        messages: msgs,
        hasMore: msgs.length === PAGE_SIZE,
        isLoading: false
      });
    } catch (error) {
      console.error(`Failed to load messages for chat ${chatId}:`, error);
      set({ isLoading: false });
    }
  },

  createNewChat: async () => {
    set({ currentChatId: null, messages: [], hasMore: false });
    // We don't necessarily create on backend yet until first message,
    // OR we can create immediately. Let's create on first message to avoid empty chats.
    // So just clearing state looks like a new chat.
  },

  sendMessage: async (content) => {
    const { currentChatId, messages } = get();

    // Optimistic User Msg
    const tempId = crypto.randomUUID();
    const chatId = currentChatId || crypto.randomUUID();
    const optimisticUserMsg: ChatMessage = {
      id: tempId,
      chat_id: chatId,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set({
      messages: [...messages, optimisticUserMsg],
      isLoading: true,
      currentChatId: chatId,
    });

    try {
      // Import aiService dynamically to avoid circular deps
      const { aiService } = await import('../utils/aiService');

      // Build conversation history for context - use fresh state
      const currentMessages = get().messages;
      const chatHistory = currentMessages.slice(-10).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

      console.log('[ChatStore] Sending chat with history:', chatHistory.length, 'messages');

      // Call client-side AI
      const answer = await aiService.chat(chatHistory);
      console.log('[ChatStore] Received answer:', answer?.slice(0, 50) + '...');

      // Optimistic Assistant Msg
      const optimisticAsstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        role: 'assistant',
        content: answer || '응답을 생성할 수 없습니다.',
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, optimisticAsstMsg],
        isLoading: false
      }));

      // Refresh chat list if new chat
      if (!currentChatId) {
        get().loadChats();
      }

    } catch (err) {
      console.error(err);
      // Add error message
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        role: 'assistant',
        content: `Error: ${String(err)}`,
        timestamp: Date.now(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        isLoading: false
      }));
    }
  },

  loadMoreMessages: async () => {
    const { currentChatId, messages, isLoadingMore, hasMore } = get();
    if (!currentChatId || isLoadingMore || !hasMore || messages.length === 0) return;

    set({ isLoadingMore: true });

    try {
      const oldestMsg = messages[0];
      const olderMsgs = await invoke<ChatMessage[]>('get_rag_messages', {
        chatId: currentChatId,
        limit: PAGE_SIZE,
        before: oldestMsg.timestamp
      });

      if (olderMsgs.length > 0) {
        set((state) => ({
          messages: [...olderMsgs, ...state.messages],
          hasMore: olderMsgs.length === PAGE_SIZE,
          isLoadingMore: false
        }));
      } else {
        set({ hasMore: false, isLoadingMore: false });
      }

    } catch (error) {
      console.error('Failed to load more messages:', error);
      set({ isLoadingMore: false });
    }
  },

  clearMessages: () => set({ messages: [] }),
}));
