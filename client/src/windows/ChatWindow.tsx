
import { useEffect, useState, useRef } from 'react';
import { Send, User, MoreVertical, Trash2, LogOut } from 'lucide-react';
import { messagingStore as chatStore } from '../stores/messagingStore';
import { useAuthStore } from '../stores/authStore';

export default function ChatWindow() {
  // Parsing ID manually if not using Router or if window.location is raw
  // But App.tsx uses Router likely.
  const [roomId, setRoomId] = useState<string>('');
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
      loadMessages(id);
      loadRoomInfo(id);
    }
  }, []);

  // Listen for broadcast updates (New Message)
  useEffect(() => {
    const channel = new BroadcastChannel('chat_updates');
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_MESSAGE' && event.data.roomId === roomId) {
        loadMessages(roomId);
      }
    };
    return () => channel.close();
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async (id: string) => {
    const msgs = await chatStore.getMessages(id);
    setMessages(msgs.sort((a, b) => a.timestamp - b.timestamp));
  };

  const loadRoomInfo = async (id: string) => {
    const room = await chatStore.getRoom(id);
    if (room) {
      setRoomName(room.name || 'Unknown Room');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !roomId || !currentUserId) return;

    // We need peers to send to.
    const room = await chatStore.getRoom(roomId);
    if (!room) return;

    // Send via ChatOpListener (Main Window) -> P2P layer
    // Or directly invoking handler if we are in the same context?
    // ChatWindow is in a separate window if we use window.open / Tauri window?
    // If it's a separate window, it doesn't share memory with Main Window P2PManager.
    // So we must use BroadcastChannel to ask Main Window to send.

    const opChannel = new BroadcastChannel('chat_ops');
    opChannel.postMessage({
      type: 'SEND_MESSAGE',
      roomId,
      content: inputValue,
      senderId: currentUserId
    });
    opChannel.close();

    // Optimistic update or wait for reload?
    // The main window will convert OP to P2P and save to DB.
    // Then msg saved -> chat_updates -> we reload.
    // Slight delay.
    setInputValue('');
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
                  // Clear Logic (Optional: Just clean local state or mark as hidden?)
                  // Currently clearAll isn't exposed in ChatWindow context directly or we need a new Op.
                  // For now, simple console log or TODO.
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
                <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-zinc-500'}`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

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


