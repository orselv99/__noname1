import { p2pManager, P2PMessage } from './P2PManager';
import { useChatStore } from '../../stores/chatStore';
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

      // 0. Ignore Self-Messages (processed locally via sendMessage)
      const myId = useAuthStore.getState().user?.user_id;
      console.log('[ChatHandler] P2P Receive:', { senderId, myId, id, roomId: msg.roomId });

      if (senderId === myId) {
        console.log('[ChatHandler] Skipping self-message from P2P');
        return;
      }

      // Simple transient dedupe:
      const msgSignature = id || `${msg.roomId}:${senderId}:${content}:${Math.floor(Date.now() / 1000)}`; // Second-level granularity
      if (this.processedMessages.has(msgSignature)) {
        console.log('[ChatHandler] Duplicate message detected (DEBUG: NOT SKIPPING):', msgSignature);
        // return; // DEBUG: Disable dedupe to see if message appears
      }
      this.processedMessages.add(msgSignature);
      setTimeout(() => this.processedMessages.delete(msgSignature), 5000); // Clear after 5s

      console.log(`[ChatHandler] Processing P2P Chat from ${senderId} in Room ${msg.roomId}`);

      try {
        await useChatStore.getState().addMessage({
          id: id, // Use received ID for idempotency
          roomId: msg.roomId,
          senderId: senderId,
          content: content,
          status: 'delivered',
          syncStatus: 'unsynced'
        });
        console.log('[ChatHandler] addMessage to store SUCCESS');
      } catch (e) {
        console.error('[ChatHandler] addMessage to store FAILED:', e);
      }

      // Notify UI (Window) via BroadcastChannel if needed
      const channel = new BroadcastChannel('chat_updates');
      channel.postMessage({ type: 'NEW_MESSAGE', roomId: msg.roomId });
      channel.close();

      // Trigger Alarm with formatted message (respecting privacy)
      const sender = useAuthStore.getState().crew.find(c => c.id === senderId);
      const senderName = sender?.username || 'Unknown User';

      const room = useChatStore.getState().getRoom(msg.roomId);

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

    // [P2P 수신 처리] 읽음 확인 신호 처리 ('chat_receipt')
    else if (msg.feature === 'chat_receipt' && msg.roomId && msg.payload) {
      const { messageIds, readerId } = msg.payload;
      console.log(`[ReadReceipt] ${readerId}님이 메시지를 읽었습니다:`, messageIds);

      // 내 로컬 스토어의 메시지 상태를 '읽음(read)'으로 업데이트합니다.
      // 이렇게 하면 UI에서 해당 메시지가 읽혔음을 표시할 수 있습니다.
      useChatStore.getState().markAsRead(msg.roomId, messageIds);
    }
  }

  public sendMessage(roomId: string, content: string, senderId: string, participants: string[], existingId?: string) {
    console.log('[ChatHandler] sendMessage called:', { roomId, participants, existingId });
    const msgId = existingId || crypto.randomUUID();

    // 0. Prevent Self-Echo (add to processed immediately)
    // We use the ID as the signature since we send it in the payload
    this.processedMessages.add(msgId);
    setTimeout(() => this.processedMessages.delete(msgId), 5000);

    // 1. Save locally with generated ID
    useChatStore.getState().addMessage({
      id: msgId,
      roomId,
      senderId,
      content,
      status: 'sent',
      syncStatus: 'unsynced' // Default for new messages
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

  // [P2P 전송] 읽음 확인 신호 보내기
  // 내가 메시지를 읽었음을 채팅방의 다른 참여자들에게 알립니다.
  public sendReadReceipt(roomId: string, messageIds: string[], participants: string[]) {
    if (messageIds.length === 0) return;

    const myId = useAuthStore.getState().user?.user_id;
    if (!myId) return;

    // 1. 내 로컬 스토어에도 '읽음'으로 반영 (중복 처리 방지 및 UI 즉시 반영)
    useChatStore.getState().markAsRead(roomId, messageIds);

    // 2. P2P로 '읽음 신호(chat_receipt)' 전송
    const msg: P2PMessage = {
      feature: 'chat_receipt',
      roomId,
      payload: {
        messageIds,
        readerId: myId,
        timestamp: Date.now()
      }
    };

    console.log(`[ReadReceipt] 읽음 신호 전송 (${messageIds.length}개) ->`, participants);

    // Ensure connections exist
    participants.forEach(pid => {
      if (pid !== myId) {
        p2pManager.connect(pid); // Idempotent check inside
      }
    });

    p2pManager.broadcast(participants, msg);
  }
}

export const chatHandler = new ChatHandler();
