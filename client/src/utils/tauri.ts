/**
 * Utility to check if running in Tauri environment
 */
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' && '__TAURI__' in window;
};
