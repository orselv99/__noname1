import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Sparkles, Send, Plus, History, MessageSquare, X, Pencil, Database, Globe, ExternalLink, FileText, ChevronDown, Calendar, Tag } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useChatStore } from '../../stores/chatStore';
import { useDocumentStore } from '../../stores/documentStore';


function CollapsibleSection({ title, icon: Icon, children, count, colorClass, defaultExpanded = true }: any) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  if (!count && count !== 0) count = 0;

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 w-full text-left mb-2 text-[11px] font-bold uppercase tracking-wider ${colorClass} hover:opacity-80 transition-opacity select-none`}
      >
        <Icon size={12} />
        <span className="flex-1">{title}</span>
        {count > 0 && <span className="text-[10px] opacity-70 bg-zinc-800/50 px-1.5 rounded-full">{count}</span>}
        <ChevronDown size={12} className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
      </button>
      {isOpen && <div className="space-y-1 px-1 animate-in slide-in-from-top-1 duration-200">{children}</div>}
    </div>
  );
}

function ServerDocPopup({ doc, onClose }: { doc: any, onClose: () => void }) {
  if (!doc) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-700 bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 rounded bg-blue-500/10 text-blue-400 shrink-0">
              <Database size={18} />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-zinc-100 truncate text-base">{doc.metadata.title || "Untitled"}</h3>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mt-1">
                {doc.metadata.created_at && (
                  <span className="flex items-center gap-1">
                    <Calendar size={10} />
                    {new Date(doc.metadata.created_at).toLocaleDateString()}
                  </span>
                )}
                {doc.metadata.score && (
                  <span className="bg-blue-900/30 text-blue-400 px-1.5 rounded">
                    {Number(doc.metadata.score).toFixed(2)} similarity
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white rounded-md hover:bg-zinc-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* Summary if available */}
          {doc.metadata.summary && (
            <div className="mb-6 p-4 bg-zinc-950/50 rounded-lg border border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Sparkles size={12} className="text-yellow-500" /> Summary
              </h4>
              <p className="text-sm text-zinc-300 leading-relaxed">{doc.metadata.summary}</p>
            </div>
          )}

          {/* Main Content */}
          <div className="prose prose-invert prose-sm max-w-none">
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-300">
              {doc.content}
            </div>
          </div>

          {/* Tags */}
          {doc.metadata.tag_evidences && doc.metadata.tag_evidences.length > 0 && (
            <div className="mt-8 pt-4 border-t border-zinc-800">
              <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Tag size={12} /> Tags
              </h4>
              <div className="flex flex-wrap gap-2">
                {doc.metadata.tag_evidences.map((tag: any, i: number) => (
                  <span key={i} className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    #{tag.tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-700 bg-zinc-900/50 text-right shrink-0">
          <button onClick={onClose} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ResultItem({ result, type, hoverColor, onSelect }: { result: any, type: 'local' | 'server' | 'web', hoverColor?: string, onSelect?: (result: any) => void }) {
  const documents = useDocumentStore(state => state.documents);
  const addTab = useDocumentStore(state => state.addTab);

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (type === 'server' && onSelect) {
      onSelect(result);
      return;
    }

    if (type === 'web') {
      if (result.metadata.url) {
        try {
          await openUrl(result.metadata.url);
        } catch (error) {
          console.error("Failed to open URL:", error);
          window.open(result.metadata.url, '_blank');
        }
      }
    } else {
      // For local, open/select the document
      const doc = documents.find(d => d.id === result.metadata.id);
      if (doc) {
        addTab(doc);
      } else {
        console.warn("Document not found locally:", result.metadata.id);
      }
    }
  };

  const getBadgeColor = (group: string) => {
    switch (group) {
      case 'Private': return 'bg-zinc-800 text-zinc-400';
      case 'Personal': return 'bg-purple-900/30 text-purple-400'; // Local/Personal -> Purple
      case 'Department': return 'bg-pink-900/30 text-pink-400';
      case 'Project': return 'bg-indigo-900/30 text-indigo-400';
      case 'Web': return 'bg-green-900/30 text-green-400';
      case 'Server': return 'bg-blue-900/30 text-blue-400'; // Server -> Blue
      default: return 'bg-zinc-800 text-zinc-500';
    }
  };

  const hoverClass = hoverColor || "group-hover:text-blue-400";

  return (
    <div
      className="bg-zinc-950/50 border border-zinc-800 rounded-md p-3 cursor-pointer hover:border-zinc-700 hover:bg-zinc-900/50 transition-all group"
      onClick={handleOpen}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs font-medium text-zinc-300 truncate transition-colors ${hoverClass}`}>
            {result.metadata.title || "Untitled"}
          </span>
          {/* Group Badge - Hide for Web */}
          {type !== 'web' && result.metadata.group_name && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide ${getBadgeColor(result.metadata.group_name)}`}>
              {result.metadata.group_name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Similarity Score */}
          {result.metadata.similarity !== undefined && (
            <span className="text-[9px] text-zinc-500 font-mono">
              {result.metadata.similarity.toFixed(0)}%
            </span>
          )}
          <div className={`text-zinc-600 transition-colors ${hoverClass}`}>
            <ExternalLink size={12} />
          </div>
        </div>
      </div>

      <div className="text-xs text-zinc-500 line-clamp-2 break-all leading-relaxed">
        {result.content}
      </div>

      {/* Web URL Footer */}
      {type === 'web' && result.metadata.url && (
        <div className="mt-2 text-[10px] text-zinc-600 flex items-center gap-1 truncate">
          <Globe size={10} />
          {new URL(result.metadata.url).hostname}
        </div>
      )}
    </div>
  );
}

import { ThinkingAccordion } from '../ui/ThinkingAccordion';

export function RagPanel() {
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedServerDoc, setSelectedServerDoc] = useState<any>(null);


  const {
    chats, currentChatId, messages,
    isLoading, loadingStatus, thinkingProcess, isLoadingMore, hasMore,
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
  const isAutoScrollEnabled = useRef(true);
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
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

    // Check if user is near bottom (within 50px)
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    isAutoScrollEnabled.current = distanceFromBottom < 50;

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
      // Don't enable auto-scroll when loading history
      isAutoScrollEnabled.current = false;
    }
  }, [messages, prevScrollHeight]);

  const scrollToBottom = () => {
    if (isFirstRender.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      isFirstRender.current = false;
      isAutoScrollEnabled.current = true;
    } else if (isAutoScrollEnabled.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  useEffect(() => {
    if (prevScrollHeight === 0 && !isLoadingMore) {
      scrollToBottom();
    }
  }, [messages, thinkingProcess, isLoadingMore, prevScrollHeight]);

  // Also scroll when server doc selected? No, popup is overlay.

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

  // Helper Component for Thinking Process moved outside


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
                {messages.map((msg) => {
                  let isRagResult = false;
                  let ragData: any = null;

                  if (msg.role === 'assistant' && msg.content.trim().startsWith('{')) {
                    try {
                      const parsed = JSON.parse(msg.content);
                      if (parsed.type === 'rag_search_result') {
                        isRagResult = true;
                        ragData = parsed;
                      }
                    } catch (e) { }
                  }

                  if (isRagResult && ragData) {
                    return (
                      <div key={msg.id} className="flex flex-col gap-2 w-full mb-6">
                        {/* 1. Thinking Process (Left Aligned, Separate) */}
                        {ragData.thinking_process && (
                          <div className="flex justify-start w-full max-w-[90%]">
                            <ThinkingAccordion state={ragData.thinking_process as any} status="Thinking Process" />
                          </div>
                        )}

                        {/* 2. Search Result (Center Aligned) */}
                        <div className="flex justify-center w-full">
                          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 w-full max-w-3xl shadow-lg">
                            <div className="font-medium text-zinc-200 mb-4 text-base">{ragData.summary}</div>

                            {/* Local Results */}
                            {ragData.results.local.length > 0 && (
                              <CollapsibleSection
                                title="Local Docs"
                                icon={FileText}
                                colorClass="text-purple-400"
                                count={ragData.results.local.length}
                              >
                                {ragData.results.local.map((r: any, i: number) => (
                                  <ResultItem
                                    key={i}
                                    result={r}
                                    type="local"
                                    hoverColor="group-hover:text-purple-400"
                                  />
                                ))}
                              </CollapsibleSection>
                            )}

                            {/* Server Results */}
                            <CollapsibleSection
                              title="Server Docs"
                              icon={Database}
                              colorClass="text-blue-400"
                              count={ragData.results.server.length}
                            >
                              {ragData.results.server.length > 0 ? (
                                ragData.results.server.map((r: any, i: number) => (
                                  <ResultItem
                                    key={i}
                                    result={r}
                                    type="server"
                                    hoverColor="group-hover:text-blue-400"
                                    onSelect={(doc) => setSelectedServerDoc(doc)}
                                  />
                                ))
                              ) : (
                                <div className="text-xs text-zinc-500 italic px-1">
                                  검색된 서버 문서가 없습니다
                                </div>
                              )}
                            </CollapsibleSection>

                            {/* Web Results */}
                            {ragData.results.web.length > 0 && (
                              <CollapsibleSection
                                title="Web Search"
                                icon={Globe}
                                colorClass="text-green-400"
                                count={ragData.results.web.length}
                              >
                                {ragData.results.web.map((r: any, i: number) => (
                                  <ResultItem
                                    key={i}
                                    result={r}
                                    type="web"
                                    hoverColor="group-hover:text-green-400"
                                  />
                                ))}
                              </CollapsibleSection>
                            )}

                            <div className="pt-3 border-t border-zinc-800/50 text-xs text-zinc-500 flex items-center gap-2">
                              <Sparkles size={12} className="text-zinc-600" />
                              <span>종합 답변 생성 기능은 준비 중입니다</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pr-4">
                          <span className="text-[10px] text-zinc-600">
                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    );
                  }

                  // Standard Message Rendering
                  return (
                    <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex flex-col max-w-[90%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                        <div className={`px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap wrap-break-word ${msg.role === 'user'
                          ? 'bg-blue-600/90 text-white rounded-tr-none'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none w-full min-w-0'
                          }`}>
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-zinc-600 mt-1 px-1">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {isLoading && thinkingProcess && (
                  <div className="flex gap-3 w-full">
                    <ThinkingAccordion
                      state={thinkingProcess as any}
                      status={loadingStatus || "답변 생성 중..."}
                      defaultExpanded={true}
                    />
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

      {/* Server Doc Popup */}
      <ServerDocPopup doc={selectedServerDoc} onClose={() => setSelectedServerDoc(null)} />
    </div>
  );
}
