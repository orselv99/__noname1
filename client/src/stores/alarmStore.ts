import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { sqliteContentStorage } from '../utils/sqliteContentStorage';

export type AlarmType = 'success' | 'error' | 'info' | 'warning';
export type AlarmImportance = 'low' | 'medium' | 'high';

export interface Alarm {
  id: string;
  title?: string;
  message: string;
  type: AlarmType;
  importance: AlarmImportance;
  timestamp: number;
  read: boolean;
  roomId?: string; // Action data
}

export type ChatPrivacy = 'all' | 'sender' | 'simple';

export interface AlarmSettings {
  enabled: boolean;
  soundEnabled: boolean;
  minImportance: AlarmImportance; // Only show alarms with importance >= this
  useDesktopNotifications: boolean;
  chatPrivacy: ChatPrivacy;
}

interface AlarmState {
  alarms: Alarm[];
  settings: AlarmSettings;

  addAlarm: (message: string, type?: AlarmType, importance?: AlarmImportance, title?: string, roomId?: string) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeAlarm: (id: string) => void;
  clearAll: () => void;
  loadAlarms: () => Promise<void>; // 로드 함수 추가

  updateSettings: (settings: Partial<AlarmSettings>) => void;
}

const importanceValue = {
  low: 0,
  medium: 1,
  high: 2
};

export const useAlarmStore = create<AlarmState>()(
  persist(
    (set, get) => ({
      alarms: [],
      settings: {
        enabled: true,
        soundEnabled: true,
        minImportance: 'low',
        useDesktopNotifications: false,
        chatPrivacy: 'all',
      },

      addAlarm: async (message, type = 'info', importance = 'medium', title, roomId) => {
        const { settings } = get();

        // Filter by importance
        if (importanceValue[importance] < importanceValue[settings.minImportance]) {
          return; // Skip low importance alarms if filter is high
        }

        const id = crypto.randomUUID();
        const newAlarm: Alarm = {
          id,
          title,
          message,
          type,
          importance,
          timestamp: Date.now(),
          read: false,
          roomId,
        };

        // Optimistic update
        set((state) => ({ alarms: [newAlarm, ...state.alarms] }));

        // Backend save
        invoke('add_alarm', {
          id,
          title,
          message,
          alarmType: type, // Tauri maps 'alarmType' (JS) -> 'alarm_type' (Rust)
          importance,
          room_id: roomId
        }).catch(e => console.error('Failed to save alarm:', e));

        // Desktop Notification Logic
        if (settings.enabled && settings.useDesktopNotifications) {
          if (Notification.permission === 'granted') {
            new Notification(title || 'Fiery Horizon', { body: message });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                new Notification(title || 'Fiery Horizon', { body: message });
              }
            });
          }
        }
      },

      markAsRead: (id) => {
        set((state) => ({
          alarms: state.alarms.map(a => a.id === id ? { ...a, read: true } : a)
        }));
        invoke('mark_alarm_read', { id }).catch(e => console.error(e));
      },

      markAllAsRead: () => {
        set((state) => ({
          alarms: state.alarms.map(a => ({ ...a, read: true }))
        }));
        invoke('mark_all_alarms_read').catch(e => console.error(e));
      },

      removeAlarm: (id) => {
        set((state) => ({
          alarms: state.alarms.filter(a => a.id !== id)
        }));
        invoke('delete_alarm', { id }).catch(e => console.error(e));
      },

      clearAll: () => {
        set({ alarms: [] });
        invoke('clear_alarms').catch(e => console.error(e));
      },

      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      // 초기화: DB에서 알람 로드
      loadAlarms: async () => {
        try {
          const alarms = await invoke<any[]>('get_alarms', { limit: 50 });
          // DB Raw -> Frontend Model 변환
          const parsedAlarms: Alarm[] = alarms.map(a => ({
            id: a.id,
            title: a.title,
            message: a.message,
            type: a.type_ as AlarmType, // type_ -> type
            importance: a.importance as AlarmImportance,
            timestamp: new Date(a.created_at).getTime(),
            read: a.is_read,
            roomId: a.room_id
          }));
          set({ alarms: parsedAlarms });
        } catch (e) {
          console.error('Failed to load alarms:', e);
        }
      }
    }),
    {
      name: 'alarm-storage', // DB key
      storage: createJSONStorage(() => sqliteContentStorage), // SQLite Adapter 사용
      partialize: (state) => ({ settings: state.settings }), // settings만 저장 (알람은 별도 테이블)
    }
  )
);
