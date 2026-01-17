import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { executeSearch, ThinkingState } from '../utils/LangGraphSearch';

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
  loadingStatus: string | null;
  thinkingProcess: ThinkingState | null;
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

const INITIAL_THINKING_STATE: ThinkingState = {
  web: { status: 'idle', logs: [] },
  server: { status: 'idle', logs: [] },
  local: { status: 'idle', logs: [] }
};

export const useChatStore = create<ChatStore>((set, get) => ({
  chats: [],
  currentChatId: null,
  messages: [],
  isLoading: false,
  loadingStatus: null,
  thinkingProcess: null,
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
  },

  sendMessage: async (content) => {
    // 0. Immediate optimistic lock
    set({
      isLoading: true,
      loadingStatus: "준비 중...",
      thinkingProcess: JSON.parse(JSON.stringify(INITIAL_THINKING_STATE)) // Deep copy initial
    });

    let { currentChatId } = get();

    // 1. Ensure chat session exists
    if (!currentChatId) {
      try {
        const chat = await invoke<ChatSession>('create_new_chat', { title: content.substring(0, 30) });
        currentChatId = chat.id;
        set({ currentChatId });
        get().loadChats();
      } catch (e) {
        console.error("Failed to create chat:", e);
        set({ isLoading: false, loadingStatus: null });
        return;
      }
    }

    // 2. Persist User Message
    let userMsg: ChatMessage;
    try {
      userMsg = await invoke<ChatMessage>('add_rag_message', {
        chatId: currentChatId,
        role: 'user',
        content
      });
    } catch (e) {
      // Fallback optimistic
      const tempId = crypto.randomUUID();
      userMsg = {
        id: tempId,
        chat_id: currentChatId,
        role: 'user',
        content,
        timestamp: Date.now()
      };
      console.error("Failed to save user message:", e);
    }

    // Dedup and add
    set((state) => ({
      messages: state.messages.some(m => m.id === userMsg.id) ? state.messages : [...state.messages, userMsg],
    }));

    try {
      // 3. Execute LangGraph Search with Progress Callback
      const results = await executeSearch(content, (partialState) => {
        set((prev) => {
          // Merge partial state
          const newState = { ...prev.thinkingProcess, ...partialState } as ThinkingState;

          // Derive simple status for header
          let statusLabel = "답변 생성 중";
          if (newState.web.status === 'running') statusLabel = "웹 검색 수행 중";
          else if (newState.server.status === 'running') statusLabel = "서버 지식 검색 중";
          else if (newState.local.status === 'running') statusLabel = "로컬 문서 검색 중";

          return {
            thinkingProcess: newState,
            loadingStatus: statusLabel
          };
        });
      });

      // 4. Generate Answer (Validation Logic for now)
      let answer = "";
      if (results.length === 0) {
        answer = "관련된 문서를 찾을 수 없습니다";
      } else {
        // Flatten results
        const local = results.filter(r => r.source === 'local');
        const server = results.filter(r => r.source === 'server');
        const web = results.filter(r => r.source === 'web');

        // Serialize results as JSON for Rich UI
        const structuredResponse = {
          type: 'rag_search_result',
          results: {
            local,
            server,
            web
          },
          summary: "검색 결과를 찾았습니다",
          thinking_process: get().thinkingProcess
        };
        answer = JSON.stringify(structuredResponse);
      }

      // 5. Persist Assistant Message
      const asstMsg = await invoke<ChatMessage>('add_rag_message', {
        chatId: currentChatId,
        role: 'assistant',
        content: answer
      });

      set((state) => ({
        messages: [...state.messages, asstMsg],
        isLoading: false,
        thinkingProcess: null,
        loadingStatus: null
      }));

    } catch (err) {
      console.error(err);
      // Add error message
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        chat_id: currentChatId!,
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
        set((state) => {
          // Robust Dedup: Filter out messages that already exist by ID
          const newUniqueMsgs = olderMsgs.filter(newMsg => !state.messages.some(existing => existing.id === newMsg.id));
          return {
            messages: [...newUniqueMsgs, ...state.messages],
            hasMore: olderMsgs.length === PAGE_SIZE,
            isLoadingMore: false
          };
        });
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
