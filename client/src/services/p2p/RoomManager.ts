import { v4 as uuidv4 } from 'uuid';
import { signalingService, SignalType, SignalMessage } from '../SignalingService';
import { useChatStore } from '../../stores/chatStore';
import { p2pManager } from './P2PManager';
import { useAuthStore } from '../../stores/authStore';

class RoomManager {
  constructor() {
    signalingService.subscribe(this.handleSignal.bind(this));
  }

  // User initiates a chat
  public async createRoom(participantIds: string[]) {
    const myId = useAuthStore.getState().user?.user_id;
    if (!myId) {
      console.error('Cannot create room: Not logged in');
      return;
    }

    const allParticipants = Array.from(new Set([...participantIds, myId]));

    // ========================================================================
    // [1:1 채팅방 재사용 로직]
    // ========================================================================
    // 이미 존재하는 1:1 채팅방이 있다면 새로 만들지 않고 기존 방을 엽니다.
    // ========================================================================
    if (allParticipants.length === 2) {
      // 1. 메모리 캐시에서 찾기
      // useChatStore.getState().rooms는 Record<string, ChatRoom> 타입
      let rooms = Object.values(useChatStore.getState().rooms);
      let existingRoom = rooms.find((r: any) =>
        r.participants.length === 2 &&
        r.participants.every((p: string) => allParticipants.includes(p))
      );

      // 2. 없으면 DB에서 다시 로드하고 다시 찾기 (동기화 문제 방지)
      if (!existingRoom) {
        console.log('[RoomManager] 메모리에 1:1 방 없음, DB 리로드 시도...');
        await useChatStore.getState().loadRooms();

        rooms = Object.values(useChatStore.getState().rooms);
        existingRoom = rooms.find((r: any) =>
          r.participants.length === 2 &&
          r.participants.every((p: string) => allParticipants.includes(p))
        );
      }

      if (existingRoom) {
        console.log('[RoomManager] 기존 1:1 방 재사용:', existingRoom.id);
        this.openChatWindow(existingRoom.id);
        this.connectToParticipants(participantIds);
        return;
      }
    }

    const roomId = uuidv4();

    // 1. Save Room Locally
    await useChatStore.getState().createOrUpdateRoom({
      id: roomId,
      participants: allParticipants,
      name: '새 채팅방',
    });

    // 2. Send INVITE signal
    participantIds.forEach(peerId => {
      signalingService.sendSignal({
        type: SignalType.INVITE,
        target_peer_id: peerId,
        room_id: roomId,
        participants: allParticipants
      });
    });

    // 3. Open Chat Window (and connect)
    this.openChatWindow(roomId);

    // 4. Initiate Connections
    this.connectToParticipants(participantIds);
  }

  // Handle incoming signals
  private async handleSignal(msg: SignalMessage) {
    if (msg.type === SignalType.INVITE && msg.room_id && msg.participants) {
      console.log(`Received INVITE to Room ${msg.room_id}`);

      // 1. Save Room
      await useChatStore.getState().createOrUpdateRoom({
        id: msg.room_id,
        participants: msg.participants,
        name: '초대받은 채팅방'
      });

      // 2. Notify User 
      // For now, auto-join / auto-connect
      const myId = useAuthStore.getState().user?.user_id;
      const others = msg.participants.filter(p => p !== myId);

      this.connectToParticipants(others);

      console.log('Invite accepted, room saved.');
    }
  }

  private connectToParticipants(peerIds: string[]) {
    peerIds.forEach(id => p2pManager.connect(id));
  }

  public openChatWindow(roomId: string) {
    // Tauri Window Creation Logic
    import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
      const label = `chat-${roomId}`;
      const myId = useAuthStore.getState().user?.user_id;
      // Note: This URL must match what Vite/Tauri serves.
      // If SPA, it might need hash router or proper history fallback.
      const webview = new WebviewWindow(label, {
        url: `/chat/${roomId}?uid=${myId}`,
        title: 'Chat',
        width: 400,
        height: 600,
      });

      webview.once('tauri://created', function () {
        // webview window successfully created
      });

      webview.once('tauri://error', function (e) {
        console.error(e);
      });
    }).catch(err => {
      console.warn('Tauri API not available or failed:', err);
    });
  }
}

export const roomManager = new RoomManager();
