import { X, Monitor, Palette, Bell, Shield, Database, Info } from 'lucide-react';
import { useState } from 'react';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'notifications' | 'security' | 'storage' | 'about';

export const SettingsDialog = ({ isOpen, onClose }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  if (!isOpen) return null;

  const tabs = [
    { id: 'appearance' as const, label: '외관', icon: Palette },
    { id: 'notifications' as const, label: '알림', icon: Bell },
    { id: 'security' as const, label: '보안', icon: Shield },
    { id: 'storage' as const, label: '저장소', icon: Database },
    { id: 'about' as const, label: '정보', icon: Info },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-white mb-3">테마</h3>
              <div className="flex gap-3">
                <button className="flex-1 p-4 bg-zinc-800 border-2 border-blue-500 rounded-lg text-center">
                  <Monitor size={24} className="mx-auto mb-2 text-white" />
                  <span className="text-sm text-white">다크</span>
                </button>
                <button className="flex-1 p-4 bg-zinc-800 border border-zinc-700 rounded-lg text-center hover:border-zinc-600">
                  <Monitor size={24} className="mx-auto mb-2 text-zinc-400" />
                  <span className="text-sm text-zinc-400">라이트</span>
                </button>
                <button className="flex-1 p-4 bg-zinc-800 border border-zinc-700 rounded-lg text-center hover:border-zinc-600">
                  <Monitor size={24} className="mx-auto mb-2 text-zinc-400" />
                  <span className="text-sm text-zinc-400">시스템</span>
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white mb-3">폰트 크기</h3>
              <select className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500">
                <option value="small">작게</option>
                <option value="medium" selected>보통</option>
                <option value="large">크게</option>
              </select>
            </div>
          </div>
        );
      case 'notifications':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">데스크톱 알림</h3>
                <p className="text-xs text-zinc-500">새 메시지 알림 받기</p>
              </div>
              <button className="w-10 h-6 bg-blue-600 rounded-full relative">
                <span className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full" />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-white">소리</h3>
                <p className="text-xs text-zinc-500">알림 소리 재생</p>
              </div>
              <button className="w-10 h-6 bg-zinc-700 rounded-full relative">
                <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full" />
              </button>
            </div>
          </div>
        );
      case 'security':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-white mb-2">비밀번호 변경</h3>
              <button className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white hover:bg-zinc-700">
                비밀번호 변경
              </button>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white mb-2">2단계 인증</h3>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm text-white">
                2단계 인증 활성화
              </button>
            </div>
          </div>
        );
      case 'storage':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-white mb-2">저장 위치</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value="C:\Users\Documents\Notes"
                  readOnly
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-400"
                />
                <button className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white hover:bg-zinc-700">
                  변경
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white mb-2">캐시</h3>
              <button className="px-4 py-2 bg-red-600/20 border border-red-600/50 rounded-lg text-sm text-red-400 hover:bg-red-600/30">
                캐시 삭제
              </button>
            </div>
          </div>
        );
      case 'about':
        return (
          <div className="space-y-4">
            <div className="text-center py-4">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text mb-2">
                Fiery Client
              </h2>
              <p className="text-sm text-zinc-500">버전 0.1.0</p>
            </div>
            <div className="space-y-2 text-sm text-zinc-400">
              <p>© 2026 Fiery Horizon. All rights reserved.</p>
              <p>Built with Tauri + React</p>
            </div>
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">설정</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 p-1"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex min-h-[400px]">
          {/* Sidebar */}
          <div className="w-48 border-r border-zinc-800 p-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === tab.id
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                  }`}
              >
                <tab.icon size={16} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};
