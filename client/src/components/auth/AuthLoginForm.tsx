import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AuthTenantSelector } from './AuthTenantSelector';
import { useAuthStore } from '../../stores/authStore';

interface TenantInfo {
  tenant_id: string;
  name: string;
}

interface AuthLoginFormProps {
  onLogin: (email: string, password: string, tenantId?: string) => Promise<void>;
}

export const AuthLoginForm = ({ onLogin }: AuthLoginFormProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Tenant selection state
  const [showTenantSelector, setShowTenantSelector] = useState(false);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      // Step 1: Check if we have a cached tenant for this email
      const cachedTenant = await invoke<string | null>('get_saved_tenant', { email });

      if (cachedTenant) {
        // Try login with cached tenant first
        try {
          await onLogin(email, password, cachedTenant);
          return; // Success!
        } catch {
          // Cached tenant login failed - clear cache and show selector
          console.log('Cached tenant login failed, clearing cache...');
          await invoke('clear_saved_tenant', { email });
        }
      }

      // Step 2: Lookup tenants for this email
      const foundTenants = await invoke<TenantInfo[]>('lookup_tenants', { email });

      // Update authStore with tenant names
      const tenantMap = foundTenants.reduce((acc, t) => {
        acc[t.tenant_id] = t.name;
        return acc;
      }, {} as Record<string, string>);
      useAuthStore.getState().setTenantNames(tenantMap);

      if (foundTenants.length === 0) {
        // No tenant found - show error
        setError('No organization found for this email');
      } else if (foundTenants.length === 1) {
        // Single tenant - proceed directly
        await onLogin(email, password, foundTenants[0].tenant_id);
      } else {
        // Multiple tenants - show selector
        setTenants(foundTenants);
        setShowTenantSelector(true);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message :
        typeof err === 'string' ? err : 'Login failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTenantSelect = async (tenantId: string) => {
    setShowTenantSelector(false);
    setIsLoading(true);
    setError(null);

    try {
      await onLogin(email, password, tenantId);
      // Success - tenant will be saved by the login flow (save_user in Rust)
    } catch (err: unknown) {
      // Login failed - clear any cached tenant
      await invoke('clear_saved_tenant', { email });
      const errorMessage = err instanceof Error ? err.message :
        typeof err === 'string' ? err : 'Login failed';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative max-w-md w-full space-y-8 bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl">
      {/* Tenant Selector Overlay */}
      <AuthTenantSelector
        isOpen={showTenantSelector}
        tenants={tenants}
        onSelect={handleTenantSelect}
        onClose={() => setShowTenantSelector(false)}
      />

      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
          Fiery Client
        </h1>
        <p className="text-zinc-400">Login to Server</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="admin@example.com"
            required
            disabled={isLoading}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
            placeholder="••••••••"
            required
            disabled={isLoading}
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          Error: {error}
        </div>
      )}
    </div>
  );
};
