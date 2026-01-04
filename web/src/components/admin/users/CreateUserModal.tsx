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
  Download,
  ChevronRight,
  ChevronDown,
  FolderTree,
  Building
} from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import Papa from 'papaparse';

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

function buildTree(departments: Department[]): Department[] {
  const map = new Map<string, Department>();
  const roots: Department[] = [];
  // Sort by sort_order
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
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Single User Form
  const [formData, setFormData] = useState({
    email: '',
    // username: '', // field removed
    password: '',
    role: '4',
    departmentId: '',
    firstName: '',
    lastName: '',
    birthday: '',
    phoneNumbers: [''], // Initial one empty phone number
    position: '',
    memo: ''
  });

  // Departments
  const [departments, setDepartments] = useState<Department[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Bulk Import
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
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
        // Default expand all
        setExpandedIds(new Set(depts.map((d: Department) => d.id)));
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      role: '4',
      departmentId: '',
      firstName: '',
      lastName: '',
      birthday: '',
      phoneNumbers: [''],
      position: '',
      memo: ''
    });
    setCsvFile(null);
    setCsvPreview([]);
    setError(null);
    setActiveTab('single');
  };

  const handlePhoneChange = (index: number, value: string) => {
    const newPhones = [...formData.phoneNumbers];
    newPhones[index] = value;
    setFormData({ ...formData, phoneNumbers: newPhones });
  };

  const addPhoneField = () => {
    setFormData({ ...formData, phoneNumbers: [...formData.phoneNumbers, ''] });
  };

  const removePhoneField = (index: number) => {
    const newPhones = formData.phoneNumbers.filter((_, i) => i !== index);
    setFormData({ ...formData, phoneNumbers: newPhones });
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((formData.role === '3' || formData.role === '4') && !formData.departmentId) {
      setError('Please select a department.');
      return;
    }

    setIsLoading(true);
    setError(null);

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
          // username has been removed from UI, API will use email if omitted
          password: formData.password,
          role: parseInt(formData.role),
          department_id: formData.departmentId,
          first_name: formData.firstName,
          last_name: formData.lastName,
          birthday: formData.birthday,
          phone_numbers: formData.phoneNumbers.filter(p => p.trim() !== ''),
          position: formData.position,
          memo: formData.memo
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

  // Bulk handlers...
  const processFile = (file: File) => {
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
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

        return {
          email: email,
          username: row.username || row.Username || email.split('@')[0],
          role: getRoleValue(row.role || row.Role),
          department_id: row.department_id || row.DepartmentId || '',
          first_name: row.first_name || row.FirstName || '',
          last_name: row.last_name || row.LastName || '',
          birthday: row.birthday || row.Birthday || '',
          phone_numbers: row.phone ? [row.phone] : (row.Phone ? [row.Phone] : []),
          position: row.position || row.Position || '',
          memo: row.memo || row.Memo || ''
        };
      }).filter(Boolean);

      if (requests.length === 0) throw new Error('No valid data found in CSV.');

      const response = await fetch('/api/v1/users/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId,
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(requests),
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

  const DepartmentItem = ({ node, level = 0 }: { node: Department, level?: number }) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isSelected = formData.departmentId === node.id;

    return (
      <div>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors select-none ${isSelected ? 'bg-blue-500/20 text-blue-300' : 'hover:bg-white/5 text-gray-300'}`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => setFormData(prev => ({ ...prev, departmentId: node.id }))}
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
            className={`w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 ${hasChildren ? 'text-gray-400' : 'invisible'}`}
          >
            {hasChildren && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
          </div>

          <div className={isSelected ? 'text-blue-400' : 'text-gray-500'}>
            {hasChildren ? <FolderTree size={16} /> : <Building size={16} />}
          </div>

          <span className="text-sm truncate">{node.name}</span>
        </div>

        <AnimatePresence>
          {isExpanded && hasChildren && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              {node.children!.map(child => (
                <DepartmentItem key={child.id} node={child} level={level + 1} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        >
          <motion.div
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
                Single Create
              </button>
              <button
                onClick={() => setActiveTab('bulk')}
                className={`py-3 px-1 text-sm font-medium transition-colors relative border-b-2 ml-6 ${activeTab === 'bulk' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}
              >
                Bulk Import (CSV)
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
                      <FolderTree size={16} className="text-blue-500" />
                      Select Department
                    </h3>
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 bg-zinc-950/30 rounded-lg p-2 border border-zinc-800/50">
                      {tree.length === 0 ? (
                        <p className="text-xs text-gray-500 text-center py-4">No departments found</p>
                      ) : (
                        tree.map(node => <DepartmentItem key={node.id} node={node} />)
                      )}
                    </div>
                  </div>

                  {/* Right: Form */}
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <form onSubmit={handleSingleSubmit} className="flex flex-col h-full">
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                        {/* Email */}
                        <div className="grid grid-cols-2 gap-4">
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
                          {/* Role */}
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
                        </div>

                        {/* Name */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Last Name</label>
                            <input
                              type="text"
                              value={formData.lastName}
                              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                              placeholder="Doe"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">First Name</label>
                            <input
                              type="text"
                              value={formData.firstName}
                              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                              placeholder="John"
                            />
                          </div>
                        </div>

                        {/* Birthday & Position */}
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


                          <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-300">Position</label>
                            <input
                              type="text"
                              value={formData.position}
                              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors"
                              placeholder="Software Engineer"
                            />
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
                                placeholder={index === 0 ? "Primary Contact (e.g. +1234567890)" : "Additional Contact"}
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

                        {/* Memo */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-gray-300">Memo</label>
                          <textarea
                            value={formData.memo}
                            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors min-h-[80px]"
                            placeholder="Additional notes..."
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
                /* Bulk Import Tab Content (Existing) */
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                    <div>
                      <h4 className="text-sm font-medium text-blue-300">Default Password</h4>
                      <p className="text-xs text-blue-400/70 mt-1">All users will be created with default password: <code className="bg-blue-900/50 px-1 rounded">zzzzzzzz</code></p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const csvContent = "email,username,role,department_id\nuser1@example.com,User 1,user,Sales\nmanager@example.com,Manager Kim,viewer,Engineering\n";
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = "user_import_template.csv";
                        link.click();
                      }}
                      className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 underline"
                    >
                      <Download size={14} />
                      Download Template
                    </button>
                  </div>

                  <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 transition-colors bg-zinc-800/50 ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
                        processFile(file);
                      } else {
                        setError('Please upload a valid CSV file.');
                      }
                    }}
                  >
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="hidden"
                      id="csv-upload"
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                      <Upload size={32} className="mb-2" />
                      <span className="text-sm font-medium">Click or Drag & Drop CSV</span>
                      <span className="text-xs text-gray-500 mt-1">Headers: email, username, role, department_id</span>
                    </label>
                  </div>

                  {csvFile && (
                    <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg">
                      <FileType className="text-green-500" size={20} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{csvFile.name}</p>
                        <p className="text-xs text-gray-500">{csvPreview.length} items found</p>
                      </div>
                      <button onClick={() => { setCsvFile(null); setCsvPreview([]); }} className="text-gray-500 hover:text-white">
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  <div className="flex justify-end pt-4 border-t border-zinc-800 gap-3">
                    <button
                      type="button"
                      onClick={() => { onClose(); resetForm(); }}
                      className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkSubmit}
                      disabled={isLoading || !csvPreview.length}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isLoading && <Loader2 className="animate-spin" size={16} />}
                      Import Users
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
