
import { chatHandler } from './ChatHandler';
import { messagingStore as chatStore } from '../../stores/messagingStore';

export function initChatOpListener() {
  const channel = new BroadcastChannel('chat_ops');

  channel.onmessage = async (event) => {
    const { type, roomId, content, senderId } = event.data;

    if (type === 'SEND_MESSAGE') {
      console.log('[Main] Received SEND_MESSAGE op:', event.data);

      // Get participants to broadcast to
      const room = await chatStore.getRoom(roomId);
      if (room) {
        // Send via P2P (and save locally)
        chatHandler.sendMessage(roomId, content, senderId, room.participants);
      } else {
        console.error('[Main] Room not found for sending:', roomId);
      }
    }
  };

  console.log('Chat Op Listener initialized');
  return () => channel.close();
}
