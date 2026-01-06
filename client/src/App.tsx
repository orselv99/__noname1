import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CollaborativeEditor } from './components/Editor';
import { DocumentSidebar } from './components/DocumentSidebar';
import { ToastProvider, useToast } from './components/Toast';

// Mock Password Strength Meter
const PasswordStrengthMeter = ({ password }: { password: string }) => {
  const getStrength = (pass: string) => {
    let score = 0;
    if (!pass) return 0;
    if (pass.length > 6) score += 1;
    if (pass.length > 10) score += 1;
    if (/[A-Z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const score = getStrength(password);
  const colors = ['bg-gray-700', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-500', 'bg-green-500'];
  const labels = ['Weak', 'Very Weak', 'Weak', 'Medium', 'Strong', 'Very Strong'];

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>Password Strength</span>
        <span>{labels[score]}</span>
      </div>
      <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${colors[score]}`}
          style={{ width: `${(score / 5) * 100}%` }}
        ></div>
      </div>
    </div>
  );
};

interface LoginResponse {
  access_token: string;
  force_change_password: boolean;
  tenant_id: string;
  role: string;
}

function AppContent() {
  const { showToast } = useToast();
  const [view, setView] = useState<'login' | 'change_password' | 'main'>('login');

  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Change Password State
  const [newPassword, setNewPassword] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Login Handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    try {
      setIsRedirecting(false);
      setNewPassword(''); // Reset password field
      // Call Rust Command
      const data = await invoke<LoginResponse>('login', { email, password });

      console.log('Login successful:', data);

      if (data.force_change_password) {
        setView('change_password');
      } else {
        showToast('Login successful', 'success');
        setView('main');
      }
    } catch (err: any) {
      setLoginError(typeof err === 'string' ? err : err.message || 'Login failed');
    }
  };

  // Change Password Handler
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangeError(null);

    try {
      // Call Rust Command
      await invoke('change_password', {
        currentPassword: password,
        newPassword: newPassword
      });

      setIsRedirecting(true);
      showToast('Login successful', 'success');
      setTimeout(() => {
        setView('main');
        setIsRedirecting(false);
        setNewPassword(''); // Clear password after success
      }, 1500); // Redirect after success
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err.message || 'Failed to change password';
      setChangeError(msg);
      showToast(msg, 'error');
    }
  };

  const skipChangePassword = () => {
    setView('main');
    setIsRedirecting(false);
    setNewPassword(''); // Clear password on skip
  };

  const handleLogout = async () => {
    try {
      await invoke('logout');
      setView('login');
      setEmail('');
      setPassword('');
      setNewPassword(''); // Clear new password state
      setLoginError(null);
      showToast('Logged out successfully', 'info');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Main View
  if (view === 'main') {
    return (
      <div className="h-screen bg-black text-white font-sans flex">
        {/* Sidebar */}
        <DocumentSidebar
          onSelectDocument={(id) => console.log('Selected:', id)}
          selectedDocumentId={undefined}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <header className="flex justify-between items-center px-6 py-4 border-b border-zinc-800">
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
                Fiery Horizon Editor
              </h1>
              <p className="text-zinc-500 text-sm">Collaborative editing powered by Rust, Tauri, and Tiptap.</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
            >
              Logout
            </button>
          </header>

          {/* Editor */}
          <main className="flex-1 p-4 overflow-hidden">
            <CollaborativeEditor />
          </main>
        </div>
      </div>
    );
  }

  // Change Password View
  if (view === 'change_password') {
    return (
      <div className="min-h-screen bg-black text-white p-8 font-sans flex flex-col items-center justify-center">
        <div className="max-w-md w-full space-y-8 bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl relative overflow-hidden">
          <header className="space-y-2 text-center">
            <h1 className="text-2xl font-bold text-white">Security Update Required</h1>
            <p className="text-zinc-400 text-sm">
              Your password needs to be updated. You can skip this step, but it is highly recommended.
            </p>
          </header>

          <form onSubmit={handleChangePassword} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-300">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter new strong password"
                required
                minLength={8}
                disabled={isRedirecting}
              />
              <PasswordStrengthMeter password={newPassword} />
            </div>

            {changeError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {changeError}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={skipChangePassword}
                disabled={isRedirecting}
                className="flex-1 py-3 px-4 rounded-lg border border-zinc-700 text-gray-300 hover:bg-zinc-800 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Skip for Now
              </button>
              <button
                type="submit"
                disabled={isRedirecting}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRedirecting ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Login View
  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans flex flex-col items-center justify-center">
      <div className="max-w-md w-full space-y-8 bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl">
        <header className="space-y-2 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
            Fiery Client
          </h1>
          <p className="text-zinc-400">Login to Server</p>
        </header>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="admin@example.com"
              required
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
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Login
          </button>
        </form>

        {loginError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            Error: {loginError}
          </div>
        )}
      </div>
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
