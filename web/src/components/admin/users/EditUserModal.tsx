'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

interface User {
  id: string;
  email: string;
  username: string;
  role: string | number; // Handle both enum string or value if needed, effectively string ("user", "admin", etc) from Listing
  department_id?: string;
}

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
  user: User | null;
}

export default function EditUserModal({ isOpen, onClose, onSuccess, tenantId, user }: EditUserModalProps) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    role: '4', // Default User
    departmentId: '',
  });

  // Role String to Enum Value Mapper
  const getRoleValue = (roleStr: string | number) => {
    const r = String(roleStr).toLowerCase();
    if (r === 'super') return '1';
    if (r === 'admin') return '2';
    if (r === 'viewer') return '3';
    return '4'; // user
  };

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        role: getRoleValue(user.role),
        departmentId: user.department_id || '',
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          username: formData.username,
          role: parseInt(formData.role),
          department_id: formData.departmentId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Save className="w-5 h-5 text-blue-500" />
                Edit User
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-800 mb-2">
                <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Editing User</div>
                <div className="text-white font-medium">{user.email}</div>
                <div className="text-xs text-gray-400 mt-0.5 max-w-full break-all">ID: {user.id}</div>
              </div>

              {/* Username */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">{t.admin.users.create.username}</label>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="John Doe"
                />
              </div>

              {/* Role Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">{t.admin.users.create.role}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                >
                  <option value="4">User</option>
                  <option value="3">Viewer (Manager)</option>
                  <option value="2">Admin</option>
                  <option value="1">Super</option>
                </select>
              </div>

              {/* Department Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-300">Department</label>
                <input
                  type="text"
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                  placeholder="e.g. Sales, Engineering"
                />
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 pt-4 mt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading && (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
