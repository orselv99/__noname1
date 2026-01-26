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

    // ========================================================================
    // [중복 메시지 체크]
    // ========================================================================
    // 같은 메시지 ID가 이미 존재하면 추가하지 않음
    // P2P 특성상 같은 메시지가 여러 경로로 도착할 수 있기 때문에 필요
    // ========================================================================
    const existingMsgs = get().messages[msg.roomId] || [];
    const existingMsg = existingMsgs.find(m => m.id === id);
    if (existingMsg) {
      console.log('[ChatStore] 중복 메시지 무시 (이미 존재함):', id);
      return existingMsg; // 이미 존재하는 메시지 반환
    }

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

  // ============================================================================
  // [읽음 처리 구현]
  // ============================================================================
  // P2P 채팅에서 '읽음' 상태를 관리하는 핵심 함수입니다.
  //
  // 동작 원리:
  // 1. 상대방이 채팅창을 열면, ReadReceiptTrigger 컴포넌트가 안 읽은 메시지를 감지
  // 2. ChatHandler.sendReadReceipt()를 호출하여 P2P로 '읽음 신호' 전송
  // 3. 나(발신자)의 ChatHandler가 신호를 받아 이 markAsRead 함수 호출
  // 4. 로컬 상태와 DB 모두 업데이트 → UI에 ✓✓ 표시!
  //
  // 왜 DB 저장이 필요한가?
  // - 앱을 껐다 켜도 읽음 상태가 유지되어야 함
  // - 채팅창이 닫혔다 다시 열려도 ✓✓가 보여야 함
  // ============================================================================
  markAsRead: (roomId, messageIds) => {
    // Step 1: 로컬 상태(메모리) 즉시 업데이트 (UI 반응성)
    set(state => {
      const roomMsgs = state.messages[roomId];
      if (!roomMsgs) return state;

      // 해당 ID의 메시지들을 'read' 상태로 변경
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

    // Step 2: DB에 영구 저장 (앱 재시작 후에도 유지)
    // 비동기로 실행하므로 UI 블로킹 없음
    invoke('update_message_status', {
      messageIds,
      status: 'read'
    }).then(() => {
      console.log(`[ChatStore] ${messageIds.length}개 메시지 읽음 처리 완료 (DB 저장됨)`);
    }).catch(e => {
      console.error('[ChatStore] 읽음 상태 DB 저장 실패:', e);
      // 실패해도 로컬 상태는 이미 업데이트됨 (낙관적 UI)
      // 다음 번 로드 시 DB 상태와 동기화될 수 있음
    });
  }
}));
