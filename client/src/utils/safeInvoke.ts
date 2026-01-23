import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../stores/authStore';

/**
 * A wrapper around Tauri's invoke command that handles token refresh automatically.
 * It catches 'Unauthorized' or 401 errors, attempts to refresh the token, and retries the request.
 */
export async function safeInvoke<T>(cmd: string, args?: any): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (error) {
    const errorMsg = String(error);

    // Detect 401 Unauthorized errors from backend
    // Patterns verifyed from backend code:
    // - "Server returned error: 401" (search_server, generate_embedding)
    // - "Unauthorized" (generic)
    if (
      errorMsg.includes('Server returned error: 401') ||
      errorMsg.toLowerCase().includes('unauthorized') ||
      errorMsg.toLowerCase().includes('token expired')
    ) {
      console.warn(`[safeInvoke] Auth error detected on '${cmd}':`, errorMsg);
      console.log('[safeInvoke] Attempting token refresh...');

      try {
        const { refreshToken, user } = useAuthStore.getState();

        // Prevent infinite loop if we are already failing refresh
        if (!user?.refresh_token) {
          throw error;
        }

        await refreshToken();

        // Check if refresh was successful (new access token?)
        const newUser = useAuthStore.getState().user;
        if (newUser?.access_token) {
          console.log('[safeInvoke] Token refresh successful. Retrying original request...');
          // Retry the original invoke
          return await invoke<T>(cmd, args);
        } else {
          console.error('[safeInvoke] Token refresh failed (no token). Logging out.');
          useAuthStore.getState().logout();
          throw error;
        }
      } catch (refreshError) {
        console.error('[safeInvoke] Token refresh failed:', refreshError);
        useAuthStore.getState().logout();
        throw refreshError; // Original error or refresh error?
      }
    }

    throw error;
  }
}
