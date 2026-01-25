import { p2pManager, P2PMessage } from './P2PManager';
import { messagingStore as chatStore } from '../../stores/messagingStore';
import { useAlarmStore } from '../../stores/alarmStore';
import { useAuthStore } from '../../stores/authStore';

class ChatHandler {
  private processedMessages = new Set<string>();

  constructor() {
    p2pManager.subscribe(this.handleP2PMessage.bind(this));
  }

  private async handleP2PMessage(_peerId: string, msg: P2PMessage) {
    if (msg.feature === 'chat' && msg.roomId && msg.payload) {
      // Payload expects: { senderId, content }
      const { senderId, content, id } = msg.payload;

      // Simple transient dedupe:
      const msgSignature = id || `${msg.roomId}:${senderId}:${content}:${Math.floor(Date.now() / 1000)}`; // Second-level granularity
      if (this.processedMessages.has(msgSignature)) {
        console.log('Skipping duplicate message:', msgSignature);
        return;
      }
      this.processedMessages.add(msgSignature);
      setTimeout(() => this.processedMessages.delete(msgSignature), 5000); // Clear after 5s

      console.log(`Received Chat from ${senderId} in Room ${msg.roomId}: ${content}`);

      await chatStore.addMessage({
        id: id, // Use received ID for idempotency
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

      // Trigger Alarm with formatted message (respecting privacy)
      const sender = useAuthStore.getState().crew.find(c => c.id === senderId);
      const senderName = sender?.username || 'Unknown User';

      const room = await chatStore.getRoom(msg.roomId);
      const isGroup = room && (room.participants.length > 2 || (room.name && room.name !== 'New Room'));

      // Clean content (truncate if too long)
      const cleanContent = content.length > 50 ? content.substring(0, 50) + '...' : content;

      const { chatPrivacy } = useAlarmStore.getState().settings;

      let title = '';
      let alarmMsg = '';

      if (chatPrivacy === 'simple') {
        title = '알림';
        alarmMsg = '새 메시지가 도착했습니다.';
      } else if (chatPrivacy === 'sender') {
        if (isGroup) {
          const roomName = room?.name || 'Group Chat';
          title = roomName;
          alarmMsg = `${senderName}님이 메시지를 보냈습니다.`;
        } else {
          title = senderName;
          alarmMsg = '새 메시지를 보냈습니다.';
        }
      } else { // 'all'
        if (isGroup) {
          const roomName = room?.name || 'Group Chat';
          title = `${roomName} - ${senderName}`;
          alarmMsg = cleanContent;
        } else {
          title = senderName;
          alarmMsg = cleanContent;
        }
      }

      useAlarmStore.getState().addAlarm(alarmMsg, 'info', 'medium', title, msg.roomId);
    }
  }

  public sendMessage(roomId: string, content: string, senderId: string, participants: string[]) {
    const msgId = crypto.randomUUID();

    // 1. Save locally with generated ID
    chatStore.addMessage({
      id: msgId,
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
      payload: { id: msgId, senderId, content }
    };

    p2pManager.broadcast(participants, msg);
  }
}

export const chatHandler = new ChatHandler();
