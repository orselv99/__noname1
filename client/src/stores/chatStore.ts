import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { v4 as uuidv4 } from 'uuid';

export interface ChatRoom {
  id: string;
  name?: string;
  participants: string[];
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  roomId: string; // CamelCase for Frontend
  senderId: string; // CamelCase
  content: string;
  status: 'pending' | 'sent' | 'delivered' | 'read';
  syncStatus?: 'synced' | 'unsynced'; // CamelCase
  timestamp: number;
}

// Rust Command DTOs
interface ChatMessageRaw {
  id: string;
  room_id: string; // SnakeCase for Backend
  sender_id: string;
  content: string;
  status: string;
  timestamp: number;
}

interface ChatRoomRaw {
  id: string;
  name?: string;
  participants: string[]; // JSON parsed by backend automatically? No, backend returns Vec<String>
  created_at: string;
  updated_at: string;
}

interface ChatState {
  rooms: Record<string, ChatRoom>; // Cache by ID
  messages: Record<string, ChatMessage[]>; // Cache by RoomID

  // Actions
  loadRooms: () => Promise<void>;
  createOrUpdateRoom: (room: { id: string; participants: string[]; name?: string }) => Promise<void>;

  loadMessages: (roomId: string) => Promise<void>;
  addMessage: (msg: { id?: string; roomId: string; senderId: string; content: string; status?: 'pending' | 'sent' | 'delivered' | 'read'; syncStatus?: 'synced' | 'unsynced' }) => Promise<ChatMessage>;

  getRoom: (roomId: string) => ChatRoom | undefined;
  getMessages: (roomId: string) => ChatMessage[];

  // [읽음 처리] 특정 채팅방의 메시지들을 '읽음' 상태로 변경합니다.
  markAsRead: (roomId: string, messageIds: string[]) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  rooms: {},
  messages: {},

  loadRooms: async () => {
    try {
      const roomsRaw = await invoke<ChatRoomRaw[]>('list_chat_rooms');
      const roomsMap: Record<string, ChatRoom> = {};
      roomsRaw.forEach(r => {
        roomsMap[r.id] = {
          ...r,
          // Backend returns standard fields, no extra parsing needed if DTO matches
        };
      });
      set({ rooms: roomsMap });
    } catch (error) {
      console.error('Failed to load chat rooms:', error);
    }
  },

  createOrUpdateRoom: async (room) => {
    try {
      // Optimistic update (optional, usually safer to wait for ack or just fire and forget)
      // Here we just call backend
      await invoke('save_chat_room', {
        id: room.id,
        name: room.name || null,
        participants: room.participants
      });

      // Refresh list or update local state
      // For now, let's update local map
      set(state => ({
        rooms: {
          ...state.rooms,
          [room.id]: {
            id: room.id,
            name: room.name,
            participants: room.participants,
            created_at: state.rooms[room.id]?.created_at || new Date().toISOString(), // Approximation
            updated_at: new Date().toISOString()
          }
        }
      }));
    } catch (error) {
      console.error('Failed to save chat room:', error);
    }
  },

  loadMessages: async (roomId) => {
    try {
      const msgsRaw = await invoke<ChatMessageRaw[]>('get_chat_messages', { roomId });
      const msgs: ChatMessage[] = msgsRaw.map(m => ({
        id: m.id,
        roomId: m.room_id,
        senderId: m.sender_id,
        content: m.content,
        status: m.status as any,
        timestamp: m.timestamp
      }));

      set(state => ({
        messages: {
          ...state.messages,
          [roomId]: msgs
        }
      }));
    } catch (error) {
      console.error(`Failed to load messages for room ${roomId}:`, error);
    }
  },

  addMessage: async (msg) => {
    const id = msg.id || uuidv4();
    const timestamp = Date.now();
    const newMessage: ChatMessage = {
      id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      content: msg.content,
      status: msg.status || 'pending',
      syncStatus: msg.syncStatus,
      timestamp
    };

    console.log('[ChatStore] addMessage called:', newMessage);

    // Optimistic Update
    set(state => {
      const roomMsgs = state.messages[msg.roomId] || [];
      return {
        messages: {
          ...state.messages,
          [msg.roomId]: [...roomMsgs, newMessage]
        }
      };
    });

    // Backend Save
    try {
      await invoke('save_chat_message', {
        message: {
          id: newMessage.id,
          room_id: newMessage.roomId,
          sender_id: newMessage.senderId,
          content: newMessage.content,
          status: newMessage.status,
          timestamp: newMessage.timestamp
        }
      });

      // Also update room updated_at implicitly in backend, but we might want to reload rooms list
      // get().loadRooms(); // Optional: might be too heavy?
    } catch (error) {
      console.error('Failed to save message:', error);
      // Rollback or mark as error? For now just log.
    }

    return newMessage;
  },

  getRoom: (roomId) => get().rooms[roomId],

  getMessages: (roomId) => get().messages[roomId] || [],

  // [읽음 처리 구현]
  // 채팅방 ID와 메시지 ID 목록을 받아, 해당 메시지들의 상태를 'read'로 업데이트합니다.
  markAsRead: (roomId, messageIds) => {
    set(state => {
      const roomMsgs = state.messages[roomId];
      if (!roomMsgs) return state;

      // 변경 대상이 있는 경우에만 새로운 배열을 생성하여 업데이트 (불변성 유지)
      const newMsgs = roomMsgs.map(msg => {
        if (messageIds.includes(msg.id) && msg.status !== 'read') {
          return { ...msg, status: 'read' as const };
        }
        return msg;
      });

      return {
        messages: {
          ...state.messages,
          [roomId]: newMsgs
        }
      };
    });
  }
}));
