import { useEffect, useState, useRef } from 'react';
import { Send, User, MoreVertical, Trash2, LogOut } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';

export default function ChatWindow() {
  const [roomId, setRoomId] = useState<string>('');

  // Zustand Store Hooks
  const storedMessages = useChatStore(state => roomId ? state.messages[roomId] : undefined);
  const storedRooms = useChatStore(state => state.rooms);
  // Get participants safely
  const currentRoom = storedRooms[roomId];
  const participants = currentRoom?.participants || [];

  // Stable empty array to prevent unnecessary effect triggers
  const EMPTY_ARRAY: any[] = [];
  const activeMessages = storedMessages || EMPTY_ARRAY;

  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [roomName, setRoomName] = useState('Chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const authUser = useAuthStore(state => state.user);

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fallback ID from URL if store not ready
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    if (authUser?.user_id) {
      setCurrentUserId(authUser.user_id);
    } else {
      const params = new URLSearchParams(window.location.search);
      const uid = params.get('uid');
      if (uid) setCurrentUserId(uid);
    }
  }, [authUser]);

  // Simple manual route param extraction
  useEffect(() => {
    const path = window.location.pathname;
    const prefix = '/chat/';
    if (path.startsWith(prefix)) {
      const id = path.slice(prefix.length);
      setRoomId(id);
      // Initial Load
      useChatStore.getState().loadMessages(id);
      useChatStore.getState().loadRooms(); // Ensure room info is loaded
    }
  }, []);

  // Update Room Info when ID or Rooms change
  useEffect(() => {
    if (roomId && storedRooms[roomId]) {
      setRoomName(storedRooms[roomId].name || 'Unknown Room');
    }
  }, [roomId, storedRooms]);

  // Sync Messages from Store to Local State
  useEffect(() => {
    setMessages([...activeMessages].sort((a, b) => a.timestamp - b.timestamp));
  }, [activeMessages]);

  // Listen for broadcast updates (New Message)
  useEffect(() => {
    const channel = new BroadcastChannel('chat_updates');
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_MESSAGE' && event.data.roomId === roomId) {
        useChatStore.getState().loadMessages(roomId);
      }
    };
    return () => channel.close();
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !roomId || !currentUserId) return;

    // Clear immediately to prevent double-submit
    const contentToSend = inputValue;
    setInputValue('');

    // Generate ID here to ensure idempotency if listener triggers multiple times
    const messageId = crypto.randomUUID();

    if (participants.length === 0) {
      console.warn('[ChatWindow] Sending message with 0 participants! Room:', roomId);
    }

    // Send via ChatOpListener (Main Window) -> P2P layer
    const opChannel = new BroadcastChannel('chat_ops');
    opChannel.postMessage({
      type: 'SEND_MESSAGE',
      id: messageId,
      roomId,
      content: contentToSend,
      senderId: currentUserId,
      participants // Send directly
    });
    opChannel.close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing) return; // Ignore IME composition confirm
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-white font-sans">
      {/* Header */}
      <div className="h-12 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 drag-region select-none relative">
        <div className="flex items-center gap-2">
          <User size={16} className="text-blue-400" />
          <span className="font-semibold text-sm">{roomName}</span>
        </div>

        <div className="no-drag">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <MoreVertical size={18} />
          </button>

          {showMenu && (
            <div ref={menuRef} className="absolute right-4 top-10 w-40 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl z-50 flex flex-col py-1">
              <button
                onClick={() => {
                  console.log('Clear Chat requested');
                  setShowMenu(false);
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white w-full text-left"
              >
                <Trash2 size={14} />
                대화내용 삭제
              </button>
              <button
                onClick={() => {
                  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
                    getCurrentWindow().close();
                  });
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-zinc-800 hover:text-red-300 w-full text-left"
              >
                <LogOut size={14} />
                나가기
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.senderId === currentUserId;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isMe ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200'
                  }`}
              >
                {msg.content}
                <div className={`text-[10px] mt-1 text-right flex items-center justify-end gap-1 ${isMe ? 'text-blue-200' : 'text-zinc-500'}`}>
                  <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {/* [읽음 표시] 내가 보낸 메시지이고, 상대가 읽었다면 파란색 체크 표시 */}
                  {isMe && (
                    <span title={msg.status === 'read' ? "읽음" : "전송됨"}>
                      {msg.status === 'read' ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* [읽음 처리 로직] 효과적인 시점에 읽음 신호를 보내기 위한 Hook */}
      {/* 메시지 목록이 업데이트되거나 창이 열릴 때, 내가 안 읽은 메시지가 있다면 읽음 처리를 수행합니다. */}
      <ReadReceiptTrigger
        roomId={roomId}
        messages={messages}
        currentUserId={currentUserId}
        participants={storedRooms[roomId]?.participants || []}
      />

      {/* Input */}
      <div className="p-4 bg-zinc-900 border-t border-zinc-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// [헬퍼 컴포넌트] 읽음 처리 트리거
// useEffect를 사용하여 '안 읽은 메시지'를 감지하고, 자동으로 읽음 신호를 보냅니다.
function ReadReceiptTrigger({ roomId, messages, currentUserId, participants }: { roomId: string, messages: any[], currentUserId: string, participants: string[] }) {
  useEffect(() => {
    if (!roomId || !currentUserId || messages.length === 0) return;

    // 1. 내가 읽지 않았고(status !== 'read'), 내가 보낸 메시지가 아닌(senderId !== currentUserId) 메시지 찾기
    const unreadMessages = messages.filter(m =>
      m.senderId !== currentUserId && m.status !== 'read'
    );

    if (unreadMessages.length > 0) {
      const ids = unreadMessages.map(m => m.id);

      // 2. ChatHandler를 통해 P2P 읽음 신호 전송
      // (약간의 지연을 두어 UI가 그려진 후 처리되도록 할 수도 있으나, 여기선 즉시 처리)
      import('../services/p2p/ChatHandler').then(({ chatHandler }) => {
        chatHandler.sendReadReceipt(roomId, ids, participants);
      });
    }
  }, [roomId, messages, currentUserId, participants]); // 메시지 목록이 바뀔 때마다 체크

  return null; // 화면에 그릴 것은 없음
}
