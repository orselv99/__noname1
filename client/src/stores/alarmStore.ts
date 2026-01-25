import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

      addAlarm: (message, type = 'info', importance = 'medium', title, roomId) => {
        const { settings } = get();

        // Filter by importance
        if (importanceValue[importance] < importanceValue[settings.minImportance]) {
          return; // Skip low importance alarms if filter is high
        }

        const newAlarm: Alarm = {
          id: crypto.randomUUID(),
          title,
          message,
          type,
          importance,
          timestamp: Date.now(),
          read: false,
          roomId,
        };

        set((state) => ({ alarms: [newAlarm, ...state.alarms] }));

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

      markAsRead: (id) => set((state) => ({
        alarms: state.alarms.map(a => a.id === id ? { ...a, read: true } : a)
      })),

      markAllAsRead: () => set((state) => ({
        alarms: state.alarms.map(a => ({ ...a, read: true }))
      })),

      removeAlarm: (id) => set((state) => ({
        alarms: state.alarms.filter(a => a.id !== id)
      })),

      clearAll: () => set({ alarms: [] }),

      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),
    }),
    {
      name: 'alarm-storage',
    }
  )
);
