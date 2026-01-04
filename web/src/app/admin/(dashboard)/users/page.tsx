'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Users, Search, UserPlus, MoreVertical, Trash2, Edit } from 'lucide-react';
import CreateUserModal from '@/components/admin/users/CreateUserModal';
import EditUserModal from '@/components/admin/users/EditUserModal';
import OrganizationSidebar from '@/components/admin/users/OrganizationSidebar';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  created_at: string;
  department_id?: string;
}

export default function UsersPage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);

  useEffect(() => {
    // Client-side Tenant Identification
    const hostname = window.location.hostname;
    const subdomain = hostname.split('.')[0];

    // Ignore non-tenant domains or special dev domains if needed
    if (subdomain !== 'localhost' && subdomain !== 'lvh' && subdomain !== 'www') {
      setTenantId(subdomain);
      fetchUsers(subdomain);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUsers = async (tid: string) => {
    try {
      const res = await fetch('/api/v1/users', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tid,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const filteredUsers = users.filter((user) => {
    // 1. Search Filter
    const matchesSearch =
      user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());

    // 2. Department Filter
    const matchesDept = selectedDepartment
      ? user.department_id === selectedDepartment || (selectedDepartment === 'Unassigned' && !user.department_id)
      : true;

    return matchesSearch && matchesDept;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-100px)] flex gap-6">


      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 text-transparent bg-clip-text">
              {t.admin.users.title}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {t.admin.users.subtitle} <span className="text-white font-mono opacity-50 px-2 py-0.5 rounded bg-white/10">{tenantId || 'Unknown'}</span>
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-white font-medium shadow-lg shadow-blue-900/20"
          >
            <UserPlus size={18} />
            <span className="hidden sm:inline">{t.admin.users.add_user}</span>
          </button>
        </div>

        {/* Search & Toolbar */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder={t.admin.departments.search_placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden backdrop-blur-sm relative flex flex-col">
          <div className="overflow-y-auto custom-scrollbar flex-1">
            <table className="w-full text-left text-gray-400">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-gray-200 font-medium sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4">{t.admin.users.table.user}</th>
                  <th className="px-6 py-4">{t.admin.users.table.role}</th>
                  <th className="px-6 py-4 text-nowrap">Department</th>
                  <th className="px-6 py-4">{t.admin.users.table.created}</th>
                  <th className="px-6 py-4 text-right">{t.admin.users.table.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      {users.length === 0 ? 'No users found.' : 'No users match your filters.'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-400 border border-white/5">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-200">{user.username}</div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${user.role === 'admin' || user.role === 'super' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {user.department_id ? (
                          <span className="text-sm text-gray-300 bg-zinc-800 px-2 py-1 rounded">{user.department_id}</span>
                        ) : (
                          <span className="text-sm text-gray-600">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEditClick(user)}
                            className="p-2 hover:bg-blue-500/20 rounded-lg transition-colors text-gray-400 hover:text-blue-400"
                            title="Edit User"
                          >
                            <Edit size={16} />
                          </button>
                          <button className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-gray-400 hover:text-red-400" title="Delete User">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CreateUserModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => fetchUsers(tenantId)}
        tenantId={tenantId}
      />

      <EditUserModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => fetchUsers(tenantId)}
        tenantId={tenantId}
        user={editingUser}
      />
    </div>
  );
}
