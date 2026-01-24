
import { p2pManager, P2PMessage } from './P2PManager';
import { messagingStore as chatStore } from '../../stores/messagingStore';

class ChatHandler {
  constructor() {
    p2pManager.subscribe(this.handleP2PMessage.bind(this));
  }

  private async handleP2PMessage(_peerId: string, msg: P2PMessage) {
    if (msg.feature === 'chat' && msg.roomId && msg.payload) {
      // Payload expects: { senderId, content }
      const { senderId, content } = msg.payload;

      console.log(`Received Chat from ${senderId} in Room ${msg.roomId}: ${content}`);

      await chatStore.addMessage({
        roomId: msg.roomId,
        senderId: senderId,
        content: content,
        status: 'read' // Messages received are implicitly available to read, or "sent" from their perspective.
        // Actually, status usually tracks MY OWN messages. 
        // Incoming messages don't really need status unless we track "read by me".
      });

      // Notify UI (Window) via BroadcastChannel if needed
      // ChatStore updates usually trigger reactivity if using useLiveQuery (dexie) or manual signals.
      // Since we use raw IDB, we might need a signal mechanism.
      // For now, let's assume the UI polls or listens to 'storage' events?
      // IDB doesn't trigger storage events across tabs/windows automatically.
      // We should use BroadcastChannel to notify ChatWindow to reload.

      const channel = new BroadcastChannel('chat_updates');
      channel.postMessage({ type: 'NEW_MESSAGE', roomId: msg.roomId });
      channel.close();
    }
  }

  public sendMessage(roomId: string, content: string, senderId: string, participants: string[]) {
    // 1. Save locally
    chatStore.addMessage({
      roomId,
      senderId,
      content,
      status: 'sent'
    }).then(() => {
      // Trigger UI update for self
      const channel = new BroadcastChannel('chat_updates');
      channel.postMessage({ type: 'NEW_MESSAGE', roomId });
      channel.close();
    });

    // 2. Broadcast via P2P
    const msg: P2PMessage = {
      feature: 'chat',
      roomId,
      payload: { senderId, content }
    };

    p2pManager.broadcast(participants, msg);
  }
}

export const chatHandler = new ChatHandler();
