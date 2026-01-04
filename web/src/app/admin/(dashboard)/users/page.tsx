'use client';

import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Users, Search, UserPlus, MoreVertical, Trash2, Edit, Plus, ChevronUp, ChevronDown, Check } from 'lucide-react';
import CreateUserModal from '@/components/admin/users/CreateUserModal';
import EditUserModal from '@/components/admin/users/EditUserModal';
import OrganizationSidebar from '@/components/admin/users/OrganizationSidebar';
import AddButton from '@/components/admin/ui/AddButton';
import TitleLabel from '@/components/admin/ui/TitleLabel';
import { useToast } from '@/components/admin/Toast';

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  created_at: string;
  department_id?: string;
  department_name?: string;
  department_role?: string;
  position_id?: string;
  position_name?: string;
}

interface Position {
  id: string;
  name: string;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
  children?: Department[];
  sort_order?: number;
}

function buildTree(departments: Department[]): Department[] {
  const map = new Map<string, Department>();
  const roots: Department[] = [];
  const sorted = [...departments].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  sorted.forEach(dept => {
    map.set(dept.id, { ...dept, children: [] });
  });

  sorted.forEach(dept => {
    const node = map.get(dept.id)!;
    if (dept.parent_department_id && map.has(dept.parent_department_id)) {
      map.get(dept.parent_department_id)!.children?.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

const PositionCell = ({
  user,
  positions,
  tenantId,
  onSuccess
}: {
  user: User;
  positions: Position[];
  tenantId: string;
  onSuccess: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUpdate = async (positionId: string) => {
    if (positionId === user.position_id) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch('/api/v1/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          id: user.id,
          positionId: positionId,
        }),
      });

      if (!response.ok) throw new Error('Failed to update position');

      showToast('Position updated successfully', 'success');
      onSuccess();
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Failed to update position', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUpdating}
        className={`text-sm px-2 py-1 rounded flex items-center gap-1.5 transition-colors bg-zinc-800 text-gray-300 hover:bg-zinc-700 hover:text-white cursor-pointer 
        ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
      >
        {user.position_name || '-'}
        <ChevronDown size={10} className="opacity-50" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
          {positions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">No positions found</div>
          ) : (
            positions.map(pos => (
              <button
                key={pos.id}
                onClick={() => handleUpdate(pos.id)}
                className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-zinc-800 hover:text-white flex items-center justify-between"
              >
                {pos.name}
                {pos.id === user.position_id && <Check size={14} className="text-blue-500" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const DepartmentTreeItem = ({
  node,
  level = 0,
  currentDeptId,
  onSelect
}: {
  node: Department;
  level?: number;
  currentDeptId?: string;
  onSelect: (id: string) => void;
}) => {
  return (
    <div>
      <button
        onClick={() => onSelect(node.id)}
        className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-zinc-800 hover:text-white flex items-center justify-between"
        style={{ paddingLeft: `${level * 12 + 12}px` }}
      >
        <div className="flex items-center gap-2 truncate">
          {level > 0 && <span className="text-zinc-600">└</span>}
          {node.name}
        </div>
        {node.id === currentDeptId && <Check size={14} className="text-blue-500 shrink-0" />}
      </button>
      {node.children && node.children.map(child => (
        <DepartmentTreeItem
          key={child.id}
          node={child}
          level={level + 1}
          currentDeptId={currentDeptId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

const DepartmentCell = ({
  user,
  departments,
  tenantId,
  onSuccess
}: {
  user: User;
  departments: Department[];
  tenantId: string;
  onSuccess: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUpdate = async (deptId: string) => {
    if (deptId === user.department_id) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch('/api/v1/users', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          id: user.id,
          departmentId: deptId,
        }),
      });

      if (!response.ok) throw new Error('Failed to update department');

      showToast('Department updated successfully', 'success');
      onSuccess();
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      showToast('Failed to update department', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const tree = buildTree(departments);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUpdating}
        className={`text-sm px-2 py-1 rounded flex items-center gap-1.5 transition-colors cursor-pointer 
        ${user.department_name
            ? 'bg-zinc-800 text-gray-300 hover:bg-zinc-700 hover:text-white'
            : 'text-gray-500 hover:text-gray-400'
          } ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
      >
        {user.department_name || '-'}
        <ChevronDown size={10} className="opacity-50" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 max-h-80 overflow-y-auto custom-scrollbar">
          {departments.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-500">No departments found</div>
          ) : (
            tree.map(node => (
              <DepartmentTreeItem
                key={node.id}
                node={node}
                currentDeptId={user.department_id}
                onSelect={handleUpdate}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default function UsersPage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tenantId, setTenantId] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDesc, setSortDesc] = useState(true);

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
      fetchPositions(subdomain);
      fetchDepartments(subdomain);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUsers = async (tid: string, sort = sortBy, desc = sortDesc) => {
    try {
      const searchParams = new URLSearchParams();
      if (sort) searchParams.set('sort_by', sort);
      if (desc !== undefined) searchParams.set('sort_desc', desc.toString());

      const res = await fetch(`/api/v1/users?${searchParams.toString()}`, {
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

  const fetchPositions = async (tid: string) => {
    try {
      const res = await fetch('/api/v1/positions', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tid,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setPositions(data.positions || []);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    }
  };

  const fetchDepartments = async (tid: string) => {
    try {
      const res = await fetch('/api/v1/departments', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tid,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const handleSort = (column: string) => {
    let newDesc = true;
    if (sortBy === column) {
      newDesc = !sortDesc;
    } else {
      newDesc = false; // Default to ASC when switching columns
    }
    setSortBy(column);
    setSortDesc(newDesc);
    fetchUsers(tenantId, column, newDesc);
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
        <div className="h-14 flex items-center justify-between shrink-0">
          <TitleLabel title={t.admin.users.title} subtitle={t.admin.users.subtitle} />
          <AddButton
            onClick={() => setIsCreateModalOpen(true)}
            label={t.admin.users.add_user}
          />
        </div>

        {/* Search & Toolbar */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input
              type="text"
              placeholder={t.admin.users.search_placeholder}
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
              <thead className="bg-zinc-900/50 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort('position')}
                  >
                    <div className="flex items-center gap-1">
                      Position
                      {sortBy === 'position' && (
                        <span className="text-blue-500">
                          {sortDesc ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </span>
                      )}
                    </div>
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none"
                    onClick={() => handleSort('department')}
                  >
                    <div className="flex items-center gap-1">
                      Department
                      {sortBy === 'department' && (
                        <span className="text-blue-500">
                          {sortDesc ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </span>
                      )}
                    </div>
                  </th>
                  <th></th>
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
                          {/* Avatar */}
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-400 border border-white/5">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              {/* Username */}
                              <div className="font-medium text-gray-200">{user.username}</div>
                              {/* Department */}
                              {user.department_role && (
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase tracking-wide">
                                  {user.department_role}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <PositionCell
                          user={user}
                          positions={positions}
                          tenantId={tenantId}
                          onSuccess={() => fetchUsers(tenantId)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <DepartmentCell
                          user={user}
                          departments={departments}
                          tenantId={tenantId}
                          onSuccess={() => fetchUsers(tenantId)}
                        />
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
