'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/context/LanguageContext';
import { Users, Search, UserPlus, MoreVertical, Trash2, Edit, Plus, ChevronUp, ChevronDown, Check, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
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
  role: number;
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

const PositionBadge = ({
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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && dropdownTriggerRef.current) {
      const rect = dropdownTriggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const height = 200; // Expected max height
      const openUpwards = spaceBelow < height;

      setDropdownPosition({
        top: openUpwards ? rect.top - height - 45 : rect.bottom + 4,
        left: rect.left,
      });
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown on scroll
  useEffect(() => {
    if (isOpen) {
      const handleScroll = (event: Event) => {
        if (dropdownContentRef.current && dropdownContentRef.current.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      };
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownTriggerRef.current && !dropdownTriggerRef.current.contains(target) &&
        dropdownContentRef.current && !dropdownContentRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleUpdate = async (positionId: string) => {
    if (positionId === user.position_id) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/v1/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          position_id: positionId,
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
    <>
      <button
        ref={dropdownTriggerRef}
        onClick={toggleDropdown}
        disabled={isUpdating}
        className={`text-sm px-2 py-1 rounded flex items-center gap-1.5 transition-colors bg-zinc-800 text-gray-300 hover:bg-zinc-700 hover:text-white cursor-pointer 
        ${isUpdating ? 'opacity-50 cursor-wait' : ''}`}
      >
        {user.position_name || '-'}
        <ChevronDown size={10} className="opacity-50" />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownContentRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: '192px', // w-48
            zIndex: 99999,
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-y-auto max-h-60"
        >
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
        </div>,
        document.body
      )}
    </>
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

const DepartmentBadge = ({
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
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  const dropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOpen && dropdownTriggerRef.current) {
      const rect = dropdownTriggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const height = 300;
      const openUpwards = spaceBelow < height;

      setDropdownPosition({
        top: openUpwards ? rect.top - height - 25 : rect.bottom + 4,
        left: rect.left,
      });
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown on scroll
  useEffect(() => {
    if (isOpen) {
      const handleScroll = (event: Event) => {
        if (dropdownContentRef.current && dropdownContentRef.current.contains(event.target as Node)) {
          return;
        }
        setIsOpen(false);
      };
      window.addEventListener('scroll', handleScroll, true);
      return () => window.removeEventListener('scroll', handleScroll, true);
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownTriggerRef.current && !dropdownTriggerRef.current.contains(target) &&
        dropdownContentRef.current && !dropdownContentRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleUpdate = async (deptId: string) => {
    if (deptId === user.department_id) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    try {
      const response = await fetch(`/api/v1/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          department_id: deptId,
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
    <>
      <button
        ref={dropdownTriggerRef}
        onClick={toggleDropdown}
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

      {isOpen && createPortal(
        <div
          ref={dropdownContentRef}
          style={{
            position: 'fixed',
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: '256px',
            zIndex: 99999,
          }}
          className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-y-auto custom-scrollbar max-h-80"
        >
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
        </div>,
        document.body
      )}
    </>
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

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

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
      fetchUsers(subdomain, 1); // Fetch page 1 on mount
      fetchPositions(subdomain);
      fetchDepartments(subdomain);
    } else {
      setIsLoading(false);
    }
  }, []);

  const fetchUsers = async (tid: string, pageNum = page, sort = sortBy, desc = sortDesc) => {
    try {
      const searchParams = new URLSearchParams();
      if (sort) searchParams.set('sort_by', sort);
      if (desc !== undefined) searchParams.set('sort_desc', desc.toString());
      searchParams.set('page', pageNum.toString());
      searchParams.set('page_size', pageSize.toString());

      const res = await fetch(`/api/v1/users?${searchParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tid,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalCount(data.total_count || 0);
        setPage(pageNum);
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
    fetchUsers(tenantId, 1, column, newDesc); // Reset to page 1 on sort
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setIsEditModalOpen(true);
  };

  const { showToast } = useToast();

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await fetch(`/api/v1/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': tenantId,
        },
      });

      if (!response.ok) throw new Error('Failed to delete user');

      showToast('User deleted successfully', 'success');
      fetchUsers(tenantId);
    } catch (error) {
      console.error(error);
      showToast('Failed to delete user', 'error');
    }
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
  console.log(filteredUsers);
  return (
    <div className="h-[calc(100vh-100px)] flex gap-6">


      {/* Main Content */}
      <div className="flex-1 flex flex-col gap-6 overflow-hidden">

        {/* Header */}
        <div className="h-14 flex items-center justify-between shrink-0">
          <TitleLabel title={t.admin.users.title} subtitle={t.admin.users.subtitle} />
          <AddButton
            onClick={() => setIsCreateModalOpen(true)}
          // label={t.admin.users.add_user}
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[30%]">
                    User
                  </th>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none w-[25%]"
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
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-white transition-colors select-none w-[30%]"
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
                  <th className="w-[15%]"></th>
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
                          <div>
                            <div className="flex items-center gap-2">
                              {/* Username */}
                              <div className="flex items-center gap-1.5 font-medium text-gray-200">
                                {user.username}
                                {user.role === 3 && (
                                  <div className="w-4 h-4 bg-zinc-900 rounded-full flex items-center justify-center border border-orange-500/50 shadow-sm shadow-orange-500/20">
                                    <Eye size={12} className="text-orange-400" />
                                  </div>
                                )}
                              </div>
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
                        <PositionBadge
                          user={user}
                          positions={positions}
                          tenantId={tenantId}
                          onSuccess={() => fetchUsers(tenantId)}
                        />
                      </td>
                      <td className="px-6 py-4">
                        <DepartmentBadge
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
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-gray-400 hover:text-red-400"
                            title="Delete User"
                          >
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

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/50">
            <div className="text-sm text-gray-400">
              Showing {Math.min((page - 1) * pageSize + 1, totalCount)} to {Math.min(page * pageSize, totalCount)} of {totalCount} users
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchUsers(tenantId, page - 1)}
                disabled={page === 1}
                className="p-1 rounded hover:bg-zinc-800 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-sm text-gray-300 font-medium px-2">
                Page {page} of {Math.max(1, Math.ceil(totalCount / pageSize))}
              </div>
              <button
                onClick={() => fetchUsers(tenantId, page + 1)}
                disabled={page * pageSize >= totalCount}
                className="p-1 rounded hover:bg-zinc-800 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>
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
