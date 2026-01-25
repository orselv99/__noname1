/**
 * SQLite Storage Adapter for Zustand
 * 
 * Zustand의 persist 미들웨어와 호환되는 Async Storage Adapter입니다.
 * Rust 백엔드의 'content' 커맨드를 사용하여 데이터를 저장하고 불러옵니다.
 * 
 * Target: ContentStore (Tabs, Calendar Events etc.)
 */

import { StateStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export const sqliteContentStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      console.log(`[SQLite] Loading content state for key: ${name}`);
      const value = await invoke<string | null>('load_content_state', { key: name });
      return value;
    } catch (error) {
      console.error(`[SQLite] Failed to loadItem ${name}:`, error);
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    try {
      // console.log(`[SQLite] Saving content state for key: ${name}`); // Verbose log
      await invoke('save_content_state', { key: name, value });
    } catch (error) {
      console.error(`[SQLite] Failed to setItem ${name}:`, error);
    }
  },

  removeItem: async (name: string): Promise<void> => {
    try {
      console.log(`[SQLite] Removing content state for key: ${name}`);
      await invoke('delete_content_state', { key: name });
    } catch (error) {
      console.error(`[SQLite] Failed to removeItem ${name}:`, error);
    }
  },
};
