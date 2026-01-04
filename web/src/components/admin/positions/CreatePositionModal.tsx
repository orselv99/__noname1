'use client';

import { useState } from 'react';
import { X, Loader2, Upload, FileType } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Papa from 'papaparse';

import { useLanguage } from '@/context/LanguageContext';

interface CreatePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (options?: { bulkCount?: number }) => void;
}

export default function CreatePositionModal({ isOpen, onClose, onSuccess }: CreatePositionModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single Create States
  const [name, setName] = useState('');

  // Bulk Create States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);

  // Common
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await createPosition({ name });
      onSuccess();
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
      const requests = csvPreview.map(row => {
        // Handle "name" key or single column edge case
        const rowName = row['name'] || row['Name'] || Object.values(row)[0];
        if (!rowName || typeof rowName !== 'string') return null;

        return { name: rowName.trim() };
      }).filter(Boolean);

      if (requests.length === 0) {
        setError('No valid data found in CSV.');
        setIsLoading(false);
        return;
      }

      const result = await batchCreatePositions(requests);
      onSuccess({ bulkCount: result?.success_count || requests.length });
      onClose();
      resetForm();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const createPosition = async (payload: any) => {
    const res = await fetch('/api/v1/positions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        'X-Tenant-ID': window.location.hostname.split('.')[0]
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create position');
    return data;
  };

  const batchCreatePositions = async (items: any[]) => {
    const res = await fetch('/api/v1/positions/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        'X-Tenant-ID': window.location.hostname.split('.')[0]
      },
      body: JSON.stringify({ requests: items }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to batch create positions');

    if (data.failure_count > 0) {
      throw new Error(`Batch failed: ${data.failure_reasons?.join(', ')}`);
    }
    return data;
  };

  const [isDragging, setIsDragging] = useState(false);

  const processFile = (file: File) => {
    setCsvFile(file);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/^[\uFEFF\u200B"']+|["']+$/g, ''),
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
    if (file) processFile(file);
  };

  const resetForm = () => {
    setName('');
    setError('');
    setCsvFile(null);
    setCsvPreview([]);
    setActiveTab('single');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { onClose(); resetForm(); }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-white">Create Position</h2>
              <button onClick={() => { onClose(); resetForm(); }} className="text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Error */}
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
                Single Create
                {activeTab === 'single' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400" />}
              </button>
              <button
                onClick={() => setActiveTab('bulk')}
                className={`pb-2 px-1 text-sm font-medium transition-colors relative ml-6 ${activeTab === 'bulk' ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                Bulk Import (CSV)
                {activeTab === 'bulk' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-400" />}
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {activeTab === 'single' ? (
                <form onSubmit={handleSingleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Position Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. Senior Engineer"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Create Position'}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        const csvContent = "name\nSenior Engineer\nJunior Engineer\n";
                        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = "position_import_template.csv";
                        link.click();
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 underline"
                    >
                      Download Template
                    </button>
                  </div>

                  <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-gray-400 transition-colors bg-zinc-800/50 ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-zinc-500'}`}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) processFile(file);
                      else setError('Please upload a valid CSV file.');
                    }}
                  >
                    <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="pos-csv-upload" />
                    <label htmlFor="pos-csv-upload" className="cursor-pointer flex flex-col items-center w-full h-full">
                      <Upload size={32} className="mb-2" />
                      <span className="text-sm font-medium">Click to upload or drag and drop</span>
                      <span className="text-xs text-gray-500 mt-1">Header: name</span>
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
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Import Positions'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
