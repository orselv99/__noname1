'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Check, ChevronDown, ChevronRight, ChevronLeft, Users, X, Loader2, Building2 } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';

export interface UserData {
  id: string;
  username: string;
  email: string;
  department_id?: string;
  department_name?: string;
  position_name?: string;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
  children?: Department[];
}

interface UserPickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'single' | 'multi';
  selectedId?: string;
  selectedIds?: string[];
  selectedUsers?: UserData[]; // New: Pass full objects
  onSelect?: (id: string, username?: string) => void; // Optional legacy
  onUserSelect?: (user: UserData) => void; // New: Toggle object
  onMultiSelect?: (ids: string[], users: UserData[]) => void;
  title?: string;
  excludeIds?: string[];  // User IDs to exclude from selection (e.g., owner ID for member picker)
}

function buildTree(departments: Department[]): Department[] {
  const map = new Map<string, Department>();
  const roots: Department[] = [];

  departments.forEach(dept => {
    map.set(dept.id, { ...dept, children: [] });
  });

  departments.forEach(dept => {
    const node = map.get(dept.id)!;
    if (dept.parent_department_id && map.has(dept.parent_department_id)) {
      map.get(dept.parent_department_id)!.children?.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export default function UserPickerPanel({
  isOpen,
  onClose,
  mode,
  selectedId,
  selectedIds = [],
  selectedUsers = [],
  onSelect,
  onUserSelect,
  onMultiSelect,
  title = mode === 'single' ? 'Select Owner' : 'Select Members',
  excludeIds = []
}: UserPickerPanelProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [isLoadingDepts, setIsLoadingDepts] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedIds);
  const hasFetched = useRef(false);

  const tenantId = typeof window !== 'undefined' ? window.location.hostname.split('.')[0] : '';
  const headers = {
    'Authorization': `Bearer ${typeof localStorage !== 'undefined' ? localStorage.getItem('accessToken') : ''}`,
    'X-Tenant-ID': tenantId
  };

  useEffect(() => {
    if (isOpen) {
      setLocalSelectedIds(selectedIds);
      if (!hasFetched.current) {
        fetchDepartments();
        hasFetched.current = true;
      }
    } else {
      hasFetched.current = false;
      setSelectedDeptId(null);
      setUsers([]);
      setCurrentPage(1);
    }
  }, [isOpen]);

  const fetchDepartments = async () => {
    setIsLoadingDepts(true);
    try {
      const res = await fetch('/api/v1/departments', { headers });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    } finally {
      setIsLoadingDepts(false);
    }
  };

  const fetchUsersByDept = async (deptId: string, page: number = 1) => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch(`/api/v1/users?department_id=${deptId}&page=${page}&page_size=${pageSize}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalCount(data.total_count || 0);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const searchUsers = async (query: string, page: number = 1) => {
    if (!query.trim()) {
      setUsers([]);
      setTotalCount(0);
      return;
    }
    setIsLoadingUsers(true);
    try {
      const res = await fetch(`/api/v1/users?search=${encodeURIComponent(query)}&page=${page}&page_size=${pageSize}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
        setTotalCount(data.total_count || 0);
        setCurrentPage(page);
      }
    } catch (error) {
      console.error('Failed to search users:', error);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        setSelectedDeptId(null);
        searchUsers(searchQuery, 1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const deptTree = useMemo(() => buildTree(departments), [departments]);
  const filteredUsers = useMemo(() =>
    users.filter(user => !excludeIds.includes(user.id) && (mode === 'single' || !localSelectedIds.includes(user.id))),
    [users, excludeIds, localSelectedIds, mode]
  );
  const totalPages = Math.ceil(totalCount / pageSize);

  const handleDeptClick = (deptId: string) => {
    setSearchQuery('');
    if (selectedDeptId === deptId) {
      setSelectedDeptId(null);
      setUsers([]);
      setTotalCount(0);
    } else {
      setSelectedDeptId(deptId);
      fetchUsersByDept(deptId, 1);
    }
  };

  const handlePageChange = (page: number) => {
    if (selectedDeptId) {
      fetchUsersByDept(selectedDeptId, page);
    } else if (searchQuery) {
      searchUsers(searchQuery, page);
    }
  };

  const toggleDeptExpand = (e: React.MouseEvent, deptId: string) => {
    e.stopPropagation();
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  const handleUserClick = (user: UserData) => {
    if (mode === 'single') {
      onSelect(user.id, user.username);
      onClose();
    } else {
      setLocalSelectedIds(prev => {
        if (prev.includes(user.id)) {
          return prev.filter(id => id !== user.id);
        } else {
          return [...prev, user.id];
        }
      });
    }
  };

  const handleConfirmMulti = () => {
    if (onMultiSelect) {
      // Resolve full objects for selected IDs
      const resolvedUsers = localSelectedIds.map(id =>
        selectedUsers.find(u => u.id === id) ||
        users.find(u => u.id === id) ||
        { id, username: 'Unknown', email: '' } as UserData
      );
      onMultiSelect(localSelectedIds, resolvedUsers);
    }
    onClose();
  };

  const DeptTreeItem = ({ node, level = 0 }: { node: Department; level?: number }) => {
    const hasChildren = (node.children?.length || 0) > 0;
    const isExpanded = expandedDepts.has(node.id);
    const isSelected = selectedDeptId === node.id;

    return (
      <div>
        <button
          onClick={() => handleDeptClick(node.id)}
          className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-lg transition-colors ${isSelected ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-zinc-800 hover:text-white'
            }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleDeptExpand(e, node.id)}
              className="p-0.5 hover:bg-white/20 rounded shrink-0"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-5 shrink-0" />
          )}
          <Building2 size={14} className="shrink-0 opacity-60" />
          <span className="truncate text-left flex-1">{node.name}</span>
        </button>
        {hasChildren && isExpanded && node.children?.map(child => (
          <DeptTreeItem key={child.id} node={child} level={level + 1} />
        ))}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop - transparent to avoid additional dimming */}
          <div
            onClick={onClose}
            className="fixed inset-0 z-100"
          />
          {/* Panel - centered modal overlay matching project modal size */}
          <div className="fixed inset-0 z-101 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl h-[70vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Users size={18} />
                  {title}
                </h3>
                <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Search */}
              <div className="p-3 border-b border-zinc-800 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Selected Users Chips (Multi Mode) */}
              {mode === 'multi' && localSelectedIds.length > 0 && (
                <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/50 flex flex-wrap gap-2 max-h-24 overflow-y-auto custom-scrollbar shrink-0">
                  {localSelectedIds.map(id => {
                    // Resolve user object: passed prop OR current search result OR placeholder
                    const user = selectedUsers.find(u => u.id === id) || users.find(u => u.id === id) || { id, username: 'Unknown User', email: '' } as UserData;
                    return (
                      <div key={id} className="flex items-center gap-1.5 bg-blue-500/10 text-blue-300 px-2.5 py-1 rounded text-xs border border-blue-500/20">
                        <span className="font-medium">{user.username}</span>
                        <button
                          onClick={() => handleUserClick(user)}
                          className="hover:text-white hover:bg-white/10 rounded-full p-0.5 transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Department Tree */}
                <div className="w-1/2 border-r border-zinc-800 overflow-y-auto custom-scrollbar flex flex-col">
                  <div className="text-xs font-medium text-gray-500 uppercase px-3 py-2 border-b border-zinc-800 shrink-0">
                    Departments
                  </div>
                  {isLoadingDepts ? (
                    <div className="flex items-center justify-center h-32">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                    </div>
                  ) : (
                    <div className="p-2 flex-1">
                      {deptTree.map(node => (
                        <DeptTreeItem key={node.id} node={node} />
                      ))}
                    </div>
                  )}
                </div>

                {/* User List */}
                <div className="w-1/2 overflow-y-auto custom-scrollbar flex flex-col">
                  <div className="text-xs font-medium text-gray-500 uppercase px-3 py-2 border-b border-zinc-800 shrink-0">
                    {selectedDeptId ? 'Department Members' : searchQuery ? 'Search Results' : 'Select a department'}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {isLoadingUsers ? (
                      <div className="flex items-center justify-center h-32">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                      </div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-48 text-gray-500 p-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-zinc-800/50 flex items-center justify-center mb-3">
                          {selectedDeptId || searchQuery ? (
                            <Users size={24} className="opacity-40" />
                          ) : (
                            <Building2 size={24} className="opacity-40" />
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-400">
                          {users.length > 0 ? 'All users selected' :
                            selectedDeptId ? 'No members found' :
                              searchQuery ? 'No users found' :
                                'Select a department'}
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          {users.length > 0 ? 'All users in this list have been selected.' :
                            selectedDeptId ? 'This department has no members yet.' :
                              searchQuery ? 'Try adjusting your search query.' :
                                'Choose a department from the left to view members.'}
                        </p>
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {filteredUsers.map(user => {
                          const isSelected = mode === 'single'
                            ? selectedId === user.id
                            : localSelectedIds.includes(user.id);

                          return (
                            <button
                              key={user.id}
                              onClick={() => handleUserClick(user)}
                              className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors ${isSelected
                                ? 'bg-blue-600 text-white'
                                : 'hover:bg-zinc-800 text-gray-300 hover:text-white'
                                }`}
                            >
                              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-medium shrink-0">
                                {user.username.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{user.username}</div>
                                <div className="text-xs opacity-60 truncate">{user.position_name || user.email}</div>
                              </div>
                              {isSelected && <Check size={16} className="shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="p-2 border-t border-zinc-800 flex items-center justify-between text-xs shrink-0">
                      <span className="text-gray-500">{totalCount} total</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePageChange(currentPage - 1)}
                          disabled={currentPage === 1}
                          className="p-1 rounded hover:bg-zinc-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-gray-400 px-2">{currentPage} / {totalPages}</span>
                        <button
                          onClick={() => handlePageChange(currentPage + 1)}
                          disabled={currentPage >= totalPages}
                          className="p-1 rounded hover:bg-zinc-800 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer for Multi Select */}
              {mode === 'multi' && (
                <div className="p-3 border-t border-zinc-800 flex items-center justify-between shrink-0">
                  <span className="text-sm text-gray-400">
                    {localSelectedIds.length} selected
                  </span>
                  <button
                    onClick={handleConfirmMulti}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
