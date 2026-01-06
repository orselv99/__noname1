'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Save,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  Building
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '../Toast';
import { MotionDiv } from '../ui/Motion';

interface User {
  id: string;
  email: string;
  username: string;
  role: string | number;
  department_id?: string;
  position_id?: string;
  position_name?: string;
  birthday?: string;
  phone_numbers?: string[];
}

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
  user: User | null;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
  children?: Department[];
  sort_order?: number;
}

interface Position {
  id: string;
  name: string;
}

interface DepartmentItemProps {
  node: Department;
  level?: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string;
  onSelect: (id: string) => void;
}

// Extracted Component (Same as CreateUserModal)
const DepartmentItem = ({ node, level = 0, expandedIds, onToggle, selectedId, onSelect }: DepartmentItemProps) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors select-none ${isSelected ? 'bg-blue-500/20 text-blue-300' : 'hover:bg-white/5 text-gray-300'}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.id);
          }}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 ${hasChildren ? 'text-gray-400' : 'invisible'}`}
        >
          {hasChildren && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </div>
        <div className={isSelected ? 'text-blue-400' : 'text-gray-500'}>
          <Building size={16} />
        </div>
        <span className="text-sm truncate">{node.name}</span>
      </div>
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <MotionDiv
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {node.children!.map(child => (
              <DepartmentItem
                key={child.id}
                node={child}
                level={level + 1}
                expandedIds={expandedIds}
                onToggle={onToggle}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ))}
          </MotionDiv>
        )}
      </AnimatePresence>
    </div>
  );
};

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

export default function EditUserModal({ isOpen, onClose, onSuccess, tenantId, user }: EditUserModalProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    username: '',
    isAdmin: false,
    departmentId: '',
    birthday: '',
    phoneNumbers: [''],
    positionId: ''
  });

  // Departments & Positions
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
      fetchPositions();
    }
  }, [isOpen, tenantId]);

  // Pre-fill user data
  useEffect(() => {
    if (user && isOpen) { // Ensure runs when open and user exists
      const roleStr = String(user.role).toLowerCase();
      // 1=Super, 2=Admin, 3=Viewer, 4=User. 
      // We map "Department Admin" checkbox to Role 3 (Viewer).
      const isAdmin = roleStr === '3' || roleStr === 'viewer';

      setFormData({
        username: user.username || '',
        isAdmin: isAdmin,
        departmentId: user.department_id || '',
        birthday: user.birthday || '',
        phoneNumbers: (user.phone_numbers && user.phone_numbers.length > 0) ? user.phone_numbers : [''],
        positionId: user.position_id || ''
      });
    }
  }, [user, isOpen]);

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/v1/departments', {
        headers: {
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        const depts = data.departments || [];
        setDepartments(depts);
        // Expand populated department if any
        if (user?.department_id) {
          // Logic to find path could be complex, for now expand all or just roots.
          // Or keep disjoint set of all IDs to simple expand all if not too many.
          // Defaulting to expand all for editing context might be easier or just roots.
          // Let's stick to default roots expand or previously selected.
          setExpandedIds(new Set(depts.map((d: Department) => d.id)));
        } else {
          setExpandedIds(new Set(depts.map((d: Department) => d.id)));
        }
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await fetch('/api/v1/positions', {
        headers: {
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPositions(data.positions || []);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    }
  };

  const handlePhoneChange = (index: number, value: string) => {
    const newPhones = [...formData.phoneNumbers];
    newPhones[index] = value;
    setFormData({ ...formData, phoneNumbers: newPhones });
  };

  const addPhoneField = () => {
    if (formData.phoneNumbers.some(p => p.trim() === '')) {
      showToast('Please enter a phone number first.', 'error');
      return;
    }
    setFormData({ ...formData, phoneNumbers: [...formData.phoneNumbers, ''] });
  };

  const removePhoneField = (index: number) => {
    const newPhones = formData.phoneNumbers.filter((_, i) => i !== index);
    setFormData({ ...formData, phoneNumbers: newPhones });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.isAdmin && !formData.departmentId) {
      setError('Please select a department.');
      return;
    }

    setIsLoading(true);
    setError(null);

    // 3: VIEWER (Manager), 4: USER
    const roleValue = formData.isAdmin ? 3 : 4;

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
          role: roleValue,
          department_id: formData.departmentId,
          position_id: formData.positionId,
          birthday: formData.birthday,
          phone_numbers: formData.phoneNumbers.filter(p => p.trim() !== '')
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

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = buildTree(departments);

  if (!user) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <MotionDiv
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <MotionDiv
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Save className="w-5 h-5 text-blue-500" />
                Edit User
                <span className="text-sm font-normal text-gray-500 ml-2">({user.email})</span>
              </h2>
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col overflow-hidden h-[600px]">
              {error && (
                <div className="mb-4 mx-6 mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-sm text-red-400 z-10 shrink-0">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div className="flex flex-1 overflow-hidden p-6 gap-6">
                {/* Left: Department Tree */}
                <div className="w-1/3 min-w-[280px] border-r border-zinc-800 pr-6 flex flex-col overflow-hidden">
                  <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2 shrink-0">
                    <Building size={16} className="text-blue-500" />
                    Select Department
                  </h3>
                  <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 bg-zinc-950/30 rounded-lg p-2 border border-zinc-800/50">
                    {tree.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-4">No departments found</p>
                    ) : (
                      tree.map(node => (
                        <DepartmentItem
                          key={node.id}
                          node={node}
                          expandedIds={expandedIds}
                          onToggle={toggleExpand}
                          selectedId={formData.departmentId}
                          onSelect={(id) => setFormData(prev => ({ ...prev, departmentId: id }))}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Right: Form */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                      {/* Name & Email Row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">Name (Read-only)</label>
                          <input
                            type="text"
                            value={formData.username}
                            disabled
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed"
                            placeholder="John Doe"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">Email (Read-only)</label>
                          <input
                            type="email"
                            value={user.email}
                            disabled
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-gray-500 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Admin Checkbox */}
                      <div className="flex justify-end pb-2">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.isAdmin ? 'bg-blue-600 border-blue-600' : 'border-zinc-700 group-hover:border-zinc-500'}`}>
                            {formData.isAdmin && <ChevronDown className="text-white w-4 h-4" />}
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={formData.isAdmin}
                              onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                            />
                          </div>
                          <span className={`text-sm font-medium ${formData.isAdmin ? 'text-blue-400' : 'text-gray-300'}`}>Department Admin</span>
                        </label>
                      </div>

                      {/* Dept & Position */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">Department</label>
                          <div className={`w-full px-4 py-2.5 rounded-lg border flex items-center gap-3 transition-colors ${formData.departmentId ? 'bg-blue-500/10 border-blue-500/30' : 'bg-zinc-950 border-zinc-800'}`}>
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${formData.departmentId ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-800 text-gray-500'}`}>
                              {formData.departmentId ? <Building size={14} /> : <AlertCircle size={14} />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${formData.departmentId ? 'text-blue-300' : 'text-gray-400'}`}>
                                {formData.departmentId
                                  ? departments.find(d => d.id === formData.departmentId)?.name
                                  : 'No Department Selected'}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">Position</label>
                          <select
                            value={formData.positionId}
                            onChange={(e) => setFormData({ ...formData, positionId: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors appearance-none"
                          >
                            <option value="">Select Position...</option>
                            {positions.map(pos => (
                              <option key={pos.id} value={pos.id}>{pos.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Phone Numbers */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300 flex justify-between items-center">
                          Phone Numbers
                          <button
                            type="button"
                            onClick={addPhoneField}
                            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                          >
                            + Add Number
                          </button>
                        </label>
                        {formData.phoneNumbers.map((phone, index) => (
                          <div key={index} className="flex gap-2">
                            <input
                              type="tel"
                              value={phone}
                              onChange={(e) => handlePhoneChange(index, e.target.value)}
                              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                              placeholder={index === 0 ? "Primary Contact" : "Additional Contact"}
                            />
                            {formData.phoneNumbers.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePhoneField(index)}
                                className="p-2.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                              >
                                <X size={18} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                          Birthday
                          <span className="text-[10px] text-gray-500 bg-zinc-800 px-1.5 py-0.5 rounded">YYYY-MM-DD</span>
                        </label>
                        <input
                          type="date"
                          value={formData.birthday}
                          onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
                        />
                      </div>


                    </div>

                    <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3 mt-4 shrink-0">
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
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                      >
                        {isLoading && <Loader2 className="animate-spin" size={16} />}
                        Save Changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
