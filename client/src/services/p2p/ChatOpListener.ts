import { chatHandler } from './ChatHandler';
import { useChatStore } from '../../stores/chatStore';

export function initChatOpListener() {
  const channel = new BroadcastChannel('chat_ops');

  channel.onmessage = async (event) => {
    const { type, roomId, content, senderId, id, participants } = event.data;

    if (type === 'SEND_MESSAGE') {
      console.log('[Main] Received SEND_MESSAGE op:', event.data);

      if (participants && participants.length > 0) {
        // Use passed participants directly (preferred)
        chatHandler.sendMessage(roomId, content, senderId, participants, id);
      } else {
        // Fallback to store lookup
        const room = useChatStore.getState().getRoom(roomId);
        if (room) {
          chatHandler.sendMessage(roomId, content, senderId, room.participants, id);
        } else {
          console.error('[Main] Room not found for sending:', roomId);
          // Try loading if not found?
          await useChatStore.getState().loadRooms();
          const reloadedRoom = useChatStore.getState().getRoom(roomId);
          if (reloadedRoom) {
            chatHandler.sendMessage(roomId, content, senderId, reloadedRoom.participants, id);
          }
        }
      }
    }
  };

  console.log('Chat Op Listener initialized');
  return () => channel.close();
}
