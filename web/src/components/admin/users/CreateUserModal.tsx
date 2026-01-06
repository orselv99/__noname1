'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Save,
  AlertCircle,
  Upload,
  FileType,
  Loader2,
  ChevronRight,
  ChevronDown,
  Building
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useToast } from '@/components/admin/Toast';
import Papa from 'papaparse';

const MotionDiv = motion.div as any;

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tenantId: string;
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

// Extracted Component to prevent re-renders on parent state change
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
          {/* {hasChildren ? <FolderTree size={16} /> : <Building size={16} />} */}
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

export default function CreateUserModal({ isOpen, onClose, onSuccess, tenantId }: CreateUserModalProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper: Generate Random Password (10 chars alphanum)
  const generateRandomPassword = () => {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars[Math.floor(Math.random() * chars.length)];
    }
    return pass;
  };

  // Single User Form
  const [formData, setFormData] = useState({
    email: '',
    name: '',
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

  // Bulk Import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [importMode, setImportMode] = useState<'upsert' | 'replace'>('upsert');
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
      fetchPositions();
    }
  }, [isOpen]);

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
        setExpandedIds(new Set(depts.map((d: Department) => d.id)));
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

  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      isAdmin: false,
      departmentId: '',
      birthday: '',
      phoneNumbers: [''],
      positionId: ''
    });
    setCsvFile(null);
    setCsvPreview([]);
    setImportMode('upsert');
    setError(null);
    setActiveTab('single');
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

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.isAdmin && !formData.departmentId) {
      setError('Please select a department.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const roleValue = formData.isAdmin ? 3 : 4; // 3: VIEWER (Manager), 4: USER

    try {
      const response = await fetch('/api/v1/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          email: formData.email,
          username: formData.name, // "Name" maps to Username
          password: generateRandomPassword(),
          role: roleValue,
          department_id: formData.departmentId,
          // first_name: '', // Removed from proto/logic
          // last_name: '',  // Removed from proto/logic
          birthday: formData.birthday,
          phone_numbers: formData.phoneNumbers.filter(p => p.trim() !== ''),
          positionId: formData.positionId
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create user');
      }

      onSuccess();
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const processFile = (file: File) => {
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/^[\uFEFF\u200B"']+|["']+$/g, ''),
      beforeFirstChunk: (chunk) => {
        // Fix for CSVs where the entire line is wrapped in quotes (e.g. "col1,col2,col3")
        return chunk.split('\n').map(line => {
          const trimmed = line.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.split('",').length === 1) {
            // Only strip if it looks like a single wrapped line, not "col1","col2"
            return trimmed.slice(1, -1);
          }
          return line;
        }).join('\n');
      },
      complete: (results) => {
        setCsvPreview(results.data);
        setError(null);
      },
      error: (err) => {
        setError('Failed to parse CSV: ' + err.message);
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleBulkSubmit = async () => {
    if (!csvPreview.length) return;
    setIsLoading(true);
    setError(null);

    try {
      const requests = csvPreview.map(row => {
        const email = row.email || row.Email;
        if (!email) return null;

        const getRoleValue = (val: string | number) => {
          if (typeof val === 'number') return val;
          if (!val) return 4;
          const v = val.toLowerCase().trim();
          if (v === 'super' || v === '1') return 1;
          if (v === 'admin' || v === '2') return 2;
          if (v === 'viewer' || v === 'manager' || v === '3') return 3;
          return 4;
        };

        // Lookup Position ID by Name
        const positionName = row.position || row.Position;
        let positionId = row.position_id || row.PositionId || '';

        if (!positionId && positionName) {
          const found = positions.find(d => d.name.toLowerCase() === positionName.toLowerCase());
          if (found) positionId = found.id;
        }

        // Lookup Department ID by Name
        const deptName = row.department || row.Department;
        let deptId = row.department_id || row.DepartmentId || '';

        if (!deptId && deptName) {
          const found = departments.find(d => d.name.toLowerCase() === deptName.toLowerCase());
          if (found) deptId = found.id;
        }

        return {
          email: email,
          username: row.username || row.Username || email.split('@')[0],
          role: getRoleValue(row.role || row.Role), // Default to User if missing
          department_id: deptId,
          // first_name/last_name removed
          birthday: row.birthday || row.Birthday || '',
          phone_numbers: row.phone_numbers
            ? row.phone_numbers.split(/[|;,\s]+/).map((p: string) => p.trim()).filter(Boolean)
            : (row.phone || row.Phone ? [row.phone || row.Phone] : []),
          position_id: positionId // Not requested in CSV headers, default empty
        };
      }).filter(Boolean);

      if (requests.length === 0) throw new Error('No valid data found in CSV.');

      // Add Random Password to each request
      const enrichedRequests = requests.map((req: any) => ({
        ...req,
        password: generateRandomPassword()
      }));

      const response = await fetch('/api/v1/users/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          requests: enrichedRequests,
          import_mode: importMode
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to batch create users');
      }

      onSuccess();
      onClose();
      resetForm();
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
            className={`bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] ${activeTab === 'single' ? 'w-full max-w-4xl' : 'w-full max-w-lg'}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <Save className="w-5 h-5 text-blue-500" />
                {t.admin.users.create.title}
              </h2>
              <button
                onClick={() => { onClose(); resetForm(); }}
                className="p-2 text-gray-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 px-6 shrink-0">
              <button
                onClick={() => setActiveTab('single')}
                className={`py-3 px-1 text-sm font-medium transition-colors relative border-b-2 ${activeTab === 'single' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
              >
                {t.admin.users.create.tabs.single}
              </button>
              <button
                onClick={() => setActiveTab('bulk')}
                className={`py-3 px-1 text-sm font-medium transition-colors relative border-b-2 ml-6 ${activeTab === 'bulk' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
              >
                {t.admin.users.create.tabs.bulk}
              </button>
            </div>

            {/* Body */}
            <div className={`flex flex-col overflow-hidden ${activeTab === 'single' ? 'h-[600px]' : 'p-6 overflow-y-auto custom-scrollbar'}`}>
              {error && (
                <div className="mb-4 mx-6 mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3 text-sm text-red-400 z-10">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {activeTab === 'single' ? (
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
                    <form onSubmit={handleSingleSubmit} className="flex flex-col h-full">
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                        {/* Name & Email Row */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Name</label>
                            <input
                              type="text"
                              required
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                              placeholder="John Doe"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">{t.admin.users.create.email}</label>
                            <input
                              type="email"
                              required
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                              placeholder="user@example.com"
                            />
                          </div>
                        </div>

                        {/* Admin Checkbox (Right Aligned) */}
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
                          {/* Selected Department Display */}
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

                          {/* Position Select */}
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
                          onClick={() => { onClose(); resetForm(); }}
                          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                          {t.admin.users.create.cancel}
                        </button>
                        <button
                          type="submit"
                          disabled={isLoading}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                          {isLoading && <Loader2 className="animate-spin" size={16} />}
                          {t.admin.users.create.submit}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              ) : (
                /* Bulk Import Tab Content */
                <div className="space-y-6">
                  {/* Import Mode Selection */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-400">{t.admin.users.create.bulk.import_mode.title}</label>
                    <div className="flex bg-zinc-800/50 p-1 rounded-lg border border-zinc-700/50">
                      <label
                        className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-md cursor-pointer transition-all ${importMode === 'upsert'
                          ? 'bg-blue-600 shadow-lg ring-1 ring-blue-500'
                          : 'hover:bg-zinc-700/50 text-gray-400'
                          }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          value="upsert"
                          checked={importMode === 'upsert'}
                          onChange={() => setImportMode('upsert')}
                          className="hidden"
                        />
                        <span className={`text-xs font-semibold ${importMode === 'upsert' ? 'text-white' : 'text-gray-300'}`}>
                          {t.admin.users.create.bulk.import_mode.upsert}
                        </span>
                        <span className={`text-[10px] mt-0.5 ${importMode === 'upsert' ? 'text-blue-200' : 'text-gray-500'}`}>
                          {t.admin.users.create.bulk.import_mode.upsert_desc}
                        </span>
                      </label>

                      <label
                        className={`flex-1 flex flex-col items-center justify-center py-3 px-2 rounded-md cursor-pointer transition-all ml-1 ${importMode === 'replace'
                          ? 'bg-red-600 shadow-lg ring-1 ring-red-500'
                          : 'hover:bg-zinc-700/50 text-gray-400'
                          }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          value="replace"
                          checked={importMode === 'replace'}
                          onChange={() => setImportMode('replace')}
                          className="hidden"
                        />
                        <span className={`text-xs font-semibold ${importMode === 'replace' ? 'text-white' : 'text-gray-300'}`}>
                          {t.admin.users.create.bulk.import_mode.replace}
                        </span>
                        <span className={`text-[10px] mt-0.5 ${importMode === 'replace' ? 'text-red-200' : 'text-gray-500'}`}>
                          {t.admin.users.create.bulk.import_mode.replace_desc}
                        </span>
                      </label>
                    </div>
                    {importMode === 'replace' && (
                      <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                        <AlertCircle size={14} className="shrink-0" />
                        {t.admin.users.create.bulk.import_mode.warning}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                    <div>
                      <h4 className="text-sm font-medium text-blue-300">{t.admin.users.create.bulk.password.title}</h4>
                      <p className="text-xs text-blue-400/70 mt-1">{t.admin.users.create.bulk.password.description}</p>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const headers = "email,username,department,phone_numbers";
                        const example = "user@example.com,user1,Engineering,010-1234-5678|010-9999-8888";
                        const csvContent = `${headers}\n${example}`;
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        const url = URL.createObjectURL(blob);
                        link.setAttribute("href", url);
                        link.setAttribute("download", "user_import_template.csv");
                        link.style.visibility = 'hidden';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      {t.admin.users.create.bulk.download_template}
                    </button>
                  </div>

                  <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 transition-colors bg-zinc-800/50 ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault(); setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) processFile(file);
                    }}
                  >
                    <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
                    <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                      <Upload size={32} className="mb-2" />
                      <span className="text-sm font-medium">{t.admin.users.create.bulk.drag_drop}</span>
                      <span className="text-xs text-gray-500 mt-1 center text-center">
                        {t.admin.users.create.bulk.csv_helper.delimiters}<code>|</code> <code>;</code> <code>,</code>
                      </span>
                    </label>
                  </div>
                  {csvFile && (
                    <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
                      <FileType className="text-green-500" size={20} />
                      <span className="text-sm text-white">{csvFile.name} ({csvPreview.length} items)</span>
                    </div>
                  )}
                  <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3">
                    <button
                      type="button"
                      onClick={() => { onClose(); resetForm(); }}
                      disabled={isLoading}
                      className="px-4 py-2 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t.admin.users.create.cancel}
                    </button>
                    <button
                      onClick={handleBulkSubmit}
                      disabled={isLoading || !csvPreview.length}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (<Loader2 className="animate-spin" size={16} />) : (t.admin.users.create.bulk.submit)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </MotionDiv>
        </MotionDiv>
      )}
    </AnimatePresence>
  );
}
