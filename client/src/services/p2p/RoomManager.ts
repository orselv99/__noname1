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

    // Check if 1:1 room already exists
    if (allParticipants.length === 2) {
      // Ensure rooms are loaded
      if (Object.keys(useChatStore.getState().rooms).length === 0) {
        await useChatStore.getState().loadRooms();
      }

      const rooms = Object.values(useChatStore.getState().rooms);
      const existingRoom = rooms.find(r =>
        r.participants.length === 2 &&
        r.participants.every(p => allParticipants.includes(p))
      );

      if (existingRoom) {
        console.log('Reusing existing room:', existingRoom.id);
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
