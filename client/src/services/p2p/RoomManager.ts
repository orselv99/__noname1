
import { v4 as uuidv4 } from 'uuid';
import { signalingService, SignalType, SignalMessage } from '../SignalingService'; // Update path if needed
import { messagingStore as chatStore } from '../../stores/messagingStore';
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

    const roomId = uuidv4();
    const allParticipants = Array.from(new Set([...participantIds, myId]));

    // 1. Save Room Locally
    await chatStore.createOrUpdateRoom({
      id: roomId,
      participants: allParticipants,
      name: '새 채팅방', // TODO: Generate name from participants
    });

    // 2. Send INVITE signal
    // We send to each participant individually or rely on a "multicast" signal if backend supported it.
    // Our backend relay supports multiple participants in one message if we structured it that way,
    // but standard P2P signaling is often unicast.
    // However, our updated proto has `participants` field.
    // We can send ONE invite message to server, and server could relay? 
    // NO, currently Gateway relays to `TargetPeerId`.
    // We need to loop. OR update Gateway to support multicast.
    // For now, loop client-side is safer.

    // Actually, `signaling.proto` has `participants`. We can send to *each* target, but include the *full list* so they know who else is in the room.

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
      await chatStore.createOrUpdateRoom({
        id: msg.room_id,
        participants: msg.participants,
        name: '초대받은 채팅방'
      });

      // 2. Notify User (Toast or Window)
      // For now, auto-join / auto-connect
      const myId = useAuthStore.getState().user?.user_id;
      const others = msg.participants.filter(p => p !== myId);

      this.connectToParticipants(others);

      // Optional: Open window immediately or show notification
      // window.open(...) // Tauri specific handling needed
      console.log('Invite accepted, room saved.');
    }
  }

  private connectToParticipants(peerIds: string[]) {
    peerIds.forEach(id => p2pManager.connect(id));
  }

  public openChatWindow(roomId: string) {
    // Tauri Window Creation Logic
    // Using import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
    // This code might fail in pure browser, check environment.

    import('@tauri-apps/api/webviewWindow').then(({ WebviewWindow }) => {
      const label = `chat-${roomId}`;
      const webview = new WebviewWindow(label, {
        url: `/chat/${roomId}`,
        title: 'Chat',
        width: 400,
        height: 600,
      });

      webview.once('tauri://created', function () {
        // webview window successfully created
      });

      webview.once('tauri://error', function (e) {
        // an error happened creating the webview window
        console.error(e);
        // Fallback: If window exists, focus it
      });
    }).catch(err => {
      console.warn('Tauri API not available or failed:', err);
    });
  }
}

export const roomManager = new RoomManager();
