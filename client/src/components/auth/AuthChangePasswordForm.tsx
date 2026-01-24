import { useState } from 'react';
import { AuthPasswordStrengthMeter } from './AuthPasswordStrengthMeter';

interface AuthChangePasswordFormProps {
  onChangePassword: (newPassword: string) => Promise<void>;
  onSkip: () => void;
}

export const AuthChangePasswordForm = ({
  onChangePassword,
  onSkip }: AuthChangePasswordFormProps) => {
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onChangePassword(newPassword);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err.message || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md w-full space-y-8 bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-2xl">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-white">Security Update Required</h1>
        <p className="text-zinc-400 text-sm">
          Your password needs to be updated.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500"
            placeholder="Enter new password"
            required
            minLength={8}
            disabled={isLoading}
          />
          <AuthPasswordStrengthMeter password={newPassword} />
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-lg border border-zinc-700 text-gray-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Updating...' : 'Update'}
          </button>
        </div>
      </form>
    </div>
  );
};
