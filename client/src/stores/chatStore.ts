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

interface AskAiResponse {
  answer: string;
  chat_id: string;
}

interface ChatStore {
  chats: ChatSession[];
  currentChatId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;

  loadChats: () => Promise<void>;
  selectChat: (chatId: string) => Promise<void>;
  createNewChat: () => Promise<void>;

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

  loadChats: async () => {
    try {
      const chats = await invoke<ChatSession[]>('get_rag_chats');
      set({ chats });
    } catch (error) {
      console.error('Failed to load chats:', error);
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
    const { currentChatId, messages, chats } = get();

    // Optimistic User Msg
    const tempId = crypto.randomUUID();
    const optimisticUserMsg: ChatMessage = {
      id: tempId,
      chat_id: currentChatId || 'temp', // unknown yet if new
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set({
      messages: [...messages, optimisticUserMsg],
      isLoading: true
    });

    try {
      const response = await invoke<AskAiResponse>('ask_ai', {
        chatId: currentChatId,
        question: content
      });

      // Update current chat ID if it was new
      if (currentChatId !== response.chat_id) {
        set({ currentChatId: response.chat_id });
        // Refresh chat list to show new chat
        get().loadChats();
      }

      // Optimistic Assistant Msg
      const optimisticAsstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        chat_id: response.chat_id,
        role: 'assistant',
        content: response.answer,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, optimisticAsstMsg],
        isLoading: false
      }));

    } catch (err) {
      console.error(err);
      // Add error message
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        chat_id: currentChatId || 'temp',
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
