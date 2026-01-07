'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Upload, FileType } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';

import { useLanguage } from '@/context/LanguageContext';
import { MotionDiv } from '../ui/Motion';

interface CreateDepartmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (options?: { parentId?: string; newDeptId?: string; bulkCount?: number }) => void;
}

interface Department {
  id: string;
  name: string;
  parent_department_id?: string;
  sort_order?: number;
  children?: Department[];
  depth?: number;
}

function flattenDepartments(departments: Department[]): Department[] {
  const map = new Map<string, Department>();
  const roots: Department[] = [];

  // 1. Build Map & Initialize Children
  departments.forEach(d => {
    map.set(d.id, { ...d, children: [] });
  });

  // 2. Build Hierarchy
  departments.forEach(d => {
    const node = map.get(d.id)!;
    if (d.parent_department_id && map.has(d.parent_department_id)) {
      map.get(d.parent_department_id)!.children?.push(node);
    } else {
      roots.push(node);
    }
  });

  // 3. Sort & Flatten (DFS)
  const result: Department[] = [];

  function traverse(nodes: Department[], depth: number) {
    // Sort siblings by sort_order
    nodes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    for (const node of nodes) {
      node.depth = depth;
      result.push(node);
      if (node.children && node.children.length > 0) {
        traverse(node.children, depth + 1);
      }
    }
  }

  traverse(roots, 0);
  return result;
}

export default function CreateDepartmentModal({ isOpen, onClose, onSuccess }: CreateDepartmentModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single Create States
  const [name, setName] = useState('');
  const [defaultVisibility, setDefaultVisibility] = useState(1); // 1: Hidden (default)
  const [parentDeptId, setParentDeptId] = useState('');

  // Bulk Create States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [importMode, setImportMode] = useState<'upsert' | 'replace'>('upsert');

  // Common
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch departments for Parent selection
  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
    }
  }, [isOpen]);

  const fetchDepartments = async () => {
    try {
      const res = await fetch('/api/v1/departments', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'X-Tenant-ID': window.location.hostname.split('.')[0]
        }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const result = await createDepartment({
        name,
        default_visibility_level: Number(defaultVisibility),
        parent_department_id: parentDeptId || undefined
      });

      // Pass parent ID and new department ID to expand parent and highlight new dept
      onSuccess({
        parentId: parentDeptId || undefined,
        newDeptId: result?.department?.id
      });
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkSubmit = async () => {
    if (!csvPreview.length) return;
    setIsLoading(true);
    setError('');

    try {
      // Transform CSV Data to API Payload
      // Backend will handle parent_name lookup
      const requests = csvPreview.map(row => {
        let rowName = row['name'] || row['Name'];
        let rowParentName = row['parent_name'] || row['parent_name']; // fallback keys

        // Handle "Single Column" edge case where the entire line is quoted "name,parent_name"
        // This results in one key: "name,parent_name"
        const compositeKey = Object.keys(row).find(k => k.includes('name') && k.includes('parent'));
        if (!rowName && compositeKey) {
          const val = row[compositeKey];
          if (typeof val === 'string') {
            // naive split by comma (assuming names don't have commas for now)
            // If names have commas, this is ambiguous without a proper parser, but for this specific malformed CSV case:
            const parts = val.split(',');
            if (parts.length >= 1) rowName = parts[0].trim();
            if (parts.length >= 2) rowParentName = parts[1].trim();
          }
        }

        if (!rowName) return null;

        return {
          id: undefined,
          name: rowName,
          description: '',
          parent_department_id: '',
          parent_name: rowParentName || ''
        };
      }).filter(Boolean); // Remove nulls

      if (requests.length === 0) {
        setError('No valid data found in CSV.');
        setIsLoading(false);
        return;
      }

      const result = await batchCreateDepartments(requests, importMode);

      onSuccess({ bulkCount: result?.success_count || requests.length });
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const batchCreateDepartments = async (items: any[], mode: string) => {
    const res = await fetch('/api/v1/departments/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        'X-Tenant-ID': window.location.hostname.split('.')[0]
      },
      body: JSON.stringify({
        requests: items,
        import_mode: mode
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to batch create departments');
    }

    // Check partial failures if any (though current backend is all-or-nothing)
    if (data.failure_count > 0) {
      throw new Error(`Batch failed: ${data.failure_reasons?.join(', ')}`);
    }

    return data;
  };

  const createDepartment = async (payload: any) => {
    const res = await fetch('/api/v1/departments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        'X-Tenant-ID': window.location.hostname.split('.')[0]
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to create department');
    }
    return data;
  };

  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/^[\uFEFF\u200B"']+|["']+$/g, ''), // Remove BOM, quotes, whitespace
      complete: (results) => {
        setCsvPreview(results.data);
        setError('');
      },
      error: (err) => {
        setError('Failed to parse CSV: ' + err.message);
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const resetForm = () => {
    setName('');
    setError('');
    setDefaultVisibility(1);
    setParentDeptId('');
    setCsvFile(null);
    setCsvPreview([]);
    setImportMode('upsert');
    setActiveTab('single');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <MotionDiv
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { onClose(); resetForm(); }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <MotionDiv
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-white">{t.admin.departments.create.title}</h2>
              <button onClick={() => { onClose(); resetForm(); }} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Warning / Error */}
            {error && (
              <div className="mx-6 mt-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 mx-6 mt-4">
              <button
                onClick={() => setActiveTab('single')}
                className={`pb-2 px-1 text-sm font-medium transition-colors relative ${activeTab === 'single' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {t.admin.departments.create.tabs.single}
                {activeTab === 'single' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400" />}
              </button>
              <button
                onClick={() => setActiveTab('bulk')}
                className={`pb-2 px-1 text-sm font-medium transition-colors relative ml-6 ${activeTab === 'bulk' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {t.admin.departments.create.tabs.bulk}
                {activeTab === 'bulk' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400" />}
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {activeTab === 'single' ? (
                <form onSubmit={handleSingleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t.admin.departments.create.name}</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. Engineering"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t.admin.departments.create.parent}</label>
                    <select
                      value={parentDeptId}
                      onChange={(e) => setParentDeptId(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">None (Top Level)</option>
                      {flattenDepartments(departments).map(d => (
                        <option key={d.id} value={d.id}>
                          {d.depth ? '\u00A0'.repeat(d.depth * 4) + '└ ' : ''}{d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">{t.admin.departments.create.visibility_level}</label>
                    <select
                      value={defaultVisibility}
                      onChange={(e) => setDefaultVisibility(Number(e.target.value))}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value={1}>{t.admin.departments.visibility.level_1}</option>
                      <option value={2}>{t.admin.departments.visibility.level_2}</option>
                      <option value={3}>{t.admin.departments.visibility.level_3}</option>
                      <option value={4}>{t.admin.departments.visibility.level_4}</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : t.admin.departments.create.submit}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Import Mode Selection */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-400">{t.admin.departments.create.bulk.import_mode.title}</label>
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
                          {t.admin.departments.create.bulk.import_mode.upsert}
                        </span>
                        <span className={`text-[10px] mt-0.5 ${importMode === 'upsert' ? 'text-blue-200' : 'text-gray-500'}`}>
                          {t.admin.departments.create.bulk.import_mode.upsert_desc}
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
                          {t.admin.departments.create.bulk.import_mode.replace}
                        </span>
                        <span className={`text-[10px] mt-0.5 ${importMode === 'replace' ? 'text-red-200' : 'text-gray-500'}`}>
                          {t.admin.departments.create.bulk.import_mode.replace_desc}
                        </span>
                      </label>
                    </div>
                    {importMode === 'replace' && (
                      <div className="mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                        {t.admin.departments.create.bulk.import_mode.warning}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const csvContent = "name,parent_name\nSales,Sales Dept\nEngineering,Engineering Dept\n";
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        const url = URL.createObjectURL(blob);
                        link.setAttribute("href", url);
                        link.setAttribute("download", "department_import_template.csv");
                        link.style.visibility = 'hidden';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}

                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      {t.admin.departments.create.bulk.download_template}
                    </button>
                  </div>

                  <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 transition-colors bg-zinc-800/50 ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'
                      }`}
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
                      if (file && file.type === 'text/csv' || file?.name.endsWith('.csv')) {
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
                      <span className="text-sm font-medium">{t.admin.departments.create.bulk.drag_drop}</span>
                      <span className="text-xs text-gray-500 mt-1 center text-center">Headers: name, parent_name</span>
                    </label>
                  </div>

                  {csvFile && (
                    <div className="text-sm text-gray-300 flex items-center gap-2">
                      <FileType size={16} />
                      {csvFile.name} ({csvPreview.length} rows)
                    </div>
                  )}

                  <button
                    onClick={handleBulkSubmit}
                    disabled={isLoading || !csvPreview.length}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : t.admin.departments.create.bulk.submit}
                  </button>
                </div>
              )}
            </div>
          </MotionDiv>
        </>
      )}
    </AnimatePresence>
  );
}
