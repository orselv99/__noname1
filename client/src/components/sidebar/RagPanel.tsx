import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Loader2, Sparkles, Send, User, Bot, Plus, History, MessageSquare, X, Pencil } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';

export function RagPanel() {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const {
    chats, currentChatId, messages,
    isLoading, isLoadingMore, hasMore,
    loadChats, selectChat, createNewChat, sendMessage, loadMoreMessages, renameChat
  } = useChatStore();

  const handleRename = async (chatId: string) => {
    if (!editTitle.trim()) {
      setEditingChatId(null);
      return;
    }
    await renameChat(chatId, editTitle);
    setEditingChatId(null);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isFirstRender = useRef(true);
  const [prevScrollHeight, setPrevScrollHeight] = useState(0);

  // Load chats on mount
  useEffect(() => {
    loadChats();
  }, [loadChats]);

  // Auto-select latest chat if none selected and chats exist
  useEffect(() => {
    if (!currentChatId && chats.length > 0 && !showHistory) {
      // Optional: Select the first one? Or start fresh?
      // Start fresh usually better for "Ask AI". 
      // User can go to history if needed.
      // Let's keep it reset (New Chat) state by default.
    }
  }, [chats, currentChatId, showHistory]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight } = e.currentTarget;
    if (scrollTop === 0 && hasMore && !isLoadingMore && currentChatId) {
      setPrevScrollHeight(scrollHeight);
      loadMoreMessages();
    }
  };

  useLayoutEffect(() => {
    if (containerRef.current && prevScrollHeight > 0) {
      const newScrollHeight = containerRef.current.scrollHeight;
      containerRef.current.scrollTop = newScrollHeight - prevScrollHeight;
      setPrevScrollHeight(0);
    }
  }, [messages, prevScrollHeight]);

  useEffect(() => {
    if (prevScrollHeight === 0 && !isLoadingMore) {
      if (isFirstRender.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        isFirstRender.current = false;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, isLoadingMore, prevScrollHeight]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const userQuery = input.trim();
    setInput('');
    await sendMessage(userQuery);
  };

  const handleSelectChat = (id: string) => {
    selectChat(id);
    setShowHistory(false);
    isFirstRender.current = true;
  };

  const handleNewChat = () => {
    createNewChat();
    setShowHistory(false);
    isFirstRender.current = true;
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-hidden">
      {/* Header */}
      <div className="h-12 p-3 border-b border-zinc-800 text-zinc-400 font-medium text-xs uppercase tracking-wider flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-blue-400" />
          <span className="flex-1 truncate">
            {showHistory ? "History" : (currentChatId ? chats.find(c => c.id === currentChatId)?.title || "AI SEARCH" : "AI SEARCH")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded transition-colors ${showHistory ? 'text-blue-400 bg-zinc-800' : 'text-zinc-500 hover:text-zinc-300'}`}
            title="History"
          >
            <History size={14} />
          </button>
          <button
            onClick={handleNewChat}
            className="text-zinc-500 hover:text-blue-400 p-1.5 rounded transition-colors"
            title="New Chat"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Main Content: History or Chat */}
      <div className="flex-1 overflow-hidden relative">

        {/* History List Overlay/View */}
        {showHistory ? (
          <div className="absolute inset-0 overflow-y-auto bg-zinc-950 z-10 custom-scrollbar flex flex-col">
            {/* Search Input */}
            <div className="p-3 sticky top-0 bg-zinc-950 z-10 border-b border-zinc-900">
              <input
                type="text"
                placeholder="Search history..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-blue-500 transition-colors"
                onChange={(e) => loadChats(e.target.value)}
              />
            </div>

            <div className="p-2 flex-1">
              {chats.length === 0 ? (
                <div className="text-center text-zinc-600 mt-10 text-xs">No history</div>
              ) : (
                <div className="space-y-1">
                  {chats.map(chat => {
                    const isEditing = editingChatId === chat.id;
                    return (
                      <div key={chat.id} className="group relative">
                        <div
                          className={`w-full text-left p-3 rounded border transition-all flex items-center gap-3 
                                        ${currentChatId === chat.id
                              ? 'bg-zinc-900 border-blue-900/50 text-blue-100'
                              : 'bg-zinc-950 border-zinc-900 hover:bg-zinc-900 hover:border-zinc-800 text-zinc-400'}
                                    `}
                        >
                          <button onClick={() => !isEditing && handleSelectChat(chat.id)} className="flex items-center gap-3 flex-1 min-w-0">
                            <MessageSquare size={14} className={`shrink-0 ${currentChatId === chat.id ? 'text-blue-500' : 'text-zinc-600 group-hover:text-zinc-500'}`} />
                            <div className="flex-1 min-w-0 pr-12 text-left">
                              {isEditing ? (
                                <input
                                  autoFocus
                                  type="text"
                                  className="w-full bg-zinc-800 border border-blue-500/50 rounded px-1 py-0.5 text-sm text-zinc-200 focus:outline-none"
                                  value={editTitle}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  onBlur={() => handleRename(chat.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename(chat.id);
                                    if (e.key === 'Escape') setEditingChatId(null);
                                  }}
                                />
                              ) : (
                                <>
                                  <div className="text-sm font-medium truncate">{chat.title}</div>
                                  <div className="text-[10px] text-zinc-600 mt-0.5">
                                    {new Date(chat.created_at).toLocaleString()}
                                  </div>
                                </>
                              )}
                            </div>
                          </button>
                        </div>

                        {!isEditing && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingChatId(chat.id);
                                setEditTitle(chat.title);
                              }}
                              className="p-1.5 text-zinc-600 hover:text-blue-400 rounded hover:bg-zinc-800 transition-colors"
                              title="Rename Chat"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this chat?')) {
                                  useChatStore.getState().deleteChat(chat.id);
                                }
                              }}
                              className="p-1.5 text-zinc-600 hover:text-red-400 rounded hover:bg-zinc-800 transition-colors"
                              title="Delete Chat"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Chat Messages Area */
          <div
            ref={containerRef}
            className="h-full overflow-y-auto p-4 custom-scrollbar"
            onScroll={handleScroll}
          >
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 size={16} className="animate-spin text-zinc-500" />
              </div>
            )}

            {messages.length === 0 && !isLoading ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-zinc-500">
                <div className="w-12 h-12 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-blue-400/50" />
                </div>
                <p className="text-sm font-medium text-zinc-300 mb-1">AI Knowledge Base</p>
                <p className="text-xs max-w-[200px] leading-relaxed">
                  Ask questions about your entire document collection.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-blue-600' : 'bg-zinc-800'
                      }`}>
                      {msg.role === 'user' ? <User size={12} /> : <Bot size={12} className="text-blue-400" />}
                    </div>

                    <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap ${msg.role === 'user'
                        ? 'bg-blue-600/90 text-white rounded-tr-none'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none'
                        }`}>
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-zinc-600 mt-1 px-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="shrink-0 w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center">
                      <Bot size={12} className="text-blue-400" />
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg rounded-tl-none px-4 py-3 flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin text-zinc-500" />
                      <span className="text-xs text-zinc-500">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Area (Disabled when validation history list is open? No, why not allow starting new chat from there?) */}
      {!showHistory && (
        <div className="p-3 border-t border-zinc-800 bg-zinc-950 shrink-0">
          <form onSubmit={handleSubmit} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder="Ask about your documents..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 pr-9 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-zinc-200 placeholder-zinc-600 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="absolute right-1 top-1 bottom-1 aspect-square flex items-center justify-center text-zinc-400 hover:text-blue-500 disabled:opacity-50 disabled:hover:text-zinc-400 transition-colors"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
