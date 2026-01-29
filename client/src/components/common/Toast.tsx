'use client';

import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlarmStore, AlarmType } from '../../stores/alarmStore';

// Toast Context is deprecated in favor of global store, but we keep the Provider structure for compatibility if needed.
// Actually, let's export a simple hook that wraps the store action for convenience.

export function useToast() {
  const addAlarm = useAlarmStore(state => state.addAlarm);
  return {
    showToast: (message: string, type: AlarmType = 'info') => addAlarm(message, type)
  };
}

const toastStyles: Record<AlarmType, { bg: string; icon: ReactNode; border: string; text: string }> = {
  success: {
    bg: 'bg-zinc-900',
    border: 'border-green-900/50',
    text: 'text-zinc-300',
    icon: (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  error: {
    bg: 'bg-zinc-900',
    border: 'border-red-900/50',
    text: 'text-zinc-300',
    icon: (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
  info: {
    bg: 'bg-zinc-900',
    border: 'border-blue-900/50',
    text: 'text-zinc-300',
    icon: (
      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    bg: 'bg-zinc-900',
    border: 'border-yellow-900/50',
    text: 'text-zinc-300',
    icon: (
      <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
};

import { roomManager } from '../../services/p2p/RoomManager';

export function ToastProvider({ children }: { children: ReactNode }) {
  const alarms = useAlarmStore(state => state.alarms);
  const settings = useAlarmStore(state => state.settings);
  const markAsRead = useAlarmStore(state => state.markAsRead);

  // Filter for unread alarms that happened recently (e.g. last 5 seconds) to show as toast
  // Use a local strategy or just show unread? 
  // Typically toasts are ephemeral. The store keeps history.
  // We need to know which ones are "new" to show them.
  // We can track the last seen timestamp or similar.
  // OR, simply render toasts for alarms that are not read and created recently.

  // Actually, standard Toast behavior is "trigger -> show -> hide".
  // The store persists them.
  // We can just rely on the store's "addAlarm" triggering a re-render.
  // But how to auto-dismiss the TOAST without removing from STORE?
  // We need a separate "toast view" state vs "store" state?
  // User request: "toast 를 alarm provider 로 승격... 전역에서 입력하면 toast 형태로 표시".

  // Let's iterate:
  // We only show alarms that are (1) unread AND (2) created in the last 4 seconds.
  // This is a simple heuristic for "Toasting".

  const recentAlarms = alarms.filter(a => {
    const isRecent = Date.now() - a.timestamp < 4000;
    return !a.read && isRecent;
  });

  // Suppress visual toasts if in Chat Window
  const isChatWindow = typeof window !== 'undefined' && window.location.pathname.startsWith('/chat/');

  return (
    <>
      {children}

      {/* Toast Container */}
      {!settings.useDesktopNotifications && settings.enabled && !isChatWindow && (
        <div className="fixed bottom-10 right-4 z-50 flex flex-col gap-2 pointer-events-none items-end">
          <AnimatePresence>
            {recentAlarms.map(alarm => {
              const style = toastStyles[alarm.type];
              const MotionDiv = motion.div as any;
              return (
                <MotionDiv
                  key={alarm.id}
                  initial={{ opacity: 0, x: 20, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.95 }}
                  onClick={() => {
                    if (alarm.roomId) {
                      roomManager.openChatWindow(alarm.roomId);
                    }
                    markAsRead(alarm.id);
                  }}
                  className={`${style.bg} border ${style.border} ${style.text} px-4 py-3 rounded-md shadow-xl flex items-start gap-3 min-w-[300px] max-w-[400px] pointer-events-auto cursor-pointer hover:brightness-110`}
                >
                  <div className="mt-1 shrink-0">{style.icon}</div>
                  <div className="flex flex-col flex-1 min-w-0">
                    {alarm.title && <span className="font-semibold text-sm mb-0.5 truncate">{alarm.title}</span>}
                    <span className="text-sm font-medium opacity-90 wrap-break-word">{alarm.message}</span>
                    <span className="text-[10px] opacity-60 mt-1 self-end">
                      {new Date(alarm.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </MotionDiv>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </>
  );
}
