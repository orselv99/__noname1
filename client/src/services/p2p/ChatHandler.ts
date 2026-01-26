// ============================================================================
// ChatHandler.ts - P2P 채팅 핵심 핸들러
// ============================================================================
//
// [P2P(Peer-to-Peer) 채팅이란?]
// 전통적인 채팅 (카카오톡, 슬랙 등):
//   사용자A → 서버 → 사용자B  (서버가 중계)
//
// P2P 채팅 (이 앱):
//   사용자A ←→ 사용자B  (직접 연결, 서버 없음!)
//
// [장점]
// - 서버 부하 없음 (무료 운영 가능)
// - 빠른 전송 (중간 서버 없이 직접 전송)
// - 프라이버시 (서버에 메시지 저장 안 됨)
//
// [단점/해결]
// - 상대방이 오프라인이면 전송 불가 → 로컬 DB에 저장 후 나중에 재시도
// - 연결 설정이 복잡함 → WebRTC + Signaling 서버로 해결
//
// [이 파일의 역할]
// 1. P2P 메시지 수신 처리 (handleP2PMessage)
// 2. 메시지 전송 처리 (sendMessage)
// 3. 읽음 확인 전송 (sendReadReceipt)
// 4. 알람 생성 (새 메시지 도착 시)
//
// [관련 파일]
// - P2PManager.ts  : WebRTC 연결 관리 (실제 데이터 전송)
// - RoomManager.ts : 채팅방 생성/관리
// - chatStore.ts   : 채팅 데이터 저장 (로컬 DB)
// ============================================================================

import { p2pManager, P2PMessage } from './P2PManager';
import { useChatStore } from '../../stores/chatStore';
import { useAlarmStore } from '../../stores/alarmStore';
import { useAuthStore } from '../../stores/authStore';

// ============================================================================
// ChatHandler 클래스
// ============================================================================
// 싱글톤으로 사용됨 (파일 하단에서 export const chatHandler = new ChatHandler())
// P2PManager에서 메시지를 받으면 handleP2PMessage가 호출됨
// ============================================================================
class ChatHandler {
  // 이미 처리한 메시지 ID를 저장하여 중복 처리 방지
  // Set<string>: 빠른 검색을 위한 해시 집합
  private processedMessages = new Set<string>();

  constructor() {
    // P2PManager에 리스너 등록
    // P2P 메시지가 도착하면 handleP2PMessage가 자동으로 호출됨
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

      // ========================================================================
      // [중복 메시지 방지 로직 - P2P 수신 전용]
      // ========================================================================
      // 이 체크는 P2P로 "수신한" 메시지에만 적용됩니다.
      // 
      // 주의: processedMessages는 이제 P2P 수신 메시지 ID만 저장합니다.
      // sendMessage()에서 추가한 ID는 별도의 sentMessageIds로 관리합니다.
      //
      // 이렇게 분리해야 하는 이유:
      // - 내가 보낸 메시지 ID가 여기에 있으면, 상대방에게서 온 다른 메시지도 
      //   우연히 같은 ID로 착각할 수 있음 (실제로는 다른 ID이지만 타이밍 문제로)
      //
      // chatStore.addMessage()가 최종 중복 체크를 하므로 여기서는 빠른 필터링만 수행
      // ========================================================================

      // ID가 있는 경우에만 중복 체크 (ID 없는 메시지는 항상 새 메시지로 처리)
      if (id && this.processedMessages.has(id)) {
        console.log('[ChatHandler] P2P 중복 메시지 감지 (이미 수신함):', id);
        return;
      }

      // P2P로 수신한 메시지 ID 등록 (5초간 유지)
      if (id) {
        this.processedMessages.add(id);
        setTimeout(() => this.processedMessages.delete(id), 5000);
      }

      console.log(`[ChatHandler] Processing P2P Chat from ${senderId} in Room ${msg.roomId}`);

      // ========================================================================
      // [채팅방 존재 여부 확인 및 자동 생성]
      // ========================================================================
      // 메시지를 받았는데 내 로컬 DB에 해당 채팅방(roomId)이 없을 수 있습니다.
      // (예: 초대 신호(INVITE)를 못 받은 상태에서 메시지가 먼저 도착함)
      // 이 경우, 메시지를 저장하려면 부모가 되는 '채팅방'이 먼저 있어야 합니다.
      // 따라서 방이 없으면 즉시 자동으로 생성해줍니다.
      // ========================================================================
      const chatStore = useChatStore.getState();
      let targetRoom = chatStore.getRoom(msg.roomId);

      if (!targetRoom) {
        console.warn(`[ChatHandler] 방이 없음! 자동 생성 시도. RoomId: ${msg.roomId}`);

        // 내 ID 가져오기
        const myId = useAuthStore.getState().user?.user_id || 'unknown';

        // 참여자 목록 추정 (최소한 보낸사람과 나는 포함됨)
        // 1:1 채팅이라고 가정하고 복구 (참명자가 더 있어도 나중에 동기화됨)
        const participants = [senderId, myId];

        // 보낸 사람 정보 찾기 (방 이름 만들 때 필요)
        const senderInfo = useAuthStore.getState().crew.find(c => c.id === senderId);
        const senderName = senderInfo?.username || 'Unknown User';

        // 방 생성 (DB 저장)
        await chatStore.createOrUpdateRoom({
          id: msg.roomId,
          participants: participants,
          name: `${senderName} (자동 생성됨)` // 임시 방 이름
        });

        // 방 목록 다시 로드하여 메모리에 반영
        await chatStore.loadRooms();
        targetRoom = chatStore.getRoom(msg.roomId); // 이제 방이 있어야 함
        console.log('[ChatHandler] 방 자동 생성 완료:', targetRoom);
      }

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
      // ========================================================================
      // [알람 생성]
      // ========================================================================
      // 새 메시지가 도착했음을 사용자에게 알림
      // chatPrivacy 설정에 따라 표시 내용이 달라짐:
      // - 'simple': "새 메시지가 도착했습니다" (내용 숨김)
      // - 'sender': 발신자 이름만 표시
      // - 'all': 발신자 + 메시지 내용 표시
      // ========================================================================
      console.log('[ChatHandler] 알람 생성 준비:', {
        chatPrivacy,
        senderName,
        isGroup,
        roomName: room?.name,
        cleanContent
      });

      try {
        useAlarmStore.getState().addAlarm(alarmMsg, 'info', 'medium', title, msg.roomId);
        console.log('[ChatHandler] 알람 생성 완료! title:', title, 'msg:', alarmMsg);
      } catch (alarmError) {
        console.error('[ChatHandler] 알람 생성 실패:', alarmError);
      }
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

  // ============================================================================
  // [메시지 전송 함수]
  // ============================================================================
  // 사용자가 채팅창에서 메시지를 보낼 때 호출됩니다.
  // 
  // 동작 원리:
  // 1. 메시지 ID 생성 (또는 기존 ID 사용)
  // 2. 내 메시지가 P2P로 돌아와도 무시하도록 등록 (자기 에코 방지)
  // 3. 로컬 DB에 메시지 저장 (나중에 채팅창 열면 보이도록)
  // 4. BroadcastChannel로 채팅창에 알림 (UI 새로고침용)
  // 5. P2P 네트워크로 상대방에게 메시지 전송
  //
  // 주의: 채팅창(ChatWindow)은 별도 윈도우/프로세스이므로 직접 상태 공유 불가!
  //       따라서 DB에 저장하고, 채팅창이 DB를 다시 읽도록 알려야 함
  // ============================================================================
  public async sendMessage(roomId: string, content: string, senderId: string, participants: string[], existingId?: string) {
    console.log('[ChatHandler] sendMessage 호출:', { roomId, participants, existingId });

    // ========================================================================
    // Step 1: 메시지 ID 생성
    // ========================================================================
    // existingId가 있으면 그것을 사용 (재전송 등의 경우)
    // 없으면 UUID 생성 (고유한 식별자)
    const msgId = existingId || crypto.randomUUID();

    // ========================================================================
    // [자기 에코 방지 - senderId 체크로 처리됨]
    // ========================================================================
    // 이전에는 여기서 processedMessages.add(msgId)를 했지만,
    // 이것이 문제를 일으켰습니다:
    // - 내가 보낸 메시지 ID가 processedMessages에 들어가면,
    // - P2P로 수신하는 "다른" 메시지도 중복으로 처리될 수 있음
    //
    // 해결책: handleP2PMessage()에서 senderId === myId 체크로
    // 자기 메시지를 걸러내므로, 여기서 추가할 필요 없음
    // ========================================================================

    // ========================================================================
    // Step 3: 로컬 DB에 메시지 저장 (await로 완료 보장!)
    // ========================================================================
    // ★ 중요: await를 사용해서 DB 저장이 완료될 때까지 기다림!
    // 이전에는 .then()으로 처리해서 DB 저장 전에 BroadcastChannel이 발송되는 문제가 있었음
    // → 채팅창이 DB를 읽어도 아직 저장이 안 되어서 내 메시지가 안 보이는 버그!
    await useChatStore.getState().addMessage({
      id: msgId,
      roomId,
      senderId,
      content,
      status: 'sent',
      syncStatus: 'unsynced' // 서버 동기화 전 상태
    });

    // ========================================================================
    // Step 4: BroadcastChannel로 채팅창에 알림
    // ========================================================================
    // BroadcastChannel은 같은 Origin의 모든 탭/윈도우에 메시지를 보낼 수 있음
    // 채팅창(ChatWindow)이 이 메시지를 받으면 DB에서 메시지를 다시 로드함
    // → 이제 DB 저장이 완료된 후이므로, 내 메시지도 정상적으로 표시됨!
    const channel = new BroadcastChannel('chat_updates');
    channel.postMessage({ type: 'NEW_MESSAGE', roomId });
    channel.close();

    // ========================================================================
    // Step 5: P2P 네트워크로 상대방에게 전송
    // ========================================================================
    // P2PMessage 형식으로 패키징하여 참여자들에게 브로드캐스트
    // p2pManager.broadcast()는 나(myPeerId)를 제외한 참여자에게만 전송
    const msg: P2PMessage = {
      feature: 'chat',     // 기능 식별자 (chat, whiteboard 등 구분용)
      roomId,              // 채팅방 ID
      payload: {           // 실제 데이터
        id: msgId,         // 메시지 고유 ID (중복 방지용)
        senderId,          // 보낸 사람 ID
        content            // 메시지 내용
      }
    };

    p2pManager.broadcast(participants, msg);
    console.log('[ChatHandler] P2P 메시지 전송 완료:', msgId);
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
