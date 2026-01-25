import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PanelLeftClose, PanelLeft, PanelRightClose, PanelRight, FolderOpen, Star, ChevronDown, Search, List, MessageSquare, Calendar as CalendarIcon } from 'lucide-react';
import { isTauri } from './utils/tauri';

// Layout Components
import { WindowControls } from './components/layout/WindowControls';
import { ResizeHandle } from './components/layout/ResizeHandle';

// Sidebar Components
import { IconBar } from './components/sidebar/IconBar';
import { DocumentList } from './components/documentlist/DocumentList';
import { DocumentListSidebarMode as SidebarMode } from './components/documentlist/types';
import ChatWindow from './windows/ChatWindow';
import { initChatOpListener } from './services/p2p/ChatOpListener';
import { MetadataPanel } from './components/metadata/MetadataPanel';
import { DocumentListRecycleBin } from './components/documentlist/DocumentListRecycleBin';
import { useDocumentStore } from './stores/documentStore';
import { signalingService } from './services/SignalingService';
import { useAuthStore } from './stores/authStore';
import { LoginResponse } from './types';

// Dialog Components
import { SearchDialog } from './components/dialogs/SearchDialog';
import { SettingsDialog } from './components/dialogs/SettingsDialog';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { ConfirmProvider } from './components/ConfirmProvider';

// Auth Components
import { AuthLoginForm } from './components/auth/AuthLoginForm';
import { AuthChangePasswordForm } from './components/auth/AuthChangePasswordForm';

// Editor Components
import { EditorContainer } from './components/editor/EditorContainer';
import { EditorTabs } from './components/editor/EditorTabs';

// Other
import { ToastProvider, useToast } from './components/Toast';
import { StatusBar } from './components/StatusBar';
import { RagPanel } from './components/sidebar/RagPanel';
import { CrewPanel } from './components/sidebar/CrewPanel';
import { CalendarPanel } from './components/calendar/CalendarPanel';

// LoginResponse imported from types

function AppContent() {
  const { showToast } = useToast();
  const [view, setView] = useState<'login' | 'change_password' | 'main'>('login');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('folder');
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(250);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(320);

  // Dialog states
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // Initialize Chat Op Listener (Main Window Only)
  useEffect(() => {
    if (!window.location.pathname.startsWith('/chat/')) {
      return initChatOpListener();
    }
  }, []);

  // Chat Window Route
  if (window.location.pathname.startsWith('/chat/')) {
    return <ChatWindow />;
  }

  // Resize refs
  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const lastClickTimeRef = useRef(0);

  // Auth state
  const { user, refreshToken } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');

  // Pre-emptive Token Refresh Timer
  useEffect(() => {
    if (!user?.access_token || !user?.expires_in) return;

    // Refresh 60 seconds before expiration
    const refreshTime = (user.expires_in - 60) * 1000;

    if (refreshTime <= 0) {
      refreshToken();
      return;
    }

    console.log(`Scheduling token refresh in ${refreshTime / 1000}s`);
    const timer = setTimeout(() => {
      console.log("Executing pre-emptive token refresh...");
      refreshToken();
    }, refreshTime);

    return () => clearTimeout(timer);
  }, [user?.access_token, user?.expires_in, refreshToken]);

  // Disable default browser find
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        // Allow propagation so specific components can handle it
      }
    };
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, []);

  // Disable global context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // Tab Menu State
  // Tab Menu State
  const tabs = useDocumentStore(useCallback(state => state.tabs, []));
  const setActiveTab = useDocumentStore(state => state.setActiveTab);
  const [showTabMenu, setShowTabMenu] = useState(false);

  // Right Panel State
  const [activeRightTab, setActiveRightTab] = useState<'metadata' | 'rag' | 'crew' | 'calendar'>('metadata');

  // Determine active tab type
  const activeTabId = useDocumentStore(state => state.activeTabId);
  const activeTabType = useDocumentStore(state => {
    const tab = state.tabs.find(t => t.id === activeTabId);
    return tab?.type || 'document';
  });

  // Effect to switch right panel content based on main tab type
  useEffect(() => {
    if (activeRightTab === 'metadata' || activeRightTab === 'calendar') { // Only switch if in default/contextual mode
      if (activeTabType === 'calendar') {
        setActiveRightTab('calendar');
      } else {
        setActiveRightTab('metadata');
      }
    }
  }, [activeTabType]);

  // Drag to move window
  const handleDragStart = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    const now = Date.now();
    if (now - lastClickTimeRef.current < 300) {
      toggleMaximize();
      lastClickTimeRef.current = 0;
      return;
    }
    lastClickTimeRef.current = now;
    if (isTauri()) {
      getCurrentWindow().startDragging();
    }
  };

  const toggleMaximize = async () => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    if (await win.isMaximized()) await win.unmaximize();
    else await win.maximize();
  };

  // Left sidebar resize
  const handleMouseMoveLeft = useCallback((e: MouseEvent) => {
    if (!isResizingLeft.current) return;
    const newWidth = e.clientX - 48;
    if (newWidth >= 150 && newWidth <= 500) {
      setLeftSidebarWidth(newWidth);
    }
  }, []);

  const stopResizingLeft = useCallback(() => {
    isResizingLeft.current = false;
    document.removeEventListener('mousemove', handleMouseMoveLeft);
    document.removeEventListener('mouseup', stopResizingLeft);
  }, [handleMouseMoveLeft]);

  const startResizingLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingLeft.current = true;
    document.addEventListener('mousemove', handleMouseMoveLeft);
    document.addEventListener('mouseup', stopResizingLeft);
  }, [handleMouseMoveLeft, stopResizingLeft]);

  // Right sidebar resize
  const handleMouseMoveRight = useCallback((e: MouseEvent) => {
    if (!isResizingRight.current) return;
    const newWidth = window.innerWidth - e.clientX;
    if (newWidth >= 280 && newWidth <= 500) {
      setRightSidebarWidth(newWidth);
    }
  }, []);

  const stopResizingRight = useCallback(() => {
    isResizingRight.current = false;
    document.removeEventListener('mousemove', handleMouseMoveRight);
    document.removeEventListener('mouseup', stopResizingRight);
  }, [handleMouseMoveRight]);

  const startResizingRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRight.current = true;
    document.addEventListener('mousemove', handleMouseMoveRight);
    document.addEventListener('mouseup', stopResizingRight);
  }, [handleMouseMoveRight, stopResizingRight]);

  // Document Selection Handler
  const handleSelectDocument = useCallback((id: string) => {
    console.log('Selected:', id);
    const doc = useDocumentStore.getState().documents.find(d => d.id === id);
    if (doc) {
      useDocumentStore.getState().addTab(doc);
    }
  }, []);


  // Auth handlers
  const handleLogin = async (email: string, password: string, tenantId?: string) => {
    const data = await invoke<LoginResponse>('login', { email, password, tenantId });
    setCurrentPassword(password);

    useDocumentStore.getState().setCurrentUser(data);
    useAuthStore.getState().setUser(data);

    console.log(data);

    if (data.force_change_password) {
      setView('change_password');
    } else {
      showToast('Login successful', 'success');
      // Fetch crew list immediately after login
      useAuthStore.getState().fetchCrew(true);

      if (data.access_token) {
        // Connect to Signaling Server
        // TODO: Configurable URL
        signalingService.connect('ws://localhost:8080/api/v1/ws/signaling', data.user_id, data.access_token);
      }

      setView('main');
    }
  };

  const handleChangePassword = async (newPassword: string) => {
    await invoke('change_password', {
      currentPassword: currentPassword,
      newPassword: newPassword
    });
    showToast('Password updated successfully', 'success');
    setView('main');
  };

  const handleClose = () => {
    if (view === 'main') {
      if (isTauri()) {
        getCurrentWindow().minimize();
      }
    } else {
      setShowCloseConfirm(true);
    }
  };

  const getModeButtonClass = (mode: SidebarMode) => {
    const isActive = sidebarMode === mode;
    return `p-1.5 rounded-md transition-colors ${isActive ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
      }`;
  };

  const renderContent = () => {
    switch (view) {
      case 'main':
        return (
          <div className="flex-1 flex overflow-hidden">
            {/* LEFT SECTION */}
            <div className="flex flex-col bg-zinc-950">
              {/* Left Title Bar */}
              <div
                className="h-10 flex items-center border-b border-zinc-800 select-none"
                style={{ width: `${48 + (isSidebarOpen ? leftSidebarWidth : 0)}px` }}
                onMouseDown={handleDragStart}
              >
                <div className="w-12 flex items-center justify-center shrink-0">
                  <button
                    className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-white transition-colors"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
                  >
                    {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
                  </button>
                </div>

                {isSidebarOpen && (
                  <div className="flex items-center gap-1 px-2">
                    <button
                      className={getModeButtonClass('folder')}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setSidebarMode('folder')}
                      title="Documents"
                    >
                      <FolderOpen size={18} />
                    </button>
                    <button
                      className={getModeButtonClass('star')}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setSidebarMode('star')}
                      title="Favorites"
                    >
                      <Star size={18} />
                    </button>
                  </div>
                )}
              </div>

              {/* Left Content */}
              <div className="flex-1 flex overflow-hidden">
                <IconBar
                  onSearchClick={() => setShowSearchDialog(true)}
                  onSettingsClick={() => setShowSettingsDialog(true)}
                />
                {isSidebarOpen && (
                  <div style={{ width: `${leftSidebarWidth}px` }} className="h-full flex flex-col">
                    <DocumentList
                      onSelectDocument={handleSelectDocument}
                      mode={sidebarMode}
                    />
                    <DocumentListRecycleBin />
                  </div>
                )}
              </div>
            </div>

            {/* Left Resize Handle */}
            {isSidebarOpen && <ResizeHandle onResizeStart={startResizingLeft} />}

            {/* CENTER SECTION */}
            <div className="flex-1 flex flex-col min-w-0">
              <div
                className="h-10 bg-zinc-950 border-b border-zinc-800 flex items-center select-none"
                onMouseDown={handleDragStart}
              >
                <div className="flex-1 overflow-hidden h-full">
                  <EditorTabs />
                </div>

                {/* Right Panel Toggle and Controls */}
                <div className="flex items-center justify-center shrink-0 h-full relative">
                  {/* Tab Overflow Trigger */}
                  <button
                    className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-md transition-colors"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setShowTabMenu(!showTabMenu)}
                    title="Open Tabs"
                  >
                    <ChevronDown size={14} />
                  </button>

                  {/* Tab Overflow Menu */}
                  {showTabMenu && (
                    <div className="absolute top-full right-0 mt-1 w-64 bg-zinc-800 border border-zinc-700 rounded-md shadow-lg z-50 max-h-96 overflow-y-auto flex flex-col py-1">
                      {tabs.length === 0 && (
                        <div className="px-4 py-2 text-sm text-zinc-500">No open tabs</div>
                      )}
                      {tabs.map(tab => (
                        <button
                          key={tab.id}
                          className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white truncate"
                          onClick={() => { setActiveTab(tab.id); setShowTabMenu(false); }}
                        >
                          {tab.title || 'Untitled'}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    className="w-8 h-8 mr-2 flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-md transition-colors"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setIsRightSidebarOpen(!isRightSidebarOpen)}
                    title={isRightSidebarOpen ? "Collapse Metadata" : "Expand Metadata"}
                  >
                    {isRightSidebarOpen ? <PanelRightClose size={18} /> : <PanelRight size={18} />}
                  </button>

                  {/* Window Controls (When Right Panel is Hidden) */}
                  {!isRightSidebarOpen && (
                    <div className="h-full flex items-center gap-1">
                      <button
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors text-zinc-400 hover:bg-zinc-800 hover:text-white`}
                        onClick={() => { setActiveRightTab('metadata'); setIsRightSidebarOpen(true); }}
                        title="Metadata"
                      >
                        <List size={16} />
                      </button>
                      <button
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors text-zinc-400 hover:bg-zinc-800 hover:text-white`}
                        onClick={() => { setActiveRightTab('rag'); setIsRightSidebarOpen(true); }}
                        title="Search"
                      >
                        <Search size={16} />
                      </button>
                      <button
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${activeRightTab === 'crew' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        onClick={() => { setActiveRightTab('crew'); setIsRightSidebarOpen(true); }}
                        title="Crew Chat"
                      >
                        <MessageSquare size={16} />
                      </button>
                      <div className="w-px h-4 bg-zinc-800 mx-1" />
                      <WindowControls onClose={handleClose} />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 bg-zinc-900 overflow-hidden">
                <EditorContainer />
              </div>
            </div>

            {/* Right Resize Handle */}
            {isRightSidebarOpen && <ResizeHandle onResizeStart={startResizingRight} />}

            {/* RIGHT SECTION */}
            {isRightSidebarOpen && (
              <div className="flex flex-col bg-zinc-950" style={{ width: `${rightSidebarWidth}px` }}>
                <div
                  className="h-10 border-b border-zinc-800 flex items-center justify-between select-none pr-2"
                  onMouseDown={handleDragStart}
                >
                  <div className="flex items-center gap-1 ml-2">
                    <div className="h-full flex items-center gap-1">
                      {/* Contextual Tabs */}
                      <button
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${activeRightTab === 'metadata' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        onClick={() => setActiveRightTab(activeTabType === 'calendar' ? 'calendar' : 'metadata')}
                        title="Metadata"
                      >
                        <List size={16} />
                      </button>

                      <button
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${activeRightTab === 'rag' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        onClick={() => setActiveRightTab('rag')}
                        title="Search"
                      >
                        <Search size={16} />
                      </button>
                      <button
                        className={`w-8 h-8 flex items-center justify-center rounded-md transition-colors ${activeRightTab === 'crew' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}
                        onClick={() => setActiveRightTab('crew')}
                        title="Crew Chat"
                      >
                        <MessageSquare size={16} />
                      </button>
                    </div>
                  </div>

                  <WindowControls
                    onClose={handleClose}
                  />
                </div>
                <div className="flex-1 overflow-hidden">
                  {activeRightTab === 'metadata' && <MetadataPanel />}
                  {activeRightTab === 'calendar' && <CalendarPanel />}
                  {activeRightTab === 'rag' && <RagPanel />}
                  {activeRightTab === 'crew' && <CrewPanel />}
                </div>
              </div>
            )}

            {/* Comments removed */}
          </div>
        );

      case 'change_password':
        return (
          <div className="flex-1 flex flex-col">
            <div className="h-10 bg-black flex items-center justify-end select-none" onMouseDown={handleDragStart}>
              <WindowControls
                showConfirmOnClose
                onShowCloseConfirm={() => setShowCloseConfirm(true)}
              />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <AuthChangePasswordForm
                onChangePassword={handleChangePassword}
                onSkip={() => setView('main')}
              />
            </div>
          </div>
        );

      case 'login':
      default:
        return (
          <div className="flex-1 flex flex-col">
            <div className="h-10 bg-black flex items-center justify-end select-none" onMouseDown={handleDragStart}>
              <WindowControls
                showConfirmOnClose
                onShowCloseConfirm={() => setShowCloseConfirm(true)}
              />
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <AuthLoginForm onLogin={handleLogin} />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen bg-black text-white font-sans flex flex-col overflow-hidden">
      {renderContent()}
      {view === 'main' && <StatusBar />}

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={showCloseConfirm}
        title="프로그램 종료"
        message="프로그램을 종료하시겠습니까?"
        confirmText="종료"
        cancelText="취소"
        onConfirm={() => { if (isTauri()) getCurrentWindow().close(); }}
        onCancel={() => setShowCloseConfirm(false)}
      />

      <SearchDialog
        isOpen={showSearchDialog}
        onClose={() => setShowSearchDialog(false)}
        onSelect={(item) => console.log('Selected:', item)}
      />

      <SettingsDialog
        isOpen={showSettingsDialog}
        onClose={() => setShowSettingsDialog(false)}
      />


    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AppContent />
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default App;
